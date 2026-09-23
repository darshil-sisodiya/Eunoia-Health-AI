// ── Step navigation hook ────────────────────────────────────────
// NOT pure (it touches the router and the context) — the pure step logic
// lives in `onboardingFlow.ts`.
//
// Screens declare which step they ARE and then call `goNext()` / `goBack()`.
// They never name their successor. That is what previously made the flow
// brittle: `markStep(3)` in basic.tsx, `markStep(4)` in lifestyle.tsx, a
// hardcoded `router.push` beside each one, and a separate number->route table
// in the layout. Inserting a step meant editing all of them, and missing one
// silently sent the user to the wrong place.

import { router } from 'expo-router';

import { useOnboarding } from '../contexts/OnboardingContext';
import { inputStepPosition, routeForStepId } from './onboardingFlow';
import type { StepId } from '../constants/onboardingSteps';

export function useOnboardingStep(id: StepId) {
  const ctx = useOnboarding();
  const { index, total } = inputStepPosition(ctx.draft, id);

  const goNext = () => {
    const target = ctx.advance(id);
    if (target) router.push(routeForStepId(target) as never);
  };

  const goBack = () => {
    const target = ctx.retreat(id);
    if (!target) return;
    ctx.goTo(target);
    // Prefer the real stack so the transition animates backwards; fall back to
    // a replace on a cold start where there is no history to pop.
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(routeForStepId(target) as never);
    }
  };

  return { ...ctx, step: index, totalSteps: total, goNext, goBack };
}
