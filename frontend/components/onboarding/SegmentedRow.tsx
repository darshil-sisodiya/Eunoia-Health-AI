import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { colors, spacing, typography } from '../../constants/theme';

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
};

export type SegmentedRowProps<T extends string> = {
  /** Question text shown above the options. */
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T | null | undefined;
  onChange: (value: T) => void;
  /** Optional supporting line, e.g. why the answer matters. */
  hint?: string;
};

/**
 * A compact single-select row.
 *
 * `ChoiceCard` is a full-width row per option, which is right for a screen
 * that asks one question. The adaptive follow-ups ask three questions about a
 * single condition at once, so they need something denser — otherwise opening
 * one condition pushes everything else off the screen.
 *
 * Uses only design tokens; the sole numeric literal is the flex basis.
 */
export default function SegmentedRow<T extends string>({
  label,
  options,
  value,
  onChange,
  hint,
}: SegmentedRowProps<T>) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <View style={styles.row}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <TouchableOpacity
              key={option.value}
              onPress={() => onChange(option.value)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${label}: ${option.label}`}
              style={[styles.segment, selected && styles.segmentSelected]}
            >
              <Text
                style={[styles.segmentLabel, selected && styles.segmentLabelSelected]}
                numberOfLines={2}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  hint: {
    ...typography.caption,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  segment: {
    flexGrow: 1,
    flexBasis: '30%',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: spacing.buttonRadius,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentSelected: {
    backgroundColor: colors.inkSurface,
    borderColor: colors.inkSurface,
  },
  segmentLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  segmentLabelSelected: {
    color: colors.textInverse,
  },
});
