"""Tests for the v2 risk engine.

The golden cases at the top are the acceptance tests for the original
complaint: the engine was so optimistic that a long-standing, poorly-managed
chronic illness scored the same as perfect health. If `test_diabetic_is_not_low`
ever fails, the regression is back.
"""
from __future__ import annotations

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

import risk_engine as re


# ---------------------------------------------------------------------------
# Payload builders
# ---------------------------------------------------------------------------

def make_payload(**over):
    """A mid-range 35-year-old. This is the profile that v1 scored 23 / Low."""
    payload = {
        'basic': {'age': 35, 'gender': 'male', 'height_cm': 170, 'weight_kg': 78},
        'lifestyle': {
            'smoking': 'occasional', 'alcohol': 'moderate',
            'exercise_frequency': 'occasional', 'water_intake': 'moderate',
            'sleep_quality': 'fair', 'stress_level': 'moderate',
        },
        'medical': {'existing_conditions': [], 'allergies': [], 'current_medications': []},
        'family_history': {'conditions': []},
        'location': {'state': 'Karnataka', 'city': 'Bengaluru'},
    }
    payload.update(over)
    return payload


def healthy_payload():
    return {
        'basic': {'age': 25, 'gender': 'female', 'height_cm': 165, 'weight_kg': 55},
        'lifestyle': {
            'smoking': 'never', 'alcohol': 'never', 'exercise_frequency': 'daily',
            'water_intake': 'high', 'sleep_quality': 'excellent', 'stress_level': 'low',
            'exercise_minutes_per_week': 200, 'sleep_hours': 8,
            'alcohol_units_per_week': 0, 'fruit_veg_servings': 5,
        },
        'vitals': {
            'systolic_mmhg': 112, 'diastolic_mmhg': 72, 'hba1c_percent': 5.1,
            'ldl_mgdl': 90, 'waist_cm': 68,
        },
        'mental': {'phq2_interest': 0, 'phq2_down': 0, 'gad2_nervous': 0, 'gad2_worry': 0},
        'medical': {'conditions': [], 'medications': []},
        'family_history': {'entries': []},
    }


def condition(**over):
    entry = {
        'name': 'Type 2 Diabetes', 'diagnosed_bucket': 'gt_10y',
        'control': 'poorly', 'treatment': 'medication',
    }
    entry.update(over)
    return entry


def findrisc_answers(**over):
    return dict(daily_activity_30min=True, daily_fruit_vegetables=True,
                ever_bp_medication=False, ever_high_glucose=False,
                family_diabetes='none') | over


# ---------------------------------------------------------------------------
# Golden cases — the acceptance tests for the whole change
# ---------------------------------------------------------------------------

def test_healthy_young_adult_is_low():
    result = re.compute_risk(healthy_payload())
    assert result['risk_level'] == 'Low'
    assert result['confidence']['confidence'] == 100


def test_typical_unhealthy_adult_is_not_low():
    """v1 scored this profile 23 -> 'Low'. An overweight occasional smoker who
    barely exercises is not low risk."""
    result = re.compute_risk(make_payload())
    assert result['risk_level'] != 'Low'


def test_diabetic_is_not_low():
    """The headline regression guard.

    In v1 this scored *identically* to the same person without diabetes,
    because the engine ignored the `medical` key entirely.
    """
    payload = make_payload(medical={'conditions': [condition()]})
    result = re.compute_risk(payload)

    assert result['risk_level'] in ('High', 'Very High')
    assert result['components']['conditions']['score'] > 0


def test_conditions_change_the_score():
    """The specific v1 bug: conditions contributed exactly zero."""
    without = re.compute_risk(make_payload())['risk_score']
    with_cond = re.compute_risk(make_payload(medical={'conditions': [condition()]}))['risk_score']
    assert with_cond > without


def test_medications_and_allergies_do_not_crash_scoring():
    payload = make_payload(medical={
        'conditions': [condition()],
        'medications': [{'name': 'Metformin', 'started_bucket': 'gt_5y',
                         'for_condition': 'Type 2 Diabetes'}],
        'allergies': [{'allergen': 'Penicillin', 'category': 'drug',
                       'reaction': 'anaphylaxis'}],
    })
    assert re.compute_risk(payload)['risk_score'] > 0


