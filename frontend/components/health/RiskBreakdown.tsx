import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { colors, fonts, spacing, typography } from '../../constants/theme';
import { tap } from '../ui';
import {
  componentBars,
  confidenceLabel,
  linkForFactor,
  riskTone,
  topDrivers,
  unassessedFactors,
} from '../../utils/riskView';
import type { AnalyzeRiskResponse, RiskLevel } from '../../utils/onboardingApi';

/** Resolves the token names from `riskView` to real theme values.
 *  Kept here so `riskView.ts` stays free of react-native imports and can be
 *  exercised by `npm run check`. */
export function toneColors(level: RiskLevel | null | undefined) {
  const tone = riskTone(level);
  const fg = {
    // Low risk reads as good news; marigold is a fill, not a status colour.
    accent: colors.success,
    warning: colors.warning,
    error: colors.error,
    textPrimary: colors.textPrimary,
  }[tone.fg];
  const bg = {
    accentMuted: colors.successSoft,
    warningSoft: colors.warningSoft,
    errorSoft: colors.errorSoft,
    backgroundTertiary: colors.backgroundTertiary,
  }[tone.bg];
  return { fg, bg };
}

/** Small pill stating how much of the picture we actually have. */
export function ConfidencePill({ report }: { report: AnalyzeRiskResponse | null }) {
  const label = confidenceLabel(report);
  if (!label) return null;
  const confidence = report?.confidence?.confidence ?? 100;
  const low = confidence < 70;
  return (
    <View style={[styles.pill, low && styles.pillLow]}>
      <Ionicons
        name={low ? 'alert-circle-outline' : 'checkmark-circle-outline'}
        size={16}
        color={low ? colors.warning : colors.textSecondary}
      />
      <Text style={[styles.pillText, low && styles.pillTextLow]}>{label}</Text>
    </View>
  );
}

/**
 * Per-component bars on an ABSOLUTE scale.
 *
 * The previous dashboard normalised each bar against the user's own largest
 * component, so everybody's worst area rendered full-width — a Low-risk user
 * looked maxed out. Each bar is now drawn against that component's published
 * cap, which is why the backend returns the caps at all.
 *
 * A bare list with no card or title, so it sits inside the caller's card.
 */
