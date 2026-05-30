import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../constants/theme';

const CHIP_HIT_SLOP = {
  top: spacing.sm,
  right: spacing.sm,
  bottom: spacing.sm,
  left: spacing.sm,
} as const;

export interface ChipProps {
  /** Visible text inside the pill. */
  label: string;
  /** Invoked when the user activates the trailing close glyph. */
  onRemove: () => void;
  /** Optional test ID applied to the outer pill container. */
  testID?: string;
}

/**
 * Pill-shaped chip used in the Medical History onboarding step to render a
 * selected entry. Consumes only tokens from `frontend/constants/theme.ts`:
 *   - shape:   `spacing.chipRadius` (999)
 *   - surface: `colors.surface` background, `colors.surfaceBorder` border
 *   - text:    `typography.callout`, `colors.textPrimary`
 *
 * The trailing close glyph is a touch target that calls `onRemove`. It exposes
 * `accessibilityRole="button"` and an accessibility label of
 * `Remove ${label}` so assistive technologies can describe the action.
 */
export const Chip: React.FC<ChipProps> = ({ label, onRemove, testID }) => {
  return (
    <View style={styles.container} testID={testID}>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${label}`}
        hitSlop={CHIP_HIT_SLOP}
        style={({ pressed }) => [styles.closeTarget, pressed && styles.closePressed]}
      >
        <Ionicons name="close" size={14} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
};

export default Chip;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    borderRadius: spacing.chipRadius,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surfaceBorder,
  },
  label: {
    ...typography.callout,
    color: colors.textPrimary,
    marginRight: spacing.xs,
  },
  closeTarget: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: spacing.chipRadius,
  },
  closePressed: {
    backgroundColor: colors.surfaceHover,
  },
});