# ---------------------------------------------------------------------------
# Unknown is not healthy
# ---------------------------------------------------------------------------

def _age45(vitals):
    return {
        'basic': {'age': 45, 'gender': 'male', 'height_cm': 172, 'weight_kg': 80},
        'lifestyle': {
            'smoking': 'never', 'alcohol': 'occasional', 'exercise_frequency': 'regular',
            'water_intake': 'moderate', 'sleep_quality': 'good', 'stress_level': 'moderate',
        },
        'vitals': vitals,
        'medical': {'conditions': []},
        'family_history': {'conditions': []},
    }


def test_unknown_vitals_score_higher_than_known_normal_vitals():
    known = re.compute_risk(_age45({
        'systolic_mmhg': 115, 'diastolic_mmhg': 75, 'hba1c_percent': 5.2, 'ldl_mgdl': 95,
    }))
    unknown = re.compute_risk(_age45({
        'declared_unknown': ['systolic_mmhg', 'diastolic_mmhg', 'hba1c_percent', 'ldl_mgdl'],
    }))

    assert unknown['risk_score'] > known['risk_score']
    assert unknown['confidence']['confidence'] < known['confidence']['confidence']


def test_declared_unknown_counts_for_completeness_but_not_confidence():
    """Saying 'I don't know' is a real answer, but it does not tell us the value."""
    declared = re.compute_risk(_age45({
        'declared_unknown': ['systolic_mmhg', 'diastolic_mmhg', 'hba1c_percent', 'ldl_mgdl'],
    }))['confidence']
    never_asked = re.compute_risk(_age45({}))['confidence']

    assert declared['completeness'] > never_asked['completeness']
    assert declared['confidence'] == never_asked['confidence']


def test_unassessed_factors_are_tagged_for_the_ui():
    result = re.compute_risk(_age45({}))
    kinds = {f['kind'] for f in result['contributing_factors']}
    assert 'unassessed' in kinds


def test_young_adult_is_not_penalised_for_unknown_vitals():
    """The unknown-data penalty is age-gated; we do not nag a healthy 25-year-old."""
    result = re.compute_risk(healthy_payload() | {'vitals': {}})
    assert not [f for f in result['contributing_factors'] if f['kind'] == 'unassessed']


# ---------------------------------------------------------------------------
# Condition multipliers
# ---------------------------------------------------------------------------

def test_longer_duration_scores_higher():
    short = re.condition_score(condition(diagnosed_bucket='lt_1y', control='partly'))
    long = re.condition_score(condition(diagnosed_bucket='gt_10y', control='partly'))
    assert long > short


def test_worse_control_scores_higher():
    well = re.condition_score(condition(control='well'))
    poorly = re.condition_score(condition(control='poorly'))
    assert poorly > well


def test_untreated_scores_higher_than_treated():
    treated = re.condition_score(condition(treatment='both'))
    untreated = re.condition_score(condition(treatment='none'))
    assert untreated > treated


def test_unsure_control_is_penalised_not_forgiven():
    """Not knowing how well a condition is controlled must not score as 'well'."""
    assert re.CONTROL_MULT['unsure'] > re.CONTROL_MULT['well']
    assert re.CONTROL_MULT['unsure'] > 1.0


@pytest.mark.parametrize('duration', sorted(re.DURATION_MULT))
@pytest.mark.parametrize('control', sorted(re.CONTROL_MULT))
@pytest.mark.parametrize('treatment', sorted(re.TREATMENT_MULT))
def test_combined_multiplier_never_exceeds_the_ceiling(duration, control, treatment):
    """Without this ceiling, compounding uncertainty ranks an untreated
    condition of unknown control above an actively managed chronic one."""
    entry = condition(diagnosed_bucket=duration, control=control, treatment=treatment)
    base = re.CONDITION_BASE['type 2 diabetes']
    assert re.condition_score(entry) <= base * re.COMBINED_MULT_CAP


def test_unrecognised_condition_still_counts():
    """A user-typed illness we cannot name is still evidence of burden."""
    payload = make_payload(medical={'conditions': [
        {'name': 'Some rare illness', 'control': 'poorly', 'treatment': 'none'}]})
    assert re.compute_risk(payload)['components']['conditions']['score'] > 0


