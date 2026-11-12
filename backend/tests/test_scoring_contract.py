"""Scoring compatibility with the existing API and AI insight boundary."""
from datetime import datetime

import pytest
from pydantic import ValidationError

import gemini_insights
import risk_engine
import server
from backend.tests.test_risk_engine import healthy_payload, findrisc_answers


def request_payload():
    payload = healthy_payload()
    payload['basic']['full_name'] = 'Test Profile'
    payload['location'] = {'state': 'Karnataka', 'city': 'Bengaluru'}
    return payload


@pytest.mark.parametrize('exact_questionnaire', [False, True])
def test_old_clients_and_exact_questionnaire_serialize_through_existing_response(exact_questionnaire):
    payload = request_payload()
    if exact_questionnaire:
        payload['findrisc'] = findrisc_answers()
    request = server.AnalyzeRiskRequest.model_validate(payload)
    result = risk_engine.compute_risk(request.model_dump())
    response = server.AnalyzeRiskResponse(
        **result, report_id=1, insights=None, ai_insights_unavailable=True,
        created_at=datetime(2026, 1, 1))
    decoded = server.AnalyzeRiskResponse.model_validate_json(response.model_dump_json())
    assert decoded.risk_score == sum(c.score for c in decoded.components.values())
    assert ('findrisc' in {s.id for s in decoded.subscores}) == exact_questionnaire


def test_api_requires_boolean_questionnaire_answers():
    payload = request_payload()
    payload['findrisc'] = findrisc_answers(ever_high_glucose='no')
    with pytest.raises(ValidationError):
        server.AnalyzeRiskRequest.model_validate(payload)


def test_safety_explanation_reaches_ai_prompt_and_existing_response_without_ai():
    payload = request_payload()
    payload['vitals'].update(systolic_mmhg=200, diastolic_mmhg=130)
    result = risk_engine.compute_risk(payload)
    response = server.AnalyzeRiskResponse(
        **result, report_id=1, insights=None, ai_insights_unavailable=True,
        created_at=datetime(2026, 1, 1))
    assert response.risk_level == 'Very High'
    assert any('seek emergency care now' in f.explanation for f in response.contributing_factors)
    system, prompt = gemini_insights.build_prompt(payload, result)
    assert 'seek emergency care now' in prompt
    assert 'heuristic indices' in system
