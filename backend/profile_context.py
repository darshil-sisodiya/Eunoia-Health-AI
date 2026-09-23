"""One place that knows everything about a user, for every consumer that needs it.

Before this module there were four hand-rolled context builders, and each one
knew a different, mostly wrong subset of the user:

* chat (`server.py`) sent persona, sleep, stress, exercise. Two of those four
  were hardcoded constants, so the assistant was told every user sleeps 7 hours.
* the prescription analyzer sent sleep, stress, exercise, diet and conditions
  but **not allergies and not the current medication list** — so it produced an
  "interactions" field without knowing what the user takes, and could not flag
  a drug the user is allergic to. That is the reason this module exists.
* the PDF rendered six legacy fields, two of them fabricated.
* only the onboarding insights prompt saw the real medical history.

`load_full_profile` does the queries. `render_profile_for_ai` is pure, so the
safety-critical behaviour (allergies and medications reaching the prescription
prompt) is testable without a database.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

# Buckets are stored as compact codes; these render them as something a human
# or an LLM reads correctly.
_DURATION_LABELS = {
    'lt_1y': 'less than a year',
    '1_5y': '1-5 years',
    '5_10y': '5-10 years',
    'gt_10y': 'more than 10 years',
    'unknown': 'duration unknown',
}

_CONTROL_LABELS = {
    'well': 'well controlled',
    'partly': 'partly controlled',
    'poorly': 'poorly controlled',
    'unsure': 'control unknown',
}

_TREATMENT_LABELS = {
    'none': 'untreated',
    'lifestyle': 'managed with lifestyle',
    'medication': 'on medication',
    'both': 'medication and lifestyle',
}

_STARTED_LABELS = {
    'lt_1m': 'started under a month ago',
    '1_6m': 'started 1-6 months ago',
    '6_12m': 'started 6-12 months ago',
    '1_5y': 'started 1-5 years ago',
    'gt_5y': 'started over 5 years ago',
    'unknown': 'start date unknown',
}

_REACTION_LABELS = {
    'mild_rash': 'mild rash',
    'hives': 'hives',
    'swelling': 'swelling',
    'breathing': 'breathing difficulty',
    'anaphylaxis': 'anaphylaxis',
    'unknown': 'reaction unknown',
}

# Reactions that make an allergy a hard safety stop rather than a note.
SEVERE_REACTIONS = frozenset({'swelling', 'breathing', 'anaphylaxis'})


async def load_full_profile(
    user_id: int,
    fetch_one: Callable[..., Any],
    fetch_all: Callable[..., Any],
) -> Dict[str, Any]:
    """Assemble everything known about a user.

    `fetch_one` / `fetch_all` are injected so this module stays independent of
    the server's connection pool and is straightforward to exercise in tests.
    """
    profile = await fetch_one(
        "SELECT * FROM health_profiles WHERE user_id=%s", (user_id,)
    )
    conditions = await fetch_all(
        "SELECT * FROM user_conditions WHERE user_id=%s ORDER BY name", (user_id,)
    )
    medications = await fetch_all(
        "SELECT * FROM user_medications WHERE user_id=%s ORDER BY name", (user_id,)
    )
    allergies = await fetch_all(
        "SELECT * FROM user_allergies WHERE user_id=%s ORDER BY allergen", (user_id,)
    )
    vitals = await fetch_one(
        "SELECT * FROM user_vitals WHERE user_id=%s ORDER BY created_at DESC LIMIT 1",
        (user_id,),
    )
    family = await fetch_all(
        "SELECT * FROM family_history WHERE user_id=%s ORDER BY `condition`", (user_id,)
    )
    report = await fetch_one(
        """
        SELECT risk_score, risk_level, wellness_score, components, confidence,
               subscores, contributing_factors, created_at
        FROM risk_reports WHERE user_id=%s ORDER BY created_at DESC LIMIT 1
        """,
        (user_id,),
    )

    return {
        'profile': dict(profile) if profile else None,
        'conditions': [dict(c) for c in (conditions or [])],
        'medications': [dict(m) for m in (medications or [])],
        'allergies': [dict(a) for a in (allergies or [])],
        'vitals': dict(vitals) if vitals else None,
        'family_history': [dict(f) for f in (family or [])],
        'latest_report': dict(report) if report else None,
    }


def _fmt_conditions(conditions: List[Dict[str, Any]]) -> List[str]:
    lines = []
    for c in conditions:
        parts = [
            _DURATION_LABELS.get(c.get('diagnosed_bucket'), 'duration unknown'),
            _CONTROL_LABELS.get(c.get('control'), 'control unknown'),
            _TREATMENT_LABELS.get(c.get('treatment'), 'untreated'),
        ]
        if c.get('severity'):
            parts.append(f"{c['severity']} severity")
        if c.get('hospitalised_12m'):
            parts.append('hospitalised in the last 12 months')
        lines.append(f"  - {c.get('name')}: {', '.join(parts)}")
    return lines


def _fmt_medications(medications: List[Dict[str, Any]]) -> List[str]:
    lines = []
    for m in medications:
        parts = []
        if m.get('dose'):
            parts.append(str(m['dose']))
        if m.get('frequency'):
            parts.append(str(m['frequency']).upper())
        parts.append(_STARTED_LABELS.get(m.get('started_bucket'), 'start date unknown'))
        if m.get('for_condition'):
            parts.append(f"for {m['for_condition']}")
        if m.get('adherence') and m['adherence'] != 'unknown':
            parts.append(f"takes it {m['adherence']}")
        lines.append(f"  - {m.get('name')}: {', '.join(parts)}")
    return lines


def _fmt_allergies(allergies: List[Dict[str, Any]]) -> List[str]:
    lines = []
    for a in allergies:
        reaction = _REACTION_LABELS.get(a.get('reaction'), None)
        detail = f"{a.get('category', 'other')} allergy"
        if reaction:
            detail += f", reaction: {reaction}"
        if a.get('reaction') in SEVERE_REACTIONS:
            detail += ' [SEVERE]'
        lines.append(f"  - {a.get('allergen')}: {detail}")
    return lines


def _fmt_vitals(vitals: Optional[Dict[str, Any]]) -> List[str]:
    if not vitals:
        return []
    labels = [
        ('systolic_mmhg', 'Blood pressure (systolic)', 'mmHg'),
        ('diastolic_mmhg', 'Blood pressure (diastolic)', 'mmHg'),
        ('fasting_glucose_mgdl', 'Fasting glucose', 'mg/dL'),
        ('hba1c_percent', 'HbA1c', '%'),
        ('total_cholesterol_mgdl', 'Total cholesterol', 'mg/dL'),
        ('hdl_mgdl', 'HDL', 'mg/dL'),
        ('ldl_mgdl', 'LDL', 'mg/dL'),
        ('triglycerides_mgdl', 'Triglycerides', 'mg/dL'),
        ('resting_hr_bpm', 'Resting heart rate', 'bpm'),
        ('waist_cm', 'Waist', 'cm'),
    ]
    return [
        f"  - {label}: {vitals[key]} {unit}"
        for key, label, unit in labels
        if vitals.get(key) is not None
    ]


def _fmt_family(family: List[Dict[str, Any]]) -> List[str]:
    grouped: Dict[str, List[str]] = {}
    for f in family:
        cond = str(f.get('condition'))
        detail = str(f.get('relation') or '').strip() or 'relation not specified'
        onset = f.get('onset_bucket')
        if onset and onset != 'unknown':
            detail += f" (onset {onset.replace('_', '-')})"
        grouped.setdefault(cond, []).append(detail)
    return [f"  - {cond}: {'; '.join(details)}" for cond, details in sorted(grouped.items())]


def render_profile_for_ai(data: Dict[str, Any], *, purpose: str) -> str:
    """Render the profile as prompt context.

    `purpose` selects emphasis, not content availability:

    * ``prescription`` puts allergies and current medications FIRST and states
      the safety task explicitly. Getting this wrong is how a patient is told
      a drug they are allergic to is fine.
    * ``chat`` and ``report`` lead with the clinical picture.

    Every purpose receives allergies and medications. Nothing is withheld —
    the previous per-caller subsets are exactly what made the app feel
    disconnected and made the prescription analyzer unsafe.
    """
    profile = data.get('profile') or {}
    conditions = data.get('conditions') or []
    medications = data.get('medications') or []
    allergies = data.get('allergies') or []
    report = data.get('latest_report') or {}

    out: List[str] = []

    def section(title: str, lines: List[str], empty: str) -> None:
        out.append(f"{title}:")
        out.extend(lines if lines else [f"  {empty}"])
        out.append("")

    if purpose == 'prescription':
        # Safety-critical first. An LLM attends to what it reads first, and
        # these two lists are the whole reason to check a prescription at all.
        section('KNOWN ALLERGIES (check every prescribed drug against these)',
                _fmt_allergies(allergies),
                'None recorded. Say so rather than implying none exist.')
        section('CURRENT MEDICATIONS (check every prescribed drug for interactions)',
                _fmt_medications(medications),
                'None recorded. Say so rather than assuming none are taken.')

    if profile:
        demo = []
        for key, label, unit in (
            ('age', 'Age', ''), ('gender', 'Gender', ''),
            ('height', 'Height', 'cm'), ('weight', 'Weight', 'kg'),
            ('blood_group', 'Blood group', ''),
        ):
            if profile.get(key) is not None:
                demo.append(f"  - {label}: {profile[key]} {unit}".rstrip())
        height, weight = profile.get('height'), profile.get('weight')
        if height and weight:
            try:
                bmi = float(weight) / ((float(height) / 100.0) ** 2)
                demo.append(f"  - BMI: {bmi:.1f}")
            except (TypeError, ValueError, ZeroDivisionError):
                pass
        section('Profile', demo, 'Not recorded.')

    section('Diagnosed conditions', _fmt_conditions(conditions), 'None recorded.')

    if purpose != 'prescription':
        section('Current medications', _fmt_medications(medications), 'None recorded.')
        section('Known allergies', _fmt_allergies(allergies), 'None recorded.')

    section('Recent vitals', _fmt_vitals(data.get('vitals')),
            'No measurements recorded. Do not assume they are normal.')
    section('Family history', _fmt_family(data.get('family_history') or []), 'None recorded.')

    lifestyle = []
    for key, label in (
        ('smoking', 'Smoking'), ('smokeless_tobacco', 'Smokeless tobacco'),
        ('alcohol', 'Alcohol'), ('exercise_frequency', 'Exercise'),
        ('exercise_minutes_per_week', 'Exercise minutes per week'),
        ('sedentary_hours_per_day', 'Sitting hours per day'),
        ('sleep_quality', 'Sleep quality'), ('sleep_hours', 'Sleep hours'),
        ('stress_level', 'Stress'), ('diet_type', 'Diet'),
        ('fruit_veg_servings', 'Fruit/veg servings per day'),
        ('water_intake', 'Hydration'), ('cooking_fuel', 'Cooking fuel'),
    ):
        if profile.get(key) is not None:
            lifestyle.append(f"  - {label}: {profile[key]}")
    section('Lifestyle', lifestyle, 'Not recorded.')

    if report:
        risk = [
            f"  - Risk score: {report.get('risk_score')}/100 ({report.get('risk_level')})",
            f"  - Wellness score: {report.get('wellness_score')}/100",
        ]
        confidence = report.get('confidence')
        if isinstance(confidence, dict) and confidence.get('confidence') is not None:
            risk.append(
                f"  - Assessment confidence: {confidence['confidence']}% "
                f"(completeness {confidence.get('completeness')}%)"
            )
            missing = [m.get('label') for m in (confidence.get('missing') or [])]
            if missing:
                risk.append(f"  - Not yet known: {', '.join(str(m) for m in missing)}")
        section('Latest risk assessment', risk, 'Not yet assessed.')

    return "\n".join(out).strip()


def derive_persona(profile: Dict[str, Any]) -> str:
    """A short, factual descriptor of how this person lives.

    Deliberately deterministic. The persona was previously generated by a
    Gemini call that only the legacy profile endpoint made, so anyone who
    onboarded through the current flow had it left NULL forever and the chat
    prompt said "Persona: N/A". Deriving it costs no latency inside the
    onboarding request, which already has a 20-second budget.

    The tone stays calm and descriptive to match the product voice, rather
    than the playful "Zen Snacker" phrasing of the old prompt.
    """
    traits: List[str] = []

    sleep = profile.get('sleep_hours')
    sleep_quality = str(profile.get('sleep_quality') or '')
    if sleep is not None:
        try:
            hours = float(sleep)
            traits.append('well rested' if 7 <= hours <= 9 else 'short on sleep')
        except (TypeError, ValueError):
            pass
    elif sleep_quality in ('excellent', 'good'):
        traits.append('well rested')
    elif sleep_quality in ('poor', 'fair'):
        traits.append('short on sleep')

    minutes = profile.get('exercise_minutes_per_week')
    exercise = str(profile.get('exercise_frequency') or '')
    if minutes is not None:
        try:
            traits.append('consistently active' if float(minutes) >= 150 else 'lightly active')
        except (TypeError, ValueError):
            pass
    elif exercise in ('daily', 'regular'):
        traits.append('consistently active')
    elif exercise in ('occasional', 'never'):
        traits.append('lightly active')

    stress = str(profile.get('stress_level') or '')
    if stress == 'high':
        traits.append('under real pressure')
    elif stress == 'low':
        traits.append('steady under pressure')

    if not traits:
        return 'Building a health picture'
    return 'Currently ' + ', '.join(traits[:3])


def allergy_conflicts(allergies: List[Dict[str, Any]], drug_names: List[str]) -> List[str]:
    """Deterministic allergen/drug name overlap.

    Substring matching on names is crude and will not catch cross-reactivity
    or brand names, so this is a backstop that runs regardless of what the LLM
    says — not a replacement for it. It only ever adds warnings.
    """
    hits: List[str] = []
    drugs = [(d or '').strip().lower() for d in drug_names if (d or '').strip()]
    for allergy in allergies:
        allergen = str(allergy.get('allergen') or '').strip().lower()
        if not allergen:
            continue
        for drug in drugs:
            if allergen in drug or drug in allergen:
                severity = ' (SEVERE reaction on record)' if allergy.get(
                    'reaction') in SEVERE_REACTIONS else ''
                hits.append(
                    f"{allergy.get('allergen')} appears to match prescribed "
                    f"'{drug}'{severity}"
                )
                break
    return hits


__all__ = [
    'derive_persona',
    'load_full_profile',
    'render_profile_for_ai',
    'allergy_conflicts',
    'SEVERE_REACTIONS',
]
