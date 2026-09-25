import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import axios from 'axios';

import ProgressMessages from '../../components/onboarding/ProgressMessages';
import { Button, Notice } from '../../components/ui';
import { ONBOARDING_COPY } from '../../constants/onboarding';
import { colors, spacing, typography } from '../../constants/theme';
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
/** The sun rising over the horizon on mount. */
const SUN_RISE_MS = 1400;
/** One half of the sun's slow breathing cycle once risen. */
const SUN_BREATH_MS = 2400;

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
 *    are disabled and the pressed button shows its spinner until the
 *    action resolves.
 *  - 8.8: Neutrals plus a single marigold accent: the rising sun,
 *    which holds still when the OS asks for reduced motion.
 *  - 18.1, 18.4: A network error or 500 surfaces the same recoverable
 *    error state.
 *  - 18.2: A 401 from `analyze-risk` redirects to `/auth/login` while
 *    preserving the draft.
 *  - 18.3: A 400 with `loc = ['body', <step_field>, ...]` routes the
 *    user back to the step that owns the field.
 *  - 18.5: The error message uses the shared `Notice` (error tokens);
 *    actions use the shared `Button`. No new colors are introduced.
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

  // ── Render ────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.content}>
        <RisingSun animate={mode === 'loading'} />

        {mode === 'loading' ? (
          <>
            <Text style={styles.headline} accessibilityRole="header">
              {ONBOARDING_COPY.analyzing.headline}
            </Text>
            <Text style={styles.subtitle}>
              This takes a few seconds. Keep the app open while we work.
            </Text>

            <View style={styles.messagesBlock}>
              <ProgressMessages />
            </View>
          </>
        ) : (
          <View style={styles.errorBlock}>
            <Text style={styles.errorHeadline} accessibilityRole="header">
              {ONBOARDING_COPY.analyzing.error.headline}
            </Text>
            <Notice tone="error">{ONBOARDING_COPY.analyzing.error.subtitle}</Notice>

            <View style={styles.errorActions}>
              <Button
                label="Try again"
                onPress={handleRetry}
                loading={pendingAction === 'retrying'}
                disabled={pendingAction === 'cancelling'}
              />
              <Button
                label="Back to your answers"
                variant="secondary"
                onPress={handleCancel}
                loading={pendingAction === 'cancelling'}
                disabled={pendingAction === 'retrying'}
              />
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

// ── Rising sun ────────────────────────────────────────────────────
// The brand mark at hero size: a marigold sun rises over the indigo
// horizon, then breathes slowly while we wait. Proportions follow
// `BrandMark` (sun centre at 21/32, radius 8.5/32, horizon bar 23/32).
// With reduced motion the sun is simply shown risen and still.

const TILE = 168;
const SCALE = TILE / 32;
const HORIZON_Y = 21 * SCALE;
const SUN_D = 17 * SCALE;
const SUN_LEFT = (TILE - SUN_D) / 2;
const SUN_TOP = HORIZON_Y - SUN_D / 2;

function RisingSun({ animate }: { animate: boolean }) {
  // 1 = below the horizon, 0 = risen.
  const rise = useSharedValue(animate ? 1 : 0);
  const breath = useSharedValue(0);

  useEffect(() => {
    if (!animate) {
      rise.value = 0;
      breath.value = 0;
      return;
    }
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (!alive) return;
        if (reduce) {
          rise.value = 0;
          return;
        }
        rise.value = withTiming(0, { duration: SUN_RISE_MS, easing: Easing.out(Easing.cubic) });
        breath.value = withDelay(
          SUN_RISE_MS,
          withRepeat(
            withTiming(1, { duration: SUN_BREATH_MS, easing: Easing.inOut(Easing.sin) }),
            -1,
            true,
          ),
        );
      });
    return () => {
      alive = false;
      cancelAnimation(rise);
      cancelAnimation(breath);
    };
  }, [animate, rise, breath]);

  const sunStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: rise.value * SUN_D }, { scale: 1 + breath.value * 0.04 }],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: breath.value * 0.5,
    transform: [{ translateY: rise.value * SUN_D }, { scale: 1 + breath.value * 0.4 }],
  }));

  return (
    <View
      style={styles.tile}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.sky}>
        <Animated.View style={[styles.sun, styles.halo, haloStyle]} />
        <Animated.View style={[styles.sun, sunStyle]} />
      </View>
      <View style={styles.horizon} />
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────
// Styles — tokens from `frontend/constants/theme.ts` only. Marigold
// appears only as the sun's fill.
// ──────────────────────────────────────────────────────────────────

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

  tile: {
    width: TILE,
    height: TILE,
    borderRadius: 52,
    backgroundColor: colors.inkSurface,
    overflow: 'hidden',
    marginBottom: spacing.xxxl,
  },
  sky: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: HORIZON_Y,
    overflow: 'hidden',
  },
  sun: {
    position: 'absolute',
    left: SUN_LEFT,
    top: SUN_TOP,
    width: SUN_D,
    height: SUN_D,
    borderRadius: SUN_D / 2,
    backgroundColor: colors.accent,
  },
  halo: {
    backgroundColor: colors.accentGlow,
  },
  horizon: {
    position: 'absolute',
    left: 6 * SCALE,
    top: 23 * SCALE,
    width: 20 * SCALE,
    height: 2 * SCALE,
    borderRadius: SCALE,
    backgroundColor: colors.surface,
    opacity: 0.9,
  },

  headline: {
    ...typography.largeTitle,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xxl,
    maxWidth: 320,
  },
  messagesBlock: {
    minHeight: 44,
    justifyContent: 'center',
  },

  // ── Error state ───────────────────────────────────────────────
  errorBlock: {
    width: '100%',
    maxWidth: 420,
    gap: spacing.lg,
  },
  errorHeadline: {
    ...typography.title,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  errorActions: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
});
