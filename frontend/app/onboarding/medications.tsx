import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import OnboardingShell from '../../components/onboarding/OnboardingShell';
import KeyboardAwareScreenScrollView from '../../components/KeyboardAwareScreenScrollView';
import {
  AllergiesEditor,
  MedicationsEditor,
} from '../../components/health/MedicalEditors';
import { colors, spacing, typography } from '../../constants/theme';
import { useOnboardingStep } from '../../utils/useOnboardingStep';

/**
 * Medications and allergies.
 *
 * Two things here are not cosmetic:
 *
 * 1. A medication can be linked to the condition it treats, which is what
 *    lets the rest of the app explain why a drug is being taken rather than
 *    listing it in isolation.
 * 2. Allergies carry a reaction severity. Uploaded prescriptions are checked
 *    against this list — previously the analyzer could not see allergies at
 *    all, so it could tell someone a drug they react to was fine.
 *
 * Allergies share this screen rather than having their own: both are "what
 * goes into you", and the flow is long enough already.
 */
export default function MedicationsScreen() {
  const {
    draft,
    setMedications,
    setAllergies,
    step,
    totalSteps,
    goNext,
    goBack,
  } = useOnboardingStep('medications');

  const conditionNames = draft.medical.conditions.map((c) => c.name);

  return (
    <OnboardingShell
      step={step}
      totalSteps={totalSteps}
      eyebrow="Medicines & allergies"
      canAdvance
      onBack={goBack}
      onAdvance={goNext}
      advanceLabel="Continue"
    >
      <KeyboardAwareScreenScrollView>
        <Text style={styles.headline} accessibilityRole="header">
          What do you take, and what do you react to?
        </Text>
        <Text style={styles.subtitle}>
          We check new prescriptions against both of these, so it is worth
          being complete here.
        </Text>

        <Text style={styles.sectionLabel}>Medications</Text>
        <MedicationsEditor
          value={draft.medical.medications}
          onChange={setMedications}
          conditionNames={conditionNames}
        />

        <View style={styles.divider} />

        <Text style={styles.sectionLabel}>Allergies</Text>
        <Text style={styles.sectionCaption}>
          Especially medicines. This is what lets us warn you about a new
          prescription.
        </Text>
        <AllergiesEditor value={draft.medical.allergy_entries} onChange={setAllergies} />
      </KeyboardAwareScreenScrollView>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  headline: {
    ...typography.largeTitle,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  subtitle: {
    ...typography.callout,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  sectionLabel: {
    ...typography.overline,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
  },
  sectionCaption: {
    ...typography.caption,
    color: colors.textTertiary,
    marginBottom: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: spacing.xxl,
  },
});
