"""Gemini-backed preventive insight generation for the Eunoia onboarding flow.

This module is split into a pure prompt-and-parser layer (this file, task 5.1),
plus a later-added diagnosis-language scrub (task 5.2) and async ``generate()``
coroutine (task 5.3). The pure layer below is unit-testable without touching
the network or monkeypatching anything.

The system instruction and user prompt template are reproduced verbatim from
the spec at ``.kiro/specs/eunoia-preventive-onboarding-redesign/design.md``
section "Gemini Service" so that prompt changes are auditable against the
design document.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, Awaitable, Callable, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

# Outer cap on the Gemini call inside this service module (Requirement 14.4).
# The /api/analyze-risk endpoint further constrains the wait to 15 s on top of
# this 20 s budget so the API response stays under 20 s end-to-end.
GEMINI_TIMEOUT_SECONDS: int = 20

# Type of the injected Gemini callable. ``server.gemini_generate`` matches this
# signature: ``(system_instruction, user_prompt) -> awaitable raw text``.
GeminiCallable = Callable[[str, str], Awaitable[str]]

# Canonical ordered tuple of the seven sections Gemini must return. The order
# here matches design § "System instruction" and § "Module structure".
INSIGHT_KEYS: Tuple[str, ...] = (
    "preventive_health_insights",
    "lifestyle_recommendations",
    "diet_suggestions",
    "exercise_guidance",
    "mental_wellness_improvements",
    "long_term_wellness_awareness",
    "habit_optimization_recommendations",
)

# Verbatim from design § "System instruction" (Requirement 14.2).
SYSTEM_INSTRUCTION = (
    "You are Eunoia, a preventive, medically cautious health assistant. You speak\n"
    "calmly, supportively, and intelligently. You SHALL NOT issue diagnoses, name a\n"
    "specific disease as the user's diagnosis, prescribe medication, or instruct the\n"
    "user to start, stop, or change a medication. You SHALL NOT use alarming\n"
    "language. You SHALL NOT promise medical outcomes. You frame everything as\n"
    "preventive guidance that complements, but does not replace, professional care.\n"
    "\n"
    "Return ONLY a single JSON object with these top-level string keys:\n"
    '"preventive_health_insights", "lifestyle_recommendations", "diet_suggestions",\n'
    '"exercise_guidance", "mental_wellness_improvements",\n'
    '"long_term_wellness_awareness", "habit_optimization_recommendations".\n'
    "Each value is a 2\u20134 sentence paragraph in plain prose, no markdown, no lists."
)


def _join_or_none(values: Any) -> str:
    """Render a list-like field for the prompt as a comma-joined string.

    Empty/missing lists render as ``(none)`` so the prompt always reads as a
    coherent English paragraph; non-empty lists keep every value as a substring
    of the prompt (this is what Property 24 verifies).
    """
    if not values:
        return "(none)"
    return ", ".join(str(v) for v in values)


def build_prompt(profile: Dict[str, Any], risk: Dict[str, Any]) -> Tuple[str, str]:
    """Build ``(system_instruction, user_prompt)`` for the Gemini call.

    ``profile`` is the ``AnalyzeRiskRequest`` body as a plain dict (the same
    shape FastAPI receives over the wire). ``risk`` is the ``Risk_Engine``
    output dict carrying ``risk_score``, ``risk_level``, ``wellness_score``,
    ``components``, and ``contributing_factors``.

    The user prompt mirrors design \u00a7 "User prompt template" and additionally
    includes ``basic.full_name`` so the prompt covers every value in
    ``basic`` (Requirement 14.1, task 5.1).
    """
    basic = profile.get("basic") or {}
    lifestyle = profile.get("lifestyle") or {}
    medical = profile.get("medical") or {}
    family = (profile.get("family_history") or {}).get("conditions") or []
    location = profile.get("location") or {}

    factors = risk.get("contributing_factors") or []
    if factors:
        factors_summary = ", ".join(
            f"{f.get('dimension')} ({f.get('component')}, +{f.get('delta')})"
            for f in factors
        )
    else:
        factors_summary = "(none)"

    user_prompt = (
        "Risk_Engine output:\n"
        f"- risk_score: {risk.get('risk_score')}/100\n"
        f"- risk_level: {risk.get('risk_level')}\n"
        f"- wellness_score: {risk.get('wellness_score')}/100\n"
        f"- contributing_factors: {factors_summary}\n"
        "\n"
        "Basic profile:\n"
        f"- name: {basic.get('full_name', '')}\n"
        f"- age: {basic.get('age')}\n"
        f"- gender: {basic.get('gender')}\n"
        f"- height: {basic.get('height_cm')} cm\n"
        f"- weight: {basic.get('weight_kg')} kg\n"
        "\n"
        "Lifestyle:\n"
        f"- smoking: {lifestyle.get('smoking')}\n"
        f"- alcohol: {lifestyle.get('alcohol')}\n"
        f"- exercise_frequency: {lifestyle.get('exercise_frequency')}\n"
        f"- water_intake: {lifestyle.get('water_intake')}\n"
        f"- sleep_quality: {lifestyle.get('sleep_quality')}\n"
        f"- stress_level: {lifestyle.get('stress_level')}\n"
        "\n"
        "Medical history:\n"
        f"- existing_conditions: {_join_or_none(medical.get('existing_conditions'))}\n"
        f"- allergies: {_join_or_none(medical.get('allergies'))}\n"
        f"- current_medications: {_join_or_none(medical.get('current_medications'))}\n"
        "\n"
        f"Family history: {_join_or_none(family)}\n"
        "\n"
        f"Location: {location.get('city')}, {location.get('state')}\n"
        "\n"
        "Generate the seven preventive sections defined above. Personalise to the\n"
        "contributing_factors. Stay preventive, not diagnostic."
    )
    return SYSTEM_INSTRUCTION, user_prompt


def parse_insights(raw_text: str) -> Optional[Dict[str, str]]:
    """Parse a Gemini response into a seven-key dict, or ``None`` on any
    structural problem (Requirement 14.3, 14.6).

    Behaviour:
      * ``None``/empty input \u2192 ``None``.
      * Tolerates a Gemini response wrapped in a fenced code block
        (e.g. ```json ... ```).
      * JSON decode failure \u2192 ``None``.
      * Non-object root \u2192 ``None``.
      * Any of the seven required keys missing or non-string \u2192 ``None``.
      * Every value is ``.strip()``-ed.
      * If the concatenation of all seven stripped values has zero
        non-whitespace characters, returns ``None``.
    """
    if raw_text is None:
        return None

    text = raw_text.strip()
    if not text:
        return None

    # Tolerate Gemini wrapping the JSON object in a fenced markdown block.
    if text.startswith("```"):
        # Strip the leading fence (and an optional ``json`` language tag).
        stripped = text[3:]
        if stripped.lower().startswith("json"):
            stripped = stripped[4:]
        # Drop a trailing fence if present.
        if stripped.endswith("```"):
            stripped = stripped[:-3]
        text = stripped.strip()
        if not text:
            return None

    try:
        parsed = json.loads(text)
    except (json.JSONDecodeError, ValueError):
        return None

    if not isinstance(parsed, dict):
        return None

    out: Dict[str, str] = {}
    for key in INSIGHT_KEYS:
        if key not in parsed:
            return None
        value = parsed[key]
        if not isinstance(value, str):
            return None
        out[key] = value.strip()

    # Whitespace-only concatenation \u2192 treat as Gemini failure (Requirement 14.6).
    if not "".join(out[k] for k in INSIGHT_KEYS).strip():
        return None

    return out


# ---------------------------------------------------------------------------
# Diagnosis-language scrub (task 5.2, Requirement 14.5)
# ---------------------------------------------------------------------------

# Verbatim phrases that the SYSTEM_INSTRUCTION already forbids; we still scrub
# at the parser layer as defence-in-depth in case Gemini regresses. Phrases are
# matched case-insensitively as raw substrings (no word boundaries) so partial
# matches such as "You have been diagnosed" still hit "you have ".
DIAGNOSIS_DENYLIST: Tuple[str, ...] = (
    # Diagnosis assertions
    "you have ",
    "you are diagnosed",
    "you have been diagnosed",
    "i diagnose you",
    # Prescription instructions
    "prescribe",
    "i prescribe",
    "take this medication",
    # Start / stop / change-medication instructions
    "start taking",
    "stop taking",
    "do not take",
    "don't take",
    "increase your dose",
    "decrease your dose",
    "change your dose",
    "change your medication",
    "discontinue your medication",
)

# Soft preventive replacement injected wherever a denylisted phrase is found.
SOFT_REPLACEMENT = "Discuss this with your doctor."

# Compile the denylist into a single alternation, sorted longest-first so a
# phrase like "you have been diagnosed" is consumed in one match instead of
# being split into "you have " + "been diagnosed".
_DENYLIST_PATTERN = re.compile(
    "|".join(re.escape(p) for p in sorted(DIAGNOSIS_DENYLIST, key=len, reverse=True)),
    re.IGNORECASE,
)


def scrub_diagnosis_language(text: str) -> str:
    """Replace every denylisted phrase in ``text`` with ``SOFT_REPLACEMENT``.

    The match is case-insensitive and operates on raw substrings (no word
    boundaries), per design \u00a7 "Diagnosis-language scrub" and Requirement 14.5.
    Property 27 asserts no denylisted phrase remains verbatim in the output.

    The post-scrub re-validation (returning ``None`` when any of the seven
    sections becomes whitespace-only) lives in the calling ``generate()``
    coroutine in task 5.3 \u2014 this function operates on a single string and is
    deliberately section-agnostic.
    """
    if not text:
        return text
    return _DENYLIST_PATTERN.sub(SOFT_REPLACEMENT, text)


# ---------------------------------------------------------------------------
# Gemini coroutine (task 5.3, Requirements 14.4, 14.5, 14.6)
# ---------------------------------------------------------------------------


async def generate(
    profile: Dict[str, Any],
    risk: Dict[str, Any],
    *,
    gemini_call: GeminiCallable,
) -> Optional[Dict[str, str]]:
    """Generate the seven-section preventive insights for ``profile``/``risk``.

    Args:
        profile: ``AnalyzeRiskRequest`` body as a plain dict.
        risk: Risk Engine output dict.
        gemini_call: Awaitable taking ``(system_instruction, user_prompt)`` and
            returning the model's raw text. ``server.py`` injects its
            ``gemini_generate`` here so this module avoids a circular import
            and stays unit-testable without monkeypatching.

    Returns:
        Dict with the seven canonical keys mapped to scrubbed, stripped, non-
        empty strings on success, or ``None`` on any failure path:
        ``asyncio.TimeoutError``, transport / non-2xx / SDK exceptions, JSON
        decode failure, missing keys, ``None``/empty/whitespace-only text, or
        whitespace-only sections after the diagnosis-language scrub
        (Requirements 14.4, 14.5, 14.6).
    """
    try:
        system_instruction, user_prompt = build_prompt(profile, risk)
    except Exception:  # pragma: no cover - defensive; build_prompt is total
        logger.exception("gemini_insights.generate: build_prompt raised")
        return None

    try:
        raw_text = await asyncio.wait_for(
            gemini_call(system_instruction, user_prompt),
            timeout=GEMINI_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.warning(
            "gemini_insights.generate: timed out after %ss",
            GEMINI_TIMEOUT_SECONDS,
        )
        return None
    except Exception:
        # Covers transport errors, non-2xx HTTP propagated by gemini_generate,
        # SDK errors, and any other unexpected failure (Requirement 14.4).
        logger.exception("gemini_insights.generate: gemini_call raised")
        return None

    parsed = parse_insights(raw_text)
    if parsed is None:
        # parse_insights already covers None/empty/whitespace-only/JSON-decode/
        # missing-keys/non-string-values (Requirement 14.6).
        logger.warning("gemini_insights.generate: parse_insights returned None")
        return None

    # Defensive diagnosis-language scrub (Requirement 14.5). Re-strip after the
    # scrub so trailing whitespace introduced by SOFT_REPLACEMENT does not let
    # an otherwise-empty section sneak through the post-scrub validation.
    scrubbed: Dict[str, str] = {
        key: scrub_diagnosis_language(value).strip() for key, value in parsed.items()
    }

    if any(not scrubbed[key] for key in INSIGHT_KEYS):
        logger.warning(
            "gemini_insights.generate: section became empty after scrub"
        )
        return None

    if not "".join(scrubbed[key] for key in INSIGHT_KEYS).strip():
        logger.warning(
            "gemini_insights.generate: scrubbed sections concatenate to whitespace"
        )
        return None

    return scrubbed


__all__ = [
    "INSIGHT_KEYS",
    "SYSTEM_INSTRUCTION",
    "GEMINI_TIMEOUT_SECONDS",
    "GeminiCallable",
    "build_prompt",
    "parse_insights",
    "DIAGNOSIS_DENYLIST",
    "SOFT_REPLACEMENT",
    "scrub_diagnosis_language",
    "generate",
]
