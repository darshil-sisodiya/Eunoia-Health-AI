"""Gemini-assisted contextual refinement layer for the medical cost estimator.

Architecture (matches the spec for "AI-assisted healthcare estimation"):

  1. Backend deterministically computes:
       * a baseline range (``estimated_total_min``, ``estimated_total_max``)
       * a hard envelope (``allowed_range``, ``allowed_components``)
       * per-line baseline bands

  2. This module hands Gemini all of the above plus the medical context
     (city, condition, severity, hospital tier, specialization relevance)
     and asks it to produce a *refined* estimate.

  3. Gemini reasons about realistic healthcare workflow complexity:
       * how many consultations are typical
       * which diagnostic tests usually accompany the workup
       * what medication regimen is plausible
       * whether procedures / hospitalization are likely

  4. Gemini returns strict JSON with refined min/max and short reasoning
     bullets. This module validates the output against the deterministic
     envelope and falls back to the baseline on any violation.

Gemini NEVER:
  * exceeds the deterministic envelope
  * invents prices outside ``allowed_range``
  * prescribes, diagnoses, or makes medical claims
  * fabricates hospitals or procedures

If Gemini is unavailable, slow, malformed, or out-of-bounds, the deterministic
baseline is returned unchanged with ``refinement_applied = False``. The user
always sees a valid estimate.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Outer cap on the Gemini call inside this service module. The endpoint
# adds a small slack on top so the API response stays predictable.
# Bumped from 9 → 18 s after observing real-world ``gemini-1.5-flash``
# cold latency hovering around 10-14 s for structured-JSON outputs. The
# rest of the codebase already tolerates this band for AI calls
# (``gemini_insights.GEMINI_TIMEOUT_SECONDS = 20``).
GEMINI_TIMEOUT_SECONDS: int = 18

# Hard ceiling on reasoning bullets surfaced to the UI. Keeps the response
# lightweight and avoids the AI rambling.
MAX_REASONING_BULLETS: int = 5
MAX_REASONING_CHARS: int = 220

GeminiCallable = Callable[[str, str], Awaitable[str]]


# ---------------------------------------------------------------------------
# Public dataclass returned to server.py
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class RefinementResult:
    """Outcome of one refinement attempt.

    ``refinement_applied`` is ``True`` only when Gemini returned a valid,
    in-envelope response. Otherwise the deterministic baseline is preserved
    and ``reasoning`` carries a short explanation of why refinement did
    not apply (timeout, malformed, out-of-bounds, etc.).
    """

    final_min: int
    final_max: int
    components: Dict[str, Dict[str, int]]
    reasoning: List[str]
    refinement_applied: bool
    decline_reason: Optional[str] = None


# ---------------------------------------------------------------------------
# Prompting
# ---------------------------------------------------------------------------

SYSTEM_INSTRUCTION = (
    "You are Eunoia's healthcare cost-context analyst. Your role is to refine\n"
    "an existing deterministic cost estimate so it reflects realistic Indian\n"
    "healthcare workflow complexity for the given condition, city, severity,\n"
    "and hospital tier.\n"
    "\n"
    "Hard rules — violations cause your output to be rejected:\n"
    "  - You MUST stay inside the provided allowed_range.\n"
    "  - You MUST NOT invent prices, hospitals, doctors, brand names, or\n"
    "    medication names. Reason about workflow categories only.\n"
    "  - You MUST NOT diagnose, prescribe, or make medical claims about the\n"
    "    user's specific case.\n"
    "  - You MUST NOT use alarming or urgent language. Stay calm and preventive.\n"
    "  - refined_min must be >= allowed_range.min and refined_max must be\n"
    "    <= allowed_range.max.\n"
    "  - refined_max must be > refined_min.\n"
    "\n"
    "Reasoning style:\n"
    "  - 2 to 4 short bullets (each under 20 words, no markdown).\n"
    "  - Each bullet describes ONE workflow factor: consultation pattern,\n"
    "    diagnostic intensity, medication recurrence, follow-up cadence, or\n"
    "    procedural likelihood. No rupee figures inside reasoning.\n"
    "\n"
    "Output: a single JSON object with keys 'refined_min', 'refined_max',\n"
    "and 'reasoning'. Output JSON only. No markdown fences, no commentary."
)


def build_prompt(
    *,
    city: str,
    condition_label: str,
    condition_key: str,
    severity: str,
    hospital_tier: str,
    consultation_type: str,
    specializations: List[str],
    matched_hospital_summary: str,
    baseline_min: int,
    baseline_max: int,
    baseline_components: Dict[str, Dict[str, int]],
    allowed_range: Dict[str, int],
    allowed_components: Dict[str, Dict[str, int]],
) -> Tuple[str, str]:
    """Build the (system, user) prompt pair for the refinement call.

    Note: ``baseline_components`` and ``allowed_components`` are accepted by
    the signature for backwards compatibility but intentionally NOT included
    in the user prompt — they make the prompt long and slow Gemini's
    structured-JSON response down. The deterministic line breakdown is
    re-applied after the call from ``baseline_components``.
    """
    user_prompt = (
        f"Context:\n"
        f"  city={city}; condition={condition_label} (key={condition_key});\n"
        f"  severity={severity}; tier={hospital_tier};\n"
        f"  consultation_type={consultation_type};\n"
        f"  specializations={', '.join(specializations) or 'general'};\n"
        f"  hospitals_in_city={matched_hospital_summary}\n"
        "\n"
        f"Deterministic baseline total: ₹{baseline_min:,} - ₹{baseline_max:,}\n"
        f"Allowed range (HARD limits): ₹{allowed_range['min']:,} - ₹{allowed_range['max']:,}\n"
        "\n"
        "Refine the total range to reflect realistic healthcare workflow for\n"
        "this case. Consider visit count, diagnostic intensity, recurring\n"
        "medication, and procedure likelihood. Stay inside the allowed range.\n"
        "\n"
        "Return ONLY:\n"
        '{"refined_min": <int>, "refined_max": <int>, "reasoning": ["...","..."]}\n'
    )
    return SYSTEM_INSTRUCTION, user_prompt


# ---------------------------------------------------------------------------
# Parsing & validation
# ---------------------------------------------------------------------------


_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE | re.DOTALL)
_RUPEE_NUMBER_RE = re.compile(
    r"\b(?:rs\.?|inr|₹|\$)\s*\d[\d,]*\b|\b\d{2,}\s*%\b",
    re.IGNORECASE,
)


def _strip_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        # Drop opening fence + optional language tag, and trailing fence.
        text = re.sub(r"^```\s*[A-Za-z0-9_-]*\s*", "", text)
        if text.endswith("```"):
            text = text[: -3]
    return text.strip()


def _to_int(value: Any) -> Optional[int]:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        try:
            return int(round(float(value)))
        except (ValueError, OverflowError):
            return None
    if isinstance(value, str):
        # Accept "₹2,500" or "2500" — strip non-digits.
        digits = re.sub(r"[^0-9-]", "", value)
        if not digits or digits == "-":
            return None
        try:
            return int(digits)
        except ValueError:
            return None
    return None


def _scrub_reasoning_bullet(text: str) -> str:
    """Remove invented rupee values and trim to a sentence-sized bullet."""
    if not text:
        return ""
    # Remove rupee/percent figures since those belong to the deterministic layer.
    cleaned = _RUPEE_NUMBER_RE.sub("[see range]", text)
    cleaned = cleaned.strip(" -•*\t\n\r")
    if len(cleaned) > MAX_REASONING_CHARS:
        cleaned = cleaned[:MAX_REASONING_CHARS].rsplit(" ", 1)[0].rstrip(",.;: ") + "..."
    return cleaned


@dataclass(frozen=True)
class _ParsedRefinement:
    refined_min: int
    refined_max: int
    components: Dict[str, Dict[str, int]]
    reasoning: List[str]


def parse_refinement(raw_text: str) -> Optional[_ParsedRefinement]:
    """Parse Gemini output. Returns ``None`` on any structural problem."""
    if raw_text is None:
        return None

    text = _strip_fences(str(raw_text))
    if not text:
        return None

    try:
        parsed = json.loads(text)
    except (json.JSONDecodeError, ValueError):
        return None

    if not isinstance(parsed, dict):
        return None

    refined_min = _to_int(parsed.get("refined_min"))
    refined_max = _to_int(parsed.get("refined_max"))
    if refined_min is None or refined_max is None:
        return None
    if refined_max <= refined_min:
        return None

    raw_components = parsed.get("components")
    components: Dict[str, Dict[str, int]] = {}
    if isinstance(raw_components, dict):
        for line, band in raw_components.items():
            if not isinstance(line, str) or not isinstance(band, dict):
                continue
            lo = _to_int(band.get("min"))
            hi = _to_int(band.get("max"))
            if lo is None or hi is None:
                continue
            if hi < lo:
                continue
            components[line.strip().lower()] = {"min": lo, "max": hi}

    raw_reasoning = parsed.get("reasoning")
    bullets: List[str] = []
    if isinstance(raw_reasoning, list):
        for item in raw_reasoning:
            if not isinstance(item, str):
                continue
            cleaned = _scrub_reasoning_bullet(item)
            if cleaned:
                bullets.append(cleaned)
            if len(bullets) >= MAX_REASONING_BULLETS:
                break

    return _ParsedRefinement(
        refined_min=refined_min,
        refined_max=refined_max,
        components=components,
        reasoning=bullets,
    )


# ---------------------------------------------------------------------------
# Validation against the deterministic envelope
# ---------------------------------------------------------------------------


def _validate_against_envelope(
    parsed: _ParsedRefinement,
    *,
    allowed_range: Dict[str, int],
    allowed_components: Dict[str, Dict[str, int]],
    baseline_min: int,
) -> Tuple[bool, Optional[str]]:
    """Reject outputs that escape the deterministic envelope.

    Returns ``(ok, reason_if_rejected)``.
    """
    a_min = int(allowed_range.get("min", 0))
    a_max = int(allowed_range.get("max", 0))

    if parsed.refined_min < a_min:
        return False, "refined_min below allowed_range.min"
    if parsed.refined_max > a_max:
        return False, "refined_max above allowed_range.max"
    if parsed.refined_max <= parsed.refined_min:
        return False, "refined_max not greater than refined_min"

    # Each component must stay inside its envelope. Lines that the
    # deterministic engine excluded (procedure for fever, etc.) cannot be
    # added by the AI — keys outside ``allowed_components`` are silently
    # dropped, but if Gemini supplies a line, it has to fit.
    for line, band in list(parsed.components.items()):
        envelope = allowed_components.get(line)
        if envelope is None:
            # Drop hallucinated lines instead of rejecting the whole response.
            parsed.components.pop(line, None)
            continue
        if band["min"] < envelope["min"]:
            return False, f"components.{line}.min below envelope"
        if band["max"] > envelope["max"]:
            return False, f"components.{line}.max above envelope"
        if band["max"] < band["min"]:
            return False, f"components.{line} max < min"

    # Refined max should not be lower than the deterministic baseline_min —
    # if it were, the AI is recommending a range strictly worse than the
    # deterministic floor, which signals a malformed answer.
    if parsed.refined_max < baseline_min:
        return False, "refined_max below deterministic baseline_min"

    return True, None


# ---------------------------------------------------------------------------
# Public coroutine
# ---------------------------------------------------------------------------


async def refine(
    *,
    deterministic: Dict[str, Any],
    matched_hospital_summary: str,
    gemini_call: GeminiCallable,
) -> RefinementResult:
    """Refine the deterministic estimate using Gemini.

    On any failure path (no API key, timeout, malformed JSON, out-of-envelope
    output, transport error) the function returns a ``RefinementResult`` that
    reproduces the deterministic baseline with ``refinement_applied=False``.
    Callers do not need to handle exceptions.
    """
    baseline_min = int(deterministic.get("estimated_total_min", 0))
    baseline_max = int(deterministic.get("estimated_total_max", 0))
    baseline_components: Dict[str, Dict[str, int]] = dict(deterministic.get("breakdown") or {})
    allowed_range: Dict[str, int] = dict(deterministic.get("allowed_range") or {"min": baseline_min, "max": baseline_max})
    allowed_components: Dict[str, Dict[str, int]] = dict(deterministic.get("allowed_components") or baseline_components)

    def _fallback(reason: str) -> RefinementResult:
        return RefinementResult(
            final_min=baseline_min,
            final_max=baseline_max,
            components=baseline_components,
            reasoning=[],
            refinement_applied=False,
            decline_reason=reason,
        )

    if gemini_call is None:
        return _fallback("gemini_unavailable")

    condition = deterministic.get("condition") or {}
    condition_label = str(condition.get("label", ""))
    condition_key = str(condition.get("key", ""))
    severity = str(deterministic.get("severity", "moderate"))
    tier = str(deterministic.get("tier", "Medium"))
    consultation_type = str(deterministic.get("consultation_type", "specialist"))
    specializations = list(deterministic.get("specializations") or [])
    city = str(deterministic.get("city", ""))

    try:
        system_instruction, user_prompt = build_prompt(
            city=city,
            condition_label=condition_label,
            condition_key=condition_key,
            severity=severity,
            hospital_tier=tier,
            consultation_type=consultation_type,
            specializations=specializations,
            matched_hospital_summary=matched_hospital_summary,
            baseline_min=baseline_min,
            baseline_max=baseline_max,
            baseline_components=baseline_components,
            allowed_range=allowed_range,
            allowed_components=allowed_components,
        )
    except Exception:
        logger.exception("cost_refiner.refine: build_prompt raised")
        return _fallback("prompt_build_error")

    try:
        raw = await asyncio.wait_for(
            gemini_call(system_instruction, user_prompt),
            timeout=GEMINI_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.warning(
            "cost_refiner.refine: timed out after %ss",
            GEMINI_TIMEOUT_SECONDS,
        )
        return _fallback("timeout")
    except Exception:
        logger.exception("cost_refiner.refine: gemini_call raised")
        return _fallback("transport_error")

    parsed = parse_refinement(raw or "")
    if parsed is None:
        return _fallback("malformed")

    ok, reason = _validate_against_envelope(
        parsed,
        allowed_range=allowed_range,
        allowed_components=allowed_components,
        baseline_min=baseline_min,
    )
    if not ok:
        logger.info("cost_refiner.refine: refinement rejected: %s", reason)
        return _fallback(reason or "out_of_envelope")

    # Make sure each component the deterministic engine has includes a band
    # in the response. If Gemini omitted a line we keep the baseline value
    # for that line (defence-in-depth).
    merged_components: Dict[str, Dict[str, int]] = {}
    for line, baseline_band in baseline_components.items():
        if line in parsed.components:
            merged_components[line] = parsed.components[line]
        else:
            merged_components[line] = dict(baseline_band)

    return RefinementResult(
        final_min=parsed.refined_min,
        final_max=parsed.refined_max,
        components=merged_components,
        reasoning=parsed.reasoning,
        refinement_applied=True,
        decline_reason=None,
    )


__all__ = [
    "GEMINI_TIMEOUT_SECONDS",
    "MAX_REASONING_BULLETS",
    "MAX_REASONING_CHARS",
    "SYSTEM_INSTRUCTION",
    "RefinementResult",
    "GeminiCallable",
    "build_prompt",
    "parse_refinement",
    "refine",
]
