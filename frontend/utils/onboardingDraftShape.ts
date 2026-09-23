// ── Draft parsing and TTL ───────────────────────────────────────
// PURE. Split out from `onboardingDraft.ts` so the shape and expiry rules can
// be checked without a native module. `onboardingDraft.ts` keeps only the
// three AsyncStorage calls.

import { isStepId } from './onboardingFlow';
import type { StepId } from '../constants/onboardingSteps';
import type { MedicalHistory, OnboardingDraft } from './onboardingApi';

// Defined here rather than alongside the types, because `onboardingApi.ts`
// pulls in axios and the react-native Platform module. A pure module must not
// value-import it, or the node check cannot run.
export const EMPTY_MEDICAL: MedicalHistory = {
  conditions: [],
  medications: [],
  allergy_entries: [],
};

export const EMPTY_DRAFT: OnboardingDraft = {
  basic: null,
  lifestyle: null,
  medical: EMPTY_MEDICAL,
  family: [],
  location: null,
  vitals: null,
  mental: null,
  womens_health: null,
  takes_medication: null,
};

/**
 * Bumped from v1 when the draft became step-id based and gained the vitals,
 * mental-health and structured-medical slices.
 *
 * v1 drafts are dropped rather than migrated. The v1 TTL was 30 minutes, so
 * the affected population is whoever was mid-onboarding in the last half
 * hour — effectively nobody, and they lose a handful of taps. A field-by-field
 * migrator for a blob with a 30-minute half-life is pure waste.
 * ponytail: write a migrator only if the TTL ever grows large enough to matter.
 */
export const DRAFT_KEY = 'eunoia.onboarding.draft.v2';
export const LEGACY_DRAFT_KEYS = ['eunoia.onboarding.draft.v1'];

/**
 * Seven days, up from thirty minutes.
 *
 * The flow is now longer and explicitly resumable — people are expected to
 * leave and come back, and progressive profiling assumes it. A 30-minute
 * window would silently destroy real work.
 */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface StoredDraft {
  /** ISO 8601 timestamp of the most recent write. */
  updatedAt: string;
  /** The step the user was on. An id, never an index: indices shift when a
   *  step is inserted, which silently mis-resumes every in-flight draft. */
  currentStepId: StepId;
  data: OnboardingDraft;
}

/** Merge a parsed blob onto the empty draft so a missing slice cannot crash a
 *  screen that assumes its own key exists. */
function normalizeDraft(value: unknown): OnboardingDraft {
  const raw = (value ?? {}) as Partial<OnboardingDraft>;
  return {
    ...EMPTY_DRAFT,
    ...raw,
    medical: {
      conditions: raw.medical?.conditions ?? [],
      medications: raw.medical?.medications ?? [],
      allergy_entries: raw.medical?.allergy_entries ?? [],
    },
    family: Array.isArray(raw.family) ? raw.family : [],
  };
}

/**
 * Parse a stored draft, returning null when it is absent, unparseable or
 * expired. `now` is injected so the TTL is testable without faking clocks.
 */
export function parseStoredDraft(raw: string | null, now: number): StoredDraft | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const candidate = parsed as Partial<StoredDraft>;

  const updatedAtMs = Date.parse(String(candidate.updatedAt ?? ''));
  if (Number.isNaN(updatedAtMs)) return null;
  if (now - updatedAtMs > DRAFT_TTL_MS) return null;

  return {
    updatedAt: String(candidate.updatedAt),
    currentStepId: isStepId(candidate.currentStepId) ? candidate.currentStepId : 'welcome',
    data: normalizeDraft(candidate.data),
  };
}

export function serializeDraft(
  currentStepId: StepId,
  data: OnboardingDraft,
  now: number,
): string {
  const stored: StoredDraft = {
    updatedAt: new Date(now).toISOString(),
    currentStepId,
    data,
  };
  return JSON.stringify(stored);
}
