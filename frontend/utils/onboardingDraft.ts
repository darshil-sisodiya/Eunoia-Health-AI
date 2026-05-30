import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  BasicProfile,
  HereditaryCondition,
  Lifestyle,
  Location,
  MedicalHistory,
} from './onboardingApi';

// ==================== Constants ====================

/** AsyncStorage key for the in-flight onboarding draft. */
export const DRAFT_KEY = 'eunoia.onboarding.draft.v1';

/** Time-to-live for a stored draft (30 minutes), in milliseconds. */
export const DRAFT_TTL_MS = 30 * 60 * 1000;

// ==================== Types ====================

/**
 * The in-flight onboarding submission as it is being assembled across steps.
 * Mirrors design § "TypeScript draft model".
 *
 * Fields are nullable until their owning step has been completed; `medical`
 * and `family_history` start with empty collections so per-item toggles are
 * always safe.
 */
export interface OnboardingDraft {
  basic: BasicProfile | null;
  lifestyle: Lifestyle | null;
  medical: MedicalHistory;
  family_history: HereditaryCondition[];
  location: Location | null;
}

/** The shape stored in AsyncStorage under {@link DRAFT_KEY}. */
export interface StoredDraft {
  /** ISO 8601 timestamp of the most recent write. */
  updatedAt: string;
  /** The step the user was on at the time of the last write. */
  currentStep: number;
  /** The current draft submission. */
  data: OnboardingDraft;
}

// ==================== Helpers ====================

/**
 * Persists the current onboarding state under {@link DRAFT_KEY}.
 *
 * The stored payload always carries a fresh `updatedAt` so {@link loadDraft}
 * can apply the 30-minute TTL deterministically.
 */
export async function saveDraft(state: {
  currentStep: number;
  data: OnboardingDraft;
}): Promise<void> {
  const stored: StoredDraft = {
    updatedAt: new Date().toISOString(),
    currentStep: state.currentStep,
    data: state.data,
  };
  await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(stored));
}

/**
 * Removes any persisted onboarding draft.
 *
 * Safe to call when no draft is present; AsyncStorage's `removeItem` is a no-op
 * for missing keys.
 */
export async function clearDraft(): Promise<void> {
  await AsyncStorage.removeItem(DRAFT_KEY);
}

/**
 * Reads the persisted onboarding draft, returning it only when it is still
 * within the {@link DRAFT_TTL_MS} window.
 *
 * Returns `null` and clears the entry when:
 * - no draft is stored,
 * - the stored value cannot be parsed,
 * - the stored `updatedAt` is invalid, or
 * - the draft is older than 30 minutes.
 */
export async function loadDraft(): Promise<StoredDraft | null> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(DRAFT_KEY);
  } catch {
    await clearDraft();
    return null;
  }

  if (raw == null) {
    return null;
  }

  let parsed: StoredDraft;
  try {
    parsed = JSON.parse(raw) as StoredDraft;
  } catch {
    await clearDraft();
    return null;
  }

  const updatedAtMs = new Date(parsed?.updatedAt ?? '').getTime();
  if (Number.isNaN(updatedAtMs)) {
    await clearDraft();
    return null;
  }

  if (Date.now() - updatedAtMs <= DRAFT_TTL_MS) {
    return parsed;
  }

  await clearDraft();
  return null;
}
