import React, { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import OnboardingShell from '../../components/onboarding/OnboardingShell';
import NumberOrUnknown from '../../components/onboarding/NumberOrUnknown';
import KeyboardAwareScreenScrollView from '../../components/KeyboardAwareScreenScrollView';
import { colors, spacing, typography } from '../../constants/theme';
import { useOnboardingStep } from '../../utils/useOnboardingStep';
import type { Vitals } from '../../utils/onboardingApi';

/**
 * Vitals and lab numbers.
 *
 * This step did not exist before, and its absence is the single biggest reason
 * the risk score was unreliable: without blood pressure or blood sugar the
 * engine was guessing from self-reported lifestyle alone.
 *
 * Everything here is optional, but skipping is not free. A number left blank
 * in someone over 40 raises "unassessed risk" and lowers the confidence shown
 * on the result, and the app then suggests getting it measured. That is the
 * honest treatment: not knowing your blood pressure is not the same as having
 * a good one.
 */

const EMPTY_VITALS: Vitals = { declared_unknown: [] };

type Row = {
  key: keyof Omit<Vitals, 'declared_unknown' | 'measured_on'>;
  label: string;
  unit: string;
  normal?: [number, number];
};

// Grouped so the screen reads as three short asks rather than one long form.
const GROUPS: { title: string; caption: string; rows: Row[] }[] = [
  {
    title: 'Blood pressure',
    caption: 'Any recent reading works: a clinic, a pharmacy or a home monitor.',
    rows: [
      { key: 'systolic_mmhg', label: 'Systolic (upper)', unit: 'mmHg', normal: [90, 120] },
      { key: 'diastolic_mmhg', label: 'Diastolic (lower)', unit: 'mmHg', normal: [60, 80] },
    ],
  },
  {
    title: 'Blood sugar',
    caption: 'Either one is enough. HbA1c is the more useful of the two.',
    rows: [
      { key: 'hba1c_percent', label: 'HbA1c', unit: '%', normal: [4, 5.6] },
      { key: 'fasting_glucose_mgdl', label: 'Fasting glucose', unit: 'mg/dL', normal: [70, 99] },
    ],
  },
  {
    title: 'Cholesterol and body',
    caption:
      'Waist size predicts metabolic risk better than weight alone for South Asian bodies.',
    rows: [
      { key: 'total_cholesterol_mgdl', label: 'Total cholesterol', unit: 'mg/dL', normal: [125, 200] },
      { key: 'ldl_mgdl', label: 'LDL', unit: 'mg/dL', normal: [20, 100] },
      { key: 'hdl_mgdl', label: 'HDL', unit: 'mg/dL', normal: [40, 60] },
      { key: 'waist_cm', label: 'Waist', unit: 'cm', normal: [40, 90] },
      { key: 'resting_hr_bpm', label: 'Resting heart rate', unit: 'bpm', normal: [60, 100] },
    ],
  },
];

const ALL_ROWS = GROUPS.flatMap((group) => group.rows);

export default function VitalsScreen() {
  const { draft, setVitals, step, totalSteps, goNext, goBack } =
    useOnboardingStep('vitals');

  const vitals = draft.vitals ?? EMPTY_VITALS;
  const unknownSet = useMemo(
    () => new Set(vitals.declared_unknown ?? []),
    [vitals.declared_unknown],
  );

  const setValue = useCallback(
    (key: Row['key'], value: number | null) => {
      const declared = (vitals.declared_unknown ?? []).filter((k) => k !== key);
      setVitals({ ...vitals, [key]: value, declared_unknown: declared });
    },
    [vitals, setVitals],
  );

  const toggleUnknown = useCallback(
    (key: Row['key']) => {
      const declared = vitals.declared_unknown ?? [];
      const next = declared.includes(key)
        ? declared.filter((k) => k !== key)
        : [...declared, key];
      // Marking unknown clears any stale value, so the two states cannot
      // contradict each other.
      setVitals({
        ...vitals,
        [key]: declared.includes(key) ? vitals[key] : null,
        declared_unknown: next,
      });
    },
    [vitals, setVitals],
  );

  // Live feedback, so the cost of skipping is visible while answering rather
  // than a surprise on the results screen.
  const answered = ALL_ROWS.filter(
    (row) => vitals[row.key] !== null && vitals[row.key] !== undefined,
  ).length;
  const unknownCount = ALL_ROWS.filter((row) => unknownSet.has(row.key)).length;
  const untouched = ALL_ROWS.length - answered - unknownCount;

  return (
    <OnboardingShell
      step={step}
      totalSteps={totalSteps}
      eyebrow="Your numbers"
      canAdvance
      onBack={goBack}
      onAdvance={goNext}
      advanceLabel="Continue"
    >
      <KeyboardAwareScreenScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.headline} accessibilityRole="header">
          Do you know any of your health numbers?
        </Text>
        <Text style={styles.subtitle}>
          These shape your risk picture more than anything else you tell us.
          Skip what you do not know rather than guessing.
        </Text>

        {GROUPS.map((group) => (
          <View key={group.title} style={styles.group}>
            <Text style={styles.groupTitle} accessibilityRole="header">
              {group.title}
            </Text>
            <Text style={styles.groupCaption}>{group.caption}</Text>
            {group.rows.map((row) => (
              <NumberOrUnknown
                key={row.key}
                label={row.label}
                unit={row.unit}
                normal={row.normal}
                value={vitals[row.key] as number | null | undefined}
                unknown={unknownSet.has(row.key)}
                onChangeValue={(value) => setValue(row.key, value)}
                onToggleUnknown={() => toggleUnknown(row.key)}
              />
            ))}
          </View>
        ))}

        <View style={styles.summary}>
          <Text style={styles.summaryText}>
            {answered > 0
              ? `${answered} of ${ALL_ROWS.length} recorded.`
              : 'Nothing recorded yet.'}
            {unknownCount > 0 ? ` ${unknownCount} marked as not known.` : ''}
            {untouched > 0 && answered > 0 ? ` ${untouched} still blank.` : ''}
          </Text>
          <Text style={styles.summaryHint}>
            Anything missing lowers the confidence in your result, and we will
            show you what to get checked.
          </Text>
        </View>
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
    marginBottom: spacing.xxl,
  },
  group: {
    marginBottom: spacing.xxl,
  },
  groupTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  groupCaption: {
    ...typography.callout,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  summary: {
    padding: spacing.lg,
    borderRadius: spacing.cardRadiusLg,
    backgroundColor: colors.selected,
  },
  summaryText: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  summaryHint: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
