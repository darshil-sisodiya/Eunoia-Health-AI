import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, spacing, typography } from '../../constants/theme';

export type NumberFieldProps = {
  label: string;
  unit?: string;
  hint?: string;
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  placeholder?: string;
};

/**
 * A plain optional number.
 *
 * Distinct from `NumberOrUnknown`, which exists for clinical values where
 * "I don't know" is a meaningful answer that has to be recorded and penalised.
 * For lifestyle amounts a blank simply means not answered, so the extra
 * affordance would be noise.
 */
export default function NumberField({
  label,
  unit,
  hint,
  value,
  onChange,
  placeholder,
}: NumberFieldProps) {
  const [focused, setFocused] = useState(false);
  const handleText = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      onChange(null);
      return;
    }
    const parsed = Number(trimmed);
    onChange(Number.isFinite(parsed) ? parsed : null);
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <View style={[styles.field, focused && styles.fieldFocused]}>
        <TextInput
          style={styles.input}
          value={value === null || value === undefined ? '' : String(value)}
          onChangeText={handleText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="numeric"
          inputMode="decimal"
          placeholder={placeholder ?? '—'}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={unit ? `${label} in ${unit}` : label}
        />
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.xl,
  },
  label: {
    ...typography.headline,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  hint: {
    ...typography.caption,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.lg,
    minHeight: 60,
    borderRadius: spacing.inputRadius,
    borderWidth: 1.5,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
  },
  fieldFocused: {
    borderColor: colors.textPrimary,
  },
  input: {
    ...typography.numeric,
    color: colors.textPrimary,
    flex: 1,
    paddingVertical: spacing.sm,
    fontVariant: ['tabular-nums'],
    // RN web draws its own focus ring; the field border is the ring.
    outlineStyle: 'none',
  } as any,
  unit: {
    ...typography.callout,
    color: colors.textSecondary,
    marginLeft: spacing.md,
  },
});
