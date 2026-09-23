// ── Onboarding draft persistence ────────────────────────────────
// Storage only. Every decision about shape, versioning and expiry lives in
// `onboardingDraftShape.ts`, which is pure and therefore checkable by
// `npm run check` without a native module.

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DRAFT_KEY,
  LEGACY_DRAFT_KEYS,
  parseStoredDraft,
  serializeDraft,
} from './onboardingDraftShape';
import type { StoredDraft } from './onboardingDraftShape';
import type { OnboardingDraft } from './onboardingApi';
import type { StepId } from '../constants/onboardingSteps';

export { DRAFT_KEY, DRAFT_TTL_MS, EMPTY_DRAFT } from './onboardingDraftShape';
export type { StoredDraft } from './onboardingDraftShape';
export type { OnboardingDraft } from './onboardingApi';

export async function saveDraft(state: {
  currentStepId: StepId;
  data: OnboardingDraft;
}): Promise<void> {
  await AsyncStorage.setItem(
    DRAFT_KEY,
    serializeDraft(state.currentStepId, state.data, Date.now()),
  );
}

/** Safe to call when nothing is stored; `removeItem` is a no-op for a missing key. */
export async function clearDraft(): Promise<void> {
  await AsyncStorage.removeItem(DRAFT_KEY);
}

/**
 * Read the persisted draft, or null when absent, unparseable or expired.
 *
 * Also removes any v1 entry. v1 drafts are not migrated: that format had a
 * 30-minute TTL, so anything still holding one was abandoned within the last
 * half hour. Cleaning the key up stops it lingering in storage forever.
 */
export async function loadDraft(): Promise<StoredDraft | null> {
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(DRAFT_KEY);
    await Promise.all(
      LEGACY_DRAFT_KEYS.map((key) => AsyncStorage.removeItem(key).catch(() => undefined)),
    );
  } catch {
    await clearDraft().catch(() => undefined);
    return null;
  }

  const parsed = parseStoredDraft(raw, Date.now());
  if (!parsed) {
    await clearDraft().catch(() => undefined);
    return null;
  }
  return parsed;
}
