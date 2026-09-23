import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { colors, spacing, typography } from '../../constants/theme';
import { routeForSection } from '../../utils/riskView';
import type { Completeness } from '../../utils/onboardingApi';

export type CompletenessCardProps = {
  completeness: Completeness | null | undefined;
  /** Hide once effectively finished, so it stops nagging. */
  hideWhenComplete?: boolean;
};

/**
 * Profile completeness, plus the single most valuable thing to add next.
 *
 * This is what makes progressive profiling work: onboarding stays short, and
 * the remaining depth is requested here, one item at a time, ordered by how
 * much each one would actually improve the assessment. The percentage and the
 * suggestion are both computed server-side so they can never disagree with
 * the risk engine's own confidence figure.
 */
export default function CompletenessCard({
  completeness,
  hideWhenComplete = true,
}: CompletenessCardProps) {
  if (!completeness) return null;
  if (hideWhenComplete && completeness.percent >= 95) return null;

  const next = completeness.next_best;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Your profile</Text>
        <Text style={styles.percent}>{`${completeness.percent}%`}</Text>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(2, completeness.percent)}%` }]} />
      </View>

      {next ? (
        <TouchableOpacity
          style={styles.next}
          onPress={() => router.push(routeForSection(next.section_id) as never)}
          accessibilityRole="button"
          accessibilityLabel={next.cta}
        >
          <View style={styles.nextText}>
            <Text style={styles.nextTitle}>{next.title}</Text>
            <Text style={styles.nextBody}>{next.body}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </TouchableOpacity>
      ) : (
        <Text style={styles.done}>Everything we need is recorded.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    borderRadius: spacing.cardRadiusLg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.overline,
    color: colors.textTertiary,
  },
  percent: {
    ...typography.numeric,
    color: colors.textPrimary,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.backgroundTertiary,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  fill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  next: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  nextText: {
    flex: 1,
  },
  nextTitle: {
    ...typography.headline,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  nextBody: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  done: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
