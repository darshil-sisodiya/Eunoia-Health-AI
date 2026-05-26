import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, shadows } from '../constants/theme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  /** Adds a subtle accent-tinted background */
  tinted?: boolean;
}

export const GlassCard: React.FC<CardProps> = ({ children, style, tinted = false }) => {
  return (
    <View
      style={[
        styles.card,
        tinted && styles.tinted,
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: spacing.cardRadius,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    ...shadows.md,
  },
  tinted: {
    backgroundColor: colors.accentLight,
    borderColor: 'rgba(79, 70, 229, 0.12)',
  },
});
