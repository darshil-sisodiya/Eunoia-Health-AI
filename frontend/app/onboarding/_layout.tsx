import React, { useEffect, useRef } from 'react';
import { Stack, router } from 'expo-router';

import { colors } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import {
  OnboardingProvider,
  useOnboarding,
} from '../../contexts/OnboardingContext';

/**
 * Route layout for the seven-step Eunoia onboarding flow.
 *
 * Responsibilities (Requirements 17.3, 17.4, 17.5, 18.2):
 *   - Wrap every screen under `app/onboarding/` in a single
 *     `OnboardingProvider` so the in-flight draft persists across
 *     forward and backward navigation between sibling routes
 *     (Requirement 17.3, 17.4).
 *   - On first mount of the provider, after hydration completes,
 *     auto-resume to the route matching the restored
 *     `currentStep`. The provider's hydration step already enforces
 *     the 30-minute TTL on the persisted draft (Requirement 17.5),
 *     so when the saved value is older than 30 minutes the draft is
 *     cleared and `currentStep` falls back to 1 (welcome).
 *   - Route guard (Requirement 18.2): if the user reaches any
 *     onboarding screen without a valid `Auth_Token`, replace into
 *     `/auth/login` and preserve the in-memory draft and the
 *     AsyncStorage entry — `clearDraft()` is intentionally NOT
 *     called on this path so the user can resume after logging in.
 *
 * Visual contract: `headerShown: false` and a `contentStyle` keyed
 * to `colors.background` to match the monochrome shell used by the
 * step screens themselves. Gesture-back is disabled on iOS so a
 * stray swipe cannot interrupt the guided flow; explicit "Back"
 * buttons inside `OnboardingShell` remain the supported way to step
 * backward.
 */

// Map the OnboardingContext `currentStep` (1..7) onto the matching
// expo-router path. Step 1 routes to welcome, which is the canonical
// "fresh draft" landing page, so any unexpected `currentStep` value
// resolves to welcome via the `??` fallback below.
const STEP_TO_ROUTE: Record<number, string> = {
  1: '/onboarding/welcome',
  2: '/onboarding/basic',
  3: '/onboarding/lifestyle',
  4: '/onboarding/medical',
  5: '/onboarding/family',
  6: '/onboarding/location',
  7: '/onboarding/analyzing',
};

function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { token, isLoading: authLoading } = useAuth();
  const { hydrated, currentStep } = useOnboarding();
  // Ensures the auto-resume effect replaces into the restored step
  // exactly once per provider mount. Without this, every dependency
  // change in the effect would re-replace and fight any subsequent
  // `router.push` from a step screen advancing the user forward.
  const hasRoutedRef = useRef(false);

  useEffect(() => {
    // Wait for AuthContext to finish reading the token from
    // AsyncStorage; otherwise a fresh app launch into onboarding
    // would briefly observe `token === null` and bounce the user
    // to /auth/login before the stored token is available.
    if (authLoading) return;

    // Route guard (Requirement 18.2). Any onboarding screen that
    // mounts without an Auth_Token is replaced into the login
    // screen. The draft survives in memory (the OnboardingProvider
    // is unmounted only when the user leaves the /onboarding/*
    // tree, which expo-router does not do on `router.replace`
    // within the same root stack — but even so, the AsyncStorage
    // entry written by `saveDraft` covers the cold-start case).
    if (!token) {
      router.replace('/auth/login');
      return;
    }

    // Auto-resume (Requirement 17.5). Only fire after hydration so
    // we replace into the persisted step, not the empty initial
    // state. Skip subsequent invocations so this layout does not
    // override forward/backward navigation by the step screens.
    if (!hydrated) return;
    if (hasRoutedRef.current) return;
    hasRoutedRef.current = true;

    const target = STEP_TO_ROUTE[currentStep] ?? '/onboarding/welcome';
    // `router.replace` is a no-op when the active route already
    // matches the target, so re-entering /onboarding/welcome on a
    // fresh draft does not produce a visible navigation glitch.
    router.replace(target as never);
  }, [authLoading, token, hydrated, currentStep]);

  return <>{children}</>;
}

export default function OnboardingLayout() {
  return (
    <OnboardingProvider>
      <OnboardingGuard>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            // Disable swipe-back on iOS so a stray gesture cannot
            // interrupt the guided flow. The shell's explicit "Back"
            // button remains the supported way to step backward.
            gestureEnabled: false,
          }}
        />
      </OnboardingGuard>
    </OnboardingProvider>
  );
}
