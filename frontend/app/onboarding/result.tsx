import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';

import { colors, fonts, spacing, typography } from '../../constants/theme';
import { ONBOARDING_COPY } from '../../constants/onboarding';
import { Button, Notice } from '../../components/ui';
import { ConfidencePill, TopDrivers, toneColors } from '../../components/health/RiskBreakdown';
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
import { buildAnalyzePayload } from '../../utils/onboardingPayload';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * Result Screen — final step of the Eunoia onboarding flow.
 *
 * The reveal: an indigo hero with the wellness score in Young Serif, a
 * marigold arc that sweeps to the score (still when reduced motion is on),
 * the risk level chip and how complete the picture is. Below it, the top
 * drivers, then the AI insight cards.
 *
 *   - When `ai_insights_unavailable === true`, the AI cards are replaced by
 *     a single calm notice. The deterministic hereditary card is still
 *     rendered because it is fed by the Risk Engine's
 *     `contributing_factors`, not by Gemini.
 *   - The one primary action ("Return to home") is pinned below the
 *     scroll. On press, if the response carries a non-zero `report_id` the
 *     screen skips `POST /api/save-report` and navigates straight to
 *     `/(tabs)/home`. Otherwise it calls `saveReport(payload, token)`,
 *     awaits its resolution, then navigates. In both branches the
 *     AsyncStorage onboarding draft is flushed via `clearDraft()` and the
 *     in-memory `OnboardingContext` is `reset()` (Requirement 15.7). On
 *     `saveReport` failure an inline error notice appears above the button
 *     and pressing it again retries (Requirement 18.4).
 *
 * The screen receives the `AnalyzeRiskResponse` via Expo Router params
 * pushed by the analyzing screen. `useLocalSearchParams` may type the
 * parsed `response` as `string | string[]`, so the parser handles both
 * forms defensively and renders nothing destructive on a malformed payload.
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
  // above the CTA — pressing the CTA again retries.
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
          // Rebuilt with the same helper the analyzing screen used, so the
          // snapshot cannot drift from the body that was actually scored.
          // This matters more than it used to: the backend now recomputes the
          // score from this snapshot rather than trusting the numbers above.
          payload_snapshot: buildAnalyzePayload(draft),
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
  }, [draft, reset, response, savePending, token]);

  if (response === null) {
    // Defensive fallback: the analyzing screen failed to forward a valid
    // response (e.g. a deep link straight into /onboarding/result).
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.fallback}>
          <Text style={styles.fallbackTitle} accessibilityRole="header">
            Your results didn’t load here
          </Text>
          <Text style={styles.fallbackBody}>
            If your report was saved, you’ll find it on Home.
          </Text>
          <Button
            label="Go to home"
            onPress={() => router.replace('/(tabs)/home')}
            style={styles.fallbackButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  const aiUnavailable = response.ai_insights_unavailable === true;
  const insights = response.insights;
  const hereditaryFactors = response.contributing_factors.filter((factor) =>
    factor.dimension.startsWith('family_history.'),
  );
  const tone = toneColors(response.risk_level);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle} accessibilityRole="header">
          Your health profile is ready
        </Text>

        {/* ── Hero ───────────────────────────────────────── */}
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>{ONBOARDING_COPY.result.scoreLabel}</Text>
          <ScoreArc score={response.risk_score} />
          <View
            style={[styles.riskChip, { backgroundColor: tone.bg }]}
            accessible
            accessibilityLabel={`${ONBOARDING_COPY.result.riskLabel}: ${response.risk_level}`}
          >
            <View style={[styles.riskDot, { backgroundColor: tone.fg }]} />
            <Text style={[styles.riskChipText, { color: tone.fg }]}>
              {`${response.risk_level} risk`}
            </Text>
          </View>
          <View style={styles.heroPill}>
            <ConfidencePill report={response} />
          </View>
        </View>

        <View style={styles.stack}>
          <TopDrivers report={response} limit={3} linked={false} />

          <Text style={styles.sectionTitle} accessibilityRole="header">
            Your personal insights
          </Text>

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

          {/* Deterministic — driven by `contributing_factors` from the Risk
              Engine, so it renders in both happy-path and AI-unavailable modes. */}
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

      {/* ── Primary action, always in reach ──────────────── */}
      <View style={styles.footer}>
        {saveError ? (
          <Notice tone="error">We couldn’t save your report. Check your connection and press the button again.</Notice>
        ) : null}
        <Button
          label={ONBOARDING_COPY.result.primaryCta}
          onPress={handleReturnHome}
          loading={savePending}
        />
      </View>
    </SafeAreaView>
  );
}

