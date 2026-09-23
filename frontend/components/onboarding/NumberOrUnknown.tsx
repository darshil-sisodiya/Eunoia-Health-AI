import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, typography } from '../../constants/theme';

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
            {`typical ${normal[0]}-${normal[1]} ${unit}`}
          </Text>
        ) : null}
      </View>

      {unknown ? (
        <View style={styles.unknownState}>
          <Ionicons name="help-circle-outline" size={18} color={colors.warning} />
          <Text style={styles.unknownText}>
            Not known — we will suggest getting this checked
          </Text>
        </View>
      ) : (
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={value === null || value === undefined ? '' : String(value)}
            onChangeText={handleText}
            keyboardType="numeric"
            inputMode="decimal"
            placeholder={placeholder ?? '—'}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={`${label} in ${unit}`}
          />
          <Text style={styles.unit}>{unit}</Text>
        </View>
      )}

      <TouchableOpacity
        onPress={onToggleUnknown}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ selected: unknown }}
        accessibilityLabel={
          unknown ? `I do know my ${label}` : `I don't know my ${label}`
        }
        style={styles.toggle}
      >
        <Ionicons
          name={unknown ? 'checkbox' : 'square-outline'}
          size={16}
          color={unknown ? colors.warning : colors.textTertiary}
        />
        <Text style={[styles.toggleText, unknown && styles.toggleTextActive]}>
          I don&apos;t know this
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: spacing.cardRadius,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
  },
  wrapperUnknown: {
    borderColor: colors.warning,
    backgroundColor: colors.warningSoft,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  label: {
    ...typography.headline,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  normal: {
    ...typography.caption,
    color: colors.textTertiary,
    marginLeft: spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    ...typography.numeric,
    color: colors.textPrimary,
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: spacing.inputRadius,
    backgroundColor: colors.backgroundSecondary,
  },
  unit: {
    ...typography.callout,
    color: colors.textSecondary,
    marginLeft: spacing.md,
  },
  unknownState: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  unknownText: {
    ...typography.caption,
    color: colors.warning,
    flexShrink: 1,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  toggleText: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  toggleTextActive: {
    color: colors.warning,
  },
});
