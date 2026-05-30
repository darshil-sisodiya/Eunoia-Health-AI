import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';

import OnboardingShell from '../../components/onboarding/OnboardingShell';
import ChoiceCard from '../../components/onboarding/ChoiceCard';
import {
  LIFESTYLE_QUESTIONS,
  ONBOARDING_COPY,
  type LifestyleQuestionId,
} from '../../constants/onboarding';
import { useOnboarding } from '../../contexts/OnboardingContext';
import type { Lifestyle } from '../../utils/onboardingApi';
import { colors, spacing, typography } from '../../constants/theme';

/**
 * Step 3 of the Eunoia onboarding flow — the Lifestyle Analysis screen.
 *
 * Visual contract (Requirements 4.1–4.9, 16.1–16.3, 16.5):
 *   - Renders the six lifestyle sub-questions inside `OnboardingShell`
 *     (step = 3) with the global step indicator pinned at `03 / 07`.
 *   - Each sub-question shows the question copy in `typography.largeTitle`
 *     and uses `ChoiceCard` rows for its enum options. The eyebrow is
 *     supplied to the shell as `Lifestyle · NN / 06`.
 *   - A 2 px inner progress bar above the question advances `(subIndex+1)/6`
 *     using `Animated.timing` over 200 ms; the track is `colors.divider`
 *     and the fill `colors.textPrimary`, mirroring the shell progress style.
 *   - Sub-question transitions cross-fade for 200 ms (opacity only).
 *   - `canAdvance` stays `true` so the user can attempt to advance and see
 *     the inline prompt "Select an option to continue." (`colors.error`,
 *     `typography.caption`) when they have not yet picked an option.
 *
 * All values come from `frontend/constants/theme.ts` and
 * `frontend/constants/onboarding.ts`; no inline color, spacing, or
 * typography literals.
 */
