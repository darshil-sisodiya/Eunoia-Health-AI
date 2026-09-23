"""Tests for the shared profile context builder.

The prescription tests here are the important ones. The analyzer previously
received no allergy list and no medication list, so it generated an
"interactions" section without knowing what the user takes and could not flag
a drug they are allergic to. If `test_prescription_context_includes_allergies`
fails, that safety gap is back.
"""
from __future__ import annotations

import pytest

import profile_context as pc


def sample_data():
    return {
        'profile': {
            'age': 45, 'gender': 'male', 'height': 172, 'weight': 88,
            'smoking': 'former', 'alcohol': 'occasional', 'sleep_quality': 'fair',
            'sleep_hours': 6, 'stress_level': 'high', 'diet_type': 'vegetarian',
        },
        'conditions': [
            {'name': 'Type 2 Diabetes', 'diagnosed_bucket': 'gt_10y',
             'control': 'poorly', 'treatment': 'medication', 'severity': None,
             'hospitalised_12m': 0},
        ],
        'medications': [
            {'name': 'Metformin', 'dose': '500mg', 'frequency': 'bd',
             'started_bucket': 'gt_5y', 'for_condition': 'Type 2 Diabetes',
             'adherence': 'mostly'},
        ],
        'allergies': [
            {'allergen': 'Penicillin', 'category': 'drug', 'reaction': 'anaphylaxis'},
            {'allergen': 'Peanuts', 'category': 'food', 'reaction': 'hives'},
        ],
        'vitals': {'systolic_mmhg': 148, 'diastolic_mmhg': 92, 'hba1c_percent': 8.4},
        'family_history': [
            {'condition': 'Diabetes', 'relation': 'mother', 'onset_bucket': 'lt_50'},
        ],
        'latest_report': {
            'risk_score': 58, 'risk_level': 'High', 'wellness_score': 41,
            'confidence': {'confidence': 72, 'completeness': 85,
                           'missing': [{'id': 'lipids', 'label': 'Cholesterol panel',
                                        'state': 'unasked'}]},
        },
    }


# ---------------------------------------------------------------------------
# The safety regression guards
# ---------------------------------------------------------------------------

def test_prescription_context_includes_allergies():
    """Without this the analyzer cannot flag a drug the user reacts to."""
    text = pc.render_profile_for_ai(sample_data(), purpose='prescription')
    assert 'Penicillin' in text
    assert 'anaphylaxis' in text


def test_prescription_context_includes_current_medications():
    """Without this the analyzer invents an 'interactions' section blind."""
    text = pc.render_profile_for_ai(sample_data(), purpose='prescription')
    assert 'Metformin' in text
    assert '500mg' in text


def test_prescription_context_leads_with_safety_information():
    """An LLM weights what it reads first; allergies must not be buried."""
    text = pc.render_profile_for_ai(sample_data(), purpose='prescription')
    assert text.index('Penicillin') < text.index('Type 2 Diabetes')


def test_severe_reactions_are_marked():
    text = pc.render_profile_for_ai(sample_data(), purpose='prescription')
    penicillin_line = next(l for l in text.splitlines() if 'Penicillin' in l)
    assert '[SEVERE]' in penicillin_line


def test_empty_allergy_list_says_so_rather_than_implying_none():
    """'No section' reads as 'no allergies'. Absence must be explicit."""
    data = sample_data()
    data['allergies'] = []
    text = pc.render_profile_for_ai(data, purpose='prescription')
    assert 'None recorded' in text
    assert 'ALLERGIES' in text


# ---------------------------------------------------------------------------
# Every consumer gets the whole picture
# ---------------------------------------------------------------------------

@pytest.mark.parametrize('purpose', ['chat', 'prescription', 'report'])
def test_all_purposes_receive_medications_and_allergies(purpose):
    """The per-caller subsets are what made the app feel disconnected."""
    text = pc.render_profile_for_ai(sample_data(), purpose=purpose)
    assert 'Penicillin' in text
    assert 'Metformin' in text


@pytest.mark.parametrize('purpose', ['chat', 'prescription', 'report'])
def test_condition_duration_and_control_reach_the_prompt(purpose):
    text = pc.render_profile_for_ai(sample_data(), purpose=purpose)
    assert 'more than 10 years' in text
    assert 'poorly controlled' in text


def test_medication_links_to_its_condition():
    text = pc.render_profile_for_ai(sample_data(), purpose='chat')
    assert 'for Type 2 Diabetes' in text


def test_chat_context_includes_risk_and_confidence():
    text = pc.render_profile_for_ai(sample_data(), purpose='chat')
    assert '58/100' in text
    assert '72%' in text


def test_missing_evidence_is_surfaced():
    text = pc.render_profile_for_ai(sample_data(), purpose='chat')
    assert 'Cholesterol panel' in text