# ---------------------------------------------------------------------------
# BMI
# ---------------------------------------------------------------------------

def test_bmi_uses_asia_pacific_cutoffs():
    """This app serves Karnataka only. BMI 24 is 'overweight' here, not 'normal'."""
    assert re.bmi_bucket(24.0) == 'overweight'
    assert re.bmi_bucket(28.0) == 'obese'
    assert re.bmi_bucket(22.0) == 'normal'


def test_underweight_is_not_the_same_as_obese():
    """v1 collapsed both into one bucket, so BMI 17 scored the same as BMI 40."""
    assert re.bmi_bucket(17.0) != re.bmi_bucket(40.0)
    assert re.BMI_POINTS['underweight'] != re.BMI_POINTS['obese']


def test_bmi_handles_garbage_input():
    assert re.bmi_value(0, 70) is None
    assert re.bmi_value(None, None) is None
    assert re.bmi_bucket(None) is None


# ---------------------------------------------------------------------------
# Family history
# ---------------------------------------------------------------------------

def test_first_degree_relative_outweighs_second_degree():
    first = re.hereditary_score({'condition': 'Heart Disease', 'relations': ['mother']})
    second = re.hereditary_score({'condition': 'Heart Disease', 'relations': ['grandparent']})
    assert first > second


def test_premature_onset_outweighs_late_onset():
    early = re.hereditary_score(
        {'condition': 'Heart Disease', 'relations': ['father'], 'onset_bucket': 'lt_50'})
    late = re.hereditary_score(
        {'condition': 'Heart Disease', 'relations': ['father'], 'onset_bucket': 'gt_70'})
    assert early > late


# ---------------------------------------------------------------------------
# Wellness is independent of risk
# ---------------------------------------------------------------------------

def test_wellness_is_not_the_inverse_of_risk():
    """v1 defined wellness as `100 - risk_score`, which carried no information."""
    payload = make_payload(medical={'conditions': [condition()]})
    result = re.compute_risk(payload)
    assert result['wellness_score'] != 100 - result['risk_score']


def test_wellness_rewards_protective_factors():
    assert re.compute_wellness(healthy_payload()) > re.compute_wellness(make_payload())


def test_wellness_stays_in_range():
    for payload in (healthy_payload(), make_payload(), {}):
        assert 0 <= re.compute_wellness(payload) <= 100


# ---------------------------------------------------------------------------
# Sub-scores
# ---------------------------------------------------------------------------

def test_findrisc_emitted_when_inputs_present():
    payload = healthy_payload()
    payload['findrisc'] = findrisc_answers()
    ids = {s['id'] for s in re.compute_subscores(payload)}
    assert 'findrisc' in ids


def test_screeners_flag_positive_above_threshold():
    payload = healthy_payload()
    payload['mental'] = {'phq2_interest': 3, 'phq2_down': 3,
                         'gad2_nervous': 0, 'gad2_worry': 0}
    scores = {s['id']: s for s in re.compute_subscores(payload)}
    assert scores['phq2']['band'] == 'Screen positive'
    assert scores['gad2']['band'] == 'Screen negative'


def test_subscores_absent_when_inputs_missing():
    assert re.compute_subscores({'basic': {}, 'lifestyle': {}}) == []


# ---------------------------------------------------------------------------
# Bands
# ---------------------------------------------------------------------------

@pytest.mark.parametrize('score,expected', [
    (0, 'Low'), (24, 'Low'), (25, 'Moderate'), (49, 'Moderate'),
    (50, 'High'), (74, 'High'), (75, 'Very High'), (100, 'Very High'),
])
def test_band_boundaries(score, expected):
    assert re.classify(score) == expected


def test_caps_sum_to_one_hundred():
    """v1's caps summed to 105 but only 76 was reachable, so 'High' was
    effectively unreachable. The range must actually be attainable."""
    assert sum(re.COMPONENT_CAPS.values()) == 100


