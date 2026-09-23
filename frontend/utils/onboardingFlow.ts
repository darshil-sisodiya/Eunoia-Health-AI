// ── Onboarding flow logic ───────────────────────────────────────
// PURE. Imports types and step data only — no react-native, no AsyncStorage,
// no JSX. That constraint is enforced by `utils/__checks__/flow.check.ts`,
// which runs this file directly under node. If something here ever reaches
// for `Platform`, the check fails immediately.

import { FIRST_STEP, NON_INPUT_STEPS, STEP_NODES } from '../constants/onboardingSteps';
import type { StepId, StepNode } from '../constants/onboardingSteps';
import type { OnboardingDraft } from './onboardingApi';

/** Steps that apply to this draft, in flow order. */
export function visibleSteps(draft: OnboardingDraft): StepNode[] {
  return STEP_NODES.filter((node) => !node.when || node.when(draft));
}

/** 1-based position of a step, or 0 when it does not apply to this draft. */
export function stepIndex(draft: OnboardingDraft, id: StepId): number {
  return visibleSteps(draft).findIndex((node) => node.id === id) + 1;
}

/** How many steps this particular user will see. */
export function totalSteps(draft: OnboardingDraft): number {
  return visibleSteps(draft).length;
}

/**
 * Progress position counting only steps that ask something, so the bar does
 * not jump on `welcome` and `analyzing`.
 */
export function inputStepPosition(
  draft: OnboardingDraft,
  id: StepId,
): { index: number; total: number } {
  const steps = visibleSteps(draft).filter((n) => !NON_INPUT_STEPS.includes(n.id));
  const index = steps.findIndex((n) => n.id === id) + 1;
  return { index: index || 1, total: steps.length || 1 };
}

export function nextStep(draft: OnboardingDraft, id: StepId): StepNode | null {
  const steps = visibleSteps(draft);
  const at = steps.findIndex((node) => node.id === id);
  if (at < 0) return null;
  return steps[at + 1] ?? null;
}

export function prevStep(draft: OnboardingDraft, id: StepId): StepNode | null {
  const steps = visibleSteps(draft);
  const at = steps.findIndex((node) => node.id === id);
  if (at <= 0) return null;
  return steps[at - 1] ?? null;
}

export function routeForStepId(id: StepId): string {
  return STEP_NODES.find((node) => node.id === id)?.route ?? '/onboarding/welcome';
}

export function isStepId(value: unknown): value is StepId {
  return typeof value === 'string' && STEP_NODES.some((node) => node.id === value);
}

/**
 * Where to resume a draft.
 *
 * The case the old index-based map could not handle: the stored step may no
 * longer apply. Change gender from female to male and `womens` disappears;
 * remove your last condition and `medications` disappears. Routing to a step
 * that is no longer in the flow strands the user on a page with no way
 * forward, so snap to the next step that does apply.
 */
export function resumeTarget(draft: OnboardingDraft, storedId: unknown): StepId {
  if (!isStepId(storedId)) return FIRST_STEP;

  const steps = visibleSteps(draft);
  if (steps.some((node) => node.id === storedId)) return storedId;

  // Not visible any more: take the first still-visible step that comes after
  // it in the canonical order.
  const canonicalAt = STEP_NODES.findIndex((node) => node.id === storedId);
  const forward = STEP_NODES.slice(canonicalAt + 1).find((node) =>
    steps.some((visible) => visible.id === node.id),
  );
  return forward?.id ?? FIRST_STEP;
}