def test_vitals_absence_is_explicit():
    """'No vitals' must not be readable as 'vitals are normal'."""
    data = sample_data()
    data['vitals'] = None
    text = pc.render_profile_for_ai(data, purpose='chat')
    assert 'Do not assume they are normal' in text


def test_bmi_is_derived_for_the_reader():
    text = pc.render_profile_for_ai(sample_data(), purpose='report')
    assert 'BMI: 29.7' in text


def test_family_history_carries_relation_and_onset():
    text = pc.render_profile_for_ai(sample_data(), purpose='chat')
    assert 'mother' in text
    assert 'lt-50' in text


def test_empty_profile_does_not_crash():
    text = pc.render_profile_for_ai({}, purpose='chat')
    assert 'None recorded' in text


# ---------------------------------------------------------------------------
# Deterministic allergy backstop
# ---------------------------------------------------------------------------

def test_allergy_conflict_detected_on_exact_name():
    hits = pc.allergy_conflicts(sample_data()['allergies'], ['Penicillin'])
    assert len(hits) == 1
    assert 'SEVERE' in hits[0]


def test_allergy_conflict_detected_within_a_longer_drug_string():
    hits = pc.allergy_conflicts(sample_data()['allergies'], ['Penicillin V 250mg'])
    assert hits


def test_allergy_conflict_is_case_insensitive():
    assert pc.allergy_conflicts(sample_data()['allergies'], ['PENICILLIN'])


def test_no_conflict_for_unrelated_drug():
    assert pc.allergy_conflicts(sample_data()['allergies'], ['Paracetamol']) == []


def test_allergy_conflict_handles_empty_inputs():
    assert pc.allergy_conflicts([], ['Penicillin']) == []
    assert pc.allergy_conflicts(sample_data()['allergies'], []) == []
    assert pc.allergy_conflicts(sample_data()['allergies'], ['', None]) == []


def test_each_allergen_reported_once_even_with_multiple_matches():
    hits = pc.allergy_conflicts(
        [{'allergen': 'Penicillin', 'category': 'drug', 'reaction': 'hives'}],
        ['Penicillin 250mg', 'Penicillin V'],
    )
    assert len(hits) == 1


# ---------------------------------------------------------------------------
# Loader
# ---------------------------------------------------------------------------

async def test_load_full_profile_assembles_every_slice():
    async def fetch_one(query, params=()):
        if 'health_profiles' in query:
            return {'age': 30}
        if 'user_vitals' in query:
            return {'systolic_mmhg': 120}
        if 'risk_reports' in query:
            return {'risk_score': 10, 'risk_level': 'Low'}
        return None

    async def fetch_all(query, params=()):
        if 'user_conditions' in query:
            return [{'name': 'Asthma'}]
        if 'user_medications' in query:
            return [{'name': 'Salbutamol'}]
        if 'user_allergies' in query:
            return [{'allergen': 'Dust'}]
        if 'family_history' in query:
            return [{'condition': 'Asthma', 'relation': 'father'}]
        return []

    data = await pc.load_full_profile(1, fetch_one, fetch_all)

    assert data['profile']['age'] == 30
    assert data['conditions'][0]['name'] == 'Asthma'
    assert data['medications'][0]['name'] == 'Salbutamol'
    assert data['allergies'][0]['allergen'] == 'Dust'
    assert data['vitals']['systolic_mmhg'] == 120
    assert data['latest_report']['risk_level'] == 'Low'


async def test_load_full_profile_tolerates_a_brand_new_user():
    async def fetch_one(query, params=()):
        return None

    async def fetch_all(query, params=()):
        return []

    data = await pc.load_full_profile(1, fetch_one, fetch_all)
    assert data['profile'] is None
    assert data['conditions'] == []
    # Must still render rather than blow up on the empty case.
    assert pc.render_profile_for_ai(data, purpose='chat')


# ---------------------------------------------------------------------------
# Derived persona
# ---------------------------------------------------------------------------

def test_persona_is_derived_from_real_answers():
    persona = pc.derive_persona({
        'sleep_hours': 8, 'exercise_minutes_per_week': 180, 'stress_level': 'low',
    })
    assert 'well rested' in persona
    assert 'consistently active' in persona


def test_persona_reflects_poor_habits():
    persona = pc.derive_persona({
        'sleep_hours': 4, 'exercise_minutes_per_week': 0, 'stress_level': 'high',
    })
    assert 'short on sleep' in persona
    assert 'under real pressure' in persona


def test_persona_falls_back_to_ordinals():
    persona = pc.derive_persona({'sleep_quality': 'poor', 'exercise_frequency': 'daily'})
    assert 'short on sleep' in persona
    assert 'consistently active' in persona


def test_persona_never_empty():
    """A NULL persona is what made chat emit 'Persona: N/A'."""
    assert pc.derive_persona({})
    assert pc.derive_persona({'sleep_hours': 'nonsense'})
