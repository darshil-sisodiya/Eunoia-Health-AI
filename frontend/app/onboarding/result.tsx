import React, { useCallback, useMemo, useState } from 'react';
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

import { colors, spacing, typography } from '../../constants/theme';
import { ONBOARDING_COPY } from '../../constants/onboarding';
import { useAuth } from '../../contexts/AuthContext';
import { useOnboarding } from '../../contexts/OnboardingContext';
import {
  saveReport,
  type AnalyzeRiskResponse,
  type ContributingFactor,
  type GeminiInsights,
  type SaveReportRequest,
} from '../../utils/onboardingApi';
import { clearDraft } from '../../utils/onboardingDraft';

/**
 * Result Screen — final step of the Eunoia onboarding flow.
 *
 * Visual contract (Requirements 15.1–15.6, 16.1–16.6):
 *   - Hero block: centered `Wellness_Score` rendered in
 *     `typography.numericLarge` with the wellness label below it,
 *     followed by a single-tone Risk_Level badge built from
 *     `colors.surface`, `colors.surfaceBorderStrong`, and
 *     `colors.textPrimary` only — no new colors are introduced.
 *   - Trend graph slot: a placeholder skeleton card driven by
 *     `colors.skeleton`, with no real-data dependency.
 *   - Six analytics cards (`spacing.cardRadiusLg`, `colors.surfaceBorder`):
 *       1. Preventive insights
 *       2. Lifestyle optimization (recommendations + diet + exercise)
 *       3. Mental wellness recommendations
 *       4. Hereditary risk indicators (driven by `contributing_factors`
 *          whose `dimension` starts with `family_history.`)
 *       5. Long-term wellness awareness
 *       6. Habit optimization recommendations
 *   - When `ai_insights_unavailable === true`, all five AI-driven cards
 *     are replaced by a single calm panel containing the
 *     `aiUnavailableMessage` copy. The deterministic Hereditary risk
 *     indicators card (Card 4) is still rendered because it is fed by
 *     the Risk Engine's `contributing_factors`, not by Gemini.
 *   - "Return to home" CTA matches the Welcome screen's primary CTA.
 *     On press, if the response carries a non-zero `report_id` the
 *     screen skips `POST /api/save-report` and navigates straight to
 *     `/(tabs)/home`. Otherwise it calls `saveReport(payload, token)`,
 *     awaits its resolution, then navigates. In both branches the
 *     AsyncStorage onboarding draft is flushed via `clearDraft()` and
 *     the in-memory `OnboardingContext` is `reset()` (Requirement
 *     15.7). On `saveReport` failure the screen renders an inline
 *     recoverable error block above the CTA using the existing
 *     `colors.error`/`colors.errorSoft` tokens (Requirement 18.4)
 *     and tapping the CTA again retries.
 *
 * The screen receives the `AnalyzeRiskResponse` via Expo Router params
 * pushed by the analyzing screen (task 10.14). `useLocalSearchParams`
 * may type the parsed `response` as `string | string[]`, so the parser
 * handles both forms defensively and renders nothing destructive on a
 * malformed payload.
 *
 * All visuals consume tokens from `frontend/constants/theme.ts` and
 * copy from `frontend/constants/onboarding.ts`. No inline color,
 * spacing, typography, or copy literals.
 */
