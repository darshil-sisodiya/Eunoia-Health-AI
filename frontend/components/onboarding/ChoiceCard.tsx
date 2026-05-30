import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadows, spacing, typography } from '../../constants/theme';

export type ChoiceCardProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  iconName?: keyof typeof Ionicons.glyphMap;
  testID?: string;
  disabled?: boolean;
};

/**
 * Single-select / multi-select option row used by the redesigned onboarding
 * screens (Lifestyle, Family History, Location).
 *
 * Visual contract:
 *   - Left icon badge: `colors.backgroundSecondary`, becomes `colors.inkSurface`
 *     when `selected`.
 *   - Label: `typography.headline`, `colors.textSecondary` -> `colors.textPrimary`
 *     when selected.
 *   - Right check pip: hollow ring -> filled `colors.textPrimary` when selected.
 *
 * All values come from `frontend/constants/theme.ts`; no inline color, spacing,
 * or typography literals.
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
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      style={[
        styles.option,
        selected && styles.optionSelected,
        disabled && styles.optionDisabled,
      ]}
    >
      <View style={[styles.iconBadge, selected && styles.iconBadgeSelected]}>
        {iconName ? (
          <Ionicons
            name={iconName}
            size={20}
            color={selected ? colors.textInverse : colors.textTertiary}
          />
        ) : null}
      </View>

      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
        {label}
      </Text>

      <View style={[styles.optionCheck, selected && styles.optionCheckSelected]}>
        {selected ? (
          <Ionicons name="checkmark" size={14} color={colors.textInverse} />
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadiusLg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  optionSelected: {
    borderColor: colors.textPrimary,
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  optionDisabled: {
    opacity: 0.4,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: spacing.cardRadius,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  iconBadgeSelected: {
    backgroundColor: colors.inkSurface,
    borderColor: colors.inkSurface,
  },
  optionText: {
    flex: 1,
    ...typography.headline,
    color: colors.textSecondary,
  },
  optionTextSelected: {
    color: colors.textPrimary,
  },
  optionCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.surfaceBorderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionCheckSelected: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
});
