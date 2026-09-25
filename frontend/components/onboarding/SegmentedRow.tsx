import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts, spacing, typography } from '../../constants/theme';

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
 * Selected segments match `ChoiceCard`: pale indigo tint, indigo border and a
 * check. Unlike ChoiceCard, resting segments keep a light border, because
 * this row also sits inside white cards (condition and family editors) where
 * a borderless white segment would disappear.
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
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${label}: ${option.label}`}
              style={({ pressed }) => [
                styles.segment,
                selected && styles.segmentSelected,
                pressed && styles.segmentPressed,
              ]}
            >
              {selected ? (
                <Ionicons name="checkmark" size={16} color={colors.textPrimary} />
              ) : null}
              <Text
                style={[styles.segmentLabel, selected && styles.segmentLabelSelected]}
                numberOfLines={2}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
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
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  segment: {
    flexGrow: 1,
    flexBasis: '30%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 44,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
  },
  segmentSelected: {
    backgroundColor: colors.selected,
    borderColor: colors.textPrimary,
  },
  segmentPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  segmentLabel: {
    ...typography.callout,
    color: colors.textSecondary,
    textAlign: 'center',
    flexShrink: 1,
  },
  segmentLabelSelected: {
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
  },
});
