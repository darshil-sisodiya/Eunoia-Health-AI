import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import NumberOrUnknown from '../../../components/onboarding/NumberOrUnknown';
import NumberField from '../../../components/onboarding/NumberField';
import SegmentedRow from '../../../components/onboarding/SegmentedRow';
import KeyboardAwareScreenScrollView from '../../../components/KeyboardAwareScreenScrollView';
import { colors, spacing, typography } from '../../../constants/theme';
import { useHealthProfile } from '../../../contexts/HealthProfileContext';
import {
  AllergiesEditor,
  ConditionsEditor,
  MedicationsEditor,
} from '../../../components/health/MedicalEditors';
import FamilyEditor from '../../../components/health/FamilyEditor';
import type {
  AllergyEntry,
  ConditionEntry,
  FamilyEntry,
  Insurance,
  Lifestyle,
  MedicationEntry,
  MentalHealth,
  ProfileSectionPatch,
  ScreeningHistory,
  Vitals,
} from '../../../utils/onboardingApi';

/**
 * Progressive profiling.
 *
 * Onboarding asks what is needed to produce a first assessment. Everything
 * else is asked here, later, one section at a time, driven by the
 * completeness meter on the dashboard.
 *
 * Saving returns the whole recomputed bundle from the server, so the risk
 * score updates the moment this screen closes — the client never guesses what
 * the new number should be.
 */

const VITAL_ROWS: {
  key: keyof Omit<Vitals, 'declared_unknown' | 'measured_on'>;
  label: string;
  unit: string;
  normal?: [number, number];
}[] = [
  { key: 'systolic_mmhg', label: 'Blood pressure (upper)', unit: 'mmHg', normal: [90, 120] },
  { key: 'diastolic_mmhg', label: 'Blood pressure (lower)', unit: 'mmHg', normal: [60, 80] },
  { key: 'hba1c_percent', label: 'HbA1c', unit: '%', normal: [4, 5.6] },
  { key: 'fasting_glucose_mgdl', label: 'Fasting glucose', unit: 'mg/dL', normal: [70, 99] },
  { key: 'total_cholesterol_mgdl', label: 'Total cholesterol', unit: 'mg/dL', normal: [125, 200] },
  { key: 'ldl_mgdl', label: 'LDL', unit: 'mg/dL', normal: [20, 100] },
  { key: 'hdl_mgdl', label: 'HDL', unit: 'mg/dL', normal: [40, 60] },
  { key: 'waist_cm', label: 'Waist', unit: 'cm', normal: [40, 90] },
  { key: 'resting_hr_bpm', label: 'Resting heart rate', unit: 'bpm', normal: [60, 100] },
];

const RECENCY = [
  { value: 'lt_6m', label: 'Under 6 months' },
  { value: '6_12m', label: '6-12 months' },
  { value: '1_3y', label: '1-3 years' },
  { value: 'gt_3y', label: '3+ years' },
  { value: 'never', label: 'Never' },
] as const;

const SECTION_TITLES: Record<string, { title: string; body: string }> = {
  vitals: {
    title: 'Vitals and lab numbers',
    body: 'These move your risk picture more than anything else you can tell us.',
  },
  screening: {
    title: 'Screening history',
    body: 'So we can tell you what is due rather than guessing.',
  },
  insurance: {
    title: 'Insurance and budget',
    body: 'Used to suggest a hospital tier you can actually afford.',
  },
  conditions: {
    title: 'Conditions',
    body: 'How long you have had something, and how well it is managed, changes your result a lot.',
  },
  medications: {
    title: 'Medications',
    body: 'We check new prescriptions against this list for interactions.',
  },
  allergies: {
    title: 'Allergies',
    body: 'This is what lets us warn you about a prescription you should not take.',
  },
  lifestyle: {
    title: 'Lifestyle',
    body: 'Amounts, not impressions. "Regular" smoking covered both two a day and forty.',
  },
  mental: {
    title: 'Mood and stress',
    body: 'Four recognised screening questions. Private, and a rough answer beats a flattering one.',
  },
  family: {
    title: 'Family history',
    body: 'Which relative, and roughly when it started, matters more than the condition alone.',
  },
};

