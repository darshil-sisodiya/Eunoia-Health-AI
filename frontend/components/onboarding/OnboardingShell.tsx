import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadows, spacing, typography } from '../../constants/theme';

export type OnboardingShellProps = {
  /** 1-based current step index (1..totalSteps). */
  step: number;
  /** Total number of steps in the flow. Defaults to 7 (per design § "Step 1–7"). */
  totalSteps?: number;
  /** Categorical label rendered above the body (typography.overline). */
  eyebrow: string;
  /** Disables the primary CTA when false. */
  canAdvance: boolean;
  /** Invoked when the back affordance is tapped. */
  onBack?: () => void;
  /** Invoked when the primary CTA is tapped. */
  onAdvance: () => void;
  /** Primary CTA copy. Defaults to "Continue". */
  advanceLabel?: string;
  /** Body content rendered between the eyebrow and the footer. */
  children: React.ReactNode;
  /**
   * Whether the back affordance may be rendered. Defaults to `true`.
   * Even when `true`, the back button is suppressed on `step === 1`.
   */
  showBack?: boolean;
};

/**
 * Shell around each onboarding step. Provides the top-bar / progress-bar /
 * footer pattern shared by every step.
 *
 * Visual contract (Requirements 16.5, 17.1, 17.2):
 *   - Brand text `EUNOIA` in `typography.overline`, `colors.textPrimary`.
 *   - Step indicator `NN / NN` using `typography.overline`; the active part
 *     uses `colors.textPrimary` and the trailing ` / NN` uses
 *     `colors.textMuted`.
 *   - Progress bar is 2 px tall, track `colors.divider`, fill
 *     `colors.textPrimary`. Width animates via `Animated.timing` over
 *     200 ms whenever `step` changes.
 *   - Footer: optional back button on the left, primary CTA on the right
 *     (`colors.inkSurface` background, disabled state at 0.4 opacity).
 *
 * All values come from `frontend/constants/theme.ts`; no inline color,
 * spacing, or typography literals.
 */
export default function OnboardingShell({
  step,
  totalSteps = 7,
  eyebrow,
  canAdvance,
  onBack,
  onAdvance,
  advanceLabel = 'Continue',
  children,
  showBack = true,
}: OnboardingShellProps) {
  // Driven 0..1 progress value. The inner fill width interpolates to a
  // percentage string so the bar sizes itself relative to its container
  // (Requirement 17.2: "(step / totalSteps) * containerWidth").
  const initialProgress = clampProgress(step, totalSteps);
  const progress = useRef(new Animated.Value(initialProgress)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: clampProgress(step, totalSteps),
      duration: 200,
      easing: Easing.out(Easing.cubic),
      // Width is not animatable on the native driver, so we run on JS.
      useNativeDriver: false,
    }).start();
  }, [step, totalSteps, progress]);

  const fillWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const stepLabel = pad2(step);
  const totalLabel = pad2(totalSteps);
  const accessibilityStepLabel = `Step ${step} of ${totalSteps}`;
  const showBackButton = showBack && step > 1 && typeof onBack === 'function';
  const advanceDisabled = !canAdvance;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      {/* ── Top bar ─────────────────────────────────────── */}
      <View style={styles.topBar}>
        <Text style={styles.brandText}>EUNOIA</Text>
        <Text style={styles.stepIndicator}>
          <Text style={styles.stepIndicatorActive}>{stepLabel}</Text>
          <Text style={styles.stepIndicatorMuted}>{` / ${totalLabel}`}</Text>
        </Text>
      </View>

      {/* ── Progress ─────────────────────────────────────── */}
      <View style={styles.progressContainer}>
        <View
          style={styles.progressBar}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={accessibilityStepLabel}
          accessibilityLiveRegion="polite"
          accessibilityValue={{ min: 0, max: totalSteps, now: step }}
        >
          <Animated.View
            style={[styles.progressFill, { width: fillWidth }]}
          />
        </View>
      </View>

      {/* ── Body ─────────────────────────────────────────── */}
      <View style={styles.body}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <View style={styles.bodyContent}>{children}</View>
      </View>

      {/* ── Footer actions ──────────────────────────────── */}
      <View style={styles.footer}>
        {showBackButton ? (
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBack}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={18} color={colors.textPrimary} />
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backSpacer} />
        )}

        <TouchableOpacity
          style={[styles.nextButton, advanceDisabled && styles.buttonDisabled]}
          onPress={onAdvance}
          disabled={advanceDisabled}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel={advanceLabel}
          accessibilityState={{ disabled: advanceDisabled }}
        >
          <Text style={styles.nextButtonText}>{advanceLabel}</Text>
          <Ionicons name="arrow-forward" size={18} color={colors.textInverse} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function pad2(n: number): string {
  const safe = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  return String(safe).padStart(2, '0');
}

function clampProgress(step: number, totalSteps: number): number {
  if (!Number.isFinite(step) || !Number.isFinite(totalSteps) || totalSteps <= 0) {
    return 0;
  }
  const ratio = step / totalSteps;
  if (ratio <= 0) return 0;
  if (ratio >= 1) return 1;
  return ratio;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  brandText: {
    ...typography.overline,
    color: colors.textPrimary,
  },
  stepIndicator: {
    ...typography.overline,
  },
  stepIndicatorActive: {
    color: colors.textPrimary,
  },
  stepIndicatorMuted: {
    color: colors.textMuted,
  },
  progressContainer: {
    paddingHorizontal: spacing.screenPadding,
    marginBottom: spacing.xxxl,
  },
  progressBar: {
    height: 2,
    backgroundColor: colors.divider,
    borderRadius: 1,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.textPrimary,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  eyebrow: {
    ...typography.overline,
    color: colors.textTertiary,
    marginBottom: spacing.md,
  },
  bodyContent: {
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.background,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  backSpacer: {
    width: 80,
    height: 48,
  },
  backButtonText: {
    ...typography.callout,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.inkSurface,
    borderRadius: spacing.buttonRadius,
    paddingVertical: 14,
    paddingHorizontal: spacing.xxl,
    ...shadows.md,
  },
  nextButtonText: {
    ...typography.headline,
    color: colors.textInverse,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
});