def test_very_high_is_reachable():
    payload = {
        'basic': {'age': 62, 'gender': 'male', 'height_cm': 168, 'weight_kg': 95},
        'lifestyle': {
            'smoking': 'regular', 'alcohol': 'frequent', 'exercise_frequency': 'never',
            'water_intake': 'low', 'sleep_quality': 'poor', 'stress_level': 'high',
            'cigarettes_per_day': 20, 'smoking_years': 30, 'smokeless_tobacco': 'daily',
            'alcohol_units_per_week': 30, 'sleep_hours': 4, 'sedentary_hours_per_day': 12,
        },
        'vitals': {'systolic_mmhg': 165, 'diastolic_mmhg': 100,
                   'hba1c_percent': 9.2, 'ldl_mgdl': 190, 'waist_cm': 110},
        'mental': {'phq2_interest': 3, 'phq2_down': 3, 'gad2_nervous': 3, 'gad2_worry': 3},
        'medical': {'conditions': [
            condition(name='Heart Disease', control='poorly', treatment='none'),
            condition(name='Type 2 Diabetes'),
            condition(name='Chronic Kidney Disease', control='poorly'),
        ]},
        'family_history': {'entries': [
            {'condition': 'Heart Disease', 'relations': ['father'], 'onset_bucket': 'lt_50'},
            {'condition': 'Diabetes', 'relations': ['mother'], 'onset_bucket': 'lt_50'},
        ]},
    }
    assert re.compute_risk(payload)['risk_level'] == 'Very High'


# ---------------------------------------------------------------------------
# Backward compatibility with v1 payloads
# ---------------------------------------------------------------------------

def test_v1_payload_still_scores():
    """`risk_reports.payload_snapshot` holds v1-shaped bodies, and older app
    builds still send them."""
    result = re.compute_risk(make_payload())
    assert isinstance(result['risk_score'], int)
    assert result['risk_level'] in ('Low', 'Moderate', 'High', 'Very High')


def test_v1_bare_string_conditions_now_contribute():
    """v1 dropped these on the floor. They must now score, conservatively."""
    payload = make_payload(medical={
        'existing_conditions': ['Type 2 Diabetes', 'Hypertension'],
        'allergies': [], 'current_medications': [],
    })
    assert re.compute_risk(payload)['components']['conditions']['score'] > 0


def test_v1_bare_family_conditions_still_contribute():
    payload = make_payload(family_history={'conditions': ['Diabetes', 'Heart Disease']})
    assert re.compute_risk(payload)['components']['hereditary']['score'] > 0


def test_empty_payload_does_not_crash():
    result = re.compute_risk({})
    assert result['risk_score'] >= 0
    assert result['risk_level'] == 'Low'


# ---------------------------------------------------------------------------
# Structural invariants
# ---------------------------------------------------------------------------

def test_is_deterministic():
    payload = make_payload(medical={'conditions': [condition()]})
    assert re.compute_risk(payload) == re.compute_risk(payload)


def test_score_stays_in_range_and_respects_caps():
    payload = make_payload(medical={'conditions': [condition()] * 10})
    result = re.compute_risk(payload)
    assert 0 <= result['risk_score'] <= 100
    for name, bucket in result['components'].items():
        assert bucket['score'] <= bucket['cap'] == re.COMPONENT_CAPS[name]


def test_every_factor_has_a_positive_delta_and_a_label():
    """Zero-delta dimensions must not appear, or the UI lists non-findings."""
    result = re.compute_risk(make_payload(medical={'conditions': [condition()]}))
    for factor in result['contributing_factors']:
        assert factor['delta'] > 0
        assert factor['label']
        assert factor['component'] in re.COMPONENT_CAPS


def test_engine_performs_no_io():
    """The engine must stay pure so it is testable and cheap to call."""
    import inspect
    source = inspect.getsource(re)
    for forbidden in ('aiomysql', 'httpx', 'requests', 'genai', 'open('):
        assert forbidden not in source


# ---------------------------------------------------------------------------
# Property tests
# ---------------------------------------------------------------------------

@settings(max_examples=50, deadline=None)
@given(
    age=st.integers(min_value=13, max_value=120),
    height=st.floats(min_value=120, max_value=210),
    weight=st.floats(min_value=35, max_value=180),
)
def test_score_always_in_range(age, height, weight):
    payload = make_payload(basic={
        'age': age, 'gender': 'male', 'height_cm': height, 'weight_kg': weight})
    assert 0 <= re.compute_risk(payload)['risk_score'] <= 100


