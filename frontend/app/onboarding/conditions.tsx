import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import OnboardingShell from '../../components/onboarding/OnboardingShell';
import SegmentedRow from '../../components/onboarding/SegmentedRow';
import KeyboardAwareScreenScrollView from '../../components/KeyboardAwareScreenScrollView';
import { ConditionsEditor } from '../../components/health/MedicalEditors';
import { colors, spacing, typography } from '../../constants/theme';
import { useOnboardingStep } from '../../utils/useOnboardingStep';

/**
 * Conditions, with the detail that decides how much each one matters.
 *
 * The old screen collected a bare list of names — and the risk engine ignored
 * it entirely, so fifteen years of poorly-controlled diabetes scored the same
 * as nothing at all. Duration, control and treatment are what separate those
 * two people, so they are asked inline the moment a condition is added.
 *
 * The editor itself is shared with the profile screen, so a condition is
 * described the same way whether it is entered here or edited months later.
 */
export default function ConditionsScreen() {
  const {
    draft,
    setConditions,
    setTakesMedication,
    step,
    totalSteps,
    goNext,
    goBack,
  } = useOnboardingStep('conditions');

  const conditions = draft.medical.conditions;
  const anyOnMedication = conditions.some(
    (c) => c.treatment === 'medication' || c.treatment === 'both',
  );

  return (
    <OnboardingShell
      step={step}
      totalSteps={totalSteps}
      eyebrow="Medical history"
      canAdvance
      onBack={goBack}
      onAdvance={goNext}
      advanceLabel="Continue"
    >
      <KeyboardAwareScreenScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.headline} accessibilityRole="header">
          Has a doctor diagnosed you with anything?
        </Text>
        <Text style={styles.subtitle}>
          Add anything ongoing. For each one we ask how long you have had it
          and how well it is managed, since that matters more than the name.
        </Text>

        <ConditionsEditor value={conditions} onChange={setConditions} />

        {/* Gates the medications step. Asked rather than inferred: plenty of
            people take something without a diagnosis on this list. */}
        {!anyOnMedication ? (
          <View style={styles.medsPrompt}>
            <SegmentedRow
              label="Do you take any medication, supplement or contraceptive regularly?"
              options={[
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
              ]}
              value={
                draft.takes_medication === null || draft.takes_medication === undefined
                  ? null
                  : draft.takes_medication
                    ? 'yes'
                    : 'no'
              }
              onChange={(value) => setTakesMedication(value === 'yes')}
            />
          </View>
        ) : null}
      </KeyboardAwareScreenScrollView>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: spacing.xl,
  },
  headline: {
    ...typography.largeTitle,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  medsPrompt: {
    marginTop: spacing.xxl,
  },
});