/** Sections this screen can actually edit. Anything else is set during
 *  onboarding, and pretending otherwise would give the user a dead Save. */
const EDITABLE_SECTIONS = new Set([
  'vitals', 'screening', 'insurance', 'conditions', 'medications',
  'allergies', 'lifestyle', 'mental', 'family',
]);

const FREQUENCY_OPTIONS = [
  { value: '0', label: 'Not at all' },
  { value: '1', label: 'Several days' },
  { value: '2', label: 'More than half' },
  { value: '3', label: 'Nearly every day' },
] as const;

const MENTAL_QUESTIONS: { key: keyof MentalHealth; text: string }[] = [
  { key: 'phq2_interest', text: 'Little interest or pleasure in doing things' },
  { key: 'phq2_down', text: 'Feeling down, depressed or hopeless' },
  { key: 'gad2_nervous', text: 'Feeling nervous, anxious or on edge' },
  { key: 'gad2_worry', text: 'Not being able to stop or control worrying' },
];

export default function EditSection() {
  const { section } = useLocalSearchParams<{ section: string }>();
  const { data, patch } = useHealthProfile();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storedVitals = data?.vitals;
  const [vitals, setVitals] = useState<Vitals>(() => {
    const declared = storedVitals?.declared_unknown;
    return {
      ...(storedVitals ?? {}),
      declared_unknown: Array.isArray(declared)
        ? declared
        : typeof declared === 'string'
          ? safeParseList(declared)
          : [],
    } as Vitals;
  });

  const [screening, setScreening] = useState<ScreeningHistory>(
    () => (data?.profile?.screening_history as ScreeningHistory) ?? {},
  );
  const [insurance, setInsurance] = useState<Insurance>(
    () => (data?.profile?.insurance as Insurance) ?? {},
  );

  // Seeded from the store, then edited locally and saved in one patch, so a
  // half-finished edit never reaches the risk engine.
  const [conditions, setConditions] = useState<ConditionEntry[]>(() =>
    (data?.conditions ?? []).map((c) => ({
      name: c.name,
      diagnosed_bucket: c.diagnosed_bucket ?? 'unknown',
      control: c.control ?? 'unsure',
      treatment: c.treatment ?? 'none',
      severity: c.severity ?? null,
      hospitalised_12m: Boolean(c.hospitalised_12m),
    })),
  );
  const [medications, setMedications] = useState<MedicationEntry[]>(() =>
    (data?.medications ?? []).map((m) => ({
      name: m.name,
      dose: m.dose ?? null,
      frequency: m.frequency ?? null,
      started_bucket: m.started_bucket ?? 'unknown',
      for_condition: m.for_condition ?? null,
      adherence: m.adherence ?? 'unknown',
    })),
  );
  const [allergies, setAllergies] = useState<AllergyEntry[]>(() =>
    (data?.allergies ?? []).map((a) => ({
      allergen: a.allergen,
      category: a.category ?? 'other',
      reaction: a.reaction ?? null,
    })),
  );

  const [lifestyle, setLifestyle] = useState<Partial<Lifestyle>>(() => {
    const stored = (data?.profile ?? {}) as Record<string, unknown>;
    const pick = <T,>(key: string) =>
      (stored[key] === null || stored[key] === undefined ? undefined : stored[key]) as T;
    return {
      sleep_hours: pick<number>('sleep_hours'),
      exercise_minutes_per_week: pick<number>('exercise_minutes_per_week'),
      sedentary_hours_per_day: pick<number>('sedentary_hours_per_day'),
      alcohol_units_per_week: pick<number>('alcohol_units_per_week'),
      cigarettes_per_day: pick<number>('cigarettes_per_day'),
      smoking_years: pick<number>('smoking_years'),
      fruit_veg_servings: pick<number>('fruit_veg_servings'),
      diet_type: pick<Lifestyle['diet_type']>('diet_type'),
      smokeless_tobacco: pick<Lifestyle['smokeless_tobacco']>('smokeless_tobacco'),
      cooking_fuel: pick<Lifestyle['cooking_fuel']>('cooking_fuel'),
    };
  });

  const [mental, setMental] = useState<MentalHealth>(() => {
    const stored = (data?.profile ?? {}) as Record<string, unknown>;
    return {
      phq2_interest: (stored.phq2_interest as number) ?? null,
      phq2_down: (stored.phq2_down as number) ?? null,
      gad2_nervous: (stored.gad2_nervous as number) ?? null,
      gad2_worry: (stored.gad2_worry as number) ?? null,
    };
  });

  // The stored rows are one per (condition, relation); the editor works in
  // one entry per condition, so group them on the way in.
  const [family, setFamily] = useState<FamilyEntry[]>(() => {
    const grouped = new Map<string, FamilyEntry>();
    for (const row of data?.family_history ?? []) {
      const existing = grouped.get(row.condition);
      const relation = (row.relation || '').trim();
      if (existing) {
        if (relation) existing.relations.push(relation as FamilyEntry['relations'][number]);
      } else {
        grouped.set(row.condition, {
          condition: row.condition,
          relations: relation ? [relation as FamilyEntry['relations'][number]] : [],
          onset_bucket: row.onset_bucket ?? 'unknown',
        });
      }
    }
    return Array.from(grouped.values());
  });

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const toggleSection = useCallback(
    (key: string) => setOpenSections((c) => ({ ...c, [key]: !c[key] })),
    [],
  );

  const unknownSet = useMemo(
    () => new Set(vitals.declared_unknown ?? []),
    [vitals.declared_unknown],
  );

  const meta = SECTION_TITLES[String(section)] ?? {
    title: 'Update your profile',
    body: '',
  };

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const body: ProfileSectionPatch =
        section === 'vitals'
          ? { vitals }
          : section === 'screening'
            ? { screening }
            : section === 'insurance'
              ? { insurance }
              : section === 'conditions'
                ? { conditions }
                : section === 'medications'
                  ? { medications }
                  : section === 'allergies'
                    ? { allergies }
                    : section === 'lifestyle'
                      ? { lifestyle }
                      : section === 'mental'
                        ? { mental }
                        : section === 'family'
                          ? { family }
                          : {};
      await patch(String(section), body);
      router.back();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [section, vitals, screening, insurance, conditions, medications, allergies,
      lifestyle, mental, family, patch]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {meta.title}
        </Text>
        <View style={styles.backButton} />
      </View>

      <KeyboardAwareScreenScrollView>
        {meta.body ? <Text style={styles.intro}>{meta.body}</Text> : null}

        {section === 'vitals'
          ? VITAL_ROWS.map((row) => (
              <NumberOrUnknown
                key={row.key}
                label={row.label}
                unit={row.unit}
                normal={row.normal}
                value={vitals[row.key] as number | null | undefined}
                unknown={unknownSet.has(row.key)}
                onChangeValue={(value) =>
                  setVitals((current) => ({
                    ...current,
                    [row.key]: value,
                    declared_unknown: (current.declared_unknown ?? []).filter(
                      (k) => k !== row.key,
                    ),
                  }))
                }
                onToggleUnknown={() =>
                  setVitals((current) => {
                    const declared = current.declared_unknown ?? [];
                    const on = declared.includes(row.key);
                    return {
                      ...current,
                      [row.key]: on ? current[row.key] : null,
                      declared_unknown: on
                        ? declared.filter((k) => k !== row.key)
                        : [...declared, row.key],
                    };
                  })
                }
              />
            ))
          : null}

        {section === 'screening' ? (
          <>
            <SegmentedRow
              label="Last blood pressure check"
              options={RECENCY}
              value={screening.last_bp_check ?? null}
              onChange={(v) => setScreening({ ...screening, last_bp_check: v })}
            />
            <SegmentedRow
              label="Last blood sugar test"
              options={RECENCY}
              value={screening.last_blood_sugar ?? null}
              onChange={(v) => setScreening({ ...screening, last_blood_sugar: v })}
            />
            <SegmentedRow
              label="Last cholesterol panel"
              options={RECENCY}
              value={screening.last_lipid_panel ?? null}
              onChange={(v) => setScreening({ ...screening, last_lipid_panel: v })}
            />
            <SegmentedRow
              label="Last dental visit"
              options={RECENCY}
              value={screening.last_dental ?? null}
              onChange={(v) => setScreening({ ...screening, last_dental: v })}
            />
            <SegmentedRow
              label="Last eye examination"
              options={RECENCY}
              value={screening.last_eye_exam ?? null}
              onChange={(v) => setScreening({ ...screening, last_eye_exam: v })}
            />
            <SegmentedRow
              label="Last full health check-up"
              options={RECENCY}
              value={screening.last_full_checkup ?? null}
              onChange={(v) => setScreening({ ...screening, last_full_checkup: v })}
            />
          </>
        ) : null}

        {section === 'insurance' ? (
          <>
            <SegmentedRow
              label="Do you have health insurance?"
              options={[
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
              ]}
              value={
                insurance.has_insurance === null || insurance.has_insurance === undefined
                  ? null
                  : insurance.has_insurance
                    ? 'yes'
                    : 'no'
              }
              onChange={(v) => setInsurance({ ...insurance, has_insurance: v === 'yes' })}
            />
            {insurance.has_insurance ? (
              <SegmentedRow
                label="Roughly how much cover?"
                options={[
                  { value: 'lt_2l', label: 'Under 2L' },
                  { value: '2_5l', label: '2-5L' },
                  { value: '5_10l', label: '5-10L' },
                  { value: '10_25l', label: '10-25L' },
                  { value: 'gt_25l', label: '25L+' },
                  { value: 'unsure', label: 'Not sure' },
                ]}
                value={insurance.sum_insured_band ?? null}
                onChange={(v) => setInsurance({ ...insurance, sum_insured_band: v })}
              />
            ) : null}
            <SegmentedRow
              label="What could you comfortably pay yourself?"
              hint="Used only to suggest a hospital tier in the cost estimator."
              options={[
                { value: 'lt_5k', label: 'Under 5k' },
                { value: '5_25k', label: '5-25k' },
                { value: '25_1l', label: '25k-1L' },
                { value: 'gt_1l', label: '1L+' },
              ]}
              value={insurance.out_of_pocket_band ?? null}
              onChange={(v) => setInsurance({ ...insurance, out_of_pocket_band: v })}
            />
            <SegmentedRow
              label="Do you have a regular doctor?"
              options={[
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
              ]}
              value={
                insurance.has_regular_doctor === null ||
                insurance.has_regular_doctor === undefined
                  ? null
                  : insurance.has_regular_doctor
                    ? 'yes'
                    : 'no'
              }
              onChange={(v) =>
                setInsurance({ ...insurance, has_regular_doctor: v === 'yes' })
              }
            />
          </>
        ) : null}

        {section === 'conditions' ? (
          <ConditionsEditor value={conditions} onChange={setConditions} />
        ) : null}

        {section === 'medications' ? (
          <MedicationsEditor
            value={medications}
            onChange={setMedications}
            conditionNames={conditions.map((c) => c.name)}
          />
        ) : null}

        {section === 'allergies' ? (
          <AllergiesEditor value={allergies} onChange={setAllergies} />
        ) : null}

        {section === 'lifestyle' ? (
          <>
            <NumberField
              label="Hours of sleep on a typical night"
              value={lifestyle.sleep_hours}
              onChange={(v) => setLifestyle({ ...lifestyle, sleep_hours: v })}
              unit="hours"
            />
            <NumberField
              label="Minutes of exercise per week"
              value={lifestyle.exercise_minutes_per_week}
              onChange={(v) => setLifestyle({ ...lifestyle, exercise_minutes_per_week: v })}
              unit="minutes"
            />
            <NumberField
              label="Hours sitting per day"
              value={lifestyle.sedentary_hours_per_day}
              onChange={(v) => setLifestyle({ ...lifestyle, sedentary_hours_per_day: v })}
              unit="hours"
            />
            <NumberField
              label="Alcohol units per week"
              value={lifestyle.alcohol_units_per_week}
              onChange={(v) => setLifestyle({ ...lifestyle, alcohol_units_per_week: v })}
              unit="units"
            />
            <NumberField
              label="Cigarettes per day"
              value={lifestyle.cigarettes_per_day}
              onChange={(v) => setLifestyle({ ...lifestyle, cigarettes_per_day: v })}
              unit="per day"
            />
            <NumberField
              label="Years you have smoked"
              value={lifestyle.smoking_years}
              onChange={(v) => setLifestyle({ ...lifestyle, smoking_years: v })}
              unit="years"
            />
            <NumberField
              label="Servings of fruit and vegetables per day"
              value={lifestyle.fruit_veg_servings}
              onChange={(v) => setLifestyle({ ...lifestyle, fruit_veg_servings: v })}
              unit="servings"
            />
            <SegmentedRow
              label="How do you eat?"
              options={[
                { value: 'vegetarian', label: 'Vegetarian' },
                { value: 'vegan', label: 'Vegan' },
                { value: 'eggetarian', label: 'Eggetarian' },
                { value: 'non_vegetarian', label: 'Non-vegetarian' },
              ]}
              value={lifestyle.diet_type ?? null}
              onChange={(v) => setLifestyle({ ...lifestyle, diet_type: v })}
            />
            <SegmentedRow
              label="Do you use any smokeless tobacco?"
              hint="Gutka, paan masala, khaini, zarda."
              options={[
                { value: 'never', label: 'Never' },
                { value: 'former', label: 'Used to' },
                { value: 'occasional', label: 'Occasionally' },
                { value: 'daily', label: 'Daily' },
              ]}
              value={lifestyle.smokeless_tobacco ?? null}
              onChange={(v) => setLifestyle({ ...lifestyle, smokeless_tobacco: v })}
            />
            <SegmentedRow
              label="What do you cook with?"
              hint="Solid fuels affect long-term lung health."
              options={[
                { value: 'lpg', label: 'LPG' },
                { value: 'electric', label: 'Electric' },
                { value: 'biomass', label: 'Wood/biomass' },
                { value: 'kerosene', label: 'Kerosene' },
                { value: 'mixed', label: 'Mixed' },
              ]}
              value={lifestyle.cooking_fuel ?? null}
              onChange={(v) => setLifestyle({ ...lifestyle, cooking_fuel: v })}
            />
          </>
        ) : null}

        {section === 'mental' ? (
          <>
            <Text style={styles.intro}>
              Over the last two weeks, how often have you been bothered by…
            </Text>
            {MENTAL_QUESTIONS.map((question) => (
              <SegmentedRow
                key={String(question.key)}
                label={question.text}
                options={FREQUENCY_OPTIONS}
                value={
                  mental[question.key] === null || mental[question.key] === undefined
                    ? null
                    : String(mental[question.key])
                }
                onChange={(v) => setMental({ ...mental, [question.key]: Number(v) })}
              />
            ))}
            <Text style={styles.footnote}>
              These are recognised screening questions, not a diagnosis.
            </Text>
          </>
        ) : null}

        {section === 'family' ? (
          <FamilyEditor
            value={family}
            onChange={setFamily}
            openSections={openSections}
            toggleSection={toggleSection}
          />
        ) : null}

        {/* Defensive: a section with no editor would otherwise render an
            empty page with a Save button that silently does nothing. */}
        {!EDITABLE_SECTIONS.has(String(section)) ? (
          <Text style={styles.error}>
            This part of your profile is set during onboarding. Open Profile and
            choose &quot;Update health profile&quot; to change it.
          </Text>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.save, saving && styles.saveDisabled]}
          onPress={save}
          disabled={saving || !EDITABLE_SECTIONS.has(String(section))}
          accessibilityRole="button"
          accessibilityLabel="Save"
        >
          {saving ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.saveLabel}>Save</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.footnote}>
          Saving recalculates your risk assessment straight away.
        </Text>
      </KeyboardAwareScreenScrollView>
    </SafeAreaView>
  );
}

/** Vitals come back from MySQL as a JSON column, which some drivers hand
 *  back as a string. */
function safeParseList(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.headline,
    color: colors.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  intro: {
    ...typography.callout,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  error: {
    ...typography.caption,
    color: colors.error,
    marginBottom: spacing.md,
  },
  save: {
    paddingVertical: spacing.lg,
    borderRadius: spacing.buttonRadius,
    backgroundColor: colors.inkSurface,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  saveDisabled: {
    opacity: 0.6,
  },
  saveLabel: {
    ...typography.headline,
    color: colors.textInverse,
  },
  footnote: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xxl,
  },
});
