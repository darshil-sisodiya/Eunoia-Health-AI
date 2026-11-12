"""Deterministic, explainable risk scoring engine (v2) for Eunoia.

This module is intentionally pure: no network calls, no file I/O, no database
access, no AI/LLM imports. Two byte-identical inputs yield byte-identical
outputs, so it is unit-testable in isolation.

What changed from v1 and why
----------------------------
v1 ignored the ``medical`` payload entirely, so diagnosed conditions,
medications and allergies contributed **zero** points. A person with 15 years
of poorly-controlled diabetes scored identically to a healthy person with the
same lifestyle. v1 also capped out at a reachable maximum of 76/100 against a
"High" threshold of 67, so "High" was effectively unreachable.

v2 fixes both:

* A ``conditions`` component scores each diagnosed condition as
  ``base * min(duration * control * treatment, COMBINED_MULT_CAP)``, so the
  same condition spans roughly a 4x range depending on how long it has been
  present and how well it is managed.
* Component caps sum to exactly 100, so the whole band range is reachable.
* Missing data is penalised rather than forgiven. An unknown blood pressure in
  a 45-year-old adds risk and lowers ``confidence`` — it never reads as
  healthy.
* ``wellness_score`` is no longer ``100 - risk_score``. It is an independent
  protective-factors score, so the dashboard's "WELLNESS /100" means something.
* BMI uses WHO Asia-Pacific cutoffs (23 / 27.5) rather than the Western
  25 / 30, and underweight is no longer collapsed into the obese bucket.

Public surface
--------------
``compute_risk(payload)``            primary entry point
``classify(score)``                  score -> risk level
``compute_components_uncapped(p)``   pre-cap sums, for property tests
``compute_confidence(payload)``      (confidence, completeness, missing)

The payload mirrors ``AnalyzeRiskRequest`` in ``backend/server.py``. Every key
is read through ``.get()`` with a default, so v1-shaped payloads (including
``risk_reports.payload_snapshot`` replays) still score.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Components
# ---------------------------------------------------------------------------

COMPONENT_CAPS: Dict[str, int] = {
    'conditions': 35,
    'cardiovascular': 25,
    'metabolic': 20,
    'mental_wellness': 12,
    'hereditary': 8,
}

_COMPONENT_ORDER: Tuple[str, ...] = (
    'conditions',
    'cardiovascular',
    'metabolic',
    'mental_wellness',
    'hereditary',
)

# Caps sum to exactly 100 so the full 0..100 band range is reachable.
assert sum(COMPONENT_CAPS.values()) == 100

# ---------------------------------------------------------------------------
# Conditions
# ---------------------------------------------------------------------------

# Base burden per condition. Keys are normalised (lowercase, trimmed).
CONDITION_BASE: Dict[str, int] = {
    'cancer': 18,
    'type 1 diabetes': 14,
    'heart disease': 16,
    'coronary artery disease': 16,
    'chronic kidney disease': 16,
    'kidney disease': 16,
    'stroke': 16,
    'type 2 diabetes': 12,
    'diabetes': 12,
    'copd': 10,
    'hypertension': 10,
    'high blood pressure': 10,
    'asthma': 8,
    'high cholesterol': 7,
    'depression': 6,
    'anxiety': 6,
    'pcos': 5,
    'pcod': 5,
    'pcos/pcod': 5,
    'hypothyroidism': 4,
    'hyperthyroidism': 4,
    'thyroid disorder': 4,
    'anemia': 3,
    'arthritis': 3,
    'migraine': 2,
    'gerd': 2,
    'acid reflux': 2,
    'gerd/acid reflux': 2,
}

# A condition we do not recognise still counts — a user-typed chronic illness
# is evidence of burden even when we cannot name its weight.
DEFAULT_CONDITION_BASE = 5

DURATION_MULT: Dict[str, float] = {
    'lt_1y': 1.0,
    '1_5y': 1.15,
    '5_10y': 1.3,
    'gt_10y': 1.5,
    'unknown': 1.1,
}

CONTROL_MULT: Dict[str, float] = {
    'well': 0.6,
    'partly': 1.0,
    'poorly': 1.6,
    'unsure': 1.25,   # not knowing is penalised, not forgiven
}

TREATMENT_MULT: Dict[str, float] = {
    'both': 0.9,
    'medication': 1.0,
    'lifestyle': 1.1,
    'none': 1.5,
}

# Plain-English wording for the factor explanations the app displays.
DURATION_TEXT = {'lt_1y': 'under a year', '1_5y': '1-5 years', '5_10y': '5-10 years',
                 'gt_10y': 'over 10 years', 'unknown': 'duration unknown'}
CONTROL_TEXT = {'well': 'well controlled', 'partly': 'partly controlled',
                'poorly': 'poorly controlled', 'unsure': 'control unsure'}
TREATMENT_TEXT = {'both': 'medication and lifestyle', 'medication': 'on medication',
                  'lifestyle': 'lifestyle changes only', 'none': 'untreated'}
ONSET_TEXT = {'lt_50': 'started before 50', '50_70': 'started at 50-70',
              'gt_70': 'started after 70', 'unknown': 'onset unknown'}

# Without this ceiling, 'untreated' x 'unsure' compounds to 1.875 and an
# untreated condition of unknown control outranks a long-standing, actively
# managed one. Multiplicative uncertainty needs a stop.
COMBINED_MULT_CAP = 2.4

SEVERITY_BONUS: Dict[str, int] = {'mild': 0, 'moderate': 2, 'severe': 4}
HOSPITALISED_BONUS = 4

# ---------------------------------------------------------------------------
# Hereditary
# ---------------------------------------------------------------------------

HEREDITARY_BASE: Dict[str, int] = {
    'Heart Disease': 3,
    'Diabetes': 3,
    'Cancer': 3,
    'Hypertension': 2,
    'Mental Health Disorders': 2,
    'Thyroid Disorders': 1,
    'Obesity': 1,
    'Asthma': 1,
}

_FIRST_DEGREE = frozenset({'mother', 'father', 'sibling', 'child'})

RELATION_MULT_FIRST = 1.5
RELATION_MULT_SECOND = 1.0
RELATION_MULT_UNSPECIFIED = 1.0

# Premature onset in a relative is the strongest hereditary signal there is.
ONSET_MULT: Dict[str, float] = {
    'lt_50': 1.6,
    '50_70': 1.0,
    'gt_70': 0.7,
    'unknown': 1.0,
}

# ---------------------------------------------------------------------------
# Lifestyle — quantified first, ordinal fallback second
# ---------------------------------------------------------------------------

# Ordinal fallbacks, used only when the quantified field is absent. These keep
# v1-shaped payloads scoring.
SMOKING_ORDINAL: Dict[str, int] = {'never': 0, 'former': 3, 'occasional': 6, 'regular': 10}
ALCOHOL_ORDINAL: Dict[str, int] = {'never': 0, 'occasional': 1, 'moderate': 3, 'frequent': 6}
EXERCISE_ORDINAL: Dict[str, int] = {'daily': 0, 'regular': 1, 'occasional': 4, 'never': 6}
SLEEP_QUALITY_ORDINAL: Dict[str, int] = {'excellent': 0, 'good': 1, 'fair': 2, 'poor': 4}
STRESS_ORDINAL: Dict[str, int] = {'low': 0, 'moderate': 2, 'high': 4}
WATER_ORDINAL: Dict[str, int] = {'high': 0, 'moderate': 0, 'low': 1}

SMOKELESS_TOBACCO: Dict[str, int] = {'never': 0, 'former': 2, 'occasional': 4, 'daily': 8}

# ---------------------------------------------------------------------------
# Confidence weighting
# ---------------------------------------------------------------------------

# How much each piece of evidence is worth to our certainty about the score.
# Present value -> full credit. Explicitly "I don't know" -> no confidence
# credit, but it does count toward completeness. Never asked -> neither.
CONFIDENCE_WEIGHTS: Dict[str, int] = {
    'blood_pressure': 15,
    'glucose': 15,
    'lipids': 10,
    'waist': 8,
    'conditions_detail': 12,
    'medications_detail': 5,
    'family_detail': 5,
    'diet': 5,
    'tobacco': 5,
    'lifestyle_quantities': 10,
    'mental_screeners': 10,
}

_CONFIDENCE_LABELS: Dict[str, str] = {
    'blood_pressure': 'Blood pressure',
    'glucose': 'Blood sugar (fasting glucose or HbA1c)',
    'lipids': 'Cholesterol panel',
    'waist': 'Waist measurement',
    'conditions_detail': 'Details for your conditions',
    'medications_detail': 'Details for your medications',
    'family_detail': 'Family history detail',
    'lifestyle_quantities': 'Lifestyle amounts',
    'mental_screeners': 'Mood and anxiety check',
    'diet': 'Fruit and vegetable intake',
    'tobacco': 'Smoking status',
}


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def _norm(text: Any) -> str:
    """Normalise a free-text clinical label for dictionary lookup."""
    return str(text or '').strip().lower()


def _num(value: Any) -> Optional[float]:
    """Coerce to float, returning None for anything non-numeric."""
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def bmi_value(height_cm: Any, weight_kg: Any) -> Optional[float]:
    """BMI, or None when the inputs are unusable."""
    h = _num(height_cm)
    w = _num(weight_kg)
    if not h or not w or h <= 0 or w <= 0:
        return None
    return w / ((h / 100.0) ** 2)


def bmi_bucket(bmi: Optional[float]) -> Optional[str]:
    """Bucket a BMI using WHO Asia-Pacific cutoffs.

    This app serves Karnataka only. South Asian populations develop type 2
    diabetes and cardiovascular disease at materially lower BMI, so the
    Western 25 / 30 cutoffs understate risk here. Underweight is kept separate
    from obese: they carry opposite clinical meaning and opposite advice.
    """
    if bmi is None:
        return None
    if bmi < 18.5:
        return 'underweight'
    if bmi < 23.0:
        return 'normal'
    if bmi < 27.5:
        return 'overweight'
    return 'obese'


BMI_POINTS: Dict[str, int] = {
    'underweight': 3,
    'normal': 0,
    'overweight': 4,
    'obese': 8,
}


def pack_years(cigarettes_per_day: Any, smoking_years: Any) -> Optional[float]:
    """Pack-years = (cigarettes per day / 20) * years smoked."""
    cpd = _num(cigarettes_per_day)
    yrs = _num(smoking_years)
    if cpd is None or yrs is None:
        return None
    return (cpd / 20.0) * yrs


def _age_points(age: int) -> int:
    if age < 30:
        return 0
    if age < 45:
        return 2
    if age < 60:
        return 4
    return 6


def _bp_points(systolic: Optional[float], diastolic: Optional[float]) -> int:
    """ACC/AHA-style staging. Whichever of the two is worse decides."""
    if systolic is None and diastolic is None:
        return 0
    s = systolic or 0.0
    d = diastolic or 0.0
    if s >= 140 or d >= 90:
        return 9
    if s >= 130 or d >= 80:
        return 5
    if s >= 120:
        return 2
    return 0


def _glucose_points(fasting_mgdl: Optional[float], hba1c: Optional[float]) -> int:
    """Retain the stronger signal; discordant tests require clinical review."""
    fasting = 0 if fasting_mgdl is None else 9 if fasting_mgdl >= 126 else 5 if fasting_mgdl >= 100 else 0
    glycated = 0 if hba1c is None else 9 if hba1c >= 6.5 else 5 if hba1c >= 5.7 else 0
    return max(fasting, glycated)


def _smoking_points(lifestyle: Dict[str, Any]) -> int:
    """Current smoking cannot disappear because completed years round to zero."""
    ordinal = SMOKING_ORDINAL.get(_norm(lifestyle.get('smoking')), 0)
    cpd = _num(lifestyle.get('cigarettes_per_day'))
    current = 10 if cpd is not None and cpd >= 20 else 6 if cpd is not None and cpd > 0 else 0
    py = pack_years(cpd, lifestyle.get('smoking_years'))
    cumulative = 0 if py is None else 12 if py >= 20 else 8 if py >= 10 else 4 if py > 0 else 0
    return max(ordinal, current, cumulative)


def _answered_list(payload: Dict[str, Any], section: str, *fields: str) -> bool:
    data = payload.get(section) or {}
    return any(isinstance(data.get(field), list) for field in fields)


def _lipid_points(ldl: Optional[float], total: Optional[float]) -> int:
    if ldl is not None:
        if ldl >= 160:
            return 5
        if ldl >= 130:
            return 3
        if ldl >= 100:
            return 1
        return 0
    if total is not None:
        if total >= 240:
            return 5
        if total >= 200:
            return 3
        return 0
    return 0


def _waist_points(waist_cm: Optional[float], gender: str) -> int:
    """Asian waist cutoffs (IDF): men 90 cm, women 80 cm."""
    if waist_cm is None:
        return 0
    if gender == 'female':
        if waist_cm >= 80:
            return 4
        if waist_cm >= 75:
            return 2
        return 0
    if waist_cm >= 90:
        return 4
    if waist_cm >= 85:
        return 2
    return 0


# ---------------------------------------------------------------------------
# Payload readers — tolerant of v1 and v2 shapes
# ---------------------------------------------------------------------------

def _vitals(payload: Dict[str, Any]) -> Dict[str, Any]:
    return payload.get('vitals') or {}


def _declared_unknown(payload: Dict[str, Any]) -> frozenset:
    return frozenset(_vitals(payload).get('declared_unknown') or [])


def _conditions(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Return structured condition entries.

    Accepts the v2 ``medical.conditions`` list of objects, and coerces the v1
    ``medical.existing_conditions`` list of bare strings so legacy payloads
    start contributing instead of being silently dropped.
    """
    medical = payload.get('medical') or {}
    raw = medical.get('conditions')
    if raw:
        return [c for c in raw if isinstance(c, dict) and _norm(c.get('name'))]
    legacy = medical.get('existing_conditions') or []
    return [
        {'name': name, 'diagnosed_bucket': 'unknown', 'control': 'unsure', 'treatment': 'none'}
        for name in legacy
        if _norm(name)
    ]


