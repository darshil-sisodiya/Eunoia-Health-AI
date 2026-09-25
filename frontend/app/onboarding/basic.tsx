import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import OnboardingShell from '../../components/onboarding/OnboardingShell';
import ChoiceCard from '../../components/onboarding/ChoiceCard';
import KeyboardAwareScreenScrollView from '../../components/KeyboardAwareScreenScrollView';
import { TextField } from '../../components/ui';
import { type BasicProfile } from '../../contexts/OnboardingContext';
import { useOnboardingStep } from '../../utils/useOnboardingStep';
import { ONBOARDING_COPY } from '../../constants/onboarding';
import { colors, fonts, spacing, typography } from '../../constants/theme';
import type { Gender } from '../../utils/onboardingApi';

/**
 * Step 2 of the Eunoia onboarding flow — the Basic Health Profile screen.
 *
 * Collects full name, age, gender, height, and weight (Requirement 3.1).
 * Validates each field against the Pydantic constraints declared on the
 * backend (`backend/server.py::BasicProfile`) so the frontend rejects
 * payloads that the server would reject (Requirements 3.2–3.6).
 *
 * Validation runs on blur and on every keystroke; the advance CTA is
 * disabled until all five fields pass (Requirement 3.7). Per Requirement
 * 3.10, every successful validation immediately persists the parsed
 * values into `OnboardingContext.basic` so the draft survives navigation
 * and re-mounts even before the user activates "Continue". On advance
 * (Requirement 3.9), the values are confirmed and the flow moves to
 * step 3 (Lifestyle).
 *
 * Text inputs use the shared `TextField`; copy lives in `ONBOARDING_COPY.basic`.
 */

// ── Field model ───────────────────────────────────────────────────
type FieldKey = 'fullName' | 'age' | 'gender' | 'heightCm' | 'weightKg';

const FIELD_ORDER: ReadonlyArray<FieldKey> = [
  'fullName',
  'age',
  'gender',
  'heightCm',
  'weightKg',
];

const VALID_GENDERS: ReadonlyArray<Gender> = [
  'male',
  'female',
  'non_binary',
  'prefer_not_to_say',
];

interface BasicInput {
  fullName: string;
  age: string;
  gender: Gender | null;
  heightCm: string;
  weightKg: string;
}

interface ValidationResult {
  ok: boolean;
  errors: Partial<Record<FieldKey, string>>;
  parsed: BasicProfile | null;
}

// ── Validator ─────────────────────────────────────────────────────
/**
 * Mirrors the Pydantic constraints on `backend/server.py::BasicProfile`:
 *   - full_name: trimmed length 1..80
 *   - age:       integer in [13, 120]
 *   - gender:    one of {male, female, non_binary, prefer_not_to_say}
 *   - height_cm: finite number in [80, 250]
 *   - weight_kg: finite number in [20, 300]
 *
 * Returns the parsed `BasicProfile` when every field passes so callers
 * can persist the canonical (post-trim, numerically parsed) values
 * without re-parsing.
 */
export function validateBasic(input: BasicInput): ValidationResult {
  const errors: Partial<Record<FieldKey, string>> = {};
  const E = ONBOARDING_COPY.basic.errors;

  // full_name — trimmed length 1..80 (Requirement 3.2)
  const trimmed = input.fullName.trim();
  if (trimmed.length < 1 || trimmed.length > 80) {
    errors.fullName = E.fullName;
  }

  // age — integer 13..120 (Requirement 3.3)
  let ageNum: number | null = null;
  const ageStr = input.age.trim();
  if (!/^\d+$/.test(ageStr)) {
    errors.age = E.age;
  } else {
    const parsed = parseInt(ageStr, 10);
    if (!Number.isInteger(parsed) || parsed < 13 || parsed > 120) {
      errors.age = E.age;
    } else {
      ageNum = parsed;
    }
  }

  // gender — enum membership (Requirement 3.4)
  if (!input.gender || !VALID_GENDERS.includes(input.gender)) {
    errors.gender = E.gender;
  }

  // height_cm — finite 80..250 (Requirement 3.5)
  let heightNum: number | null = null;
  const heightStr = input.heightCm.trim();
  if (!/^\d+(\.\d+)?$/.test(heightStr)) {
    errors.heightCm = E.heightCm;
  } else {
    const parsed = parseFloat(heightStr);
    if (!Number.isFinite(parsed) || parsed < 80 || parsed > 250) {
      errors.heightCm = E.heightCm;
    } else {
      heightNum = parsed;
    }
  }

  // weight_kg — finite 20..300 (Requirement 3.6)
  let weightNum: number | null = null;
  const weightStr = input.weightKg.trim();
  if (!/^\d+(\.\d+)?$/.test(weightStr)) {
    errors.weightKg = E.weightKg;
  } else {
    const parsed = parseFloat(weightStr);
    if (!Number.isFinite(parsed) || parsed < 20 || parsed > 300) {
      errors.weightKg = E.weightKg;
    } else {
      weightNum = parsed;
    }
  }

  const ok = Object.keys(errors).length === 0;
  const parsed: BasicProfile | null =
    ok &&
    ageNum !== null &&
    heightNum !== null &&
    weightNum !== null &&
    input.gender
      ? {
          full_name: trimmed,
          age: ageNum,
          gender: input.gender,
          height_cm: heightNum,
          weight_kg: weightNum,
        }
      : null;

  return { ok, errors, parsed };
}

