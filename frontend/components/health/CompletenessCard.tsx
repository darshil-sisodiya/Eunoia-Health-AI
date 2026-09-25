import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { colors, fonts, spacing, typography } from '../../constants/theme';
import { tap } from '../ui';
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
 *
 * No outer margin: callers own the spacing between cards.
 */
export default function CompletenessCard({
  completeness,
  hideWhenComplete = true,
}: CompletenessCardProps) {
  if (!completeness) return null;
  if (hideWhenComplete && completeness.percent >= 95) return null;

  const next = completeness.next_best;
  const percent = Math.max(0, Math.min(100, completeness.percent));

  return (
    <View style={styles.card}>
      <View
        style={styles.header}
        accessible
        accessibilityLabel={`Your profile is ${percent} percent complete`}
      >
        <View style={styles.headerText}>
          <Text style={styles.title}>Your profile</Text>
          <Text style={styles.caption}>
            {next ? 'More detail makes your score more accurate' : 'Complete'}
          </Text>
        </View>
        <Text style={styles.percent}>{`${percent}%`}</Text>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(2, percent)}%` }]} />
      </View>

      {next ? (
        <Pressable
          style={({ pressed }) => [styles.next, pressed && styles.pressed]}
          onPress={() => {
            tap();
            router.push(routeForSection(next.section_id) as never);
          }}
          accessibilityRole="button"
          accessibilityLabel={next.cta}
          accessibilityHint={next.body}
        >
          <View style={styles.nextIcon}>
            <Ionicons name="add" size={20} color={colors.textPrimary} />
          </View>
          <View style={styles.nextText}>
            <Text style={styles.nextTitle}>{next.title}</Text>
            <Text style={styles.nextBody}>{next.body}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
        </Pressable>
      ) : (
        <Text style={styles.done}>Everything we need is recorded.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.xl,
    borderRadius: spacing.cardRadiusLg,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  headerText: {
    flex: 1,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  caption: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  percent: {
    ...typography.numeric,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.backgroundTertiary,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  next: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    minHeight: 64,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: spacing.cardRadius,
    backgroundColor: colors.background,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  nextIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextText: {
    flex: 1,
  },
  nextTitle: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  nextBody: {
    ...typography.caption,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    marginTop: 2,
  },
  done: {
    ...typography.callout,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    marginTop: spacing.lg,
  },
});
