import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, shadows, typography } from '../constants/theme';

interface QuickActionCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  /** Legacy prop — colors are derived from the monochrome system */
  colors?: [string, string];
  onPress: () => void;
}

export const QuickActionCard: React.FC<QuickActionCardProps> = ({
  icon,
  title,
  subtitle,
  onPress,
}) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={styles.container}
    >
      <View style={styles.iconContainer}>
        <Ionicons name={icon} size={20} color={colors.textPrimary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text>
      <View style={styles.arrow}>
        <Ionicons name="arrow-forward" size={14} color={colors.textTertiary} />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: spacing.cardRadiusLg,
    padding: spacing.xl,
    minHeight: 144,
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    ...shadows.sm,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    backgroundColor: colors.backgroundTertiary,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  title: {
    ...typography.headline,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textTertiary,
    lineHeight: 17,
  },
  arrow: {
    position: 'absolute',
    bottom: spacing.lg,
    right: spacing.lg,
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
});
