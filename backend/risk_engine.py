"""Deterministic, explainable risk scoring engine for the Eunoia onboarding flow.

This module is intentionally pure: no network calls, no file I/O, no database
access, no AI/LLM imports. It is unit-testable in isolation and is designed so
that two byte-identical inputs yield byte-identical outputs (Requirement 13.3,
13.10).

Public surface:
    - ``compute_risk(payload)`` — primary entry point. Returns a dict matching
      the ``RiskEngineResult`` Pydantic shape declared in
      ``backend/server.py``: ``risk_score`` (int 0..100), ``risk_level``
      ('Low' | 'Moderate' | 'High'), ``wellness_score`` (int 0..100),
      ``components`` (capped, per-bucket totals), and ``contributing_factors``
      (list of ``{dimension, component, delta}`` dicts in deterministic
      order).
    - ``classify(score)`` — maps an integer 0..100 to the risk level using the
      lower-third / middle-third / upper-third partition from
      Requirement 13.9.
    - ``compute_components_uncapped(payload)`` — returns the pre-cap component
      sums. Property tests use this so the strict per-dimension monotonicity
      from Requirement 13.4..13.8 stays observable even when the per-component
      caps would otherwise mask it.

Constants ``CARDIO_*``, ``METABOLIC_*``, ``WELLNESS_*``, ``HEREDITARY_TABLE``,
and ``COMPONENT_CAPS`` are exposed for tests and traceability with
design § "Scoring tables".
"""

from __future__ import annotations

from typing import Any, Dict, List, Tuple

# ---------------------------------------------------------------------------
# Scoring tables — see design § "Scoring tables".
# ---------------------------------------------------------------------------

# Cardiovascular component drivers.
CARDIO_SMOKING: Dict[str, int] = {
    'never': 0,
    'former': 3,
    'occasional': 6,
    'regular': 12,
}

CARDIO_ALCOHOL: Dict[str, int] = {
    'never': 0,
    'occasional': 1,
    'moderate': 3,
    'frequent': 6,
}

CARDIO_EXERCISE: Dict[str, int] = {
    'daily': 0,
    'regular': 1,
    'occasional': 4,
    'never': 8,
}

CARDIO_FAMILY: Dict[str, int] = {
    'Heart Disease': 5,
    'Hypertension': 3,
}

# Age band labels mapping to cardiovascular deltas.
CARDIO_AGE: Dict[str, int] = {
    '<30': 0,
    '30..44': 1,
    '45..59': 3,
    '>=60': 5,
}

# Metabolic component drivers.
METABOLIC_BMI: Dict[str, int] = {
    'normal': 0,
    'overweight': 3,
    'extreme': 6,
}

METABOLIC_FAMILY: Dict[str, int] = {
    'Diabetes': 4,
    'Obesity': 3,
    'Thyroid Disorders': 2,
}

METABOLIC_WATER: Dict[str, int] = {
    'high': 0,
    'moderate': 1,
    'low': 3,
}

# Wellness component drivers (higher value = lower wellness score).
WELLNESS_SLEEP: Dict[str, int] = {
    'excellent': 0,
    'good': 1,
    'fair': 3,
    'poor': 6,
}

WELLNESS_STRESS: Dict[str, int] = {
    'low': 0,
    'moderate': 2,
    'high': 6,
}

WELLNESS_FAMILY: Dict[str, int] = {
    'Mental Health Disorders': 4,
}

# Hereditary component table — only Cancer and Asthma route here. Diabetes,
# Obesity, Thyroid Disorders, Heart Disease, Hypertension, and Mental Health
# Disorders are routed via the per-component family tables above.
HEREDITARY_TABLE: Dict[str, int] = {
    'Cancer': 5,
    'Asthma': 2,
}

# Per-component caps applied before the global 0..100 clamp.
COMPONENT_CAPS: Dict[str, int] = {
    'cardiovascular': 35,
    'metabolic': 25,
    'wellness': 25,
    'hereditary': 20,
}

