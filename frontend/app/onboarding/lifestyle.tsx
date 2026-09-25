import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import OnboardingShell from '../../components/onboarding/OnboardingShell';
import ChoiceCard from '../../components/onboarding/ChoiceCard';
import { Notice } from '../../components/ui';
import {
  LIFESTYLE_QUESTIONS,
  ONBOARDING_COPY,
  type LifestyleQuestionId,
} from '../../constants/onboarding';
import { useOnboardingStep } from '../../utils/useOnboardingStep';
import type { Lifestyle } from '../../utils/onboardingApi';
import { colors, spacing, typography } from '../../constants/theme';

/**
 * Lifestyle: six single-choice questions paced one at a time inside a single
 * onboarding step.
 *
 *   - The shell's segmented bar tracks the step; the eyebrow carries the
 *     inner count ("Lifestyle, question 2 of 6") so there is one progress
 *     bar on screen, not two.
 *   - Sub-question transitions cross-fade for 200 ms (opacity only).
 *   - `canAdvance` stays `true` so advancing without an answer shows the
 *     inline prompt instead of a dead button.
 */
export default function LifestyleScreen() {
  const { draft, setLifestyle, step, totalSteps, goNext, goBack } =
    useOnboardingStep('lifestyle');

  // Local index over the six lifestyle sub-questions; the shell's step
  // count does not move while these advance.
  const [subIndex, setSubIndex] = useState(0);
  const [attemptedAdvance, setAttemptedAdvance] = useState(false);

  // The cross-fade lags `subIndex` so the outgoing question stays mounted
  // through its 200 ms fade-out before being replaced by the new one.
  const [displayedIndex, setDisplayedIndex] = useState(0);

  const fadeOpacity = useRef(new Animated.Value(1)).current;

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
    // All sub-questions answered; the step graph decides what comes next.
    goNext();
  };

  const handleBack = () => {
    if (subIndex > 0) {
      setAttemptedAdvance(false);
      setSubIndex((i) => i - 1);
      return;
    }
    goBack();
  };

  const eyebrow = `${currentQuestion.eyebrow}, question ${displayedIndex + 1} of ${LIFESTYLE_QUESTIONS.length}`;

  return (
    <OnboardingShell
      step={step}
      totalSteps={totalSteps}
      eyebrow={eyebrow}
      canAdvance
      onBack={handleBack}
      onAdvance={handleAdvance}
      advanceLabel={ONBOARDING_COPY.lifestyle.advanceLabel}
    >
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
          <View style={styles.unansweredPrompt}>
            <Notice>{ONBOARDING_COPY.lifestyle.unansweredPrompt}</Notice>
          </View>
        ) : null}
      </Animated.View>
    </OnboardingShell>
  );
}

// ── helpers ──────────────────────────────────────────────────────

/**
 * Reads the field stored in the in-flight draft for the given sub-question
 * id. Returns `undefined` when the user has not yet answered it.
 */
function readLifestyleValue(
  lifestyle: Partial<Lifestyle> | null,
  id: LifestyleQuestionId,
): Lifestyle[keyof Lifestyle] | undefined {
  if (!lifestyle) return undefined;
  return lifestyle[id];
}

const styles = StyleSheet.create({
  sub: {
    flex: 1,
  },
  question: {
    ...typography.largeTitle,
    color: colors.textPrimary,
    marginBottom: spacing.xxl,
  },
  options: {
    gap: spacing.sm,
  },
  unansweredPrompt: {
    marginTop: spacing.lg,
  },
});
