import React from 'react';
import { StyleSheet, Text } from 'react-native';

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
      eyebrow="Medicines and allergies"
      canAdvance
      onBack={goBack}
      onAdvance={goNext}
      advanceLabel="Continue"
    >
      <KeyboardAwareScreenScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.headline} accessibilityRole="header">
          What do you take, and what do you react to?
        </Text>
        <Text style={styles.subtitle}>
          We check every new prescription against both lists, so include
          everything you can.
        </Text>

        <Text style={styles.sectionLabel} accessibilityRole="header">
          Medications
        </Text>
        <MedicationsEditor
          value={draft.medical.medications}
          onChange={setMedications}
          conditionNames={conditionNames}
        />

        <Text style={[styles.sectionLabel, styles.sectionSpaced]} accessibilityRole="header">
          Allergies
        </Text>
        <Text style={styles.sectionCaption}>
          Medicine allergies matter most. They are how we warn you about a new
          prescription.
        </Text>
        <AllergiesEditor value={draft.medical.allergy_entries} onChange={setAllergies} />
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
  sectionLabel: {
    ...typography.subtitle,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  sectionSpaced: {
    marginTop: spacing.xxxl,
  },
  sectionCaption: {
    ...typography.callout,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
});
