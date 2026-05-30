import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';

import OnboardingShell from '../../components/onboarding/OnboardingShell';
import ChoiceCard from '../../components/onboarding/ChoiceCard';
import {
  useOnboarding,
  type BasicProfile,
} from '../../contexts/OnboardingContext';
import { ONBOARDING_COPY } from '../../constants/onboarding';
import { colors, spacing, typography } from '../../constants/theme';
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
 * All visual values consume tokens from `frontend/constants/theme.ts`
 * and copy from `ONBOARDING_COPY.basic`; no inline color, spacing, or
 * typography literals.
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
  const { draft, hydrated, setBasic, markStep } = useOnboarding();

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
    markStep(3);
    // The `/onboarding/lifestyle` route is created by task 10.4. Until
    // that file lands, expo-router's typed-route generator does not
    // list it, so we cast through `any` to keep this screen
    // self-contained.
    router.push('/onboarding/lifestyle' as any);
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/onboarding/welcome' as any);
    }
  };

  const C = ONBOARDING_COPY.basic;

  return (
    <OnboardingShell
      step={2}
      eyebrow={C.eyebrow}
      canAdvance={validation.ok}
      onBack={handleBack}
      onAdvance={handleAdvance}
      advanceLabel={C.advanceLabel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kav}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Heading ─────────────────────────────── */}
          <View style={styles.heading}>
            <Text style={styles.headline}>{C.headline}</Text>
            <Text style={styles.subtitle}>{C.subtitle}</Text>
          </View>

          {/* ── Full name ───────────────────────────── */}
          <Field
            label={C.fields.fullName.label}
            hint={C.fields.fullName.hint}
            error={visibleErrors.fullName}
          >
            <TextInput
              value={input.fullName}
              onChangeText={(v) => update('fullName', v)}
              onBlur={() => blur('fullName')}
              placeholder={C.fields.fullName.placeholder}
              placeholderTextColor={colors.textMuted}
              maxLength={80}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
              style={[
                styles.input,
                visibleErrors.fullName ? styles.inputError : null,
              ]}
              accessibilityLabel={C.fields.fullName.label}
              accessibilityHint={C.fields.fullName.hint}
            />
          </Field>

          {/* ── Age ─────────────────────────────────── */}
          <Field
            label={C.fields.age.label}
            hint={C.fields.age.hint}
            error={visibleErrors.age}
          >
            <TextInput
              value={input.age}
              onChangeText={(v) => update('age', v.replace(/[^\d]/g, ''))}
              onBlur={() => blur('age')}
              placeholder={C.fields.age.placeholder}
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={3}
              returnKeyType="next"
              style={[
                styles.input,
                visibleErrors.age ? styles.inputError : null,
              ]}
              accessibilityLabel={C.fields.age.label}
              accessibilityHint={C.fields.age.hint}
            />
          </Field>

          {/* ── Gender ──────────────────────────────── */}
          <Field
            label={C.fields.gender.label}
            error={visibleErrors.gender}
          >
            <View style={styles.genderColumn}>
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
          </Field>

          {/* ── Height ──────────────────────────────── */}
          <Field
            label={`${C.fields.heightCm.label} (${C.fields.heightCm.unit})`}
            hint={C.fields.heightCm.hint}
            error={visibleErrors.heightCm}
          >
            <TextInput
              value={input.heightCm}
              onChangeText={(v) =>
                update('heightCm', v.replace(/[^\d.]/g, ''))
              }
              onBlur={() => blur('heightCm')}
              placeholder={C.fields.heightCm.placeholder}
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              maxLength={6}
              returnKeyType="next"
              style={[
                styles.input,
                visibleErrors.heightCm ? styles.inputError : null,
              ]}
              accessibilityLabel={C.fields.heightCm.label}
              accessibilityHint={C.fields.heightCm.hint}
            />
          </Field>

          {/* ── Weight ──────────────────────────────── */}
          <Field
            label={`${C.fields.weightKg.label} (${C.fields.weightKg.unit})`}
            hint={C.fields.weightKg.hint}
            error={visibleErrors.weightKg}
          >
            <TextInput
              value={input.weightKg}
              onChangeText={(v) =>
                update('weightKg', v.replace(/[^\d.]/g, ''))
              }
              onBlur={() => blur('weightKg')}
              placeholder={C.fields.weightKg.placeholder}
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              maxLength={6}
              returnKeyType="done"
              style={[
                styles.input,
                visibleErrors.weightKg ? styles.inputError : null,
              ]}
              accessibilityLabel={C.fields.weightKg.label}
              accessibilityHint={C.fields.weightKg.hint}
            />
          </Field>
        </ScrollView>
      </KeyboardAvoidingView>
    </OnboardingShell>
  );
}

// ── Field row helper ──────────────────────────────────────────────
interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}

function Field({ label, hint, error, children }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? (
        <Text style={styles.errorText} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hintText}>{hint}</Text>
      ) : null}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  kav: {
    flex: 1,
  },
  scroll: {
    paddingBottom: spacing.xxxl,
  },
  heading: {
    marginBottom: spacing.xl,
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
  field: {
    marginBottom: spacing.xl,
  },
  label: {
    ...typography.callout,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: spacing.cardRadius,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    ...typography.body,
    color: colors.textPrimary,
  },
  inputError: {
    borderColor: colors.error,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.xs,
  },
  hintText: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  genderColumn: {
    gap: spacing.sm,
  },
});
