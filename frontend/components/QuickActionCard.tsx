import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, shadows, typography } from '../constants/theme';

interface QuickActionCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  /** Accent color for the icon badge – now a single color, not a gradient */
  colors: [string, string];
  onPress: () => void;
}

export const QuickActionCard: React.FC<QuickActionCardProps> = ({
  icon,
  title,
  subtitle,
  colors: [iconColor],
  onPress,
}) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={styles.container}
    >
      <View style={[styles.iconContainer, { backgroundColor: `${iconColor}14` }]}>
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text>
      <View style={styles.arrow}>
        <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: spacing.cardRadius,
    padding: spacing.xl,
    minHeight: 140,
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    ...shadows.md,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.headline,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  arrow: {
    position: 'absolute',
    bottom: spacing.lg,
    right: spacing.lg,
  },
});