export function ComponentBars({
  report,
  limit,
}: {
  report: AnalyzeRiskResponse | null;
  limit?: number;
}) {
  const bars = componentBars(report);
  if (bars.length === 0) return null;
  const visible = limit ? bars.slice(0, limit) : bars;

  return (
    <View style={styles.bars}>
      {visible.map((bar) => (
        <View
          key={bar.id}
          accessible
          accessibilityLabel={`${bar.label}: ${bar.score} of ${bar.cap}${bar.atCap ? ', at the maximum' : ''}`}
        >
          <View style={styles.barHeader}>
            <Text style={styles.barLabel}>{bar.label}</Text>
            <Text style={styles.barValue}>
              <Text style={styles.barScore}>{bar.score}</Text>
              {` of ${bar.cap}`}
            </Text>
          </View>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                { width: `${Math.max(1, bar.fraction * 100)}%` },
                bar.atCap && styles.barFillCapped,
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Top contributors, each linking to whatever can change it.
 *  `linked={false}` renders plain rows, e.g. at the end of onboarding where
 *  leaving for an edit screen would skip saving the report. */
export function TopDrivers({
  report,
  limit = 5,
  linked = true,
}: {
  report: AnalyzeRiskResponse | null;
  limit?: number;
  linked?: boolean;
}) {
  const drivers = topDrivers(report, limit);
  if (drivers.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle} accessibilityRole="header">
        What’s driving your score
      </Text>
      <Text style={styles.cardCaption}>Points each one adds to your risk, largest first.</Text>
      {drivers.map((driver, index) => {
        const link = linked ? linkForFactor(driver.dimension) : null;
        const unassessed = driver.kind === 'unassessed';
        const body = (
          <>
            <View style={styles.driverText}>
              <Text style={[styles.driverLabel, unassessed && styles.driverLabelUnassessed]}>
                {driver.label}
              </Text>
              {driver.explanation ? (
                <Text style={styles.driverExplanation}>{driver.explanation}</Text>
              ) : null}
              {driver.multiplier && driver.multiplier !== 1 ? (
                <Text style={styles.driverMultiplier}>
                  {`Severity multiplier ×${driver.multiplier}`}
                </Text>
              ) : null}
            </View>
            <View style={styles.driverRight}>
              <Text style={[styles.driverDelta, unassessed && styles.driverDeltaUnassessed]}>
                {`+${driver.delta}`}
              </Text>
              {link ? (
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              ) : null}
            </View>
          </>
        );

        return link ? (
          <Pressable
            key={driver.dimension}
            style={({ pressed }) => [
              styles.driverRow,
              index > 0 && styles.rowDivider,
              pressed && styles.pressed,
            ]}
            onPress={() => {
              tap();
              router.push(link as never);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${driver.label}, adds ${driver.delta}. Open to act on this.`}
          >
            {body}
          </Pressable>
        ) : (
          <View
            key={driver.dimension}
            style={[styles.driverRow, index > 0 && styles.rowDivider]}
            accessible
            accessibilityLabel={`${driver.label}, adds ${driver.delta}`}
          >
            {body}
          </View>
        );
      })}
    </View>
  );
}

/** Validated instruments, each on its own published scale. */
export function SubScores({ report }: { report: AnalyzeRiskResponse | null }) {
  const subscores = report?.subscores ?? [];
  if (subscores.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle} accessibilityRole="header">
        Screening scores
      </Text>
      <Text style={styles.cardCaption}>Standard questionnaires, each on its own scale.</Text>
      {subscores.map((sub) => (
        <View key={sub.id} style={styles.subCard}>
          <View style={styles.subHeader}>
            <Text style={styles.subLabel}>{sub.label}</Text>
            <Text style={styles.subScore}>
              {sub.score}
              <Text style={styles.subMax}>{` of ${sub.max}`}</Text>
            </Text>
          </View>
          <Text style={styles.subBand}>{sub.band}</Text>
          <Text style={styles.subDetail}>{sub.detail}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * The things we do not know.
 *
 * Rendered as actions rather than findings. This is the visible half of
 * "unknown is not healthy": rather than quietly scoring a blank as fine, the
 * app says what is missing and offers to record it.
 */
export function GetCheckedCard({ report }: { report: AnalyzeRiskResponse | null }) {
  const missing = report?.confidence?.missing ?? [];
  const unassessed = unassessedFactors(report);
  if (missing.length === 0 && unassessed.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle} accessibilityRole="header">
        Worth getting checked
      </Text>
      <Text style={styles.cardCaption}>
        We have not assumed these are fine. They are simply not known yet.
      </Text>
      {missing.map((item, index) => (
        <Pressable
          key={item.id}
          style={({ pressed }) => [
            styles.checkRow,
            index > 0 && styles.rowDivider,
            pressed && styles.pressed,
          ]}
          onPress={() => {
            tap();
            router.push('/profile/edit/vitals' as never);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Record ${item.label}`}
        >
          <View style={styles.checkIcon}>
            <Ionicons name="add" size={18} color={colors.warning} />
          </View>
          <Text style={styles.checkLabel}>{item.label}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: spacing.chipRadius,
    backgroundColor: colors.background,
    alignSelf: 'flex-start',
  },
  pillLow: {
    backgroundColor: colors.warningSoft,
  },
  pillText: {
    ...typography.caption,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  pillTextLow: {
    color: colors.warning,
  },

  // White card shell for the titled blocks. No outer margin: the caller
  // stacks them with a 12pt gap.
  card: {
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadiusLg,
    padding: spacing.xl,
  },
  cardTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  cardCaption: {
    ...typography.caption,
    fontFamily: fonts.regular,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },

  // Component bars
  bars: {
    gap: spacing.lg,
  },
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  barLabel: {
    ...typography.callout,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  barValue: {
    ...typography.caption,
    fontFamily: fonts.regular,
    color: colors.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  barScore: {
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.backgroundTertiary,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.textPrimary,
  },
  barFillCapped: {
    backgroundColor: colors.error,
  },

  // Drivers
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  driverText: {
    flex: 1,
  },
  driverLabel: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  driverLabelUnassessed: {
    color: colors.warning,
  },
  driverExplanation: {
    ...typography.callout,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    marginTop: 2,
  },
  driverMultiplier: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  driverRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  driverDelta: {
    ...typography.title,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  driverDeltaUnassessed: {
    color: colors.warning,
  },

  // Screening scores
  subCard: {
    padding: spacing.lg,
    borderRadius: spacing.cardRadius,
    backgroundColor: colors.background,
    marginTop: spacing.sm,
  },
  subHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing.md,
  },
  subLabel: {
    ...typography.headline,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  subScore: {
    ...typography.title,
    color: colors.textPrimary,
  },
  subMax: {
    ...typography.caption,
    fontFamily: fonts.regular,
    color: colors.textTertiary,
  },
  subBand: {
    ...typography.callout,
    fontFamily: fonts.semibold,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  subDetail: {
    ...typography.callout,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },

  // Get checked
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingVertical: spacing.sm,
  },
  checkIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.warningSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkLabel: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    flex: 1,
  },
});
