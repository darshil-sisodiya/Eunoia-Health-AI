"""Tests for the symptom -> specialization mapping system.

Covers the keyword dictionary integrity, the mapper's clinical correctness
across short/long/multi-symptom/layman queries, and — most importantly — the
strict rule that everyday complaints never route to a surgical department.
"""
from __future__ import annotations

import pytest

import specialization_keywords as kw
import specialization_mapper as sm


# ---------------------------------------------------------------------------
# Keyword dictionary integrity
# ---------------------------------------------------------------------------


def test_all_specializations_have_keywords():
    for spec in kw.SPECIALIZATIONS:
        assert spec in kw.SPECIALIZATION_KEYWORDS
        assert kw.SPECIALIZATION_KEYWORDS[spec], f"{spec} has no keywords"


def test_every_specialization_has_at_least_150_keywords():
    counts = kw.keyword_counts()
    for spec, n in counts.items():
        assert n >= 150, f"{spec} has only {n} keywords (<150)"


def test_no_duplicate_keywords_within_a_specialization():
    for spec, words in kw.SPECIALIZATION_KEYWORDS.items():
        lowered = [w.lower() for w in words]
        assert len(lowered) == len(set(lowered)), f"{spec} contains duplicates"


def test_dataset_specializations_are_covered():
    # Every department that appears in blr.xlsx must be representable. Dentistry
    # is the mapper label for the dataset's "Dental" department.
    dataset = {
        "Cardiology", "Dermatology", "ENT", "Endocrinology", "Gastroenterology",
        "General Surgery", "Gynecology", "Hematology", "Nephrology", "Neurology",
        "Oncology", "Ophthalmology", "Orthopedics", "Pediatrics", "Plastic Surgery",
        "Psychiatry", "Pulmonology", "Rheumatology", "Urology",
    }
    for dept in dataset:
        assert dept in kw.SPECIALIZATION_KEYWORDS, f"{dept} missing from keywords"
    assert "Dentistry" in kw.SPECIALIZATION_KEYWORDS  # dataset "Dental"


def test_general_surgery_has_no_generic_symptom_words():
    # The structural fix: generic everyday words must NOT live under surgery.
    forbidden = {"fever", "pain", "swelling", "infection", "cough", "cold",
                 "headache", "weakness", "tired", "body ache"}
    gs = {w.lower() for w in kw.SPECIALIZATION_KEYWORDS["General Surgery"]}
    assert gs.isdisjoint(forbidden)


# ---------------------------------------------------------------------------
# Normalization
# ---------------------------------------------------------------------------


def test_normalize_lowercases_and_cleans_punctuation():
    assert sm.normalize("FEVER!!!").strip() == "fever"
    assert sm.normalize("Chest   Pain.") .strip() == "chest pain"


def test_normalize_expands_abbreviations():
    assert "blood pressure" in sm.normalize("high bp")
    assert "shortness of breath" in sm.normalize("sob since morning")


# ---------------------------------------------------------------------------
# Core mapping correctness
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "query,expected",
    [
        ("fever", "General Physician"),
        ("high fever and cough", "General Physician"),
        ("cold and cough", "General Physician"),
        ("chest pain", "Cardiology"),
        ("heart beating fast", "Cardiology"),
        ("palpitations", "Cardiology"),
        ("migraine", "Neurology"),
        ("skin itching and redness", "Dermatology"),
        ("skin rash", "Dermatology"),
        ("joint pain while walking", "Orthopedics"),
        ("stomach ache after eating", "Gastroenterology"),
        ("difficulty breathing", "Pulmonology"),
        ("asthma", "Pulmonology"),
        ("diabetes", "Endocrinology"),
        ("thyroid problem", "Endocrinology"),
        ("anxiety", "Psychiatry"),
        ("feeling depressed", "Psychiatry"),
        ("burning urination", "Urology"),
        ("kidney stone", "Urology"),
        ("ear pain", "ENT"),
        ("blurred vision", "Ophthalmology"),
        ("irregular periods", "Gynecology"),
        ("pregnancy checkup", "Gynecology"),
        ("hernia", "General Surgery"),
        ("gallstones", "General Surgery"),
        ("appendicitis", "General Surgery"),
        ("toothache", "Dentistry"),
        ("bleeding gums", "Dentistry"),
        ("rheumatoid arthritis", "Rheumatology"),
        ("high uric acid", "Rheumatology"),
        ("my child has fever", "Pediatrics"),
        ("low hemoglobin and fatigue", "Hematology"),
        ("diet plan for weight loss", "Nutrition/Dietetics"),
        ("physiotherapy after fracture", "Physiotherapy"),
        ("scar revision", "Plastic Surgery"),
        ("chronic kidney disease", "Nephrology"),
        ("cancer lump growing", "Oncology"),
    ],
)
def test_map_specialization_examples(query, expected):
    assert sm.best_specialization(query) == expected


# ---------------------------------------------------------------------------
# STRICT fallback rules
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "query",
    ["", "   ", "xyz random gibberish", "not feeling well", "feeling off",
     "something is wrong", "general discomfort"],
)
def test_unmatched_queries_fall_back_to_generalist(query):
    result = sm.map_specialization(query)
    assert result.specialization in (sm.PRIMARY_FALLBACK, sm.SECONDARY_FALLBACK)
    assert result.specialization not in sm.FALLBACK_FORBIDDEN


@pytest.mark.parametrize(
    "query",
    ["fever", "pain", "swelling", "infection", "body ache", "weakness",
     "tired", "not well", "feeling sick", "general weakness"],
)
def test_generic_complaints_never_route_to_surgery(query):
    spec = sm.best_specialization(query)
    assert spec not in ("General Surgery", "Plastic Surgery"), (
        f"{query!r} incorrectly routed to {spec}"
    )


def test_chronic_wording_prefers_internal_medicine():
    assert sm.best_specialization("tired all the time for months") == "Internal Medicine"
    assert sm.best_specialization("unexplained weight loss") == "Internal Medicine"


# ---------------------------------------------------------------------------
# Robustness: short / long / multi-symptom / layman / mixed wording
# ---------------------------------------------------------------------------


def test_long_multi_symptom_description():
    q = ("for the past few days i have had high fever with chills, body pain "
         "and a bad cough, feeling very weak")
    assert sm.best_specialization(q) == "General Physician"


def test_layman_phrasing_chest():
    assert sm.best_specialization("my heart is racing and pounding") == "Cardiology"


def test_mixed_wording_stomach():
    assert sm.best_specialization("really bad tummy ache and loose motions") == "Gastroenterology"


def test_result_is_deterministic():
    a = sm.map_specialization("chest pain and breathlessness")
    b = sm.map_specialization("chest pain and breathlessness")
    assert a.specialization == b.specialization
    assert a.confidence == b.confidence


def test_rank_returns_scores():
    ranked = sm.rank_specializations("chest pain", top=3)
    assert ranked
    assert ranked[0][0] == "Cardiology"
    assert ranked[0][1] >= ranked[-1][1]
