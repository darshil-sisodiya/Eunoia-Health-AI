// ── Analyze-risk payload assembly ───────────────────────────────
// PURE. One place that turns a draft into a request body.
//
// This used to be duplicated: analyzing.tsx and result.tsx each wrapped the
// bare family array into `{ conditions: [...] }` themselves. Two copies of a
// request builder is a bug waiting to happen — the moment one gains a field
// the other silently sends a different shape.

import type {
  AnalyzeRiskRequest,
  BasicProfile,
  FamilyEntry,
  Lifestyle,
  Location,
  MedicalHistory,
  MentalHealth,
  OnboardingDraft,
  Vitals,
} from './onboardingApi';

/** True when the draft has enough to submit. */
export function isSubmittable(draft: OnboardingDraft): boolean {
  return Boolean(draft.basic && draft.location?.city && hasAllLifestyleAnswers(draft));
}

const REQUIRED_LIFESTYLE_KEYS = [
  'smoking',
  'alcohol',
  'exercise_frequency',
  'water_intake',
  'sleep_quality',
  'stress_level',
] as const;

export function hasAllLifestyleAnswers(draft: OnboardingDraft): boolean {
  const lifestyle = draft.lifestyle;
  if (!lifestyle) return false;
  return REQUIRED_LIFESTYLE_KEYS.every((key) => Boolean(lifestyle[key]));
}

/**
 * Build the request body.
 *
 * Optional slices are sent as `null` rather than omitted-or-empty, so the
 * backend can tell "the user skipped this" apart from "this build does not
 * collect it yet".
 */
export function buildAnalyzePayload(draft: OnboardingDraft): AnalyzeRiskRequest {
  if (!draft.basic || !draft.location) {
    throw new Error('buildAnalyzePayload: draft is missing basic profile or location');
  }

  const medical: MedicalHistory = {
    conditions: draft.medical?.conditions ?? [],
    medications: draft.medical?.medications ?? [],
    allergy_entries: draft.medical?.allergy_entries ?? [],
  };

  return {
    basic: draft.basic as BasicProfile,
    lifestyle: draft.lifestyle as Lifestyle,
    medical,
    family_history: { entries: (draft.family ?? []) as FamilyEntry[] },
    location: draft.location as Location,
    vitals: (draft.vitals ?? null) as Vitals | null,
    mental: (draft.mental ?? null) as MentalHealth | null,
    womens_health: draft.womens_health ?? null,
  };
}
