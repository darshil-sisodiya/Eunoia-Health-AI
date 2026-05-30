"""Deterministic medical cost estimator for the Eunoia Karnataka context.

Architecture
============

This module is intentionally pure once the hospital dataset has been loaded
into memory at import time: no network, no AI, no database. Two byte-
identical inputs always produce byte-identical outputs.

The estimator is **anchor-based**, not multiplicative. The previous design
stacked ``tier × condition_intensity × severity`` factors and summed line
bands — that compounded extremes (the Auto-tier upper for a fever ended
up at ₹14k and the Severe cancer floor was ₹12k, both wrong). The new
design fixes this by:

1. Hand-calibrating a single ``TOTAL_RANGES`` table indexed by
   ``condition × tier × severity``. Each cell is a realistic (min, max)
   for one full treatment cycle in 2024-25 Indian rupees.

2. Allocating that total across cost lines (consultation, tests,
   medication, procedure, hospitalization) using
   ``LINE_WEIGHTS`` proportions. Lines that don't apply at a given
   severity are simply absent from the weights — there's no separate
   "gating" step.

3. Letting the consultation_type multiplier shift only the consultation
   line; the total is recomputed from the line sum so everything stays
   internally consistent.

4. For ``hospital_tier=Auto``, the displayed total spans from the lowest
   present tier's minimum to the highest present tier's maximum, using
   the same calibrated table. The per-tier breakdown surfaces each
   tier's range directly so the user sees the full spectrum.

5. The allowed envelope (the hard constraint the Gemini refinement layer
   stays inside) is a simple widening of the deterministic baseline:
   roughly ±35% on each side, with both per-line and total clamps.

This guarantees:
  * Floors and ceilings stay realistic at every (condition, tier,
    severity) combination because they're directly anchored, not derived.
  * Line breakdowns always sum to the total exactly.
  * The Gemini refinement layer cannot push the estimate outside
    plausible Indian healthcare pricing.
"""

from __future__ import annotations

import csv
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Hospital dataset loading
# ---------------------------------------------------------------------------

_DATASET_PATH = Path(__file__).resolve().parent.parent / "karnataka_hospitals_200.csv"


@dataclass(frozen=True)
class Hospital:
    name: str
    state: str
    district: str
    city: str
    hospital_type: str
    specialization: str
    rating: float
    cost_level: str  # "Low" | "Medium" | "High"
    latitude: float
    longitude: float


