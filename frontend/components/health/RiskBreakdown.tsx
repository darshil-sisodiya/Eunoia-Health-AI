import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { colors, spacing, typography } from '../../constants/theme';
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
    accent: colors.accent,
    warning: colors.warning,
    error: colors.error,
    textPrimary: colors.textPrimary,
  }[tone.fg];
  const bg = {
    accentMuted: colors.accentMuted,
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
        size={14}
        color={low ? colors.warning : colors.textTertiary}
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
        <View key={bar.id} style={styles.barRow}>
          <View style={styles.barHeader}>
            <Text style={styles.barLabel}>{bar.label}</Text>
            <Text style={styles.barValue}>{`${bar.score} / ${bar.cap}`}</Text>
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

/** Top contributors, each linking to whatever can change it. */
export function TopDrivers({
  report,
  limit = 5,
}: {
  report: AnalyzeRiskResponse | null;
  limit?: number;
}) {
  const drivers = topDrivers(report, limit);
  if (drivers.length === 0) return null;

  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>What is driving this</Text>
      {drivers.map((driver) => {
        const link = linkForFactor(driver.dimension);
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
                  {`severity multiplier x${driver.multiplier}`}
                </Text>
              ) : null}
            </View>
            <View style={styles.driverRight}>
              <Text style={[styles.driverDelta, unassessed && styles.driverDeltaUnassessed]}>
                {`+${driver.delta}`}
              </Text>
              {link ? (
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              ) : null}
            </View>
          </>
        );

        return link ? (
          <TouchableOpacity
            key={driver.dimension}
            style={styles.driverRow}
            onPress={() => router.push(link as never)}
            accessibilityRole="button"
            accessibilityLabel={`${driver.label}. Open to act on this.`}
          >
            {body}
          </TouchableOpacity>
        ) : (
          <View key={driver.dimension} style={styles.driverRow}>
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
    <View style={styles.block}>
      <Text style={styles.blockTitle}>Recognised screening scores</Text>
      {subscores.map((sub) => (
        <View key={sub.id} style={styles.subCard}>
          <View style={styles.subHeader}>
            <Text style={styles.subLabel}>{sub.label}</Text>
            <Text style={styles.subScore}>{`${sub.score} / ${sub.max}`}</Text>
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
    <View style={styles.block}>
      <Text style={styles.blockTitle}>Worth getting checked</Text>
      <Text style={styles.blockCaption}>
        We have not assumed these are fine — they are simply not known yet.
      </Text>
      {missing.map((item) => (
        <TouchableOpacity
          key={item.id}
          style={styles.checkRow}
          onPress={() => router.push('/profile/edit/vitals' as never)}
          accessibilityRole="button"
          accessibilityLabel={`Record ${item.label}`}
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.warning} />
          <Text style={styles.checkLabel}>{item.label}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: spacing.chipRadius,
    backgroundColor: colors.backgroundSecondary,
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
  bars: {
    marginTop: spacing.md,
  },
  barRow: {
    marginBottom: spacing.md,
  },
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.xs,
  },
  barLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  barValue: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.backgroundTertiary,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.textPrimary,
  },
  barFillCapped: {
    backgroundColor: colors.error,
  },
  block: {
    marginTop: spacing.xxl,
  },
  blockTitle: {
    ...typography.overline,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
  },
  blockCaption: {
    ...typography.caption,
    color: colors.textTertiary,
    marginBottom: spacing.md,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
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
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.xs,
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
    ...typography.numeric,
    color: colors.textPrimary,
  },
  driverDeltaUnassessed: {
    color: colors.warning,
  },
  subCard: {
    padding: spacing.lg,
    borderRadius: spacing.cardRadius,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
  },
  subHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  subLabel: {
    ...typography.headline,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  subScore: {
    ...typography.numeric,
    color: colors.textPrimary,
  },
  subBand: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  subDetail: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  checkLabel: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    flex: 1,
  },
});
