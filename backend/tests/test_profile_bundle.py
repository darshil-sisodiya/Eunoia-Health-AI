"""Tests for profile completeness and the catalog endpoint.

Completeness drives the dashboard nudge, so the rule that matters most is that
an explicit "I don't know" counts as answered. Nagging someone for a number
they already told us they do not have is how a profile meter becomes noise.
"""
from __future__ import annotations

import json

import pytest

import server


def full_data():
    return {
        'profile': {
            'age': 40, 'gender': 'male', 'height': 175, 'weight': 80,
            'sleep_hours': 7, 'exercise_minutes_per_week': 150,
            'diet_type': 'vegetarian',
            'phq2_interest': 0, 'phq2_down': 0, 'gad2_nervous': 0, 'gad2_worry': 0,
            'screening_history': '{}', 'insurance': '{}',
            'consent_accepted_at': '2026-01-01',
        },
        'conditions': [{'name': 'Asthma', 'diagnosed_bucket': '1_5y', 'control': 'well'}],
        'medications': [{'name': 'Salbutamol', 'started_bucket': '1_5y'}],
        'allergies': [{'allergen': 'Dust', 'category': 'environmental'}],
        'vitals': {'systolic_mmhg': 120, 'declared_unknown': '[]'},
        'family_history': [{'condition': 'Asthma', 'relation': 'father'}],
        'latest_report': None,
    }


def test_a_fully_answered_profile_is_complete():
    assert server.compute_completeness(full_data())['percent'] == 100


def test_an_empty_profile_is_not_complete():
    result = server.compute_completeness({})
    assert result['percent'] < 100
    assert result['next_best'] is not None


def test_declared_unknown_vitals_count_as_answered():
    """The user answered. Asking again would be nagging, and the risk engine
    already records the uncertainty separately via `confidence`."""
    data = full_data()
    data['vitals'] = {'declared_unknown': json.dumps(['systolic_mmhg', 'hba1c_percent'])}
    sections = {s['id']: s for s in server.compute_completeness(data)['sections']}
    assert sections['vitals']['done'] is True


def test_never_asked_vitals_do_not_count():
    data = full_data()
    data['vitals'] = {}
    sections = {s['id']: s for s in server.compute_completeness(data)['sections']}
    assert sections['vitals']['done'] is False


def test_having_no_conditions_is_a_complete_answer():
    """'I have none' must not look like 'not answered yet'."""
    data = full_data()
    data['conditions'] = []
    sections = {s['id']: s for s in server.compute_completeness(data)['sections']}
    assert sections['conditions']['done'] is True


def test_conditions_without_duration_or_control_are_incomplete():
    data = full_data()
    data['conditions'] = [{'name': 'Asthma', 'diagnosed_bucket': 'unknown', 'control': 'unsure'}]
    sections = {s['id']: s for s in server.compute_completeness(data)['sections']}
    assert sections['conditions']['done'] is False


def test_family_history_without_a_relation_is_incomplete():
    data = full_data()
    data['family_history'] = [{'condition': 'Asthma', 'relation': ''}]
    sections = {s['id']: s for s in server.compute_completeness(data)['sections']}
    assert sections['family']['done'] is False


def test_next_best_action_picks_the_heaviest_gap():
    """The prompt should always be whichever missing answer buys the most."""
    data = full_data()
    data['vitals'] = {}                       # weight 22
    data['profile']['screening_history'] = None   # weight 3
    assert server.compute_completeness(data)['next_best']['section_id'] == 'vitals'


def test_next_best_action_is_absent_once_complete():
    assert server.compute_completeness(full_data())['next_best'] is None


def test_every_section_has_copy_for_its_prompt():
    """A section with no copy would render an empty nudge card."""
    for section in server.PROFILE_SECTIONS:
        assert section['id'] in server._NEXT_BEST_COPY


def test_section_weights_are_positive():
    assert all(s['weight'] > 0 for s in server.PROFILE_SECTIONS)


# ---------------------------------------------------------------------------
# Catalog endpoint
# ---------------------------------------------------------------------------

async def test_catalog_is_served(client):
    response = await client.get('/api/health/catalog')
    assert response.status_code == 200

    body = response.json()
    for key in ('conditions', 'medications', 'allergies', 'hereditary_conditions',
                'relations', 'vital_ranges'):
        assert body[key], f'{key} is empty'


async def test_catalog_conditions_are_scoreable_by_the_risk_engine(client):
    """A catalogue entry the engine does not recognise silently falls back to a
    default weight, so the two lists must stay in step."""
    import risk_engine

    body = (await client.get('/api/health/catalog')).json()
    unknown = [
        name for name in body['conditions']
        if name.strip().lower() not in risk_engine.CONDITION_BASE
    ]
    assert not unknown, f'Not weighted in risk_engine.CONDITION_BASE: {unknown}'


async def test_catalog_hereditary_matches_the_validator(client):
    body = (await client.get('/api/health/catalog')).json()
    assert set(body['hereditary_conditions']) == set(server.HEREDITARY)


async def test_catalog_vital_ranges_bracket_their_normal_bands(client):
    ranges = (await client.get('/api/health/catalog')).json()['vital_ranges']
    for name, spec in ranges.items():
        low, high = spec['normal']
        assert spec['min'] <= low <= high <= spec['max'], name


async def test_unknown_profile_section_is_rejected(client):
    response = await client.patch('/api/profile/not-a-section', json={})
    # 404 for the unknown section, or 401/403 if auth is checked first.
    assert response.status_code in (401, 403, 404)
