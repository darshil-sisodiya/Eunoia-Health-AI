import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import axios from 'axios';

import ProgressMessages from '../../components/onboarding/ProgressMessages';
import { ONBOARDING_COPY } from '../../constants/onboarding';
import { colors, shadows, spacing, typography } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { routeForStepId } from '../../utils/onboardingFlow';
import { buildAnalyzePayload, isSubmittable } from '../../utils/onboardingPayload';
import type { StepId } from '../../constants/onboardingSteps';
import { useOnboarding } from '../../contexts/OnboardingContext';
import {
  analyzeRisk,
  type AnalyzeRiskRequest,
  type AnalyzeRiskResponse,
} from '../../utils/onboardingApi';

// ── Timing constants (Requirements 8.4, 8.5) ──────────────────────
/** Minimum on-screen time before navigating to the Result Screen. */
const MIN_VISIBLE_MS = 2000;
/** When the request has not resolved within this window, swap to the
 *  recoverable error state (Requirement 8.5). */
const ERROR_TIMEOUT_MS = 30000;
/** One full revolution of the soft accent dot. */
const DOT_ROTATION_DURATION_MS = 1500;

/**
 * Maps a 400's `loc[1]` payload field to the step that owns it.
 *
 * Step ids, not indices: the route for a step comes from the step graph, so
 * inserting a step cannot silently send someone to the wrong screen.
 */
const STEP_ID_BY_FIELD: Record<string, StepId> = {
  basic: 'basic',
  lifestyle: 'lifestyle',
  medical: 'conditions',
  family_history: 'family',
  vitals: 'vitals',
  mental: 'mental',
  womens_health: 'womens',
  location: 'location',
};

type Mode = 'loading' | 'error';
type PendingAction = 'idle' | 'retrying' | 'cancelling';

/**
 * Step 7 of the Eunoia onboarding flow — the AI Analysis Transition.
 *
 * Behavioural contract (Requirements 8.1–8.8, 18.1–18.5):
 *  - 8.1: Mounted directly after step 6 submits.
 *  - 8.2, 8.3: Renders `ProgressMessages` for the four-message sequence
 *    with cross-fade animation; only one message is visible at a time.
 *  - 8.4, 8.7: Records `mountedAt = Date.now()` on mount and only
 *    navigates to `/onboarding/result` when the response has resolved
 *    AND `Date.now() - mountedAt >= 2000`.
 *  - 8.5: After 30 s with no response, swaps the message stack for a
 *    recoverable error state with Retry and Cancel buttons.
 *  - 8.6: While either Retry or Cancel is processing, both buttons
 *    are disabled and an `ActivityIndicator` replaces the pressed
 *    button's label until the action resolves.
 *  - 8.8: Monochrome neutrals plus the single accent dot only.
 *  - 18.1, 18.4: A network error or 500 surfaces the same recoverable
 *    error state.
 *  - 18.2: A 401 from `analyze-risk` redirects to `/auth/login` while
 *    preserving the draft.
 *  - 18.3: A 400 with `loc = ['body', <step_field>, ...]` routes the
 *    user back to the step that owns the field.
 *  - 18.5: Buttons render with `error`/`errorSoft` tokens only — no
 *    new colors are introduced.
 */