// ── Screen ────────────────────────────────────────────────────────
export default function Basic() {
  const { draft, hydrated, setBasic, step, totalSteps, goNext, goBack } =
    useOnboardingStep('basic');

  const [input, setInput] = useState<BasicInput>({
    fullName: '',
    age: '',
    gender: null,
    heightCm: '',
    weightKg: '',
  });
  const [touched, setTouched] = useState<Record<FieldKey, boolean>>({
    fullName: false,
    age: false,
    gender: false,
    heightCm: false,
    weightKg: false,
  });
  // Set true after a failed advance attempt so every error becomes
  // visible at once even if some fields were never blurred.
  const [showAllErrors, setShowAllErrors] = useState(false);
  const hydratedFromDraftRef = useRef(false);
  const ageRef = useRef<TextInput>(null);
  const weightRef = useRef<TextInput>(null);

  // Hydrate local state from `OnboardingContext.draft.basic` on mount.
  useEffect(() => {
    if (!hydrated || hydratedFromDraftRef.current) return;
    hydratedFromDraftRef.current = true;
    if (draft.basic) {
      setInput({
        fullName: draft.basic.full_name,
        age: String(draft.basic.age),
        gender: draft.basic.gender,
        heightCm: String(draft.basic.height_cm),
        weightKg: String(draft.basic.weight_kg),
      });
    }
  }, [hydrated, draft.basic]);

  const validation = useMemo(() => validateBasic(input), [input]);

  // Per Requirement 3.10: persist the parsed profile into the
  // OnboardingContext as soon as every field passes validation, even
  // before the user activates the advance action. The reducer will
  // mirror the value to AsyncStorage so the draft survives unmount.
  useEffect(() => {
    if (!hydratedFromDraftRef.current) return;
    if (!validation.ok || !validation.parsed) return;
    const next = validation.parsed;
    const existing = draft.basic;
    const unchanged =
      existing &&
      existing.full_name === next.full_name &&
      existing.age === next.age &&
      existing.gender === next.gender &&
      existing.height_cm === next.height_cm &&
      existing.weight_kg === next.weight_kg;
    if (!unchanged) {
      setBasic(next);
    }
  }, [validation, draft.basic, setBasic]);

  // Compute which errors are currently visible. An error is rendered
  // when the field is touched OR a failed advance attempt has unlocked
  // all errors (per Requirement 3.7).
  const visibleErrors: Partial<Record<FieldKey, string>> = {};
  for (const key of FIELD_ORDER) {
    const message = validation.errors[key];
    if (message && (touched[key] || showAllErrors)) {
      visibleErrors[key] = message;
    }
  }

  const update = <K extends keyof BasicInput>(key: K, value: BasicInput[K]) =>
    setInput((prev) => ({ ...prev, [key]: value }));

  const blur = (key: FieldKey) =>
    setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true }));

  const handleAdvance = () => {
    const result = validateBasic(input);
    if (!result.ok || !result.parsed) {
      // Safety net: the CTA is disabled when invalid, so this branch is
      // rarely hit, but Requirement 3.7 requires us to surface inline
      // errors on attempted advance regardless of prior touch state.
      setShowAllErrors(true);
      setTouched({
        fullName: true,
        age: true,
        gender: true,
        heightCm: true,
        weightKg: true,
      });
      return;
    }
    setBasic(result.parsed);
    // Where "next" is depends on the draft (gender decides whether the
    // women's-health step applies), so the step graph decides, not this screen.
    goNext();
  };

  const handleBack = () => {
    goBack();
  };

  const C = ONBOARDING_COPY.basic;

  return (
    <OnboardingShell
      step={step}
      totalSteps={totalSteps}
      eyebrow={C.eyebrow}
      canAdvance={validation.ok}
      onBack={handleBack}
      onAdvance={handleAdvance}
      advanceLabel={C.advanceLabel}
    >
      <KeyboardAwareScreenScrollView
        style={styles.keyboardScroll}
        contentContainerStyle={styles.scroll}
      >
        <View style={styles.heading}>
          <Text style={styles.headline} accessibilityRole="header">
            {C.headline}
          </Text>
          <Text style={styles.subtitle}>{C.subtitle}</Text>
        </View>

        <View style={styles.form}>
          <TextField
            label={C.fields.fullName.label}
            hint={C.fields.fullName.hint}
            error={visibleErrors.fullName}
            value={input.fullName}
            onChangeText={(v) => update('fullName', v)}
            onBlur={() => blur('fullName')}
            placeholder={C.fields.fullName.placeholder}
            maxLength={80}
            autoCapitalize="words"
            autoCorrect={false}
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
            onSubmitEditing={() => ageRef.current?.focus()}
            submitBehavior="submit"
            accessibilityHint={C.fields.fullName.hint}
          />

          <TextField
            ref={ageRef}
            label={C.fields.age.label}
            hint={C.fields.age.hint}
            error={visibleErrors.age}
            value={input.age}
            onChangeText={(v) => update('age', v.replace(/[^\d]/g, ''))}
            onBlur={() => blur('age')}
            placeholder={C.fields.age.placeholder}
            keyboardType="number-pad"
            maxLength={3}
            returnKeyType="done"
            accessibilityHint={C.fields.age.hint}
          />

          <View style={styles.field}>
            <Text style={styles.label}>{C.fields.gender.label}</Text>
            <View style={styles.genderColumn} accessibilityRole="radiogroup">
              {C.fields.gender.options.map((opt) => (
                <ChoiceCard
                  key={opt.value}
                  label={opt.label}
                  selected={input.gender === opt.value}
                  onPress={() => {
                    update('gender', opt.value as Gender);
                    blur('gender');
                  }}
                  testID={`gender-${opt.value}`}
                />
              ))}
            </View>
            {visibleErrors.gender ? (
              <Text style={styles.errorText} accessibilityLiveRegion="polite">
                {visibleErrors.gender}
              </Text>
            ) : null}
          </View>

          <TextField
            label={`${C.fields.heightCm.label} (${C.fields.heightCm.unit})`}
            hint={C.fields.heightCm.hint}
            error={visibleErrors.heightCm}
            value={input.heightCm}
            onChangeText={(v) => update('heightCm', v.replace(/[^\d.]/g, ''))}
            onBlur={() => blur('heightCm')}
            placeholder={C.fields.heightCm.placeholder}
            keyboardType="decimal-pad"
            maxLength={6}
            returnKeyType="next"
            onSubmitEditing={() => weightRef.current?.focus()}
            submitBehavior="submit"
            accessibilityHint={C.fields.heightCm.hint}
          />

          <TextField
            ref={weightRef}
            label={`${C.fields.weightKg.label} (${C.fields.weightKg.unit})`}
            hint={C.fields.weightKg.hint}
            error={visibleErrors.weightKg}
            value={input.weightKg}
            onChangeText={(v) => update('weightKg', v.replace(/[^\d.]/g, ''))}
            onBlur={() => blur('weightKg')}
            placeholder={C.fields.weightKg.placeholder}
            keyboardType="decimal-pad"
            maxLength={6}
            returnKeyType="done"
            accessibilityHint={C.fields.weightKg.hint}
          />
        </View>
      </KeyboardAwareScreenScrollView>
    </OnboardingShell>
  );
}

// ── Styles ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  keyboardScroll: {
    flex: 1,
  },
  scroll: {
    paddingBottom: spacing.xxxl,
  },
  heading: {
    marginBottom: spacing.xxl,
  },
  headline: {
    ...typography.largeTitle,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  form: {
    gap: spacing.xl,
  },
  field: {
    gap: spacing.sm,
  },
  label: {
    ...typography.callout,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
  },
  genderColumn: {
    gap: spacing.sm,
  },
});