export default function Result() {
  const params = useLocalSearchParams<{ response?: string | string[] }>();
  const response = useMemo(() => parseResponseParam(params.response), [params.response]);

  const { token } = useAuth();
  const { draft, reset } = useOnboarding();

  // Persistence flow state (Requirements 15.7, 18.4). `savePending`
  // gates the CTA so a double tap cannot trigger two save-report
  // requests. `saveError` flips on when the optional save-report call
  // rejects so the screen can render an inline recoverable error
  // block above the CTA — tapping the CTA again retries.
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const handleReturnHome = useCallback(async () => {
    if (response === null) return;
    if (savePending) return;

    setSavePending(true);
    setSaveError(false);

    try {
      // Happy path through `/api/analyze-risk` already persisted the
      // report and surfaced its identifier in `report_id`. Anything
      // else (zero or null on a malformed payload) means we need to
      // call `/api/save-report` ourselves before navigating, so the
      // user's history reflects the report they are about to leave.
      if (response.report_id == null || response.report_id === 0) {
        const saveBody: SaveReportRequest = {
          wellness_score: response.wellness_score,
          risk_score: response.risk_score,
          risk_level: response.risk_level,
          contributing_factors: response.contributing_factors,
          insights: response.insights,
          ai_insights_unavailable: response.ai_insights_unavailable,
          // Best-effort snapshot reconstructed from the in-memory
          // draft. The Result Screen does not receive the original
          // `AnalyzeRiskRequest` directly; the analyzing screen built
          // it from the same draft slices, so this mirrors that
          // payload as closely as the type system allows. The
          // backend stores it as JSON, so any partial slice still
          // round-trips safely.
          payload_snapshot: {
            basic: draft.basic,
            lifestyle: draft.lifestyle,
            medical: draft.medical,
            family_history: { conditions: draft.family_history },
            location: draft.location,
          } as SaveReportRequest['payload_snapshot'],
        };
        await saveReport(saveBody, token ?? '');
      }

      // Flush the AsyncStorage onboarding draft and the in-memory
      // OnboardingContext state so a fresh onboarding never resumes
      // from a completed submission.
      await clearDraft();
      reset();
      router.replace('/(tabs)/home');
    } catch (err) {
      // `axiosDebug` already logs the failure via its response
      // interceptor (Requirement 18.4); we surface a recoverable
      // inline error so the user can retry without losing context.
      // eslint-disable-next-line no-console
      console.warn('Result: saveReport failed', err);
      setSaveError(true);
    } finally {
      setSavePending(false);
    }
  }, [
    draft.basic,
    draft.family_history,
    draft.lifestyle,
    draft.location,
    draft.medical,
    reset,
    response,
    savePending,
    token,
  ]);

  if (response === null) {
    // Defensive fallback: if the analyzing screen failed to forward a
    // valid response (e.g. deep link directly into /onboarding/result),
    // render a calm empty state that still honours the brand surface
    // and stays on monochrome neutrals.
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.fallback}>
          <Text style={styles.fallbackEyebrow}>{ONBOARDING_COPY.result.eyebrow}</Text>
          <Text style={styles.fallbackBody}>
            {ONBOARDING_COPY.result.aiUnavailableMessage}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const aiUnavailable = response.ai_insights_unavailable === true;
  const insights = response.insights;
  const hereditaryFactors = response.contributing_factors.filter((factor) =>
    factor.dimension.startsWith('family_history.'),
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero block ─────────────────────────────────── */}
        <View style={styles.hero} accessibilityRole="header">
          <Text style={styles.heroEyebrow}>{ONBOARDING_COPY.result.eyebrow}</Text>
          <Text
            style={styles.wellnessScore}
            accessibilityLabel={`${ONBOARDING_COPY.result.wellnessLabel} ${response.wellness_score}`}
          >
            {response.wellness_score}
          </Text>
          <Text style={styles.wellnessLabel}>
            {ONBOARDING_COPY.result.wellnessLabel}
          </Text>

          <View
            style={styles.riskBadge}
            accessibilityRole="text"
            accessibilityLabel={`${ONBOARDING_COPY.result.riskLabel} ${response.risk_level}`}
          >
            <Text style={styles.riskBadgeLabel}>
              {`${ONBOARDING_COPY.result.riskLabel} · `}
            </Text>
            <Text style={styles.riskBadgeValue}>{response.risk_level}</Text>
          </View>
        </View>

        {/* ── Trend graph placeholder ────────────────────── */}
        <View
          style={styles.trendPlaceholder}
          accessibilityRole="text"
          accessibilityLabel={ONBOARDING_COPY.result.sections.trendPlaceholder}
        >
          <Text style={styles.trendPlaceholderText}>
            {ONBOARDING_COPY.result.sections.trendPlaceholder}
          </Text>
        </View>

        {/* ── Analytics cards ────────────────────────────── */}
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

        {/* The hereditary indicators card is deterministic — it is
            driven by `contributing_factors` from the Risk Engine, so it
            is rendered in both happy-path and AI-unavailable modes. */}
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

        {/* ── Primary CTA ────────────────────────────────── */}
        {saveError && (
          <View
            style={styles.saveErrorBlock}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <Text style={styles.saveErrorText}>
              {ONBOARDING_COPY.result.saveErrorMessage}
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.primaryCta, savePending && styles.primaryCtaDisabled]}
          onPress={handleReturnHome}
          activeOpacity={0.9}
          disabled={savePending}
          accessibilityRole="button"
          accessibilityLabel={ONBOARDING_COPY.result.primaryCta}
          accessibilityState={{ disabled: savePending, busy: savePending }}
        >
          {savePending ? (
            <ActivityIndicator size="small" color={colors.textInverse} />
          ) : (
            <Text style={styles.primaryCtaText}>
              {ONBOARDING_COPY.result.primaryCta}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Card primitives ──────────────────────────────────────────────

type InsightCardProps = {
  title: string;
  body: string | undefined | null;
};

function InsightCard({ title, body }: InsightCardProps) {
  // If the AI section came back empty (whitespace-only would have been
  // mapped to `ai_insights_unavailable: true` upstream, but a section
  // can still be missing for forwards-compat), suppress the card to
  // keep the screen calm rather than rendering an empty container.
  const trimmed = typeof body === 'string' ? body.trim() : '';
  if (!trimmed) return null;
  return (
    <View style={styles.card} accessibilityRole="summary">
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{trimmed}</Text>
    </View>
  );
}

type LifestyleCardProps = {
  insights: GeminiInsights | null | undefined;
};

function LifestyleCard({ insights }: LifestyleCardProps) {
  // Lifestyle optimization is the condensed view of three Gemini
  // sections (Requirement 15.1, design § "Result Screen"): lifestyle
  // recommendations, diet suggestions, and exercise guidance. They are
  // rendered as up to three sub-paragraphs so each retains its voice
  // while still living inside one analytics card.
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
          style={[
            styles.cardBody,
            index < sections.length - 1 && styles.cardBodyParagraph,
          ]}
        >
          {section}
        </Text>
      ))}
    </View>
  );
}