export default function LifestyleScreen() {
  const { draft, setLifestyle, markStep } = useOnboarding();

  // Local index over the six lifestyle sub-questions. The global step
  // indicator stays at `03 / 07`; this is the inner pacing.
  const [subIndex, setSubIndex] = useState(0);
  const [attemptedAdvance, setAttemptedAdvance] = useState(false);

  // The cross-fade lags `subIndex` so the outgoing question stays mounted
  // through its 200 ms fade-out before being replaced by the new one.
  const [displayedIndex, setDisplayedIndex] = useState(0);

  // Animated drivers (200 ms each).
  const fadeOpacity = useRef(new Animated.Value(1)).current;
  const innerProgress = useRef(
    new Animated.Value(initialProgress(0)),
  ).current;

  // Cross-fade between sub-questions: opacity 1→0 (200 ms), swap children,
  // opacity 0→1 (200 ms). The displayed index updates between the two
  // halves so the new ChoiceCard rows are mounted while opacity is 0.
  useEffect(() => {
    if (displayedIndex === subIndex) return;
    let cancelled = false;
    Animated.timing(fadeOpacity, {
      toValue: 0,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished || cancelled) return;
      setDisplayedIndex(subIndex);
      Animated.timing(fadeOpacity, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
    return () => {
      cancelled = true;
    };
  }, [subIndex, displayedIndex, fadeOpacity]);

  // Inner progress bar tracks `subIndex` directly (the new bar width is
  // visible during the cross-fade so progress feels responsive).
  useEffect(() => {
    Animated.timing(innerProgress, {
      toValue: progressFor(subIndex),
      duration: 200,
      easing: Easing.out(Easing.cubic),
      // Width is not animatable on the native driver.
      useNativeDriver: false,
    }).start();
  }, [subIndex, innerProgress]);

  const currentQuestion = LIFESTYLE_QUESTIONS[displayedIndex];
  const selectedValue = readLifestyleValue(draft.lifestyle, currentQuestion.id);
  const showUnansweredPrompt = attemptedAdvance && selectedValue == null;

  const handleSelect = (value: string) => {
    // The constants file declares `value` with the narrowed enum type for
    // the corresponding sub-question; cast at the boundary so the context
    // reducer receives a typed Lifestyle field update.
    setLifestyle(
      currentQuestion.id as keyof Lifestyle,
      value as Lifestyle[keyof Lifestyle],
    );
    if (attemptedAdvance) setAttemptedAdvance(false);
  };

  const handleAdvance = () => {
    // Re-read from the live `draft` rather than the captured `selectedValue`
    // so a tap-and-immediately-advance interaction is honoured.
    const liveValue = readLifestyleValue(
      draft.lifestyle,
      LIFESTYLE_QUESTIONS[subIndex].id,
    );
    if (liveValue == null) {
      setAttemptedAdvance(true);
      return;
    }
    if (subIndex < LIFESTYLE_QUESTIONS.length - 1) {
      setAttemptedAdvance(false);
      setSubIndex((i) => i + 1);
      return;
    }
    // Finished all six sub-questions — advance to step 4 (Medical History).
    markStep(4);
    router.push('/onboarding/medical' as never);
  };

  const handleBack = () => {
    if (subIndex > 0) {
      setAttemptedAdvance(false);
      setSubIndex((i) => i - 1);
      return;
    }
    router.back();
  };

  const fillWidth = innerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });
  const subIndicatorLabel = `Sub-question ${subIndex + 1} of ${LIFESTYLE_QUESTIONS.length}`;

  return (
    <OnboardingShell
      step={3}
      eyebrow={currentQuestion.eyebrow}
      canAdvance
      onBack={handleBack}
      onAdvance={handleAdvance}
      advanceLabel={ONBOARDING_COPY.lifestyle.advanceLabel}
    >
      {/* ── Inner progress bar (1/6 .. 6/6) ─────────────── */}
      <View style={styles.innerProgressContainer}>
        <View
          style={styles.innerProgressTrack}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={subIndicatorLabel}
          accessibilityValue={{
            min: 0,
            max: LIFESTYLE_QUESTIONS.length,
            now: subIndex + 1,
          }}
        >
          <Animated.View
            style={[styles.innerProgressFill, { width: fillWidth }]}
          />
        </View>
      </View>

      {/* ── Cross-faded sub-question body ───────────────── */}
      <Animated.View style={[styles.sub, { opacity: fadeOpacity }]}>
        <Text style={styles.question} accessibilityRole="header">
          {currentQuestion.question}
        </Text>

        <View style={styles.options}>
          {currentQuestion.options.map((option) => (
            <ChoiceCard
              key={option.value}
              label={option.label}
              selected={selectedValue === option.value}
              onPress={() => handleSelect(option.value)}
            />
          ))}
        </View>

        {showUnansweredPrompt ? (
          <Text
            style={styles.unansweredPrompt}
            accessibilityLiveRegion="polite"
          >
            {ONBOARDING_COPY.lifestyle.unansweredPrompt}
          </Text>
        ) : null}
      </Animated.View>
    </OnboardingShell>
  );
}

// ── helpers ──────────────────────────────────────────────────────

function progressFor(subIndex: number): number {
  const total = LIFESTYLE_QUESTIONS.length;
  return Math.min(1, Math.max(0, (subIndex + 1) / total));
}

function initialProgress(subIndex: number): number {
  return progressFor(subIndex);
}

/**
 * Reads the field stored in the in-flight draft for the given sub-question
 * id. Returns `undefined` when the user has not yet answered it.
 */
function readLifestyleValue(
  lifestyle: Lifestyle | null,
  id: LifestyleQuestionId,
): Lifestyle[keyof Lifestyle] | undefined {
  if (!lifestyle) return undefined;
  return (lifestyle as Partial<Lifestyle>)[id];
}

const styles = StyleSheet.create({
  innerProgressContainer: {
    marginBottom: spacing.xl,
  },
  innerProgressTrack: {
    height: 2,
    backgroundColor: colors.divider,
    borderRadius: 1,
    overflow: 'hidden',
  },
  innerProgressFill: {
    height: '100%',
    backgroundColor: colors.textPrimary,
  },
  sub: {
    flex: 1,
  },
  question: {
    ...typography.largeTitle,
    color: colors.textPrimary,
    marginBottom: spacing.xxl,
  },
  options: {
    gap: spacing.md,
  },
  unansweredPrompt: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.lg,
  },
});
