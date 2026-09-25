import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts, spacing, typography } from '../../constants/theme';

export type NumberOrUnknownProps = {
  label: string;
  unit: string;
  /** Current numeric value, or null when none has been entered. */
  value: number | null | undefined;
  /** True when the user has explicitly said they do not know this number. */
  unknown: boolean;
  onChangeValue: (value: number | null) => void;
  onToggleUnknown: () => void;
  /** Reference range, rendered as a hint so people can read their own result. */
  normal?: [number, number];
  placeholder?: string;
};

/**
 * One clinical number, with an explicit "I don't know".
 *
 * The three states must stay visually distinct:
 *   - a value          -> neutral, answered
 *   - "I don't know"   -> WARNING styling, because an unmeasured number is
 *                         unassessed risk, not a clean result
 *   - untouched        -> neutral, unanswered
 *
 * The warning treatment is the point. If skipping a question looked the same
 * as answering it well, missing data would keep reading as good news, which is
 * exactly what made the old risk score so optimistic.
 */
export default function NumberOrUnknown({
  label,
  unit,
  value,
  unknown,
  onChangeValue,
  onToggleUnknown,
  normal,
  placeholder,
}: NumberOrUnknownProps) {
  const [focused, setFocused] = useState(false);
  const handleText = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      onChangeValue(null);
      return;
    }
    const parsed = Number(trimmed);
    onChangeValue(Number.isFinite(parsed) ? parsed : null);
  };

  return (
    <View style={[styles.wrapper, unknown && styles.wrapperUnknown]}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        {normal ? (
          <Text style={styles.normal}>
            {`Typical ${normal[0]}–${normal[1]} ${unit}`}
          </Text>
        ) : null}
      </View>

      {unknown ? (
        <View style={styles.unknownState}>
          <Ionicons name="help-circle-outline" size={20} color={colors.warning} />
          <Text style={styles.unknownText}>
            Not known. We will suggest getting this checked.
          </Text>
        </View>
      ) : (
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
            accessibilityLabel={`${label} in ${unit}`}
          />
          <Text style={styles.unit}>{unit}</Text>
        </View>
      )}

      <Pressable
        onPress={onToggleUnknown}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: unknown }}
        accessibilityLabel={`I don't know my ${label}`}
        hitSlop={4}
        style={({ pressed }) => [styles.toggle, pressed && styles.togglePressed]}
      >
        <Ionicons
          name={unknown ? 'checkbox' : 'square-outline'}
          size={20}
          color={unknown ? colors.warning : colors.textTertiary}
        />
        <Text style={[styles.toggleText, unknown && styles.toggleTextActive]}>
          I don&apos;t know this
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    padding: spacing.lg,
    paddingBottom: spacing.sm,
    borderRadius: spacing.cardRadiusLg,
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
  },
  wrapperUnknown: {
    backgroundColor: colors.warningSoft,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  label: {
    ...typography.headline,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  normal: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
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
  unknownState: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 60,
    gap: spacing.sm,
  },
  unknownText: {
    ...typography.callout,
    color: colors.warning,
    flexShrink: 1,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    minHeight: 44,
    gap: spacing.sm,
  },
  togglePressed: {
    opacity: 0.7,
  },
  toggleText: {
    ...typography.callout,
    color: colors.textSecondary,
  },
  toggleTextActive: {
    fontFamily: fonts.semibold,
    color: colors.warning,
  },
});
