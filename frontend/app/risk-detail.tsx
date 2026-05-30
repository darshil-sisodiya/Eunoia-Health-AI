import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, typography } from '../constants/theme';
import { ONBOARDING_COPY } from '../constants/onboarding';
import { useAuth } from '../contexts/AuthContext';
import {
  getReports,
  type AnalyzeRiskResponse,
  type ContributingFactor,
  type GeminiInsights,
} from '../utils/onboardingApi';

/**
 * Risk Detail Screen.
 *
 * Renders the same content the user saw at the end of onboarding
 * (wellness score, risk level, hereditary indicators, AI insights)
 * for any persisted report on the user's history. Reached from the
 * dashboard's Risk Score card.
 *
 * Routing:
 *   - With no params it loads the latest report (head of `/api/reports`).
 *   - With `?id=<n>` it loads the matching report from the same list.
 *
 * Visual language matches onboarding/result.tsx so the user experiences
 * a consistent presentation between first-time onboarding and dashboard
 * review.
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
      setError('Please sign in again to view your report.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const reports = await getReports(token);
      if (reports.length === 0) {
        setReport(null);
        setError('No reports available yet.');
        return;
      }
      const picked =
        requestedId != null
          ? reports.find((r) => r.report_id === requestedId) ?? reports[0]
          : reports[0];
      setReport(picked);
    } catch (e) {
      console.warn('RiskDetail: getReports failed', e);
      setError('Unable to load your report. Pull to retry.');
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
        <Header onBack={handleBack} />
        <View style={styles.center}>
          <ActivityIndicator size="small" color={colors.textTertiary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !report) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <Header onBack={handleBack} />
        <View style={styles.center}>
          <Text style={styles.errorEyebrow}>{ONBOARDING_COPY.result.eyebrow}</Text>
          <Text style={styles.errorText}>{error ?? 'Report not found.'}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={load}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Retry"
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const aiUnavailable = report.ai_insights_unavailable === true;
  const insights = report.insights;
  const hereditaryFactors = report.contributing_factors.filter((factor) =>
    factor.dimension.startsWith('family_history.'),
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <Header onBack={handleBack} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero} accessibilityRole="header">
          <Text style={styles.heroEyebrow}>{ONBOARDING_COPY.result.eyebrow}</Text>
          <Text
            style={styles.wellnessScore}
            accessibilityLabel={`${ONBOARDING_COPY.result.wellnessLabel} ${report.wellness_score}`}
          >
            {report.wellness_score}
          </Text>
          <Text style={styles.wellnessLabel}>{ONBOARDING_COPY.result.wellnessLabel}</Text>

          <View
            style={styles.riskBadge}
            accessibilityRole="text"
            accessibilityLabel={`${ONBOARDING_COPY.result.riskLabel} ${report.risk_level}`}
          >
            <Text style={styles.riskBadgeLabel}>{`${ONBOARDING_COPY.result.riskLabel} · `}</Text>
            <Text style={styles.riskBadgeValue}>{report.risk_level}</Text>
          </View>

          <Text style={styles.timestamp}>{formatTimestamp(report.created_at)}</Text>
        </View>

        {/* Trend placeholder */}
        <View
          style={styles.trendPlaceholder}
          accessibilityRole="text"
          accessibilityLabel={ONBOARDING_COPY.result.sections.trendPlaceholder}
        >
          <Text style={styles.trendPlaceholderText}>
            {ONBOARDING_COPY.result.sections.trendPlaceholder}
          </Text>
        </View>

        {/* Cards */}
        {aiUnavailable ? (
          <AiUnavailablePanel />
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

        <TouchableOpacity
          style={styles.primaryCta}
          onPress={handleBack}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="Back to dashboard"
        >
          <Text style={styles.primaryCtaText}>Back to dashboard</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Header ───────────────────────────────────────────────────────

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.headerBtn}
        onPress={onBack}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Health Report</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

// ── Card primitives (mirroring onboarding/result.tsx) ────────────

function InsightCard({ title, body }: { title: string; body: string | undefined | null }) {
  const trimmed = typeof body === 'string' ? body.trim() : '';
  if (!trimmed) return null;
  return (
    <View style={styles.card} accessibilityRole="summary">
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{trimmed}</Text>
    </View>
  );
}

function LifestyleCard({ insights }: { insights: GeminiInsights | null | undefined }) {
  const sections = [
    insights?.lifestyle_recommendations,
    insights?.diet_suggestions,
    insights?.exercise_guidance,
  ]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value.length > 0);

  if (sections.length === 0) return null;

  return (
    <View style={styles.card} accessibilityRole="summary">
      <Text style={styles.cardTitle}>
        {ONBOARDING_COPY.result.sections.lifestyleOptimization}
      </Text>
      {sections.map((section, index) => (
        <Text
          key={`lifestyle-${index}`}
          style={[styles.cardBody, index < sections.length - 1 && styles.cardBodyParagraph]}
        >
          {section}
        </Text>
      ))}
    </View>
  );
}

