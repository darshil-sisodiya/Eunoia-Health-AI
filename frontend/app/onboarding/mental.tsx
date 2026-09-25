import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import OnboardingShell from '../../components/onboarding/OnboardingShell';
import SegmentedRow from '../../components/onboarding/SegmentedRow';
import { colors, spacing, typography } from '../../constants/theme';
import { useOnboardingStep } from '../../utils/useOnboardingStep';
import type { MentalHealth } from '../../utils/onboardingApi';

/**
 * PHQ-2 and GAD-2.
 *
 * Four questions, both validated instruments, both free to use. They replace
 * nothing — the single "how stressed are you" question stays — but they turn
 * an impression into a score with a published threshold, which is what makes
 * the mental-wellbeing component defensible rather than decorative.
 *
 * A score of 3 or more on either is "screen positive", meaning a fuller
 * assessment is worthwhile. That is deliberately not phrased as a diagnosis
 * anywhere in the app.
 */

const FREQUENCY_OPTIONS = [
  { value: '0', label: 'Not at all' },
  { value: '1', label: 'Several days' },
  { value: '2', label: 'More than half' },
  { value: '3', label: 'Nearly every day' },
] as const;

type Question = {
  key: keyof MentalHealth;
  text: string;
};

const PHQ2: Question[] = [
  { key: 'phq2_interest', text: 'Little interest or pleasure in doing things' },
  { key: 'phq2_down', text: 'Feeling down, depressed or hopeless' },
];

const GAD2: Question[] = [
  { key: 'gad2_nervous', text: 'Feeling nervous, anxious or on edge' },
  { key: 'gad2_worry', text: 'Not being able to stop or control worrying' },
];

export default function MentalScreen() {
  const { draft, setMental, step, totalSteps, goNext, goBack } =
    useOnboardingStep('mental');

  const mental: MentalHealth = draft.mental ?? {};

  const setAnswer = (key: keyof MentalHealth, value: string) => {
    setMental({ ...mental, [key]: Number(value) });
  };

  const renderQuestion = (question: Question) => {
    const current = mental[question.key];
    return (
      <SegmentedRow
        key={String(question.key)}
        label={question.text}
        options={FREQUENCY_OPTIONS}
        value={current === null || current === undefined ? null : String(current)}
        onChange={(value) => setAnswer(question.key, value)}
      />
    );
  };

  return (
    <OnboardingShell
      step={step}
      totalSteps={totalSteps}
      eyebrow="Mood and worry"
      canAdvance
      onBack={goBack}
      onAdvance={goNext}
      advanceLabel="Continue"
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <Text style={styles.headline} accessibilityRole="header">
          Over the last two weeks, how often have you been bothered by…
        </Text>
        <Text style={styles.subtitle}>
          Four questions. Your answers stay private, and an honest rough answer
          is more useful than a flattering one.
        </Text>

        <View style={styles.block}>
          <Text style={styles.blockTitle} accessibilityRole="header">
            Mood
          </Text>
          {PHQ2.map(renderQuestion)}
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle} accessibilityRole="header">
            Worry
          </Text>
          {GAD2.map(renderQuestion)}
        </View>

        <Text style={styles.disclaimer}>
          These are recognised screening questions, not a diagnosis. If anything
          here worries you, speaking to a doctor is always reasonable.
        </Text>
      </ScrollView>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: spacing.xl,
  },
  // Validated PHQ-2 / GAD-2 stem, kept verbatim, so a smaller serif size
  // than other steps keeps it to two or three lines.
  headline: {
    ...typography.title,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xxl,
  },
  block: {
    marginBottom: spacing.xl,
  },
  blockTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  disclaimer: {
    ...typography.callout,
    color: colors.textSecondary,
  },
});
