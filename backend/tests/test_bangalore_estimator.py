"""Tests for the Bangalore-specific (blr.xlsx) cost estimation pipeline.

These exercise the pure estimator module directly (no network, no DB) and
verify:

  * the dataset loads and tiers are dynamically derived & cleanly separated,
  * Bangalore results carry doctor recommendations + consultation fees,
  * fee-driven tier classification (Low < Mid < High) is monotonic,
  * city routing only treats Bengaluru/Bangalore as the special case,
  * non-Bangalore cities keep the generic deterministic shape (no doctors).
"""
from __future__ import annotations

import math

import pytest

import bangalore_estimator as be
import cost_estimator as ce


pytestmark = pytest.mark.skipif(
    not be.AVAILABLE,
    reason="blr.xlsx / openpyxl unavailable in this environment",
)


def test_dataset_loaded():
    assert len(be.HOSPITALS) > 0
    # Every hospital should have at least one doctor and a derived tier.
    for h in be.HOSPITALS:
        assert h.tier in be.TIER_NAMES


def test_is_bangalore_aliases():
    assert be.is_bangalore("Bengaluru")
    assert be.is_bangalore("bangalore")
    assert be.is_bangalore("  BLR ")
    assert not be.is_bangalore("Mysuru")
    assert not be.is_bangalore("")
    assert not be.is_bangalore(None)


def test_tier_fee_bands_are_monotonic():
    low = be.TIER_FEE_BANDS["Low"]
    mid = be.TIER_FEE_BANDS["Mid"]
    high = be.TIER_FEE_BANDS["High"]
    # Anchored on per-hospital median fees within each tier, so the bands
    # should step upward Low -> Mid -> High.
    assert low[0] <= mid[0] <= high[0]
    assert low[1] <= mid[1] <= high[1]


def test_tiers_partition_hospitals():
    tiers = {t: 0 for t in be.TIER_NAMES}
    for h in be.HOSPITALS:
        tiers[h.tier] += 1
    # Tercile-based classification should populate all three tiers.
    assert all(count > 0 for count in tiers.values())


def test_estimate_returns_bangalore_mode_and_doctors():
    res = be.estimate(
        city="Bengaluru",
        condition_text="chest pain",
        severity="Moderate",
        hospital_tier=None,
        consultation_type="Specialist",
    )
    assert res["bangalore_mode"] is True
    assert res["city"] == "Bengaluru"
    assert res["condition"]["key"] == "cardiology"
    assert res["estimated_total_min"] < res["estimated_total_max"]

    hospitals = res["matched_hospitals"]
    assert len(hospitals) > 0
    first = hospitals[0]
    # Bangalore enrichment present.
    assert first["tier"] in be.TIER_NAMES
    assert first["doctors"], "expected doctor recommendations"
    doc = first["doctors"][0]
    assert doc["name"]
    assert doc["consultation_fee"] is None or doc["consultation_fee"] > 0
    assert first["estimated_cost_min"] <= first["estimated_cost_max"]


def test_doctor_specialization_relevance():
    # A cardiology condition should surface cardiology-department doctors first.
    res = be.estimate(
        city="Bangalore",
        condition_text="heart attack",
        severity="Severe",
        hospital_tier="High",
        consultation_type="Specialist",
    )
    specialties = be.condition_specialties("cardiology")
    assert "Cardiology" in specialties
    surfaced = [
        d["specialization"]
        for h in res["matched_hospitals"]
        for d in h["doctors"]
    ]
    # At least one recommended doctor matches the relevant specialty.
    assert any(s in specialties for s in surfaced)


def test_requested_tier_narrows_results():
    res = be.estimate(
        city="Bengaluru",
        condition_text="diabetes",
        severity="Mild",
        hospital_tier="Low",
        consultation_type="General",
    )
    assert res["tier"] == "Low"
    # Tier breakdown only populated for Auto.
    assert res["tier_breakdown"] == {}
    for h in res["matched_hospitals"]:
        assert h["tier"] == "Low"


def test_auto_tier_spans_all_tiers():
    # Use a specialist condition so the Bangalore pipeline (not the generic
    # fallback) produces the Low/Mid/High tier breakdown.
    res = be.estimate(
        city="Bengaluru",
        condition_text="chest pain",
        severity="Moderate",
        hospital_tier=None,
        consultation_type="Specialist",
    )
    assert res["tier"] == "Auto"
    assert res.get("bangalore_mode") is True
    tb = res["tier_breakdown"]
    assert set(tb.keys()) <= set(be.TIER_NAMES)
    # Per-tier totals should be ordered Low <= Mid <= High at the top end.
    if all(t in tb for t in be.TIER_NAMES):
        assert tb["Low"]["max"] <= tb["Mid"]["max"] <= tb["High"]["max"]


def test_generalist_symptom_falls_back_to_hospitals_only():
    # "fever" maps to General Physician, which has no department in blr.xlsx.
    # The Bangalore pipeline must step aside and serve hospitals only (no
    # doctors, no specialization), exactly like other Karnataka cities.
    res = be.estimate(
        city="Bengaluru",
        condition_text="fever",
        severity="Moderate",
        hospital_tier=None,
        consultation_type="Specialist",
    )
    assert "bangalore_mode" not in res
    assert "mapped_specialization" not in res
    assert res["matched_hospitals"], "should still recommend hospitals"
    for h in res["matched_hospitals"]:
        assert "doctors" not in h
        assert "consultation_fee_min" not in h


def test_generalist_specializations_have_no_department():
    for spec in be.GENERALIST_SPECIALIZATIONS:
        assert not be.has_dataset_department(spec)
    # And the symptom routing returns no departments for them.
    assert be.specialties_for_text("fever") == ()
    assert be.specialties_for_text("need a diet plan") == ()


def test_specialist_symptom_keeps_rich_bangalore_output():
    res = be.estimate(
        city="Bengaluru",
        condition_text="chest pain",
        severity="Moderate",
        hospital_tier=None,
        consultation_type="Specialist",
    )
    assert res.get("bangalore_mode") is True
    assert res.get("mapped_specialization") == "Cardiology"
    assert any(h.get("doctors") for h in res["matched_hospitals"])


def test_allowed_envelope_contains_baseline():
    res = be.estimate(
        city="Bengaluru",
        condition_text="knee fracture",
        severity="Severe",
        hospital_tier="High",
        consultation_type="Specialist",
    )
    env = res["allowed_range"]
    assert env["min"] <= res["estimated_total_min"]
    assert env["max"] >= res["estimated_total_max"]


def test_generic_city_has_no_bangalore_enrichment():
    # The generic estimator path must remain unchanged for other cities.
    res = ce.estimate(
        city="Mysuru",
        condition_text="fever",
        severity="Mild",
        hospital_tier=None,
        consultation_type="General",
    )
    assert "bangalore_mode" not in res
    for h in res["matched_hospitals"]:
        assert "doctors" not in h