function HereditaryCard({ factors }: { factors: ContributingFactor[] }) {
  return (
    <View style={styles.card} accessibilityRole="summary">
      <Text style={styles.cardTitle}>
        {ONBOARDING_COPY.result.sections.hereditaryIndicators}
      </Text>
      {factors.length === 0 ? (
        <Text style={styles.cardBody}>—</Text>
      ) : (
        factors.map((factor) => (
          <View
            key={factor.dimension}
            style={styles.hereditaryRow}
            accessibilityRole="text"
            accessibilityLabel={`${extractCondition(factor.dimension)}, ${factor.component}`}
          >
            <Text style={styles.hereditaryCondition}>
              {extractCondition(factor.dimension)}
            </Text>
            <Text style={styles.hereditaryComponent}>{factor.component}</Text>
          </View>
        ))
      )}
    </View>
  );
}

function AiUnavailablePanel() {
  return (
    <View style={styles.aiUnavailablePanel} accessibilityRole="text">
      <Text style={styles.aiUnavailableText}>
        {ONBOARDING_COPY.result.aiUnavailableMessage}
      </Text>
    </View>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

function extractCondition(dimension: string): string {
  const prefix = 'family_history.';
  if (dimension.startsWith(prefix)) {
    return dimension.slice(prefix.length);
  }
  return dimension;
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
    paddingHorizontal: spacing.screenPadding,
    gap: spacing.lg,
  },
  // ── Header ─────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    backgroundColor: colors.background,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  headerTitle: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  // ── Scroll ─────────────────────────────────────────────────────
  scrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxxl,
  },
  // ── Hero ───────────────────────────────────────────────────────
  hero: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  heroEyebrow: {
    ...typography.overline,
    color: colors.textTertiary,
    marginBottom: spacing.lg,
  },
  wellnessScore: {
    ...typography.numericLarge,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  wellnessLabel: {
    ...typography.callout,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  riskBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorderStrong,
    borderRadius: spacing.chipRadius,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  riskBadgeLabel: {
    ...typography.callout,
    color: colors.textTertiary,
  },
  riskBadgeValue: {
    ...typography.callout,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  timestamp: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.lg,
  },
  // ── Trend placeholder ──────────────────────────────────────────
  trendPlaceholder: {
    height: 140,
    backgroundColor: colors.skeleton,
    borderRadius: spacing.cardRadiusLg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  trendPlaceholderText: {
    ...typography.callout,
    color: colors.textTertiary,
  },
  // ── Cards ──────────────────────────────────────────────────────
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: spacing.cardRadiusLg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  cardTitle: {
    ...typography.headline,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  cardBody: {
    ...typography.body,
    color: colors.textSecondary,
  },
  cardBodyParagraph: {
    marginBottom: spacing.md,
  },
  hereditaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  hereditaryCondition: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  hereditaryComponent: {
    ...typography.caption,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  aiUnavailablePanel: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: spacing.cardRadiusLg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  aiUnavailableText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  // ── Primary CTA ────────────────────────────────────────────────
  primaryCta: {
    backgroundColor: colors.inkSurface,
    borderRadius: spacing.buttonRadius,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  primaryCtaText: {
    ...typography.headline,
    color: colors.textInverse,
  },
  // ── Error / empty ──────────────────────────────────────────────
  errorEyebrow: {
    ...typography.overline,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
  },
  errorText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: spacing.buttonRadius,
    backgroundColor: colors.inkSurface,
  },
  retryBtnText: {
    ...typography.headline,
    color: colors.textInverse,
  },
});