// ── Score arc ────────────────────────────────────────────────────
// Sweeps up to the score once on arrival; skipped under reduced motion.

function ScoreArc({ score }: { score: number }) {
  const width = 264;
  const stroke = 14;
  const r = (width - stroke) / 2;
  const cy = r + stroke / 2;
  const height = cy + stroke / 2;
  const arcLength = Math.PI * r;
  const progress = Math.max(0, Math.min(score / 100, 1));
  const d = `M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${width - stroke / 2} ${cy}`;

  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (!alive) return;
        if (reduce) {
          sweep.setValue(progress);
          return;
        }
        Animated.timing(sweep, {
          toValue: progress,
          duration: 1300,
          delay: 250,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start();
      });
    return () => {
      alive = false;
    };
  }, [progress, sweep]);

  const dashOffset = sweep.interpolate({ inputRange: [0, 1], outputRange: [arcLength, 0] });

  return (
    <View
      style={styles.arc}
      accessible
      accessibilityLabel={`${ONBOARDING_COPY.result.scoreLabel} ${score} ${ONBOARDING_COPY.result.scoreOutOf}`}
    >
      <Svg width={width} height={height}>
        <Path d={d} stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} fill="none" strokeLinecap="round" />
        <AnimatedPath
          d={d}
          stroke={colors.accent}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${arcLength}`}
          strokeDashoffset={dashOffset as any}
        />
      </Svg>
      <View style={styles.arcCenter}>
        <Text style={styles.score}>{score}</Text>
        <Text style={styles.scoreOutOf}>{ONBOARDING_COPY.result.scoreOutOf}</Text>
      </View>
    </View>
  );
}

// ── Cards ────────────────────────────────────────────────────────

/** Long AI sections start folded so the page stays scannable. */
const COLLAPSE_AT = 360;

function InsightCard({ title, body }: { title: string; body: string | undefined | null }) {
  const [open, setOpen] = useState(false);
  // A section can be missing for forwards-compat; suppress the card rather
  // than render an empty container.
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
  // Lifestyle optimization condenses three Gemini sections into one card,
  // each under its own small heading so it can be scanned.
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
  // Always rendered, even with zero family-history factors, so the
  // "your risk indicators are ready" promise has something to point at.
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

/**
 * `useLocalSearchParams` may type a single param as `string | string[]`
 * because Expo Router cannot statically rule out the array form. The
 * analyzing screen pushes a single value, so we accept either shape and
 * recover the first string. Anything else (undefined, empty array,
 * malformed JSON) returns `null` so the screen renders a calm empty
 * state rather than crashing.
 */
function parseResponseParam(raw: string | string[] | undefined): AnalyzeRiskResponse | null {
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

/** `family_history.<Condition>` → `<Condition>`. */
function extractCondition(dimension: string): string {
  const prefix = 'family_history.';
  return dimension.startsWith(prefix) ? dimension.slice(prefix.length) : dimension;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  pageTitle: {
    ...typography.largeTitle,
    color: colors.textPrimary,
    marginBottom: spacing.xl,
  },

  // ── Hero ────────────────────────────────────────────────────────
  hero: {
    backgroundColor: colors.inkSurface,
    borderRadius: spacing.cardRadiusXl,
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    alignItems: 'center',
  },
  heroLabel: {
    ...typography.headline,
    color: colors.textInverse,
    alignSelf: 'flex-start',
    marginBottom: spacing.xl,
  },
  arc: {
    alignItems: 'center',
  },
  arcCenter: {
    position: 'absolute',
    bottom: -6,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  score: {
    ...typography.mega,
    fontSize: 80,
    lineHeight: 84,
    color: colors.textInverse,
    fontVariant: ['tabular-nums'],
  },
  scoreOutOf: {
    ...typography.caption,
    color: colors.textInverseMuted,
  },
  riskChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: spacing.chipRadius,
    marginTop: spacing.xxl,
  },
  riskDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  riskChipText: {
    ...typography.callout,
    fontFamily: fonts.semibold,
  },
  heroPill: {
    marginTop: spacing.md,
    alignItems: 'center',
  },

  // ── Cards ───────────────────────────────────────────────────────
  stack: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  sectionTitle: {
    ...typography.title,
    color: colors.textPrimary,
    marginTop: spacing.lg,
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

  // ── Footer ──────────────────────────────────────────────────────
  footer: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },

  // ── Fallback empty state ────────────────────────────────────────
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.screenPadding,
    gap: spacing.sm,
  },
  fallbackTitle: {
    ...typography.title,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  fallbackBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  fallbackButton: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
  },
});
