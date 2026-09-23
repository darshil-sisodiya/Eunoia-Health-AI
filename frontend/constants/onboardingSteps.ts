// ── Onboarding step graph ───────────────────────────────────────
// The flow is data, not control flow spread across screens.
//
// Previously each screen hardcoded its successor's index — `markStep(3)` in
// basic.tsx, `markStep(4)` in lifestyle.tsx and so on — and `_layout.tsx` held
// a fixed number→route map. Inserting a step meant renumbering every screen,
// and any miss silently mis-routed the flow or resumed a draft onto the wrong
// page.
//
// Here a step declares itself and, optionally, when it applies. Nothing
// downstream knows a step number.

import type { OnboardingDraft } from '../utils/onboardingApi';

export type StepId =
  | 'welcome'
  | 'basic'
  | 'vitals'
  | 'lifestyle'
  | 'conditions'
  | 'medications'
  | 'family'
  | 'mental'
  | 'womens'
  | 'location'
  | 'analyzing';

export interface StepNode {
  id: StepId;
  route: string;
  /**
   * Pure predicate over the draft. Absent means the step always applies.
   * Keep these total — they run against partially-filled drafts during
   * resume, so every one must tolerate missing slices.
   */
  when?: (draft: OnboardingDraft) => boolean;
}

/**
 * Order is the flow order. `welcome` and `analyzing` are part of the list so
 * resume and routing have a single source of truth, even though neither
 * collects an answer.
 */
export const STEP_NODES: readonly StepNode[] = [
  { id: 'welcome', route: '/onboarding/welcome' },
  { id: 'basic', route: '/onboarding/basic' },
  { id: 'vitals', route: '/onboarding/vitals' },
  { id: 'lifestyle', route: '/onboarding/lifestyle' },
  { id: 'conditions', route: '/onboarding/conditions' },
  {
    id: 'medications',
    route: '/onboarding/medications',
    // Only worth asking once we know there is something to treat. Someone
    // with no conditions who takes nothing should not sit through this.
    when: (d) => (d.medical?.conditions?.length ?? 0) > 0 || d.takes_medication === true,
  },
  { id: 'family', route: '/onboarding/family' },
  { id: 'mental', route: '/onboarding/mental' },
  {
    id: 'womens',
    route: '/onboarding/womens',
    when: (d) => d.basic?.gender === 'female',
  },
  { id: 'location', route: '/onboarding/location' },
  { id: 'analyzing', route: '/onboarding/analyzing' },
];

/** The step a fresh draft starts on. */
export const FIRST_STEP: StepId = 'welcome';

/** Steps that collect nothing, so progress chrome can skip counting them. */
export const NON_INPUT_STEPS: readonly StepId[] = ['welcome', 'analyzing'];
