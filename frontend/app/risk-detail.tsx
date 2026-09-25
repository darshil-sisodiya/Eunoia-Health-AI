import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts, spacing, typography } from '../constants/theme';
import { ONBOARDING_COPY } from '../constants/onboarding';
import { Button, Notice, ScreenHeader } from '../components/ui';
import {
  ComponentBars,
  ConfidencePill,
  GetCheckedCard,
  SubScores,
  TopDrivers,
  toneColors,
} from '../components/health/RiskBreakdown';
import { componentBars } from '../utils/riskView';
import { useAuth } from '../contexts/AuthContext';
import {
  getReports,
  type AnalyzeRiskResponse,
  type ContributingFactor,
  type GeminiInsights,
} from '../utils/onboardingApi';

const NO_REPORTS = "You don't have a report yet. Answer a few questions about your health to get one.";

/**
 * Risk Detail Screen.
 *
 * Renders the same content the user saw at the end of onboarding
 * (wellness score, risk level, hereditary indicators, AI insights)
 * for any persisted report on the user's history. Reached from the
 * dashboard's wellness card.
 *
 * Routing:
 *   - With no params it loads the latest report (head of `/api/reports`).
 *   - With `?id=<n>` it loads the matching report from the same list.
 */
export default function RiskDetail() {
  const { token } = useAuth();
  const params = useLocalSearchParams<{ id?: string }>();
  const requestedId = useMemo(() => {
    const raw = Array.isArray(params.id) ? params.id[0] : params.id;
    if (raw == null || raw === '') return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }, [params.id]);

  const [report, setReport] = useState<AnalyzeRiskResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setError('Your session has ended. Sign in again to view your report.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const reports = await getReports(token);
      if (reports.length === 0) {
        setReport(null);
        setError(NO_REPORTS);
        return;
      }
      const picked =
        requestedId != null
          ? reports.find((r) => r.report_id === requestedId) ?? reports[0]
          : reports[0];
      setReport(picked);
    } catch (e) {
      console.warn('RiskDetail: getReports failed', e);
      setError("Your report didn't load. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [token, requestedId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/home');
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <ScreenHeader title="Health report" onBack={handleBack} />
        <View style={styles.center}>
          <ActivityIndicator size="small" color={colors.textTertiary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !report) {
    const empty = error === NO_REPORTS;
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <ScreenHeader title="Health report" onBack={handleBack} />
        <View style={styles.body}>
          {empty ? (
            <View style={styles.card}>
              <Text style={styles.cardBody}>{NO_REPORTS}</Text>
              <Button
                label="Build your health profile"
                onPress={() => router.push('/onboarding/welcome' as any)}
                style={styles.emptyButton}
              />
            </View>
          ) : (
            <>
              <Notice tone="error">{error ?? "This report couldn't be found."}</Notice>
              <Button label="Try again" variant="secondary" onPress={load} style={styles.emptyButton} />
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const aiUnavailable = report.ai_insights_unavailable === true;
  const insights = report.insights;
  const hereditaryFactors = report.contributing_factors.filter((factor) =>
    factor.dimension.startsWith('family_history.'),
  );
  const tone = toneColors(report.risk_level);
  const hasBars = componentBars(report).length > 0;
  const timestamp = formatTimestamp(report.created_at);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          title="Health report"
          subtitle={timestamp ? `Assessed ${timestamp}` : undefined}
          onBack={handleBack}
        />

        <View style={styles.body}>
          {/* ── Hero ───────────────────────────────────── */}
          <View
            style={styles.hero}
            accessible
            accessibilityLabel={`${ONBOARDING_COPY.result.scoreLabel} ${report.risk_score} ${ONBOARDING_COPY.result.scoreOutOf}, ${report.risk_level} risk`}
          >
            <Text style={styles.heroLabel}>{ONBOARDING_COPY.result.scoreLabel}</Text>
            <View style={styles.scoreRow}>
              <Text style={styles.score}>{report.risk_score}</Text>
              <View style={styles.scoreSide}>
                <Text style={styles.scoreOutOf}>{ONBOARDING_COPY.result.scoreOutOf}</Text>
                <View style={[styles.riskChip, { backgroundColor: tone.bg }]}>
                  <View style={[styles.riskDot, { backgroundColor: tone.fg }]} />
                  <Text style={[styles.riskChipText, { color: tone.fg }]}>
                    {`${report.risk_level} risk`}
                  </Text>
                </View>
              </View>
            </View>
            {/* How much of the picture this is based on, rather than
                presenting a partly-informed score as a settled fact. */}
            <ConfidencePill report={report} />
          </View>

          {/* Where the score comes from: each component against its own cap,
              the biggest drivers, the recognised screening scores, and what
              is still unknown. */}
          {hasBars ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle} accessibilityRole="header">
                Where this comes from
              </Text>
              <Text style={styles.cardCaption}>Each area measured against its own maximum.</Text>
              <ComponentBars report={report} />
            </View>
          ) : null}
          <TopDrivers report={report} />
          <SubScores report={report} />
          <GetCheckedCard report={report} />

          {/* ── AI insights ────────────────────────────── */}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              Your personal insights
            </Text>
            <Text style={styles.sectionCaption}>
              Written for you from your answers. Not a diagnosis.
            </Text>
          </View>

          {aiUnavailable ? (
            <Notice tone="info">{ONBOARDING_COPY.result.aiUnavailableMessage}</Notice>
          ) : (
            <>
              <InsightCard
                title={ONBOARDING_COPY.result.sections.preventiveInsights}
                body={insights?.preventive_health_insights}
              />
              <LifestyleCard insights={insights} />
              <InsightCard
                title={ONBOARDING_COPY.result.sections.mentalWellness}
                body={insights?.mental_wellness_improvements}
              />
            </>
          )}

          <HereditaryCard factors={hereditaryFactors} />

          {!aiUnavailable && (
            <>
              <InsightCard
                title={ONBOARDING_COPY.result.sections.longTermAwareness}
                body={insights?.long_term_wellness_awareness}
              />
              <InsightCard
                title={ONBOARDING_COPY.result.sections.habitOptimization}
                body={insights?.habit_optimization_recommendations}
              />
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Cards (mirroring onboarding/result.tsx) ──────────────────────

/** Long AI sections start folded so the report stays scannable. */
const COLLAPSE_AT = 360;

function InsightCard({ title, body }: { title: string; body: string | undefined | null }) {
  const [open, setOpen] = useState(false);
  const trimmed = typeof body === 'string' ? body.trim() : '';
  if (!trimmed) return null;
  const long = trimmed.length > COLLAPSE_AT;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.cardBody} numberOfLines={long && !open ? 5 : undefined}>
        {trimmed}
      </Text>
      {long ? (
        <Pressable
          onPress={() => setOpen((o) => !o)}
          hitSlop={10}
          style={({ pressed }) => [styles.more, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={open ? `Show less of ${title}` : `Read all of ${title}`}
          accessibilityState={{ expanded: open }}
        >
          <Text style={styles.moreText}>{open ? 'Show less' : 'Read more'}</Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textPrimary} />
        </Pressable>
      ) : null}
    </View>
  );
}

function LifestyleCard({ insights }: { insights: GeminiInsights | null | undefined }) {
  const sections = [
    { label: 'Daily habits', text: insights?.lifestyle_recommendations },
    { label: 'Diet', text: insights?.diet_suggestions },
    { label: 'Exercise', text: insights?.exercise_guidance },
  ]
    .map((s) => ({ ...s, text: typeof s.text === 'string' ? s.text.trim() : '' }))
    .filter((s) => s.text.length > 0);

  if (sections.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle} accessibilityRole="header">
        {ONBOARDING_COPY.result.sections.lifestyleOptimization}
      </Text>
      {sections.map((section) => (
        <View key={section.label} style={styles.subsection}>
          <Text style={styles.subsectionLabel}>{section.label}</Text>
          <Text style={styles.cardBody}>{section.text}</Text>
        </View>
      ))}
    </View>
  );
}

function HereditaryCard({ factors }: { factors: ContributingFactor[] }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle} accessibilityRole="header">
        {ONBOARDING_COPY.result.sections.hereditaryIndicators}
      </Text>
      {factors.length === 0 ? (
        <Text style={styles.cardBody}>No family history recorded.</Text>
      ) : (
        factors.map((factor, index) => (
          <View
            key={factor.dimension}
            style={[styles.hereditaryRow, index > 0 && styles.rowDivider]}
            accessible
            accessibilityLabel={`${extractCondition(factor.dimension)}, adds ${factor.delta}`}
          >
            <Text style={styles.hereditaryCondition}>{extractCondition(factor.dimension)}</Text>
            <Text style={styles.hereditaryDelta}>{`+${factor.delta}`}</Text>
          </View>
        ))
      )}
    </View>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

function extractCondition(dimension: string): string {
  const prefix = 'family_history.';
  return dimension.startsWith(prefix) ? dimension.slice(prefix.length) : dimension;
}

function formatTimestamp(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: spacing.xxxl,
  },
  body: {
    paddingHorizontal: spacing.screenPadding,
    gap: spacing.md,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  emptyButton: {
    marginTop: spacing.lg,
  },

  // ── Hero ───────────────────────────────────────────────────────
  hero: {
    backgroundColor: colors.inkSurface,
    borderRadius: spacing.cardRadiusXl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  heroLabel: {
    ...typography.headline,
    color: colors.textInverse,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  score: {
    ...typography.mega,
    fontSize: 80,
    lineHeight: 84,
    color: colors.textInverse,
    fontVariant: ['tabular-nums'],
  },
  scoreSide: {
    paddingBottom: 12,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  scoreOutOf: {
    ...typography.callout,
    color: colors.textInverseMuted,
  },
  riskChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: spacing.chipRadius,
  },
  riskDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  riskChipText: {
    ...typography.caption,
    fontFamily: fonts.semibold,
  },

  // ── Sections & cards ───────────────────────────────────────────
  sectionHead: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  sectionCaption: {
    ...typography.caption,
    fontFamily: fonts.regular,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: spacing.cardRadiusLg,
    padding: spacing.xl,
  },
  cardTitle: {
    ...typography.title,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  cardCaption: {
    ...typography.caption,
    fontFamily: fonts.regular,
    color: colors.textTertiary,
    marginTop: -spacing.xs,
    marginBottom: spacing.lg,
  },
  cardBody: {
    ...typography.body,
    color: colors.textSecondary,
  },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    minHeight: 32,
    marginTop: spacing.sm,
  },
  moreText: {
    ...typography.callout,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
  },
  subsection: {
    marginTop: spacing.md,
  },
  subsectionLabel: {
    ...typography.headline,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  hereditaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 48,
    paddingVertical: spacing.sm,
  },
  hereditaryCondition: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    flex: 1,
  },
  hereditaryDelta: {
    ...typography.headline,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
});