type HereditaryCardProps = {
  factors: ContributingFactor[];
};

function HereditaryCard({ factors }: HereditaryCardProps) {
  // The hereditary indicators card is always rendered — even when
  // there are zero family-history factors — so the user has a stable
  // anchor that "your hereditary risk indicators are ready", which is
  // the deterministic guarantee the AI-unavailable copy refers to.
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

/**
 * `useLocalSearchParams` may type a single param as `string | string[]`
 * because Expo Router cannot statically rule out the array form. The
 * analyzing screen pushes a single value, so we accept either shape and
 * recover the first string. Anything else (undefined, empty array,
 * malformed JSON) returns `null` so the screen renders a calm empty
 * state rather than crashing.
 */
function parseResponseParam(
  raw: string | string[] | undefined,
): AnalyzeRiskResponse | null {
  if (raw == null) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || value.length === 0) return null;
  try {
    const parsed = JSON.parse(value) as AnalyzeRiskResponse;
    if (parsed == null || typeof parsed !== 'object') return null;
    if (typeof parsed.wellness_score !== 'number') return null;
    if (typeof parsed.risk_level !== 'string') return null;
    if (!Array.isArray(parsed.contributing_factors)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * `family_history.<Condition>` → `<Condition>`. For dimensions that do
 * not match the prefix (defensive guard; the caller already filters by
 * prefix) the original string is returned unchanged so nothing is lost.
 */
function extractCondition(dimension: string): string {
  const prefix = 'family_history.';
  if (dimension.startsWith(prefix)) {
    return dimension.slice(prefix.length);
  }
  return dimension;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxxl,
  },
  // ── Hero ────────────────────────────────────────────────────────
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
  // ── Trend placeholder ───────────────────────────────────────────
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
  // ── Cards ───────────────────────────────────────────────────────
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
  // ── Hereditary rows ─────────────────────────────────────────────
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
  // ── AI unavailable panel ────────────────────────────────────────
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
  // ── Primary CTA (matches welcome screen) ────────────────────────
  primaryCta: {
    backgroundColor: colors.inkSurface,
    borderRadius: spacing.buttonRadius,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  primaryCtaDisabled: {
    opacity: 0.7,
  },
  primaryCtaText: {
    ...typography.headline,
    color: colors.textInverse,
  },
  // ── Inline save-report error (Requirement 18.4) ─────────────────
  saveErrorBlock: {
    backgroundColor: colors.errorSoft,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: spacing.cardRadiusLg,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  saveErrorText: {
    ...typography.callout,
    color: colors.error,
    textAlign: 'center',
  },
  // ── Fallback empty state ────────────────────────────────────────
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.screenPadding,
  },
  fallbackEyebrow: {
    ...typography.overline,
    color: colors.textTertiary,
    marginBottom: spacing.lg,
  },
  fallbackBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
