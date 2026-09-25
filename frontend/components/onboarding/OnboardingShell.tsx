import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '../../constants/theme';
import { BrandMark, Button, IconButton } from '../ui';

export type OnboardingShellProps = {
  /** 1-based current step index (1..totalSteps). */
  step: number;
  /**
   * Total number of steps for THIS user.
   *
   * Required, with no default: the flow is adaptive, so the count depends on
   * the draft. A default of 7 would quietly render the wrong denominator for
   * anyone whose flow branches.
   */
  totalSteps: number;
  /** Which part of the profile this step covers, shown above the body. */
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
 * Shell around each onboarding step: back + step count, a segmented
 * progress track (one segment per step, since the flow really is a
 * sequence), the body, and a full-width primary action.
 */
export default function OnboardingShell({
  step,
  totalSteps,
  eyebrow,
  canAdvance,
  onBack,
  onAdvance,
  advanceLabel = 'Continue',
  children,
  showBack = true,
}: OnboardingShellProps) {
  // Only the current segment animates; completed ones are solid.
  const fill = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fill.setValue(0);
    Animated.timing(fill, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [step, fill]);

  const total = Math.max(1, Math.trunc(Number.isFinite(totalSteps) ? totalSteps : 1));
  const current = Math.min(Math.max(1, Math.trunc(Number.isFinite(step) ? step : 1)), total);
  const showBackButton = showBack && current > 1 && typeof onBack === 'function';
  const fillWidth = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.topBar}>
        {showBackButton ? (
          <IconButton icon="chevron-back" label="Go back" onPress={onBack!} />
        ) : (
          <BrandMark size={26} />
        )}
        <Text style={styles.stepText}>
          Step {current} of {total}
        </Text>
      </View>

      <View
        style={styles.progress}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`Step ${current} of ${total}`}
        accessibilityValue={{ min: 0, max: total, now: current }}
      >
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={styles.segment}>
            {i + 1 < current ? <View style={styles.segmentDone} /> : null}
            {i + 1 === current ? (
              <Animated.View style={[styles.segmentDone, { width: fillWidth }]} />
            ) : null}
          </View>
        ))}
      </View>

      <View style={styles.body}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <View style={styles.bodyContent}>{children}</View>
      </View>

      <View style={styles.footer}>
        <Button label={advanceLabel} onPress={onAdvance} disabled={!canAdvance} />
      </View>
    </SafeAreaView>
  );
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
    minHeight: 44,
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  stepText: {
    ...typography.callout,
    color: colors.textSecondary,
  },
  progress: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: spacing.screenPadding,
    marginBottom: spacing.xxl,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceBorder,
    overflow: 'hidden',
  },
  segmentDone: {
    height: '100%',
    width: '100%',
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.screenPadding,
  },
  eyebrow: {
    ...typography.callout,
    color: colors.accentText,
    marginBottom: spacing.sm,
  },
  bodyContent: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
  },
});
