"""Production-grade symptom -> medical specialization mapper.

This is the triage brain that turns a free-text patient complaint into the
single best-matching specialization, backed by the large keyword dictionary in
:mod:`specialization_keywords`.

Pipeline
========

1. **Normalization** — lowercase, strip accents, expand a small set of common
   abbreviations/synonyms (``bp`` -> ``blood pressure``, ``sob`` ->
   ``shortness of breath``), collapse punctuation and whitespace.

2. **Phrase matching (weighted)** — every keyword is matched as a whole-word
   phrase against the normalized text. Longer, more specific phrases score
   much higher than single generic words, so "chest pain" decisively beats a
   stray "pain". Multi-word clinical phrases are the strongest signal.

3. **Partial / token matching** — for multi-word keywords that don't appear
   verbatim, a smaller partial-overlap credit is given so paraphrases
   ("pain in my chest") still register.

4. **Weighted specialization scoring** — per-specialization scores are summed,
   length-normalized so a specialization with more keywords isn't unfairly
   advantaged, and the best score wins.

5. **STRICT fallback** — if no specialization clears a confidence threshold the
   result is ``"General Physician"`` (or ``"Internal Medicine"`` for clearly
   chronic/systemic wording). The fallback is **never** ``General Surgery``.

The module is pure and deterministic; identical input always yields identical
output. It performs no I/O and has no third-party dependencies.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from specialization_keywords import SPECIALIZATION_KEYWORDS, SPECIALIZATIONS

# ---------------------------------------------------------------------------
# Fallback configuration
# ---------------------------------------------------------------------------

#: Primary safe fallback for undifferentiated / everyday complaints.
PRIMARY_FALLBACK = "General Physician"

#: Secondary fallback when wording is clearly chronic / systemic / multi-organ.
SECONDARY_FALLBACK = "Internal Medicine"

#: Specializations that must NEVER be selected as a fallback. A surgical
#: department is only ever returned when a genuinely surgical keyword matched.
FALLBACK_FORBIDDEN = frozenset({"General Surgery", "Plastic Surgery"})

#: Minimum total score a specialization must reach to beat the fallback. Tuned
#: so a single specific phrase ("migraine") wins, but a lone generic token does
#: not hijack the result.
CONFIDENCE_THRESHOLD = 1.0

#: Wording that nudges an unmatched query toward Internal Medicine instead of
#: the General Physician default (chronic / systemic framing).
_INTERNAL_MEDICINE_HINTS = (
    "chronic", "for months", "for weeks", "since months", "long standing",
    "long term", "multiple symptoms", "weight loss", "weight gain",
    "always tired", "all the time", "recurrent", "persistent", "systemic",
    "several problems", "multiple problems", "many symptoms",
)


# ---------------------------------------------------------------------------
# Normalization
# ---------------------------------------------------------------------------

# Common abbreviations / shorthand expanded to their canonical phrase so the
# keyword dictionary (which stores the long forms) matches. Order matters only
# in that each is applied independently on word boundaries.
_ABBREVIATIONS: Dict[str, str] = {
    "bp": "blood pressure",
    "sob": "shortness of breath",
    "uti": "urinary tract infection",
    "gerd": "acid reflux",
    "copd": "chronic obstructive pulmonary disease",
    "tb": "tuberculosis",
    "ra": "rheumatoid arthritis",
    "mi": "heart attack",
    "cad": "coronary artery disease",
    "ckd": "chronic kidney disease",
    "ibs": "irritable bowel syndrome",
    "ibd": "inflammatory bowel disease",
    "pcos": "polycystic ovary syndrome",
    "pcod": "polycystic ovary syndrome",
    "ed": "erectile dysfunction",
    "bph": "enlarged prostate",
    "dvt": "deep vein thrombosis",
    "adhd": "attention deficit hyperactivity disorder",
    "ocd": "obsessive compulsive disorder",
    "tmj": "jaw joint pain",
    "rct": "root canal treatment",
    "hb": "hemoglobin",
    "afib": "atrial fibrillation",
}

# Light synonym/spelling normalization applied to the whole string. Maps a
# regex (already lowercased) to a replacement. Keeps the dictionary lean by
# folding frequent variants onto a canonical token.
_SYNONYM_SUBS: Tuple[Tuple[re.Pattern, str], ...] = (
    (re.compile(r"\bstomach ?ache\b"), "stomach ache"),
    (re.compile(r"\btummy\b"), "stomach"),
    (re.compile(r"\bdiarrh?oea\b"), "diarrhea"),
    (re.compile(r"\bdiarhea\b"), "diarrhea"),
    (re.compile(r"\bloose ?motions?\b"), "loose motion"),
    (re.compile(r"\bvomitting\b"), "vomiting"),
    (re.compile(r"\bbreathe?ing\b"), "breathing"),
    (re.compile(r"\bpalpitation\b"), "palpitations"),
    (re.compile(r"\bgiddy\b"), "giddiness"),
    (re.compile(r"\bpain(s)? in (my |the )?"), "pain in "),
    (re.compile(r"\bfeel(ing)? like\b"), "feeling"),
    (re.compile(r"\bcan'?t\b"), "cannot"),
    (re.compile(r"\bwon'?t\b"), "will not"),
    (re.compile(r"\bheart beating (very |really )?(fast|rapidly)\b"), "heart beating fast"),
)


def _strip_accents(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in nfkd if not unicodedata.combining(ch))


def normalize(text: str) -> str:
    """Lowercase, de-accent, expand abbreviations/synonyms, clean punctuation.

    Returns a single-spaced lowercase string padded with leading/trailing
    spaces so whole-word boundary checks are uniform.
    """
    if not text:
        return " "
    t = _strip_accents(str(text)).lower()
    # Replace any non-alphanumeric char with a space (keeps word boundaries).
    t = re.sub(r"[^a-z0-9]+", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    if not t:
        return " "

    # Expand standalone abbreviations (whole-word only).
    tokens = t.split(" ")
    expanded: List[str] = []
    for tok in tokens:
        expanded.append(_ABBREVIATIONS.get(tok, tok))
    t = " ".join(expanded)

    # Apply synonym/spelling folding.
    for pattern, repl in _SYNONYM_SUBS:
        t = pattern.sub(repl, t)
    t = re.sub(r"\s+", " ", t).strip()

    return f" {t} "


# ---------------------------------------------------------------------------
# Scoring weights
# ---------------------------------------------------------------------------

# An exact (whole-phrase) match scores by the number of words in the phrase,
# squared-ish, so specific multi-word phrases dominate generic single words.
def _exact_weight(word_count: int) -> float:
    if word_count <= 1:
        return 1.0
    if word_count == 2:
        return 3.0
    if word_count == 3:
        return 5.0
    return 7.0


# A partial (subset of a multi-word keyword's tokens present, in any order)
# match earns a fraction of the exact weight, scaled by coverage.
_PARTIAL_MAX_WEIGHT = 1.5
_PARTIAL_MIN_COVERAGE = 0.6  # need >=60% of a phrase's significant tokens

# Tokens too generic to carry meaning on their own during partial matching.
_STOPWORDS = frozenset(
    {
        "in", "on", "of", "the", "a", "an", "and", "or", "to", "with", "my",
        "is", "it", "for", "at", "by", "from", "feeling", "feel", "have",
        "having", "pain", "problem", "issue", "after", "while", "very",
        "really", "some", "due", "side", "near", "around", "lot", "bit",
    }
)


@dataclass
class MatchResult:
    """Full diagnostic result of a mapping operation."""

    specialization: str
    confidence: float
    is_fallback: bool
    scores: Dict[str, float] = field(default_factory=dict)
    matched_keywords: Dict[str, List[str]] = field(default_factory=dict)

    def ranked(self, top: int = 5) -> List[Tuple[str, float]]:
        return sorted(self.scores.items(), key=lambda kv: -kv[1])[:top]


# ---------------------------------------------------------------------------
# Core matching
# ---------------------------------------------------------------------------


def _significant_tokens(phrase: str) -> List[str]:
    return [w for w in phrase.split(" ") if w and w not in _STOPWORDS]


def _score_text(norm_text: str) -> Tuple[Dict[str, float], Dict[str, List[str]]]:
    """Compute raw per-specialization scores and the keywords that matched."""
    text_tokens = set(norm_text.strip().split(" "))
    scores: Dict[str, float] = {s: 0.0 for s in SPECIALIZATION_KEYWORDS}
    matched: Dict[str, List[str]] = {s: [] for s in SPECIALIZATION_KEYWORDS}

    for spec, keywords in SPECIALIZATION_KEYWORDS.items():
        for kw in keywords:
            kw_norm = kw.strip().lower()
            word_count = kw_norm.count(" ") + 1

            # 1) Exact whole-phrase match (padded boundaries avoid substrings
            #    like "ear" matching "hearing").
            if f" {kw_norm} " in norm_text:
                scores[spec] += _exact_weight(word_count)
                matched[spec].append(kw_norm)
                continue

            # 2) Partial match for multi-word phrases: require a strong
            #    fraction of the phrase's significant tokens to be present.
            if word_count >= 2:
                sig = _significant_tokens(kw_norm)
                if len(sig) >= 2:
                    present = sum(1 for tok in sig if tok in text_tokens)
                    coverage = present / len(sig)
                    if coverage >= _PARTIAL_MIN_COVERAGE and present >= 2:
                        scores[spec] += _PARTIAL_MAX_WEIGHT * coverage
                        matched[spec].append(f"~{kw_norm}")

    return scores, matched


def _looks_chronic(norm_text: str) -> bool:
    return any(f" {hint} " in norm_text or norm_text.strip().endswith(hint)
               or hint in norm_text for hint in _INTERNAL_MEDICINE_HINTS)


def map_specialization(text: str) -> MatchResult:
    """Map a free-text complaint to the best specialization.

    Always returns a :class:`MatchResult`. When nothing clears the confidence
    threshold the result is the strict generalist fallback (never a surgical
    department).
    """
    norm = normalize(text)
    raw_scores, matched = _score_text(norm)

    # Length-normalize: divide by a gentle function of the keyword-list size so
    # large dictionaries (e.g. Dermatology) are not unfairly favored, while
    # still rewarding multiple distinct hits. We use a gentle exponent to keep
    # it subtle. The adjusted score is used only for RANKING between
    # specializations; the fallback gate below uses the RAW score so a single
    # specific disease keyword ("migraine") is never normalized below the bar.
    adjusted: Dict[str, float] = {}
    for spec, raw in raw_scores.items():
        if raw <= 0:
            adjusted[spec] = 0.0
            continue
        size = len(SPECIALIZATION_KEYWORDS[spec])
        # Normalize lightly against a reference size of 180 keywords.
        adjusted[spec] = raw * (180.0 / size) ** 0.15

    best_spec = max(adjusted, key=lambda s: adjusted[s]) if adjusted else PRIMARY_FALLBACK
    best_score = adjusted.get(best_spec, 0.0)
    best_raw = raw_scores.get(best_spec, 0.0)

    # Strict fallback handling — gated on the RAW score (an actual keyword hit).
    if best_raw < CONFIDENCE_THRESHOLD:
        fallback = SECONDARY_FALLBACK if _looks_chronic(norm) else PRIMARY_FALLBACK
        return MatchResult(
            specialization=fallback,
            confidence=round(best_score, 3),
            is_fallback=True,
            scores=adjusted,
            matched_keywords={s: m for s, m in matched.items() if m},
        )

    # Guard: a surgical department can only win on a genuine (exact) surgical
    # keyword match, never on partial/paraphrase credit alone.
    if best_spec in FALLBACK_FORBIDDEN:
        exact_hits = [m for m in matched[best_spec] if not m.startswith("~")]
        if not exact_hits:
            # Demote to the next best non-forbidden specialization or fallback.
            ranked = sorted(adjusted.items(), key=lambda kv: -kv[1])
            best_spec = PRIMARY_FALLBACK
            best_score = 0.0
            for spec, sc in ranked:
                if spec in FALLBACK_FORBIDDEN:
                    continue
                if raw_scores.get(spec, 0.0) >= CONFIDENCE_THRESHOLD:
                    best_spec, best_score = spec, sc
                break
            if raw_scores.get(best_spec, 0.0) < CONFIDENCE_THRESHOLD:
                fallback = SECONDARY_FALLBACK if _looks_chronic(norm) else PRIMARY_FALLBACK
                return MatchResult(
                    specialization=fallback,
                    confidence=round(best_score, 3),
                    is_fallback=True,
                    scores=adjusted,
                    matched_keywords={s: m for s, m in matched.items() if m},
                )

    return MatchResult(
        specialization=best_spec,
        confidence=round(best_score, 3),
        is_fallback=False,
        scores=adjusted,
        matched_keywords={s: m for s, m in matched.items() if m},
    )


def best_specialization(text: str) -> str:
    """Convenience wrapper returning just the best-matching specialization name."""
    return map_specialization(text).specialization


def rank_specializations(text: str, top: int = 5) -> List[Tuple[str, float]]:
    """Return the top-N specializations with scores (diagnostics/UX use)."""
    return map_specialization(text).ranked(top=top)


__all__ = [
    "PRIMARY_FALLBACK",
    "SECONDARY_FALLBACK",
    "FALLBACK_FORBIDDEN",
    "CONFIDENCE_THRESHOLD",
    "MatchResult",
    "normalize",
    "map_specialization",
    "best_specialization",
    "rank_specializations",
]
