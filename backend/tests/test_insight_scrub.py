"""The diagnosis scrub must remove denylisted phrases without garbling prose."""
from __future__ import annotations

from gemini_insights import DIAGNOSIS_DENYLIST, SOFT_REPLACEMENT, scrub_diagnosis_language


def test_replaces_the_whole_offending_sentence():
    text = (
        "Walking helps. Since you exercise, you have a solid foundation to build on.\n\n"
        "Sleep matters too."
    )
    assert scrub_diagnosis_language(text) == (
        f"Walking helps. {SOFT_REPLACEMENT}\n\nSleep matters too."
    )


def test_no_denylisted_phrase_survives():
    for phrase in DIAGNOSIS_DENYLIST:
        out = scrub_diagnosis_language(f"Intro. Please {phrase} now. Outro.").lower()
        assert phrase not in out, phrase
        assert out.startswith("intro.") and out.endswith("outro.")


def test_clean_text_is_untouched():
    text = "Drink more water. Aim for 7 hours of sleep!"
    assert scrub_diagnosis_language(text) == text
