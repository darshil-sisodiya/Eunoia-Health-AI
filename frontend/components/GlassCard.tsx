import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, shadows } from '../constants/theme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  /** Use the inverse (ink) surface for hero / focal blocks */
  inverse?: boolean;
  /** Subtle accent-tinted background — use sparingly */
  tinted?: boolean;
  /** Disable shadow — flat brutalist variant */
  flat?: boolean;
}

export const GlassCard: React.FC<CardProps> = ({
  children,
  style,
  inverse = false,
  tinted = false,
  flat = false,
}) => {
  return (
    <View
      style={[
        styles.card,
        inverse && styles.inverse,
        tinted && styles.tinted,
        flat && styles.flat,
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: spacing.cardRadiusLg,
    padding: spacing.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    ...shadows.md,
  },
  inverse: {
    backgroundColor: colors.inkSurface,
    borderColor: colors.inkBorder,
  },
  tinted: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentSoftBorder,
  },
  flat: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
});
