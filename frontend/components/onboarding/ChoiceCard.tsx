import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../constants/theme';

export type ChoiceCardProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  iconName?: keyof typeof Ionicons.glyphMap;
  testID?: string;
  disabled?: boolean;
};

/**
 * Full-width option row for single- or multi-select questions.
 *
 * Unselected: flat white row, hollow check ring. Selected: pale indigo tint,
 * indigo border and a filled indigo check. `SegmentedRow` uses the same
 * selected treatment so every choice in onboarding reads the same way.
 */
export default function ChoiceCard({
  label,
  selected,
  onPress,
  iconName,
  testID,
  disabled = false,
}: ChoiceCardProps) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [
        styles.option,
        selected && styles.optionSelected,
        disabled && styles.optionDisabled,
        pressed && styles.optionPressed,
      ]}
    >
      {iconName ? (
        <View style={[styles.iconBadge, selected && styles.iconBadgeSelected]}>
          <Ionicons
            name={iconName}
            size={20}
            color={selected ? colors.textInverse : colors.textSecondary}
          />
        </View>
      ) : null}

      <Text style={styles.optionText}>{label}</Text>

      <View style={[styles.check, selected && styles.checkSelected]}>
        {selected ? <Ionicons name="checkmark" size={16} color={colors.textInverse} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 60,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: spacing.cardRadius,
    backgroundColor: colors.surface,
    // Transparent border on the resting state so selecting does not shift layout.
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  optionSelected: {
    backgroundColor: colors.selected,
    borderColor: colors.textPrimary,
  },
  optionDisabled: {
    opacity: 0.4,
  },
  optionPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadgeSelected: {
    backgroundColor: colors.inkSurface,
  },
  optionText: {
    flex: 1,
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.surfaceBorderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkSelected: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
});