# Component bucket order — used everywhere we need a deterministic iteration
# of components so the output dict is stable across Python versions.
_COMPONENT_ORDER: Tuple[str, ...] = (
    'cardiovascular',
    'metabolic',
    'wellness',
    'hereditary',
)


# ---------------------------------------------------------------------------
# Helpers.
# ---------------------------------------------------------------------------

def _bmi_bucket(height_cm: float, weight_kg: float) -> str:
    """Bucket a BMI value as 'extreme', 'overweight', or 'normal'.

    BMI is computed as ``weight_kg / (height_cm / 100) ** 2``. Buckets per
    design § "Scoring tables":

      - bmi < 18.5  → 'extreme'
      - bmi >= 30   → 'extreme'
      - 25 <= bmi < 30 → 'overweight'
      - 18.5 <= bmi < 25 → 'normal'
    """
    bmi = weight_kg / ((height_cm / 100.0) ** 2)
    if bmi < 18.5 or bmi >= 30:
        return 'extreme'
    if bmi >= 25:
        return 'overweight'
    return 'normal'


def _age_band(age: int) -> str:
    """Return the age-band label for the given integer age."""
    if age < 30:
        return '<30'
    if age < 45:
        return '30..44'
    if age < 60:
        return '45..59'
    return '>=60'


def _family_contributions(cond: str) -> List[Tuple[str, int]]:
    """Return the ``(component, delta)`` pairs contributed by a family-history
    condition.

    The lookup order — cardiovascular, metabolic, wellness, hereditary — is
    fixed so the resulting ``contributing_factors`` list is byte-deterministic
    when a single condition contributes to multiple components.
    Only non-zero deltas are emitted.
    """
    contribs: List[Tuple[str, int]] = []
    cardio_delta = CARDIO_FAMILY.get(cond, 0)
    if cardio_delta:
        contribs.append(('cardiovascular', cardio_delta))
    metabolic_delta = METABOLIC_FAMILY.get(cond, 0)
    if metabolic_delta:
        contribs.append(('metabolic', metabolic_delta))
    wellness_delta = WELLNESS_FAMILY.get(cond, 0)
    if wellness_delta:
        contribs.append(('wellness', wellness_delta))
    hereditary_delta = HEREDITARY_TABLE.get(cond, 0)
    if hereditary_delta:
        contribs.append(('hereditary', hereditary_delta))
    return contribs


# ---------------------------------------------------------------------------
# Classification.
# ---------------------------------------------------------------------------

def classify(score: int) -> str:
    """Map an integer ``score`` in [0, 100] to a risk level.

    Thresholds (Requirement 13.9):
        - 0  <= score < 34   → 'Low'
        - 34 <= score < 67   → 'Moderate'
        - 67 <= score <= 100 → 'High'
    """
    if score < 34:
        return 'Low'
    if score < 67:
        return 'Moderate'
    return 'High'


# ---------------------------------------------------------------------------
# Internal accumulator shared by ``compute_risk`` and
# ``compute_components_uncapped``.
# ---------------------------------------------------------------------------