@settings(max_examples=30, deadline=None)
@given(worse=st.sampled_from(['poorly', 'unsure']), better=st.just('well'))
def test_control_is_monotonic_uncapped(worse, better):
    """Checked on the uncapped accumulator so component caps cannot mask it."""
    hi = re.compute_components_uncapped(
        make_payload(medical={'conditions': [condition(control=worse)]}))
    lo = re.compute_components_uncapped(
        make_payload(medical={'conditions': [condition(control=better)]}))
    assert hi['conditions'] > lo['conditions']


@pytest.mark.parametrize('lower,higher', [
    ('lt_1y', '1_5y'), ('1_5y', '5_10y'), ('5_10y', 'gt_10y'),
])
def test_duration_is_monotonic_uncapped(lower, higher):
    lo = re.compute_components_uncapped(
        make_payload(medical={'conditions': [condition(diagnosed_bucket=lower, control='partly')]}))
    hi = re.compute_components_uncapped(
        make_payload(medical={'conditions': [condition(diagnosed_bucket=higher, control='partly')]}))
    assert hi['conditions'] > lo['conditions']


@pytest.mark.parametrize('dimension,lower,higher', [
    ('smoking', 'never', 'regular'),
    ('alcohol', 'never', 'frequent'),
    ('exercise_frequency', 'daily', 'never'),
])
def test_lifestyle_ordinals_are_monotonic(dimension, lower, higher):
    def score(value):
        payload = make_payload()
        payload['lifestyle'][dimension] = value
        return re.compute_components_uncapped(payload)['cardiovascular']
    assert score(higher) > score(lower)


@pytest.mark.parametrize('systolic,diastolic,level', [
    (200, 130, 'Very High'), (181, 72, 'Very High'), (112, 121, 'Very High'),
    (180, 120, 'High'), (140, 90, 'High'), (112, 72, 'Low'),
])
def test_bp_review_level_does_not_invent_component_points(systolic, diastolic, level):
    payload = healthy_payload()
    payload['vitals'].update(systolic_mmhg=systolic, diastolic_mmhg=diastolic)
    result = re.compute_risk(payload)
    assert result['risk_level'] == level
    assert result['risk_score'] == sum(c['score'] for c in result['components'].values())
    if level == 'Very High':
        assert result['wellness_score'] < 100
        factor = next(f for f in result['contributing_factors'] if f['dimension'] == 'vitals.blood_pressure')
        assert 'seek emergency care now' in factor['explanation']
        assert 'independently of the point total' in factor['explanation']


def test_positive_mental_screeners_are_not_overridden_by_healthy_habits():
    payload = healthy_payload()
    baseline = re.compute_risk(payload)
    payload['mental'] = dict.fromkeys(payload['mental'], 3)
    result = re.compute_risk(payload)
    assert result['risk_level'] == 'Moderate'
    assert result['wellness_score'] < baseline['wellness_score']
    assert all(s['band'] == 'Screen positive' for s in result['subscores'])


def test_unanswered_diet_cannot_improve_scores_or_retain_full_confidence():
    payload = healthy_payload()
    payload['lifestyle']['fruit_veg_servings'] = 0
    reported = re.compute_risk(payload)
    del payload['lifestyle']['fruit_veg_servings']
    missing = re.compute_risk(payload)
    assert missing['wellness_score'] <= reported['wellness_score']
    assert missing['risk_score'] >= reported['risk_score']
    assert missing['confidence']['confidence'] < reported['confidence']['confidence']


def test_empty_input_earns_no_wellness_or_confidence_credit():
    result = re.compute_risk({})
    assert result['wellness_score'] == 0
    assert result['confidence']['confidence'] == 0


@pytest.mark.parametrize('fasting,a1c,points', [(300, 5.1, 9), (90, 7, 9), (110, 5.1, 5)])
def test_discordant_glucose_results_retain_evidence_and_explain_review(fasting, a1c, points):
    payload = healthy_payload()
    payload['vitals'].update(fasting_glucose_mgdl=fasting, hba1c_percent=a1c)
    result = re.compute_risk(payload)
    assert result['components']['metabolic']['score'] == points
    assert result['risk_level'] != 'Low'
    assert 'Neither result cancels the other' in next(
        f['explanation'] for f in result['contributing_factors'] if f['dimension'] == 'vitals.glucose')