def _coerce_float(value: str, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _normalize_cost_level(value: str) -> str:
    v = (value or "").strip().lower()
    if v.startswith("low"):
        return "Low"
    if v.startswith("med") or v == "mid":
        return "Medium"
    if v.startswith("hi"):
        return "High"
    return "Medium"


def _load_hospitals() -> List[Hospital]:
    if not _DATASET_PATH.exists():
        logger.warning(
            "cost_estimator: dataset not found at %s; estimator will fall back "
            "to deterministic defaults without hospital matches",
            _DATASET_PATH,
        )
        return []

    hospitals: List[Hospital] = []
    try:
        with _DATASET_PATH.open("r", encoding="utf-8", newline="") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                name = (row.get("hospital_name") or "").strip()
                if not name:
                    continue
                hospitals.append(
                    Hospital(
                        name=name,
                        state=(row.get("state") or "").strip(),
                        district=(row.get("district") or "").strip(),
                        city=(row.get("city") or "").strip(),
                        hospital_type=(row.get("hospital_type") or "").strip(),
                        specialization=(row.get("specialization") or "").strip(),
                        rating=_coerce_float(row.get("rating", "0")),
                        cost_level=_normalize_cost_level(row.get("cost_level", "")),
                        latitude=_coerce_float(row.get("latitude", "0")),
                        longitude=_coerce_float(row.get("longitude", "0")),
                    )
                )
    except Exception:
        logger.exception("cost_estimator: failed to load dataset")
        return []
    return hospitals


HOSPITALS: Tuple[Hospital, ...] = tuple(_load_hospitals())

_HOSPITALS_BY_CITY: Dict[str, Tuple[Hospital, ...]] = {}
for _h in HOSPITALS:
    _key = _h.city.strip().lower()
    _HOSPITALS_BY_CITY.setdefault(_key, ())
    _HOSPITALS_BY_CITY[_key] = _HOSPITALS_BY_CITY[_key] + (_h,)


def hospitals_in_city(city: str) -> Tuple[Hospital, ...]:
    """Return the dataset rows for ``city`` (case-insensitive). Empty if none."""
    if not city:
        return ()
    return _HOSPITALS_BY_CITY.get(city.strip().lower(), ())


# ---------------------------------------------------------------------------
# Tier order (used for Auto-tier resolution and stratified hospital pick)
# ---------------------------------------------------------------------------

TIER_ORDER: Tuple[str, ...] = ("Low", "Medium", "High")


# ---------------------------------------------------------------------------
# Hand-calibrated total ranges
# ---------------------------------------------------------------------------
#
# These are the source of truth. Every cell is a realistic ``(min, max)``
# for one full treatment cycle at the given tier and severity, in 2024-25
# Indian rupees. Tuned against typical pricing across govt OPD, mid-tier
# private clinics, and corporate/premium hospitals like Apollo / Manipal /
# Fortis.
#
# Convention:
#   * "Mild": minimal intervention — one consult, basic workup, short med
#     course. No procedures or hospitalization unless the condition
#     fundamentally requires it (e.g. cancer at any severity has a procedure
#     line because biopsy / planning happens).
#   * "Moderate": typical ongoing care — multiple visits, fuller diagnostic
#     panel, recurring meds. May include a routine procedure for
#     condition categories where it's standard (orthopedics, gynaecology,
#     cardiology).
#   * "Severe": acute / advanced — admission, surgery, ICU, prolonged
#     follow-up.

TOTAL_RANGES: Dict[str, Dict[str, Dict[str, Tuple[int, int]]]] = {
    # ── Acute non-surgical ────────────────────────────────────────────
    "general": {  # fever, cough, viral infection
        "Low":    {"mild": (300, 1200),   "moderate": (600, 2200),    "severe": (1800, 6000)},
        "Medium": {"mild": (700, 2500),   "moderate": (1500, 4500),   "severe": (4500, 14000)},
        "High":   {"mild": (1500, 4500),  "moderate": (3000, 9000),   "severe": (10000, 28000)},
    },
    # ── Chronic conditions ────────────────────────────────────────────
    "diabetes": {
        "Low":    {"mild": (700, 2500),   "moderate": (1200, 4500),   "severe": (2500, 8000)},
        "Medium": {"mild": (1800, 5500),  "moderate": (3000, 9500),   "severe": (5500, 17000)},
        "High":   {"mild": (3500, 10000), "moderate": (6000, 20000),  "severe": (12000, 35000)},
    },
    "hypertension": {
        "Low":    {"mild": (500, 2000),   "moderate": (1000, 3500),   "severe": (2000, 6500)},
        "Medium": {"mild": (1200, 4500),  "moderate": (2500, 8000),   "severe": (4500, 14000)},
        "High":   {"mild": (3000, 9000),  "moderate": (5500, 18000),  "severe": (10000, 30000)},
    },
    "asthma": {
        "Low":    {"mild": (400, 1500),   "moderate": (1500, 4500),   "severe": (8000, 30000)},
        "Medium": {"mild": (1200, 4000),  "moderate": (3500, 12000),  "severe": (18000, 70000)},
        "High":   {"mild": (3000, 9500),  "moderate": (8000, 28000),  "severe": (40000, 150000)},
    },
    # ── Procedural / specialty ────────────────────────────────────────
    "dental": {
        "Low":    {"mild": (300, 1200),   "moderate": (1000, 3500),   "severe": (3000, 10000)},
        "Medium": {"mild": (800, 2800),   "moderate": (2500, 8000),   "severe": (7000, 25000)},
        "High":   {"mild": (1800, 6000),  "moderate": (5500, 16000),  "severe": (15000, 50000)},
    },
    "ophthalmology": {
        "Low":    {"mild": (300, 1200),   "moderate": (8000, 30000),  "severe": (18000, 60000)},
        "Medium": {"mild": (800, 3000),   "moderate": (18000, 60000), "severe": (40000, 140000)},
        "High":   {"mild": (2000, 7000),  "moderate": (40000, 140000),"severe": (85000, 350000)},
    },
    "orthopedics": {
        "Low":    {"mild": (1000, 4500),  "moderate": (12000, 40000), "severe": (45000, 150000)},
        "Medium": {"mild": (3000, 10000), "moderate": (28000, 90000), "severe": (90000, 300000)},
        "High":   {"mild": (8000, 25000), "moderate": (70000, 250000),"severe": (250000, 800000)},
    },
    # ── Critical / high-stakes ────────────────────────────────────────
    "cardiology": {
        "Low":    {"mild": (800, 3500),   "moderate": (4000, 18000),  "severe": (60000, 250000)},
        "Medium": {"mild": (2500, 9000),  "moderate": (12000, 45000), "severe": (150000, 600000)},
        "High":   {"mild": (6000, 22000), "moderate": (35000, 120000),"severe": (400000, 1800000)},
    },
    "neurology": {
        "Low":    {"mild": (700, 3000),   "moderate": (5000, 25000),  "severe": (50000, 200000)},
        "Medium": {"mild": (2500, 9000),  "moderate": (15000, 60000), "severe": (120000, 500000)},
        "High":   {"mild": (6000, 22000), "moderate": (35000, 140000),"severe": (350000, 1500000)},
    },
    "gynaecology": {
        "Low":    {"mild": (500, 2500),   "moderate": (3000, 12000),  "severe": (25000, 90000)},
        "Medium": {"mild": (1500, 5500),  "moderate": (8000, 30000),  "severe": (60000, 200000)},
        "High":   {"mild": (3500, 12000), "moderate": (20000, 75000), "severe": (150000, 500000)},
    },
    "oncology": {
        "Low":    {"mild": (8000, 35000),    "moderate": (35000, 150000),    "severe": (150000, 500000)},
        "Medium": {"mild": (20000, 80000),   "moderate": (80000, 350000),    "severe": (400000, 1200000)},
        "High":   {"mild": (50000, 200000),  "moderate": (200000, 700000),   "severe": (800000, 3500000)},
    },
}


# ---------------------------------------------------------------------------
# Per-condition × per-severity line allocation weights
# ---------------------------------------------------------------------------
#
# These are *relative* weights — they do not need to sum to any particular
# value. The estimator normalizes within each (condition, severity) cell.
# Lines that don't apply at a severity are simply absent. This is how
# severity gating is encoded — there's no separate gating logic.

LINE_WEIGHTS: Dict[str, Dict[str, Dict[str, int]]] = {
    "general": {
        "mild":     {"consultation": 5, "tests": 2, "medication": 3},
        "moderate": {"consultation": 4, "tests": 3, "medication": 4},
        # Severe general medicine = ER admission, IV fluids, short stay.
        "severe":   {"consultation": 3, "tests": 4, "medication": 4, "hospitalization": 6},
    },
    "diabetes": {
        # Chronic outpatient management; medication dominates.
        "mild":     {"consultation": 3, "tests": 3, "medication": 4},
        "moderate": {"consultation": 3, "tests": 4, "medication": 5},
        "severe":   {"consultation": 3, "tests": 5, "medication": 6},
    },
    "hypertension": {
        "mild":     {"consultation": 3, "tests": 2, "medication": 5},
        "moderate": {"consultation": 3, "tests": 3, "medication": 6},
        "severe":   {"consultation": 3, "tests": 4, "medication": 7},
    },
    "asthma": {
        "mild":     {"consultation": 4, "tests": 2, "medication": 4},
        "moderate": {"consultation": 3, "tests": 4, "medication": 5},
        # Severe = nebulization, admission, IV steroids.
        "severe":   {"consultation": 2, "tests": 3, "medication": 4, "hospitalization": 8},
    },
    "dental": {
        "mild":     {"consultation": 6, "tests": 1, "medication": 2},
        "moderate": {"consultation": 3, "tests": 1, "medication": 2, "procedure": 6},
        "severe":   {"consultation": 2, "tests": 1, "medication": 2, "procedure": 9},
    },
    "ophthalmology": {
        "mild":     {"consultation": 6, "tests": 3, "medication": 1},
        "moderate": {"consultation": 2, "tests": 2, "medication": 1, "procedure": 8},
        "severe":   {"consultation": 1, "tests": 2, "medication": 2, "procedure": 10, "hospitalization": 2},
    },
    "orthopedics": {
        "mild":     {"consultation": 3, "tests": 4, "medication": 3},
        "moderate": {"consultation": 1, "tests": 2, "medication": 2, "procedure": 6, "hospitalization": 3},
        "severe":   {"consultation": 1, "tests": 2, "medication": 2, "procedure": 7, "hospitalization": 4},
    },
    "cardiology": {
        "mild":     {"consultation": 3, "tests": 4, "medication": 3},
        "moderate": {"consultation": 2, "tests": 3, "medication": 3, "procedure": 5, "hospitalization": 2},
        "severe":   {"consultation": 1, "tests": 2, "medication": 1, "procedure": 7, "hospitalization": 4},
    },
    "neurology": {
        "mild":     {"consultation": 4, "tests": 3, "medication": 3},
        "moderate": {"consultation": 2, "tests": 4, "medication": 3, "procedure": 4, "hospitalization": 2},
        "severe":   {"consultation": 1, "tests": 3, "medication": 2, "procedure": 5, "hospitalization": 5},
    },
    "gynaecology": {
        "mild":     {"consultation": 4, "tests": 3, "medication": 3},
        "moderate": {"consultation": 2, "tests": 3, "medication": 2, "procedure": 5, "hospitalization": 1},
        "severe":   {"consultation": 1, "tests": 2, "medication": 2, "procedure": 6, "hospitalization": 5},
    },
    "oncology": {
        # Even mild cancer involves diagnosis (biopsy / imaging) so the
        # procedure line is present at every severity.
        "mild":     {"consultation": 3, "tests": 5, "medication": 2, "procedure": 4},
        "moderate": {"consultation": 1, "tests": 3, "medication": 4, "procedure": 5, "hospitalization": 2},
        "severe":   {"consultation": 1, "tests": 2, "medication": 5, "procedure": 6, "hospitalization": 4},
    },
}


# Consultation-type multiplier — applied only to the consultation line.
# The total is recomputed from line sum so everything stays consistent.
CONSULTATION_MULT: Dict[str, float] = {
    "general": 0.85,
    "specialist": 1.15,
    "follow_up": 0.55,
    "tele": 0.50,
}

# Severity normalization (lowercase canonical).
_SEVERITIES: Tuple[str, ...] = ("mild", "moderate", "severe")


# ---------------------------------------------------------------------------
# Condition catalog
# ---------------------------------------------------------------------------

DATASET_SPECIALIZATIONS: Tuple[str, ...] = (
    "Cardiology",
    "Dental",
    "General Medicine",
    "Multi-speciality",
    "Neurology",
    "Obstetrics & Gynaecology",
    "Oncology",
    "Ophthalmology",
    "Orthopedics & Trauma",
)


@dataclass(frozen=True)
class ConditionProfile:
    """Maps a condition key to its display label, free-text aliases, and the
    dataset specializations relevant to it. The numeric pricing logic lives
    in :data:`TOTAL_RANGES` and :data:`LINE_WEIGHTS` keyed by ``key``.
    """

    key: str
    label: str
    aliases: Tuple[str, ...]
    specializations: Tuple[str, ...]


CONDITION_CATALOG: Tuple[ConditionProfile, ...] = (
    ConditionProfile(
        key="general",
        label="General Medicine",
        aliases=(
            "fever", "cold", "cough", "flu", "viral", "infection",
            "general", "checkup", "fatigue", "weakness", "body ache",
            "throat", "headache",
        ),
        specializations=("General Medicine", "Multi-speciality"),
    ),
    ConditionProfile(
        key="diabetes",
        label="Diabetes",
        aliases=(
            "diabetes", "diabetic", "blood sugar", "type 1", "type 2",
            "insulin", "hba1c",
        ),
        specializations=("General Medicine", "Multi-speciality"),
    ),
    ConditionProfile(
        key="hypertension",
        label="Hypertension",
        aliases=("hypertension", "high blood pressure", "bp", "blood pressure"),
        specializations=("Cardiology", "General Medicine", "Multi-speciality"),
    ),
    ConditionProfile(
        key="asthma",
        label="Asthma / Respiratory",
        aliases=(
            "asthma", "respiratory", "breathing", "copd", "lung", "wheeze",
            "wheezing", "bronchitis", "pneumonia",
        ),
        specializations=("General Medicine", "Multi-speciality"),
    ),
    ConditionProfile(
        key="dental",
        label="Dental",
        aliases=(
            "dental", "tooth", "teeth", "gum", "root canal", "cavity",
            "filling", "extraction", "molar", "wisdom tooth",
        ),
        specializations=("Dental", "Multi-speciality"),
    ),
    ConditionProfile(
        key="ophthalmology",
        label="Ophthalmology",
        aliases=("eye", "vision", "cataract", "retina", "glaucoma", "myopia", "lasik"),
        specializations=("Ophthalmology", "Multi-speciality"),
    ),
    ConditionProfile(
        key="orthopedics",
        label="Orthopedics",
        aliases=(
            "ortho", "orthopedic", "fracture", "joint", "knee", "back pain",
            "spine", "shoulder", "bone", "ligament", "sprain", "dislocation",
        ),
        specializations=("Orthopedics & Trauma", "Multi-speciality"),
    ),
    ConditionProfile(
        key="cardiology",
        label="Heart / Cardiology",
        aliases=(
            "heart", "cardiac", "cardio", "chest pain", "angina",
            "arrhythmia", "palpitation", "stroke risk",
        ),
        specializations=("Cardiology", "Multi-speciality"),
    ),
    ConditionProfile(
        key="neurology",
        label="Neurology",
        aliases=(
            "neuro", "migraine", "seizure", "epilepsy", "stroke",
            "parkinson", "alzheimer", "nerve", "vertigo",
        ),
        specializations=("Neurology", "Multi-speciality"),
    ),
    ConditionProfile(
        key="gynaecology",
        label="Obstetrics & Gynaecology",
        aliases=(
            "pregnancy", "pregnant", "gyna", "gyne", "obstetric",
            "menstrual", "period", "pcos", "fertility", "delivery",
        ),
        specializations=("Obstetrics & Gynaecology", "Multi-speciality"),
    ),
    ConditionProfile(
        key="oncology",
        label="Oncology / Cancer",
        aliases=(
            "cancer", "tumor", "tumour", "oncology", "chemo", "lymphoma",
            "leukemia", "leukaemia", "carcinoma",
        ),
        specializations=("Oncology", "Multi-speciality"),
    ),
)


def _condition_by_key(key: str) -> Optional[ConditionProfile]:
    for c in CONDITION_CATALOG:
        if c.key == key:
            return c
    return None


def resolve_condition(text: str) -> ConditionProfile:
    """Resolve a free-form condition string to a canonical condition profile.

    Matches by counting how many of each profile's aliases appear as
    substrings of the (lowercased) input, longest aliases first so
    "blood pressure" matches hypertension instead of "blood" matching some
    other profile. Falls back to ``general`` when nothing matches.
    """
    fallback = _condition_by_key("general")
    assert fallback is not None  # populated above

    if not text:
        return fallback
    norm = text.strip().lower()
    if not norm:
        return fallback

    direct_key = norm.replace(" ", "_")
    direct = _condition_by_key(direct_key)
    if direct is not None:
        return direct
    for c in CONDITION_CATALOG:
        if c.label.lower() == norm:
            return c

    best: Optional[ConditionProfile] = None
    best_score = 0.0
    for cond in CONDITION_CATALOG:
        score = 0.0
        for alias in sorted(cond.aliases, key=len, reverse=True):
            if alias in norm:
                score += 1.0 + len(alias) / 30.0
        if score > best_score:
            best_score = score
            best = cond

    return best if (best is not None and best_score > 0) else fallback


# ---------------------------------------------------------------------------
# Rounding helpers
# ---------------------------------------------------------------------------

def _round_to(n: float, step: int) -> int:
    if step <= 0:
        return int(round(n))
    return int(round(n / step) * step)


def _round_band(low: float, high: float) -> Tuple[int, int]:
    """Round a (low, high) pair to readable steps, preserving order."""
    if high < 1500:
        step = 50
    elif high < 8000:
        step = 100
    elif high < 25000:
        step = 250
    elif high < 100000:
        step = 500
    else:
        step = 1000

    rounded_low = max(0, _round_to(low, step))
    rounded_high = max(rounded_low, _round_to(high, step))
    if rounded_high == rounded_low and high > low:
        rounded_high = rounded_low + step
    return rounded_low, rounded_high


# ---------------------------------------------------------------------------
# Hospital matching
# ---------------------------------------------------------------------------


def _hospital_relevance(h: Hospital, condition: ConditionProfile) -> float:
    spec = h.specialization.strip()
    primary = condition.specializations[0] if condition.specializations else ""

    score = 0.0
    if spec == primary:
        score = 1.00
    elif spec in condition.specializations:
        score = 0.75
    elif spec == "Multi-speciality":
        score = 0.55
    else:
        score = 0.0

    score += max(0.0, min(0.20, (h.rating - 3.5) * 0.15))
    return round(min(1.0, score), 3)


def _stratified_pick(
    candidates: List[Tuple[Hospital, float]],
    *,
    target: int,
) -> List[Tuple[Hospital, float]]:
    """Pick up to ``target`` hospitals, distributing across cost tiers."""
    if not candidates:
        return []

    buckets: Dict[str, List[Tuple[Hospital, float]]] = {t: [] for t in TIER_ORDER}
    for h, rel in candidates:
        buckets.setdefault(h.cost_level, []).append((h, rel))

    present_tiers = [t for t in TIER_ORDER if buckets[t]]
    picked: List[Tuple[Hospital, float]] = []
    while len(picked) < target and present_tiers:
        for tier in list(present_tiers):
            if not buckets[tier]:
                present_tiers.remove(tier)
                continue
            picked.append(buckets[tier].pop(0))
            if len(picked) >= target:
                break
    return picked


def match_hospitals(
    *,
    city: str,
    condition: ConditionProfile,
    requested_tier: Optional[str],
    limit: int = 6,
) -> List[Tuple[Hospital, float]]:
    """Return up to ``limit`` hospitals in ``city`` matched to ``condition``."""
    pool = hospitals_in_city(city)
    if not pool:
        return []

    scored: List[Tuple[Hospital, float]] = []
    for h in pool:
        rel = _hospital_relevance(h, condition)
        if rel <= 0:
            continue
        scored.append((h, rel))

    if not scored:
        scored = [(h, 0.40) for h in pool]

    scored.sort(key=lambda pair: (-pair[1], -pair[0].rating, pair[0].name))

    if requested_tier:
        target = _normalize_cost_level(requested_tier)
        same_tier = [pair for pair in scored if pair[0].cost_level == target]
        if same_tier:
            return same_tier[:limit]
        return scored[:limit]

    return _stratified_pick(scored, target=limit)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


# Envelope widening factors — bound the AI refinement layer's freedom on
# top of the deterministic baseline. Small enough that even a fully
# refined estimate stays inside a plausible Indian-healthcare range, large
# enough to give Gemini room to model realistic workflow complexity.
_ENVELOPE_LOW_MULT = 0.65   # allowed_min  = baseline_min × 0.65
_ENVELOPE_HIGH_MULT = 1.40  # allowed_max  = baseline_max × 1.40


def _resolve_total_range(condition_key: str, tier: str, severity: str) -> Tuple[int, int]:
    """Look up the calibrated total range; fall back to ``general`` if missing."""
    cond_table = TOTAL_RANGES.get(condition_key) or TOTAL_RANGES["general"]
    tier_table = cond_table.get(tier) or cond_table["Medium"]
    band = tier_table.get(severity) or tier_table["moderate"]
    return int(band[0]), int(band[1])


def _resolve_weights(condition_key: str, severity: str) -> Dict[str, int]:
    cond = LINE_WEIGHTS.get(condition_key) or LINE_WEIGHTS["general"]
    return dict(cond.get(severity) or cond["moderate"])


def estimate(
    *,
    city: str,
    condition_text: str,
    severity: Optional[str] = None,
    hospital_tier: Optional[str] = None,
    consultation_type: Optional[str] = None,
) -> Dict[str, object]:
    """Generate a deterministic cost estimate.

    Parameters mirror the public API request body. When ``hospital_tier`` is
    omitted the response uses tier = ``"Auto"`` and the displayed total
    spans every tier present in the user's city.
    """
    condition = resolve_condition(condition_text)

    severity_norm = (severity or "moderate").strip().lower()
    if severity_norm not in _SEVERITIES:
        severity_norm = "moderate"

    consultation_norm = (consultation_type or "specialist").strip().lower().replace("-", "_").replace(" ", "_")
    if consultation_norm not in CONSULTATION_MULT:
        consultation_norm = "specialist"

    auto_tier = hospital_tier is None or str(hospital_tier).strip() == ""
    chosen_tier = None if auto_tier else _normalize_cost_level(str(hospital_tier))

    pool = hospitals_in_city(city)
    if auto_tier:
        if pool:
            present_tiers = tuple(
                t for t in TIER_ORDER if any(h.cost_level == t for h in pool)
            )
            if not present_tiers:
                present_tiers = TIER_ORDER
        else:
            # Unknown city — span the full spectrum so the range stays useful.
            present_tiers = TIER_ORDER
    else:
        # ``chosen_tier`` is not None inside this branch — assertion appeases type-checkers.
        assert chosen_tier is not None
        present_tiers = (chosen_tier,)

    matches = match_hospitals(
        city=city,
        condition=condition,
        requested_tier=chosen_tier,
        limit=6,
    )

    # ---- Total range (the anchor) ----------------------------------------
    if auto_tier:
        # Auto: span from the lowest present tier's min to the highest
        # present tier's max. Both endpoints are themselves hand-calibrated,
        # so they are individually plausible.
        ordered = [t for t in TIER_ORDER if t in present_tiers]
        if not ordered:
            ordered = list(TIER_ORDER)
        low_low, _ = _resolve_total_range(condition.key, ordered[0], severity_norm)
        _, high_high = _resolve_total_range(condition.key, ordered[-1], severity_norm)
        total_min = float(low_low)
        total_max = float(high_high)
    else:
        assert chosen_tier is not None
        lo, hi = _resolve_total_range(condition.key, chosen_tier, severity_norm)
        total_min = float(lo)
        total_max = float(hi)

    # ---- Line breakdown via proportional allocation ---------------------
    weights = _resolve_weights(condition.key, severity_norm)
    weight_total = float(sum(weights.values())) or 1.0

    raw_breakdown: Dict[str, Dict[str, float]] = {}
    for line, w in weights.items():
        share = w / weight_total
        raw_breakdown[line] = {
            "min": total_min * share,
            "max": total_max * share,
        }

    # Apply consultation_type multiplier to the consultation line, then
    # re-derive the total from the line sum so the output stays internally
    # consistent.
    consult_mult = CONSULTATION_MULT.get(consultation_norm, 1.0)
    if consult_mult != 1.0 and "consultation" in raw_breakdown:
        c = raw_breakdown["consultation"]
        c["min"] = c["min"] * consult_mult
        c["max"] = c["max"] * consult_mult

    sum_min = sum(b["min"] for b in raw_breakdown.values())
    sum_max = sum(b["max"] for b in raw_breakdown.values())
    total_min, total_max = sum_min, sum_max

    breakdown_rounded: Dict[str, Dict[str, int]] = {}
    for line, b in raw_breakdown.items():
        rl, rh = _round_band(b["min"], b["max"])
        breakdown_rounded[line] = {"min": rl, "max": rh}
    rounded_total_min, rounded_total_max = _round_band(total_min, total_max)

    # ---- Per-tier breakdown (Auto only) ---------------------------------
    tier_breakdown: Dict[str, Dict[str, int]] = {}
    if auto_tier:
        consult_share = (weights.get("consultation", 0) / weight_total) if weight_total else 0
        for tier in present_tiers:
            t_lo, t_hi = _resolve_total_range(condition.key, tier, severity_norm)
            # Scale the per-tier total by the consultation_type multiplier
            # using the same approach: only the consultation share is
            # affected.
            if consult_mult != 1.0 and consult_share > 0:
                scale = (1 - consult_share) + consult_share * consult_mult
                t_lo_s = float(t_lo) * scale
                t_hi_s = float(t_hi) * scale
            else:
                t_lo_s = float(t_lo)
                t_hi_s = float(t_hi)
            t_rmin, t_rmax = _round_band(t_lo_s, t_hi_s)
            tier_breakdown[tier] = {"min": t_rmin, "max": t_rmax}

    # ---- Allowed envelope (hard constraint for Gemini) ------------------
    allowed_total_min_raw = max(0.0, total_min * _ENVELOPE_LOW_MULT)
    allowed_total_max_raw = total_max * _ENVELOPE_HIGH_MULT
    allowed_total_min, allowed_total_max = _round_band(
        allowed_total_min_raw, allowed_total_max_raw
    )

    allowed_components: Dict[str, Dict[str, int]] = {}
    for line, b in raw_breakdown.items():
        a_lo = max(0.0, b["min"] * _ENVELOPE_LOW_MULT)
        a_hi = b["max"] * _ENVELOPE_HIGH_MULT
        ar_lo, ar_hi = _round_band(a_lo, a_hi)
        allowed_components[line] = {"min": ar_lo, "max": ar_hi}

    # ---- Hospitals + narrative -----------------------------------------
    matched_hospitals_payload = [
        {
            "name": h.name,
            "city": h.city,
            "district": h.district,
            "hospital_type": h.hospital_type,
            "specialization": h.specialization,
            "rating": round(h.rating, 1),
            "cost_level": h.cost_level,
            "relevance_score": rel,
        }
        for h, rel in matches
    ]

    confidence_note = _build_confidence_note(
        city=city,
        matches=matches,
        chosen_tier=chosen_tier,
        present_tiers=present_tiers,
        condition=condition,
        auto=auto_tier,
    )
    relevance_summary = _build_relevance_summary(
        city=city,
        matches=matches,
        condition=condition,
    )

    return {
        "city": city,
        "condition": {"key": condition.key, "label": condition.label},
        "tier": "Auto" if auto_tier else chosen_tier,
        "severity": severity_norm,
        "consultation_type": consultation_norm,
        "estimated_total_min": rounded_total_min,
        "estimated_total_max": rounded_total_max,
        "breakdown": breakdown_rounded,
        "tier_breakdown": tier_breakdown if auto_tier else {},
        "present_tiers": list(present_tiers),
        "allowed_range": {"min": allowed_total_min, "max": allowed_total_max},
        "allowed_components": allowed_components,
        "matched_hospitals": matched_hospitals_payload,
        "confidence_note": confidence_note,
        "relevance_summary": relevance_summary,
    }


# ---------------------------------------------------------------------------
# Narrative helpers
# ---------------------------------------------------------------------------


def _build_confidence_note(
    *,
    city: str,
    matches: List[Tuple[Hospital, float]],
    chosen_tier: Optional[str],
    present_tiers: Tuple[str, ...],
    condition: ConditionProfile,
    auto: bool,
) -> str:
    if matches:
        if auto:
            tier_list = ", ".join(t.lower() for t in present_tiers)
            return (
                f"Range spans the {tier_list} tier{'s' if len(present_tiers) != 1 else ''} "
                f"present in {city}, informed by {len(matches)} hospital match"
                f"{'es' if len(matches) != 1 else ''}. "
                f"Pick a tier above to narrow the estimate."
            )
        target = chosen_tier or "Medium"
        tier_match_count = sum(1 for h, _ in matches if h.cost_level == target)
        if tier_match_count == 0:
            other_tiers = sorted({h.cost_level for h, _ in matches})
            other_label = ", ".join(t.lower() for t in other_tiers)
            return (
                f"No {target.lower()}-tier hospitals are indexed in {city}; "
                f"the estimate uses the {target.lower()}-tier pricing band, "
                f"and the listed hospitals are {other_label}-tier alternatives."
            )
        return (
            f"Estimated against the {target.lower()}-tier pricing band in "
            f"{city}, informed by {tier_match_count} hospital match"
            f"{'es' if tier_match_count != 1 else ''}. "
            f"Actual costs vary by hospital, doctor, and treatment plan."
        )
    if auto:
        tier_list = ", ".join(t.lower() for t in present_tiers)
        return (
            f"No matching hospitals indexed for {city}; range uses the {tier_list} "
            f"tier base bands as a reference. Actual costs vary by hospital."
        )
    return (
        f"No matching hospitals indexed for {city} at the {chosen_tier.lower() if chosen_tier else ''} "
        f"tier; the base pricing band is used as a reference. Actual costs vary by hospital."
    )


def _build_relevance_summary(
    *,
    city: str,
    matches: List[Tuple[Hospital, float]],
    condition: ConditionProfile,
) -> str:
    if not matches:
        return f"No {condition.label.lower()} specialists indexed for {city} yet."
    primary = condition.specializations[0] if condition.specializations else ""
    primary_count = sum(1 for h, _ in matches if h.specialization == primary)
    multi_count = sum(1 for h, _ in matches if h.specialization == "Multi-speciality")
    parts = [
        f"{len(matches)} hospital{'s' if len(matches) != 1 else ''} reviewed in {city}",
    ]
    if primary_count and primary not in ("", "Multi-speciality"):
        parts.append(
            f"{primary_count} {primary.lower()} specialist"
            f"{'s' if primary_count != 1 else ''}"
        )
    if multi_count:
        parts.append(
            f"{multi_count} multi-speciality option"
            f"{'s' if multi_count != 1 else ''}"
        )
    return "; ".join(parts) + "."


__all__ = [
    "Hospital",
    "HOSPITALS",
    "DATASET_SPECIALIZATIONS",
    "ConditionProfile",
    "CONDITION_CATALOG",
    "TOTAL_RANGES",
    "LINE_WEIGHTS",
    "TIER_ORDER",
    "CONSULTATION_MULT",
    "hospitals_in_city",
    "resolve_condition",
    "match_hospitals",
    "estimate",
]