def _medications(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    medical = payload.get('medical') or {}
    raw = medical.get('medications')
    if raw:
        return [m for m in raw if isinstance(m, dict) and _norm(m.get('name'))]
    return [{'name': n} for n in (medical.get('current_medications') or []) if _norm(n)]


def _family(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Return structured family entries, coercing the v1 bare-string list."""
    fh = payload.get('family_history') or {}
    raw = fh.get('entries')
    if raw:
        return [e for e in raw if isinstance(e, dict) and e.get('condition')]
    return [
        {'condition': c, 'relations': [], 'onset_bucket': 'unknown'}
        for c in (fh.get('conditions') or [])
    ]


def condition_score(entry: Dict[str, Any]) -> float:
    """Score one diagnosed condition.

    ``base * min(duration * control * treatment, COMBINED_MULT_CAP)`` plus
    discrete bumps for severity and a recent related hospitalisation.
    """
    base = CONDITION_BASE.get(_norm(entry.get('name')), DEFAULT_CONDITION_BASE)
    score = base * min(condition_multiplier(entry), COMBINED_MULT_CAP)
    score += SEVERITY_BONUS.get(entry.get('severity') or '', 0)
    if entry.get('hospitalised_12m'):
        score += HOSPITALISED_BONUS
    return score


def condition_multiplier(entry: Dict[str, Any]) -> float:
    """The raw, uncapped duration x control x treatment product."""
    return (
        DURATION_MULT.get(entry.get('diagnosed_bucket') or 'unknown', 1.1)
        * CONTROL_MULT.get(entry.get('control') or 'unsure', 1.25)
        * TREATMENT_MULT.get(entry.get('treatment') or 'none', 1.5)
    )


def hereditary_score(entry: Dict[str, Any]) -> float:
    """Score one family-history entry by relation degree and onset age."""
    base = HEREDITARY_BASE.get(entry.get('condition'), 1)
    relations = {_norm(r) for r in (entry.get('relations') or [])}
    if not relations:
        rel_mult = RELATION_MULT_UNSPECIFIED
    elif relations & _FIRST_DEGREE:
        rel_mult = RELATION_MULT_FIRST
    else:
        rel_mult = RELATION_MULT_SECOND
    onset_mult = ONSET_MULT.get(entry.get('onset_bucket') or 'unknown', 1.0)
    return base * rel_mult * onset_mult


def _phq2_total(mental: Dict[str, Any]) -> Optional[int]:
    a = _num(mental.get('phq2_interest'))
    b = _num(mental.get('phq2_down'))
    if a is None or b is None:
        return None
    return int(a + b)


def _gad2_total(mental: Dict[str, Any]) -> Optional[int]:
    a = _num(mental.get('gad2_nervous'))
    b = _num(mental.get('gad2_worry'))
    if a is None or b is None:
        return None
    return int(a + b)


# ---------------------------------------------------------------------------
# Accumulator
# ---------------------------------------------------------------------------

def _accumulate(payload: Dict[str, Any]) -> Tuple[Dict[str, int], List[Dict[str, Any]]]:
    """Walk the payload, building pre-cap component totals and the ordered
    ``contributing_factors`` list.

    Iteration order is fixed so the output is byte-deterministic.
    """
    components: Dict[str, int] = {k: 0 for k in _COMPONENT_ORDER}
    factors: List[Dict[str, Any]] = []

    def add(dimension: str, component: str, delta: float, *,
            label: str = '', kind: str = 'reported',
            multiplier: Optional[float] = None,
            explanation: str = '') -> None:
        rounded = int(round(delta))
        if rounded <= 0:
            return
        components[component] += rounded
        factor: Dict[str, Any] = {
            'dimension': dimension,
            'component': component,
            'delta': rounded,
            'label': label or dimension,
            'kind': kind,
        }
        if multiplier is not None:
            factor['multiplier'] = round(multiplier, 2)
        if explanation:
            factor['explanation'] = explanation
        factors.append(factor)

    basic = payload.get('basic') or {}
    lifestyle = payload.get('lifestyle') or {}
    vitals = _vitals(payload)
    activity = payload.get('activity') or {}

    age = int(_num(basic.get('age')) or 0)
    gender = _norm(basic.get('gender'))
    bmi = bmi_value(basic.get('height_cm'), basic.get('weight_kg'))
    bucket = bmi_bucket(bmi)

    # -- conditions ---------------------------------------------------------
    for entry in sorted(_conditions(payload), key=lambda c: _norm(c.get('name'))):
        name = str(entry.get('name'))
        applied = min(condition_multiplier(entry), COMBINED_MULT_CAP)
        add(
            'condition.' + _norm(name), 'conditions', condition_score(entry),
            label=name, multiplier=applied,
            explanation='{0}, {1}, {2}'.format(
                DURATION_TEXT.get(entry.get('diagnosed_bucket') or 'unknown', entry.get('diagnosed_bucket')),
                CONTROL_TEXT.get(entry.get('control') or 'unsure', entry.get('control')),
                TREATMENT_TEXT.get(entry.get('treatment') or 'none', entry.get('treatment')),
            ).capitalize(),
        )

    # -- cardiovascular -----------------------------------------------------
    py = pack_years(lifestyle.get('cigarettes_per_day'), lifestyle.get('smoking_years'))
    if py is not None:
        pts = _smoking_points(lifestyle)
        add('lifestyle.pack_years', 'cardiovascular', pts,
            label='Smoking', kind='measured',
            explanation='{0:.1f} pack-years'.format(py))
    else:
        add('lifestyle.smoking', 'cardiovascular',
            _smoking_points(lifestyle), label='Smoking')

    add('lifestyle.smokeless_tobacco', 'cardiovascular',
        SMOKELESS_TOBACCO.get(_norm(lifestyle.get('smokeless_tobacco')), 0),
        label='Smokeless tobacco')

    units = _num(lifestyle.get('alcohol_units_per_week'))
    if units is not None:
        pts = 8 if units > 21 else 5 if units >= 15 else 3 if units >= 8 else 1 if units >= 1 else 0
        add('lifestyle.alcohol_units', 'cardiovascular', pts,
            label='Alcohol', kind='measured',
            explanation='{0:g} units/week'.format(units))
    else:
        add('lifestyle.alcohol', 'cardiovascular',
            ALCOHOL_ORDINAL.get(_norm(lifestyle.get('alcohol')), 0), label='Alcohol')

    # Measured step data beats self-report; self-reported minutes beat an ordinal.
    avg_steps = _num(activity.get('avg_steps_7d'))
    minutes = _num(lifestyle.get('exercise_minutes_per_week'))
    if avg_steps is not None:
        pts = 0 if avg_steps >= 8000 else 1 if avg_steps >= 5000 else 3 if avg_steps >= 3000 else 5
        add('lifestyle.activity', 'cardiovascular', pts,
            label='Physical activity', kind='measured',
            explanation='{0} steps/day average'.format(int(avg_steps)))
    elif minutes is not None:
        pts = 0 if minutes >= 150 else 2 if minutes >= 75 else 4 if minutes >= 1 else 6
        add('lifestyle.activity', 'cardiovascular', pts,
            label='Physical activity', kind='measured',
            explanation='{0} min/week'.format(int(minutes)))
    else:
        add('lifestyle.exercise_frequency', 'cardiovascular',
            EXERCISE_ORDINAL.get(_norm(lifestyle.get('exercise_frequency')), 0),
            label='Physical activity')

    sedentary = _num(lifestyle.get('sedentary_hours_per_day'))
    if sedentary is not None:
        pts = 3 if sedentary >= 10 else 2 if sedentary >= 8 else 1 if sedentary >= 6 else 0
        add('lifestyle.sedentary', 'cardiovascular', pts, label='Sitting time',
            explanation='{0:g} h/day'.format(sedentary))

    systolic = _num(vitals.get('systolic_mmhg'))
    diastolic = _num(vitals.get('diastolic_mmhg'))
    if systolic is not None or diastolic is not None:
        add('vitals.blood_pressure', 'cardiovascular', _bp_points(systolic, diastolic),
            label='Blood pressure', kind='measured',
            explanation='{0}/{1} mmHg'.format(int(systolic or 0), int(diastolic or 0)))
    elif age >= 40:
        add('vitals.blood_pressure_unknown', 'cardiovascular', 4,
            label='Blood pressure not known', kind='unassessed',
            explanation='Unmeasured risk in this age group')

    ldl = _num(vitals.get('ldl_mgdl'))
    total_chol = _num(vitals.get('total_cholesterol_mgdl'))
    if ldl is not None or total_chol is not None:
        add('vitals.lipids', 'cardiovascular', _lipid_points(ldl, total_chol),
            label='Cholesterol', kind='measured')
    elif age >= 40:
        add('vitals.lipids_unknown', 'cardiovascular', 2,
            label='Cholesterol not known', kind='unassessed',
            explanation='Unmeasured risk in this age group')

    add('basic.age', 'cardiovascular', _age_points(age), label='Age')

    # -- metabolic ----------------------------------------------------------
    if bucket:
        add('basic.bmi', 'metabolic', BMI_POINTS[bucket], label='Body mass index',
            explanation='BMI {0:.1f} ({1}, Asia-Pacific cutoffs)'.format(bmi, bucket))

    waist = _num(vitals.get('waist_cm'))
    add('vitals.waist', 'metabolic', _waist_points(waist, gender), label='Waist',
        kind='measured' if waist is not None else 'reported')

    fasting = _num(vitals.get('fasting_glucose_mgdl'))
    hba1c = _num(vitals.get('hba1c_percent'))
    if fasting is not None or hba1c is not None:
        add('vitals.glucose', 'metabolic', _glucose_points(fasting, hba1c),
            label='Blood sugar', kind='measured')
    else:
        family_diabetes = any(e.get('condition') == 'Diabetes' for e in _family(payload))
        if family_diabetes or age >= 40 or (bmi is not None and bmi >= 23):
            add('vitals.glucose_unknown', 'metabolic', 4,
                label='Blood sugar not known', kind='unassessed',
                explanation='Unmeasured risk given your age, weight or family history')

    sugary = _num(lifestyle.get('sugary_drinks_per_week'))
    if sugary is not None:
        add('lifestyle.sugary_drinks', 'metabolic',
            3 if sugary >= 7 else 2 if sugary >= 3 else 0, label='Sugary drinks')
    fried = _num(lifestyle.get('fried_food_per_week'))
    if fried is not None:
        add('lifestyle.fried_food', 'metabolic', 2 if fried >= 5 else 0, label='Fried food')
    servings = _num(lifestyle.get('fruit_veg_servings'))
    if servings is not None:
        add('lifestyle.fruit_veg', 'metabolic', 2 if servings < 2 else 0,
            label='Fruit and vegetables')
    else:
        add('lifestyle.fruit_veg_unknown', 'metabolic', 2,
            label='Fruit and vegetable intake not known', kind='unassessed',
            explanation='Provisional points until intake is reported; not a finding of poor diet.')

    add('lifestyle.water_intake', 'metabolic',
        WATER_ORDINAL.get(_norm(lifestyle.get('water_intake')), 0), label='Hydration')

    # -- mental wellness ----------------------------------------------------
    mental = payload.get('mental') or {}
    phq2 = _phq2_total(mental)
    gad2 = _gad2_total(mental)
    if phq2 is not None:
        add('mental.phq2', 'mental_wellness',
            6 if phq2 >= 5 else 4 if phq2 >= 3 else 1 if phq2 >= 1 else 0,
            label='Mood (PHQ-2)', explanation='PHQ-2 score {0}/6'.format(phq2))
    if gad2 is not None:
        add('mental.gad2', 'mental_wellness',
            5 if gad2 >= 5 else 3 if gad2 >= 3 else 1 if gad2 >= 1 else 0,
            label='Anxiety (GAD-2)', explanation='GAD-2 score {0}/6'.format(gad2))

    hours = _num(lifestyle.get('sleep_hours'))
    if hours is not None:
        pts = 4 if hours < 5 else 2 if hours < 7 else 1 if hours > 9 else 0
        add('lifestyle.sleep_hours', 'mental_wellness', pts, label='Sleep',
            explanation='{0:g} h/night'.format(hours))
    else:
        add('lifestyle.sleep_quality', 'mental_wellness',
            SLEEP_QUALITY_ORDINAL.get(_norm(lifestyle.get('sleep_quality')), 0), label='Sleep')

    add('lifestyle.stress_level', 'mental_wellness',
        STRESS_ORDINAL.get(_norm(lifestyle.get('stress_level')), 0), label='Stress')

    # -- hereditary ---------------------------------------------------------
    for entry in sorted(_family(payload), key=lambda e: str(e.get('condition'))):
        cond = str(entry.get('condition'))
        relations = [_norm(r) for r in (entry.get('relations') or [])]
        detail = ', '.join(relations) if relations else 'relation not specified'
        onset = entry.get('onset_bucket') or 'unknown'
        add('family_history.' + cond, 'hereditary', hereditary_score(entry),
            label='Family history: ' + cond,
            explanation='{0}, {1}'.format(detail, ONSET_TEXT.get(onset, onset)).capitalize())

    return components, factors


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

def classify(score: int) -> str:
    """Map a 0..100 risk score to a level.

    These are heuristic index bands, not calibrated disease probabilities.
    The report level can be raised separately by a clinical review flag.
    """
    if score < 25:
        return 'Low'
    if score < 50:
        return 'Moderate'
    if score < 75:
        return 'High'
    return 'Very High'


# ---------------------------------------------------------------------------
# Confidence and completeness
# ---------------------------------------------------------------------------

def _evidence_state(payload: Dict[str, Any]) -> Dict[str, str]:
    """Classify each evidence group as 'known', 'unknown' or 'unasked'.

    'known'   -> we have a value
    'unknown' -> the user explicitly said they do not know
    'unasked' -> we never got an answer either way
    """
    vitals = _vitals(payload)
    declared = _declared_unknown(payload)
    lifestyle = payload.get('lifestyle') or {}
    conditions = _conditions(payload)
    medications = _medications(payload)
    family = _family(payload)
    mental = payload.get('mental') or {}

    def vital_state(fields: List[str]) -> str:
        if any(_num(vitals.get(f)) is not None for f in fields):
            return 'known'
        if any(f in declared for f in fields):
            return 'unknown'
        return 'unasked'

    state: Dict[str, str] = {
        'blood_pressure': vital_state(['systolic_mmhg', 'diastolic_mmhg']),
        'glucose': vital_state(['fasting_glucose_mgdl', 'hba1c_percent']),
        'lipids': vital_state(['ldl_mgdl', 'total_cholesterol_mgdl']),
        'waist': vital_state(['waist_cm']),
    }
    if not all(_num(vitals.get(f)) is not None for f in ('systolic_mmhg', 'diastolic_mmhg')):
        state['blood_pressure'] = 'unknown' if declared & {'systolic_mmhg', 'diastolic_mmhg'} else 'unasked'

    # A condition list is "detailed" once every entry says something about how
    # long it has been present and how well it is controlled.
    if not conditions:
        state['conditions_detail'] = 'known' if _answered_list(payload, 'medical', 'conditions', 'existing_conditions') else 'unasked'
    elif all(
        (c.get('diagnosed_bucket') or 'unknown') != 'unknown'
        and (c.get('control') or 'unsure') != 'unsure'
        for c in conditions
    ):
        state['conditions_detail'] = 'known'
    else:
        state['conditions_detail'] = 'unasked'

    if not medications:
        state['medications_detail'] = 'known' if _answered_list(payload, 'medical', 'medications', 'current_medications') else 'unasked'
    elif all((m.get('started_bucket') or 'unknown') != 'unknown' for m in medications):
        state['medications_detail'] = 'known'
    else:
        state['medications_detail'] = 'unasked'

    if not family:
        state['family_detail'] = 'known' if _answered_list(payload, 'family_history', 'entries', 'conditions') else 'unasked'
    elif all((e.get('relations') or []) for e in family):
        state['family_detail'] = 'known'
    else:
        state['family_detail'] = 'unasked'

    quantified = [
        lifestyle.get('exercise_minutes_per_week'),
        lifestyle.get('sleep_hours'),
        lifestyle.get('alcohol_units_per_week'),
    ]
    state['lifestyle_quantities'] = 'known' if all(v is not None for v in quantified) else 'unasked'

    has_mental = _phq2_total(mental) is not None and _gad2_total(mental) is not None
    state['mental_screeners'] = 'known' if has_mental else 'unasked'
    state['diet'] = 'known' if _num(lifestyle.get('fruit_veg_servings')) is not None else 'unasked'
    state['tobacco'] = 'known' if _norm(lifestyle.get('smoking')) in SMOKING_ORDINAL else 'unasked'

    return state


def compute_confidence(payload: Dict[str, Any]) -> Dict[str, Any]:
    """How much we trust this score, and what is missing.

    ``confidence`` counts only evidence we actually have. An explicit "I don't
    know" counts toward ``completeness`` (the user answered) but never toward
    ``confidence`` (we still do not know the value). That distinction is what
    stops missing data from reading as healthy.
    """
    state = _evidence_state(payload)
    total = float(sum(CONFIDENCE_WEIGHTS.values()))

    confident = sum(w for k, w in CONFIDENCE_WEIGHTS.items() if state[k] == 'known')
    complete = sum(
        w for k, w in CONFIDENCE_WEIGHTS.items() if state[k] in ('known', 'unknown')
    )

    missing = [
        {'id': k, 'label': _CONFIDENCE_LABELS[k], 'state': state[k]}
        for k in sorted(CONFIDENCE_WEIGHTS, key=lambda x: -CONFIDENCE_WEIGHTS[x])
        if state[k] != 'known'
    ]

    return {
        'confidence': int(round(100.0 * confident / total)),
        'completeness': int(round(100.0 * complete / total)),
        'missing': missing,
    }


# ---------------------------------------------------------------------------
# Wellness — protective factors, independent of risk
# ---------------------------------------------------------------------------

def compute_wellness(payload: Dict[str, Any]) -> int:
    """A positive score built from protective factors.

    Deliberately NOT ``100 - risk_score``. A mirror of the risk number carries
    no information of its own, and the dashboard already labels this
    "WELLNESS /100".
    """
    basic = payload.get('basic') or {}
    lifestyle = payload.get('lifestyle') or {}
    activity = payload.get('activity') or {}
    total = 0

    # Activity (max 20)
    avg_steps = _num(activity.get('avg_steps_7d'))
    minutes = _num(lifestyle.get('exercise_minutes_per_week'))
    if avg_steps is not None:
        total += 20 if avg_steps >= 8000 else 14 if avg_steps >= 5000 else 8 if avg_steps >= 3000 else 0
    elif minutes is not None:
        total += 20 if minutes >= 150 else 14 if minutes >= 75 else 8 if minutes >= 1 else 0
    else:
        total += {'daily': 20, 'regular': 14, 'occasional': 8, 'never': 0}.get(
            _norm(lifestyle.get('exercise_frequency')), 0)

    # Sleep (max 15)
    hours = _num(lifestyle.get('sleep_hours'))
    if hours is not None:
        total += 15 if 7 <= hours <= 9 else 9 if 6 <= hours <= 10 else 3
    else:
        total += {'excellent': 15, 'good': 11, 'fair': 6, 'poor': 1}.get(
            _norm(lifestyle.get('sleep_quality')), 0)

    # Diet (max 15)
    servings = _num(lifestyle.get('fruit_veg_servings'))
    if servings is not None:
        total += 15 if servings >= 5 else 10 if servings >= 3 else 5 if servings >= 1 else 0

    # Not smoking (max 10)
    tobacco_credit = {'never': 10, 'former': 7, 'occasional': 3, 'regular': 0}.get(
        _norm(lifestyle.get('smoking')), 0)
    if _smoking_points(lifestyle) >= 6:
        tobacco_credit = min(tobacco_credit, 3)
    if _smoking_points(lifestyle) >= 10:
        tobacco_credit = 0
    smokeless = _norm(lifestyle.get('smokeless_tobacco'))
    if smokeless in ('occasional', 'daily'):
        tobacco_credit = min(tobacco_credit, 3 if smokeless == 'occasional' else 0)
    total += tobacco_credit

    # Healthy weight (max 10)
    bucket = bmi_bucket(bmi_value(basic.get('height_cm'), basic.get('weight_kg')))
    total += {'normal': 10, 'overweight': 6, 'underweight': 4, 'obese': 2}.get(bucket or '', 0)

    # Conditions under control (max 10). Absence of an answer earns no credit.
    conditions = _conditions(payload)
    if not conditions:
        total += 10 if _answered_list(payload, 'medical', 'conditions', 'existing_conditions') else 0
    else:
        controls = {(c.get('control') or 'unsure') for c in conditions}
        if controls <= {'well'}:
            total += 9
        elif controls & {'poorly', 'unsure'}:
            total += 0
        else:
            total += 5

    # Vitals (max 10): only known, favourable readings earn credit.
    vitals = _vitals(payload)
    s, d = _num(vitals.get('systolic_mmhg')), _num(vitals.get('diastolic_mmhg'))
    if s is not None and d is not None and 90 <= s < 120 and 60 <= d < 80:
        total += 4
    fasting, a1c = _num(vitals.get('fasting_glucose_mgdl')), _num(vitals.get('hba1c_percent'))
    if (fasting is not None or a1c is not None) and _glucose_points(fasting, a1c) == 0 and (fasting is None or fasting >= 70):
        total += 3
    ldl, cholesterol = _num(vitals.get('ldl_mgdl')), _num(vitals.get('total_cholesterol_mgdl'))
    if (ldl is not None or cholesterol is not None) and _lipid_points(ldl, cholesterol) == 0:
        total += 3

    # Mood and anxiety (max 10); these are screening results, not diagnoses.
    mental = payload.get('mental') or {}
    for score in (_phq2_total(mental), _gad2_total(mental)):
        if score is not None:
            total += 5 if score == 0 else 3 if score < 3 else 0

    return max(0, min(100, total))


def _review_flags(payload: Dict[str, Any]) -> List[Tuple[str, str, str]]:
    """Minimum report levels, independent of the additive burden index.

    These are conservative product review rules, not calibrated risk bands.
    Keep urgent guidance deterministic and visible without an AI response.
    """
    flags = []
    vitals = _vitals(payload)
    s, d = _num(vitals.get('systolic_mmhg')), _num(vitals.get('diastolic_mmhg'))
    if (s is not None and s > 180) or (d is not None and d > 120):
        flags.append(('vitals.blood_pressure', 'Very High',
                      'Very high reported blood pressure raises the report level independently of the point total. '
                      'If you have chest pain, breathlessness, weakness, vision changes or difficulty speaking, seek emergency care now. '
                      'Otherwise repeat the measurement after at least one minute and contact a healthcare professional immediately if it remains this high.'))
    elif _bp_points(s, d) >= 9:
        flags.append(('vitals.blood_pressure', 'High',
                      'Elevated reported blood pressure raises the report level independently of the point total. Arrange clinical review and repeat measurements.'))
    fasting, a1c = _num(vitals.get('fasting_glucose_mgdl')), _num(vitals.get('hba1c_percent'))
    if _glucose_points(fasting, a1c) >= 9:
        flags.append(('vitals.glucose', 'High',
                      'A reported blood sugar result needs clinical review and raises the report level independently of the point total. '
                      'A single result is not a diagnosis; confirm with a healthcare professional.'))
    if fasting is not None and a1c is not None and _glucose_points(fasting, None) != _glucose_points(None, a1c):
        flags.append(('vitals.glucose', 'Moderate',
                      'Fasting glucose and HbA1c fall in different ranges. Neither result cancels the other; discuss repeat testing with a healthcare professional.'))
    mental = payload.get('mental') or {}
    for name, score in (('phq2', _phq2_total(mental)), ('gad2', _gad2_total(mental))):
        if score is not None and score >= 3:
            flags.append(('mental.' + name, 'Moderate',
                          'A positive screening result raises the report level to at least Moderate independently of the point total. '
                          'Arrange a fuller mental health assessment; this screening result is not a diagnosis.'))
    return flags


# ---------------------------------------------------------------------------
# Validated sub-scores
# ---------------------------------------------------------------------------

def _findrisc(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Original eight-item questionnaire; never infer answers from proxies.

    Original form: https://carpha.org/Portals/0/FINDRISC.pdf
    Existing clients do not collect all these answers, so omit the instrument
    until the exact questionnaire is supplied. No population risk percentages
    are exported as individual predictions for this app's population.
    """
    basic = payload.get('basic') or {}
    answers = payload.get('findrisc') or {}
    age = _num(basic.get('age'))
    bmi = bmi_value(basic.get('height_cm'), basic.get('weight_kg'))
    waist = _num(_vitals(payload).get('waist_cm'))
    gender = _norm(basic.get('gender'))
    required = ('daily_activity_30min', 'daily_fruit_vegetables',
                'ever_bp_medication', 'ever_high_glucose')
    family = answers.get('family_diabetes')
    if (age is None or age < 18 or bmi is None or waist is None
            or gender not in ('male', 'female')
            or not all(isinstance(answers.get(k), bool) for k in required)
            or family not in ('none', 'second_degree', 'first_degree')
            or not _answered_list(payload, 'medical', 'conditions', 'existing_conditions')):
        return None
    if any('diabetes' in _norm(c.get('name')) for c in _conditions(payload)):
        return None  # Do not predict development of a condition already reported.

    score = 0 if age < 45 else 2 if age < 55 else 3 if age < 65 else 4
    score += 0 if bmi < 25 else 1 if bmi <= 30 else 3
    low, high = (80, 88) if gender == 'female' else (94, 102)
    score += 0 if waist < low else 3 if waist <= high else 4
    score += 0 if answers['daily_activity_30min'] else 2
    score += 0 if answers['daily_fruit_vegetables'] else 1
    score += 2 if answers['ever_bp_medication'] else 0
    score += 5 if answers['ever_high_glucose'] else 0
    score += {'none': 0, 'second_degree': 3, 'first_degree': 5}[family]
    band = ('Low' if score < 7 else 'Slightly elevated' if score < 12
            else 'Moderate' if score < 15 else 'High' if score <= 20 else 'Very high')
    return {
        'id': 'findrisc', 'label': 'FINDRISC (type 2 diabetes)',
        'score': score, 'max': 26, 'band': band,
        'detail': 'Original questionnaire score; not a diagnosis or a locally calibrated ten-year probability. Discuss screening with a healthcare professional.',
    }


def _screener(mental: Dict[str, Any], kind: str) -> Optional[Dict[str, Any]]:
    total = _phq2_total(mental) if kind == 'phq2' else _gad2_total(mental)
    if total is None:
        return None
    positive = total >= 3
    return {
        'id': kind,
        'label': 'PHQ-2 (mood)' if kind == 'phq2' else 'GAD-2 (anxiety)',
        'score': total,
        'max': 6,
        'band': 'Screen positive' if positive else 'Screen negative',
        'detail': (
            'A score of 3 or more suggests a fuller assessment is worthwhile.'
            if positive else 'Below the threshold for further screening.'
        ),
    }


def compute_subscores(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Validated instruments, emitted only when their inputs are present."""
    mental = payload.get('mental') or {}
    candidates = [_findrisc(payload), _screener(mental, 'phq2'), _screener(mental, 'gad2')]
    return [c for c in candidates if c is not None]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def compute_components_uncapped(payload: Dict[str, Any]) -> Dict[str, int]:
    """Pre-cap component sums. Property tests use this so per-component caps
    do not mask a monotonicity violation."""
    components, _ = _accumulate(payload)
    return components


def compute_risk(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Compute the deterministic risk assessment for an onboarding payload.

    Every key is read defensively, so a v1-shaped payload (no ``vitals``, no
    ``mental``, bare-string conditions) still produces a valid result.

    Returns ``risk_score``, ``risk_level``, ``wellness_score``, ``components``
    (each with its cap), ``contributing_factors``, ``confidence`` and
    ``subscores``.
    """
    components, factors = _accumulate(payload)

    capped = {k: min(components[k], COMPONENT_CAPS[k]) for k in _COMPONENT_ORDER}
    risk_score = min(100, sum(capped.values()))
    confidence = compute_confidence(payload)
    level = classify(risk_score)
    levels = ('Low', 'Moderate', 'High', 'Very High')
    flags = _review_flags(payload)
    for dimension, minimum, explanation in flags:
        if levels.index(minimum) > levels.index(level):
            level = minimum
        for factor in factors:
            if factor['dimension'] == dimension:
                factor['explanation'] = (factor.get('explanation', '') + ' ' + explanation).strip()
    # Existing onboarding renders only the three largest deltas, even when
    # AI is unavailable. Keep a report-level notice visible if its own factor
    # falls outside that shortlist; do not manipulate points to force sorting.
    visible = sorted(factors, key=lambda factor: -factor['delta'])[:3]
    visible_dimensions = {factor['dimension'] for factor in visible}
    hidden_notices = [explanation for dimension, _, explanation in flags
                      if dimension not in visible_dimensions]
    if visible and hidden_notices:
        first = visible[0]
        first['explanation'] = ('Report review notice (no additional points): '
                                + ' '.join(hidden_notices) + ' '
                                + first.get('explanation', '')).strip()

    return {
        'risk_score': risk_score,
        'risk_level': level,
        'wellness_score': compute_wellness(payload),
        'components': {
            k: {'score': capped[k], 'cap': COMPONENT_CAPS[k]} for k in _COMPONENT_ORDER
        },
        'contributing_factors': factors,
        'confidence': confidence,
        'subscores': compute_subscores(payload),
    }


__all__ = [
    'COMPONENT_CAPS',
    'CONDITION_BASE',
    'DEFAULT_CONDITION_BASE',
    'DURATION_MULT',
    'CONTROL_MULT',
    'TREATMENT_MULT',
    'COMBINED_MULT_CAP',
    'HEREDITARY_BASE',
    'ONSET_MULT',
    'BMI_POINTS',
    'CONFIDENCE_WEIGHTS',
    'bmi_value',
    'bmi_bucket',
    'pack_years',
    'condition_score',
    'condition_multiplier',
    'hereditary_score',
    'classify',
    'compute_risk',
    'compute_components_uncapped',
    'compute_confidence',
    'compute_wellness',
    'compute_subscores',
]