@pytest.mark.parametrize('status,cpd,years', [('regular', 20, 0), ('never', 20, 0), ('regular', 0, 0)])
def test_smoking_quantities_cannot_erase_current_smoking(status, cpd, years):
    payload = healthy_payload()
    payload['lifestyle'].update(smoking=status, cigarettes_per_day=cpd, smoking_years=years)
    result = re.compute_risk(payload)
    assert result['components']['cardiovascular']['score'] >= 10
    assert result['wellness_score'] < 100


def test_incomplete_bp_or_hdl_only_does_not_earn_full_confidence():
    payload = healthy_payload()
    del payload['vitals']['systolic_mmhg']
    del payload['vitals']['ldl_mgdl']
    payload['vitals']['hdl_mgdl'] = 60
    missing = {e['id'] for e in re.compute_confidence(payload)['missing']}
    assert {'blood_pressure', 'lipids'} <= missing


def test_findrisc_is_not_emitted_from_proxy_answers():
    assert 'findrisc' not in {s['id'] for s in re.compute_subscores(healthy_payload())}


@pytest.mark.parametrize('field', ['daily_activity_30min', 'daily_fruit_vegetables',
                                  'ever_bp_medication', 'ever_high_glucose', 'family_diabetes'])
def test_findrisc_requires_every_exact_answer(field):
    payload = healthy_payload()
    payload['findrisc'] = findrisc_answers()
    del payload['findrisc'][field]
    assert re._findrisc(payload) is None


def test_findrisc_uses_lifetime_answers_instead_of_current_proxy_values():
    payload = healthy_payload()
    payload['findrisc'] = findrisc_answers(daily_activity_30min=False,
                                         ever_bp_medication=True, ever_high_glucose=True)
    result = re._findrisc(payload)
    assert result['score'] == 9  # 2 activity + 2 medication history + 5 glucose history
    assert '1 in' not in result['detail']


def test_findrisc_maximum_is_26():
    payload = healthy_payload()
    payload['basic'].update(age=70, weight_kg=100)
    payload['vitals']['waist_cm'] = 110
    payload['findrisc'] = findrisc_answers(daily_activity_30min=False, daily_fruit_vegetables=False,
                                         ever_bp_medication=True, ever_high_glucose=True,
                                         family_diabetes='first_degree')
    assert re._findrisc(payload)['score'] == 26


@pytest.mark.parametrize('age,gender,conditions', [(15, 'female', []), (25, 'non_binary', []),
                                                 (25, 'female', [condition()])])
def test_findrisc_excludes_unsupported_or_already_diagnosed_profiles(age, gender, conditions):
    payload = healthy_payload()
    payload['basic'].update(age=age, gender=gender)
    payload['medical']['conditions'] = conditions
    payload['findrisc'] = findrisc_answers()
    assert re._findrisc(payload) is None


@pytest.mark.parametrize('value', [float('nan'), float('inf'), float('-inf')])
def test_nonfinite_readings_are_missing_not_healthy(value):
    payload = healthy_payload()
    payload['vitals']['hba1c_percent'] = value
    assert re.compute_risk(payload)['confidence']['confidence'] < 100


def test_urgent_guidance_survives_existing_frontend_top_three_limit():
    payload = healthy_payload()
    payload['vitals'].update(systolic_mmhg=200, diastolic_mmhg=130)
    payload['medical']['conditions'] = [condition(name=name) for name in
                                       ('Heart Disease', 'Type 2 Diabetes', 'Chronic Kidney Disease')]
    result = re.compute_risk(payload)
    visible = sorted(result['contributing_factors'], key=lambda f: -f['delta'])[:3]
    assert all(f['dimension'] != 'vitals.blood_pressure' for f in visible)
    assert any('seek emergency care now' in f.get('explanation', '') for f in visible)
    assert result['risk_score'] == sum(c['score'] for c in result['components'].values())