export default function Analyzing() {
  const { token } = useAuth();
  const { draft, goTo } = useOnboarding();

  const [mode, setMode] = useState<Mode>('loading');
  const [pendingAction, setPendingAction] = useState<PendingAction>('idle');

  // Mutable refs for timers & response so async work does not race
  // with React re-renders.
  const mountedAtRef = useRef<number>(Date.now());
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const minVisibleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const responseRef = useRef<AnalyzeRiskResponse | null>(null);
  // Generation counter so an in-flight request from a previous attempt
  // (before Retry was tapped) cannot resolve and navigate after the
  // user has restarted.
  const generationRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const hasNavigatedRef = useRef<boolean>(false);

  // ── Rotating accent dot (Requirement 8.8) ─────────────────────
  // A single soft accent dot rotates continuously via reanimated's
  // `withRepeat`. The dot is the only element in the entire screen
  // that uses `colors.accent`; everything else is monochrome neutrals.
  const rotation = useSharedValue(0);
  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, {
        duration: DOT_ROTATION_DURATION_MS,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(rotation);
    };
  }, [rotation]);
  const dotAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  // ── Timer helpers ─────────────────────────────────────────────
  const clearErrorTimer = useCallback(() => {
    if (errorTimerRef.current !== null) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
  }, []);
  const clearMinVisibleTimer = useCallback(() => {
    if (minVisibleTimerRef.current !== null) {
      clearTimeout(minVisibleTimerRef.current);
      minVisibleTimerRef.current = null;
    }
  }, []);

  const navigateToResult = useCallback((res: AnalyzeRiskResponse) => {
    if (hasNavigatedRef.current) return;
    hasNavigatedRef.current = true;
    router.replace({
      pathname: '/onboarding/result' as any,
      params: { response: JSON.stringify(res) },
    });
  }, []);

  /** Routes the user back to the step that owns `field`. */
  const routeBackToStep = useCallback(
    (field: string) => {
      const stepId = STEP_ID_BY_FIELD[field];
      if (!stepId) return;
      goTo(stepId);
      router.replace(routeForStepId(stepId) as never);
    },
    [goTo],
  );

  // ── Build the AnalyzeRiskRequest payload from the draft ───────
  // If any required slice is missing we never start a request; we
  // route back to the step that owns the slice instead.
  // One shared builder, also used by the result screen's save path. Two
  // copies of a request body is how the two ends drift apart.
  const buildPayload = useCallback((): AnalyzeRiskRequest | null => {
    if (!isSubmittable(draft)) return null;
    return buildAnalyzePayload(draft);
  }, [draft]);

  // ── Run a single request attempt ──────────────────────────────
  const runRequest = useCallback(async () => {
    // If a required slice is missing, redirect to that step instead
    // of attempting a guaranteed-400 submission.
    if (!draft.basic) {
      routeBackToStep('basic');
      return;
    }
    if (!draft.lifestyle) {
      routeBackToStep('lifestyle');
      return;
    }
    if (!draft.location) {
      routeBackToStep('location');
      return;
    }

    const payload = buildPayload();
    if (!payload) {
      // Should be unreachable thanks to the slice checks above, but
      // keeps the type narrowing honest.
      routeBackToStep('basic');
      return;
    }

    // Bump the generation counter so any earlier in-flight request
    // becomes a no-op when it resolves.
    const generation = ++generationRef.current;
    mountedAtRef.current = Date.now();
    responseRef.current = null;
    hasNavigatedRef.current = false;

    setMode('loading');

    // (Re)arm the 30 s error timer.
    clearErrorTimer();
    errorTimerRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      if (generation !== generationRef.current) return;
      // Only flip to error if no response has arrived.
      if (responseRef.current !== null) return;
      setMode('error');
    }, ERROR_TIMEOUT_MS);

    try {
      const res = await analyzeRisk(payload, token ?? '');
      if (!isMountedRef.current) return;
      if (generation !== generationRef.current) return;

      responseRef.current = res;
      clearErrorTimer();

      const elapsed = Date.now() - mountedAtRef.current;
      const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
      if (remaining === 0) {
        navigateToResult(res);
      } else {
        clearMinVisibleTimer();
        minVisibleTimerRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          if (generation !== generationRef.current) return;
          if (responseRef.current === null) return;
          navigateToResult(responseRef.current);
        }, remaining);
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      if (generation !== generationRef.current) return;

      clearErrorTimer();

      const status = axios.isAxiosError(err) ? err.response?.status : undefined;

      if (status === 401) {
        // Preserve draft (do NOT call reset). Send the user to login.
        router.replace('/auth/login');
        return;
      }

      if (status === 400 && axios.isAxiosError(err)) {
        // FastAPI 400 body shape: { detail: [{ loc: ['body', <slice>, ...], msg, type }] }
        const detail = (err.response?.data as any)?.detail;
        if (Array.isArray(detail)) {
          for (const entry of detail) {
            const loc = entry?.loc;
            if (
              Array.isArray(loc) &&
              loc.length >= 2 &&
              loc[0] === 'body' &&
              typeof loc[1] === 'string' &&
              STEP_ID_BY_FIELD[loc[1]]
            ) {
              routeBackToStep(loc[1]);
              return;
            }
          }
        }
        // 400 we cannot map → fall through to the recoverable error UI.
        setMode('error');
        return;
      }

      // Network error, 500, or any other failure (Requirements 18.1, 18.4).
      setMode('error');
    }
  }, [
    buildPayload,
    clearErrorTimer,
    clearMinVisibleTimer,
    draft.basic,
    draft.lifestyle,
    draft.location,
    navigateToResult,
    routeBackToStep,
    token,
  ]);

  // Kick off the first attempt on mount.
  useEffect(() => {
    isMountedRef.current = true;
    void runRequest();
    return () => {
      isMountedRef.current = false;
      // Invalidate any in-flight request and clear timers.
      generationRef.current += 1;
      clearErrorTimer();
      clearMinVisibleTimer();
    };
    // `runRequest` is stable for our purposes (its dependencies — the
    // draft slices and `token` — do not change between mount and the
    // first response). We intentionally only run it once on mount;
    // Retry calls it directly via `handleRetry`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Retry / Cancel handlers (Requirements 8.5, 8.6) ───────────
  const handleRetry = useCallback(async () => {
    if (pendingAction !== 'idle') return;
    setPendingAction('retrying');
    try {
      await runRequest();
    } finally {
      if (isMountedRef.current) {
        setPendingAction('idle');
      }
    }
  }, [pendingAction, runRequest]);

  const handleCancel = useCallback(() => {
    if (pendingAction !== 'idle') return;
    setPendingAction('cancelling');
    // Invalidate any in-flight request so a late response cannot
    // navigate us forward to the Result Screen.
    generationRef.current += 1;
    clearErrorTimer();
    clearMinVisibleTimer();
    goTo('location');
    router.replace(routeForStepId('location') as never);
  }, [clearErrorTimer, clearMinVisibleTimer, goTo, pendingAction]);

  const buttonsDisabled = pendingAction !== 'idle';

  // ── Render ────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.brand} accessibilityRole="text">
          {ONBOARDING_COPY.analyzing.eyebrow}
        </Text>

        {mode === 'loading' ? (
          <>
            <Text style={styles.headline} accessibilityRole="header">
              {ONBOARDING_COPY.analyzing.headline}
            </Text>
            <Text style={styles.subtitle}>
              {ONBOARDING_COPY.analyzing.subtitle}
            </Text>

            <View style={styles.messagesBlock}>
              <ProgressMessages />
            </View>

            <View style={styles.dotWrapper} accessibilityElementsHidden>
              <Animated.View style={[styles.dotRotor, dotAnimatedStyle]}>
                <View style={styles.dot} />
              </Animated.View>
            </View>
          </>
        ) : (
          <View style={styles.errorBlock}>
            <Text style={styles.errorHeadline} accessibilityRole="header">
              {ONBOARDING_COPY.analyzing.error.headline}
            </Text>
            <Text style={styles.errorSubtitle}>
              {ONBOARDING_COPY.analyzing.error.subtitle}
            </Text>

            <View style={styles.errorActions}>
              <TouchableOpacity
                style={[
                  styles.errorButton,
                  styles.errorButtonPrimary,
                  buttonsDisabled && styles.buttonDisabled,
                ]}
                onPress={handleRetry}
                disabled={buttonsDisabled}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={ONBOARDING_COPY.analyzing.error.retryLabel}
                accessibilityState={{ disabled: buttonsDisabled }}
              >
                {pendingAction === 'retrying' ? (
                  <ActivityIndicator size="small" color={colors.error} />
                ) : (
                  <Text style={styles.errorButtonPrimaryText}>
                    {ONBOARDING_COPY.analyzing.error.retryLabel}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.errorButton,
                  styles.errorButtonSecondary,
                  buttonsDisabled && styles.buttonDisabled,
                ]}
                onPress={handleCancel}
                disabled={buttonsDisabled}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={ONBOARDING_COPY.analyzing.error.cancelLabel}
                accessibilityState={{ disabled: buttonsDisabled }}
              >
                {pendingAction === 'cancelling' ? (
                  <ActivityIndicator size="small" color={colors.error} />
                ) : (
                  <Text style={styles.errorButtonSecondaryText}>
                    {ONBOARDING_COPY.analyzing.error.cancelLabel}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

// ──────────────────────────────────────────────────────────────────
// Styles — only tokens from `frontend/constants/theme.ts`. The
// rotating dot uses `colors.accent` (single accent allowed by
// Requirement 8.8); error buttons stay within the existing `error`
// and `errorSoft` tokens (Requirement 18.5).
// ──────────────────────────────────────────────────────────────────

const DOT_DIAMETER = 12;
const DOT_ROTOR_DIAMETER = 56;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.screenPadding,
  },
  brand: {
    ...typography.overline,
    color: colors.textPrimary,
    marginBottom: spacing.xxxl,
  },
  headline: {
    ...typography.largeTitle,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  subtitle: {
    ...typography.callout,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xxxl,
    maxWidth: 320,
  },
  messagesBlock: {
    minHeight: 32,
    marginBottom: spacing.xxxl,
  },
  dotWrapper: {
    height: DOT_ROTOR_DIAMETER,
    width: DOT_ROTOR_DIAMETER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotRotor: {
    height: DOT_ROTOR_DIAMETER,
    width: DOT_ROTOR_DIAMETER,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  dot: {
    width: DOT_DIAMETER,
    height: DOT_DIAMETER,
    borderRadius: DOT_DIAMETER / 2,
    backgroundColor: colors.accent,
  },

  // ── Error state ───────────────────────────────────────────────
  errorBlock: {
    width: '100%',
    alignItems: 'center',
  },
  errorHeadline: {
    ...typography.title,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  errorSubtitle: {
    ...typography.callout,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xxxl,
    maxWidth: 320,
  },
  errorActions: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
    justifyContent: 'center',
  },
  errorButton: {
    flex: 1,
    minHeight: 52,
    maxWidth: 200,
    borderRadius: spacing.buttonRadius,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  errorButtonPrimary: {
    backgroundColor: colors.errorSoft,
    borderWidth: 1,
    borderColor: colors.error,
    ...shadows.sm,
  },
  errorButtonSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.error,
  },
  errorButtonPrimaryText: {
    ...typography.headline,
    color: colors.error,
  },
  errorButtonSecondaryText: {
    ...typography.headline,
    color: colors.error,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
