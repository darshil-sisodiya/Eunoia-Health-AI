import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import OnboardingShell from '../../components/onboarding/OnboardingShell';
import SegmentedRow from '../../components/onboarding/SegmentedRow';
import { colors, spacing, typography } from '../../constants/theme';
import { useOnboardingStep } from '../../utils/useOnboardingStep';
import type { WomensHealth } from '../../utils/onboardingApi';

/**
 * Women's health.
 *
 * Only shown when gender is female — the step graph handles that, so this
 * screen never has to check. Roughly half of users previously got no
 * questions in this area at all, despite cycle irregularity, PCOS and
 * menopause status being directly relevant to metabolic and cardiovascular
 * risk.
 *
 * Every question is skippable. Nothing here blocks advancing.
 */

export default function WomensScreen() {
  const { draft, setWomensHealth, step, totalSteps, goNext, goBack } =
    useOnboardingStep('womens');

  const value: WomensHealth = draft.womens_health ?? {};
  const update = (patch: Partial<WomensHealth>) => setWomensHealth({ ...value, ...patch });

  return (
    <OnboardingShell
      step={step}
      totalSteps={totalSteps}
      eyebrow="Women's health"
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
          Questions about your cycle and screenings
        </Text>
        <Text style={styles.subtitle}>
          Skip anything you would rather not answer. It will not hold up your
          result.
        </Text>

        <SegmentedRow
          label="Are your periods regular?"
          options={[
            { value: 'regular', label: 'Regular' },
            { value: 'irregular', label: 'Irregular' },
            { value: 'absent', label: 'Absent' },
            { value: 'unsure', label: 'Not sure' },
          ]}
          value={value.cycle_regularity ?? null}
          onChange={(v) => update({ cycle_regularity: v })}
        />

        <SegmentedRow
          label="Are you pregnant or planning to be?"
          options={[
            { value: 'no', label: 'No' },
            { value: 'pregnant', label: 'Pregnant' },
            { value: 'trying', label: 'Trying' },
            { value: 'postpartum', label: 'Postpartum' },
            { value: 'prefer_not_say', label: 'Rather not say' },
          ]}
          value={value.pregnancy_status ?? null}
          onChange={(v) => update({ pregnancy_status: v })}
        />

        <SegmentedRow
          label="Where are you with menopause?"
          options={[
            { value: 'pre', label: 'Not started' },
            { value: 'peri', label: 'Going through it' },
            { value: 'post', label: 'Been through it' },
            { value: 'unsure', label: 'Not sure' },
          ]}
          value={value.menopause_status ?? null}
          onChange={(v) => update({ menopause_status: v })}
        />

        <SegmentedRow
          label="When was your last cervical screening (Pap)?"
          options={[
            { value: 'lt_1y', label: 'Under a year' },
            { value: '1_3y', label: '1-3 years' },
            { value: 'gt_3y', label: '3+ years' },
            { value: 'never', label: 'Never' },
            { value: 'unsure', label: 'Not sure' },
          ]}
          value={value.last_pap_bucket ?? null}
          onChange={(v) => update({ last_pap_bucket: v })}
        />

        <SegmentedRow
          label="When was your last mammogram?"
          hint="Usually only relevant from around 40 onwards."
          options={[
            { value: 'lt_1y', label: 'Under a year' },
            { value: '1_3y', label: '1-3 years' },
            { value: 'gt_3y', label: '3+ years' },
            { value: 'never', label: 'Never' },
            { value: 'unsure', label: 'Not sure' },
          ]}
          value={value.last_mammogram_bucket ?? null}
          onChange={(v) => update({ last_mammogram_bucket: v })}
        />
      </ScrollView>
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
    marginBottom: spacing.xxl,
  },
});
