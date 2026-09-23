import React from 'react';
import { StyleSheet, Text } from 'react-native';

import OnboardingShell from '../../components/onboarding/OnboardingShell';
import KeyboardAwareScreenScrollView from '../../components/KeyboardAwareScreenScrollView';
import FamilyEditor from '../../components/health/FamilyEditor';
import { ONBOARDING_COPY } from '../../constants/onboarding';
import { colors, spacing, typography } from '../../constants/theme';
import { useOnboardingStep } from '../../utils/useOnboardingStep';

/**
 * Family history.
 *
 * The editor is shared with the profile screen so the same detail — which
 * relative, and roughly when it started — is captured wherever it is entered.
 */
export default function Family() {
  const {
    draft,
    setFamily,
    openSections,
    toggleSection,
    step,
    totalSteps,
    goNext,
    goBack,
  } = useOnboardingStep('family');

  return (
    <OnboardingShell
      step={step}
      totalSteps={totalSteps}
      eyebrow={ONBOARDING_COPY.family.eyebrow}
      canAdvance
      onAdvance={goNext}
      onBack={goBack}
      advanceLabel={ONBOARDING_COPY.family.advanceLabel}
    >
      <KeyboardAwareScreenScrollView>
        <Text style={styles.headline} accessibilityRole="header">
          {ONBOARDING_COPY.family.headline}
        </Text>
        <Text style={styles.supporting}>{ONBOARDING_COPY.family.supporting}</Text>

        <FamilyEditor
          value={draft.family ?? []}
          onChange={setFamily}
          openSections={openSections}
          toggleSection={toggleSection}
        />
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
  supporting: {
    ...typography.callout,
    color: colors.textSecondary,
    marginBottom: spacing.xxl,
  },
});