def _accumulate(payload: Dict[str, Any]) -> Tuple[Dict[str, int], List[Dict[str, Any]]]:
    """Walk the payload, building the pre-cap component totals and the ordered
    ``contributing_factors`` list.

    Iteration order — kept fixed so the output is byte-deterministic
    (Requirement 13.3):

      1. Lifestyle keys, in source-defined order:
         smoking, alcohol, exercise_frequency, water_intake, sleep_quality,
         stress_level.
      2. age (cardiovascular).
      3. bmi (metabolic).
      4. family_history.conditions in ``sorted()`` order; for each condition
         the family-table lookup order is cardio → metabolic → wellness →
         hereditary.
    """
    components: Dict[str, int] = {k: 0 for k in _COMPONENT_ORDER}
    factors: List[Dict[str, Any]] = []

    def add(dimension: str, component: str, delta: int) -> None:
        if delta > 0:
            components[component] += delta
            factors.append({
                'dimension': dimension,
                'component': component,
                'delta': delta,
            })

    lifestyle = payload['lifestyle']
    add('smoking', 'cardiovascular', CARDIO_SMOKING[lifestyle['smoking']])
    add('alcohol', 'cardiovascular', CARDIO_ALCOHOL[lifestyle['alcohol']])
    add(
        'exercise_frequency',
        'cardiovascular',
        CARDIO_EXERCISE[lifestyle['exercise_frequency']],
    )
    add('water_intake', 'metabolic', METABOLIC_WATER[lifestyle['water_intake']])
    add('sleep_quality', 'wellness', WELLNESS_SLEEP[lifestyle['sleep_quality']])
    add('stress_level', 'wellness', WELLNESS_STRESS[lifestyle['stress_level']])

    basic = payload['basic']
    add('age', 'cardiovascular', CARDIO_AGE[_age_band(int(basic['age']))])
    add(
        'bmi',
        'metabolic',
        METABOLIC_BMI[_bmi_bucket(float(basic['height_cm']), float(basic['weight_kg']))],
    )

    family_conditions = payload.get('family_history', {}).get('conditions', []) or []
    for cond in sorted(family_conditions):
        for component, delta in _family_contributions(cond):
            add(f'family_history.{cond}', component, delta)

    return components, factors


# ---------------------------------------------------------------------------
# Public API.
# ---------------------------------------------------------------------------

def compute_components_uncapped(payload: Dict[str, Any]) -> Dict[str, int]:
    """Return the pre-cap, pre-clamp component sums for a payload.

    Property tests rely on this helper to assert the strict per-dimension
    monotonicity (Requirement 13.4..13.8) without the per-component cap from
    ``COMPONENT_CAPS`` masking the inequality.
    """
    components, _ = _accumulate(payload)
    return components


def compute_risk(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Compute the deterministic risk assessment for an onboarding payload.

    Args:
        payload: Plain-dict onboarding submission. Expected shape mirrors the
            ``AnalyzeRiskRequest`` Pydantic model and must contain ``basic``,
            ``lifestyle``, and ``family_history`` keys. Other keys (``medical``,
            ``location``) are ignored by the risk engine — they are forwarded
            to Gemini downstream.

    Returns:
        A dict with the ``RiskEngineResult`` shape::

            {
                'risk_score': int,             # 0..100
                'risk_level': str,             # 'Low' | 'Moderate' | 'High'
                'wellness_score': int,         # 100 - risk_score
                'components': {
                    'cardiovascular': int,
                    'metabolic': int,
                    'wellness': int,
                    'hereditary': int,
                },
                'contributing_factors': [
                    {'dimension': str, 'component': str, 'delta': int},
                    ...
                ],
            }
    """
    components, factors = _accumulate(payload)

    # Apply per-component caps before the global clamp.
    capped: Dict[str, int] = {
        k: min(components[k], COMPONENT_CAPS[k]) for k in _COMPONENT_ORDER
    }
    risk_score: int = min(100, sum(capped.values()))
    risk_level: str = classify(risk_score)

    return {
        'risk_score': risk_score,
        'risk_level': risk_level,
        'wellness_score': 100 - risk_score,
        'components': capped,
        'contributing_factors': factors,
    }


__all__ = [
    'CARDIO_SMOKING',
    'CARDIO_ALCOHOL',
    'CARDIO_EXERCISE',
    'CARDIO_FAMILY',
    'CARDIO_AGE',
    'METABOLIC_BMI',
    'METABOLIC_FAMILY',
    'METABOLIC_WATER',
    'WELLNESS_SLEEP',
    'WELLNESS_STRESS',
    'WELLNESS_FAMILY',
    'HEREDITARY_TABLE',
    'COMPONENT_CAPS',
    'classify',
    'compute_risk',
    'compute_components_uncapped',
]
