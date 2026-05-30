import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
} from 'react-native';
import { router } from 'expo-router';

import OnboardingShell from '../../components/onboarding/OnboardingShell';
import {
  HEREDITARY_CONDITIONS,
  ONBOARDING_COPY,
  type HereditaryCondition,
} from '../../constants/onboarding';
import { colors, spacing, typography } from '../../constants/theme';
import { useOnboarding } from '../../contexts/OnboardingContext';

/**
 * Step 5 of the Eunoia onboarding flow — the Family History grid.
 *
 * Visual contract (Requirements 6.1–6.5, 16.1–16.5):
 *   - Lives inside `OnboardingShell` with `step=5`. `canAdvance` is
 *     always true: zero or more selections is valid (Requirement 6.4).
 *   - Renders a single supporting line above the grid stating that
 *     the data powers hereditary risk indicators and is never used
 *     to issue diagnoses (Requirement 6.5).
 *   - A 2-column grid of 8 `HereditaryCard` items, one per entry in
 *     `HEREDITARY_CONDITIONS` (Requirement 6.2).
 *   - Each card commits its visual update synchronously inside the
 *     press handler via `toggleFamily`, then runs an `Animated.spring`
 *     over `borderColor` and `transform: scale` aiming to land within
 *     ~100 ms (Requirement 6.3).
 *
 * All values come from `frontend/constants/theme.ts` and
 * `frontend/constants/onboarding.ts`; the only inline numeric literals
 * are the 1.02 selected scale factor and the standard spring tension /
 * friction config required for the 100 ms target.
 */
export default function Family() {
  const { draft, toggleFamily, markStep } = useOnboarding();
  const selectedSet = useMemo(
    () => new Set<HereditaryCondition>(draft.family_history),
    [draft.family_history],
  );

  const handleAdvance = () => {
    markStep(6);
    router.push('/onboarding/location' as any);
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <OnboardingShell
      step={5}
      eyebrow={ONBOARDING_COPY.family.eyebrow}
      canAdvance
      onAdvance={handleAdvance}
      onBack={handleBack}
      advanceLabel={ONBOARDING_COPY.family.advanceLabel}
    >
      <Text style={styles.headline} accessibilityRole="header">
        {ONBOARDING_COPY.family.headline}
      </Text>

      <Text style={styles.supporting}>
        {ONBOARDING_COPY.family.supporting}
      </Text>

      <View style={styles.grid}>
        {HEREDITARY_CONDITIONS.map((condition) => (
          <HereditaryCard
            key={condition}
            condition={condition}
            selected={selectedSet.has(condition)}
            onToggle={() => toggleFamily(condition)}
          />
        ))}
      </View>
    </OnboardingShell>
  );
}

// ─── HereditaryCard ──────────────────────────────────────────────

type HereditaryCardProps = {
  condition: HereditaryCondition;
  selected: boolean;
  onToggle: () => void;
};

const AnimatedPressable = Animated.createAnimatedComponent(
  Pressable as React.ComponentType<PressableProps>,
);

/**
 * A single tappable card in the 2-column hereditary grid.
 *
 * Selected state inverts to `colors.inkSurface` background and
 * `colors.textInverse` text. Border and scale are driven by an
 * `Animated.spring` so the card "snaps" into the selected look
 * within ~100 ms on mid-range hardware (Requirement 6.3).
 *
 * The synchronous part of the visual update (background + text
 * color) is committed by React the instant `toggleFamily` runs;
 * the spring layers a polish animation on top of the already-
 * committed state, so even if the spring takes longer than 100 ms
 * the user has already seen the selected styling.
 */
function HereditaryCard({ condition, selected, onToggle }: HereditaryCardProps) {
  // 0 = unselected, 1 = selected. Initialised to the current value so
  // the first render does not visibly animate from 0 → current.
  const driver = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(driver, {
      toValue: selected ? 1 : 0,
      tension: 200,
      friction: 12,
      // Color interpolation is unsupported by the native driver, so
      // both interpolations (borderColor + scale) run on the JS driver.
      useNativeDriver: false,
    }).start();
  }, [selected, driver]);

  const borderColor = driver.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.surfaceBorder, colors.inkSurface],
  });
  const scale = driver.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.02],
  });

  // Background and text color flip synchronously with `selected` so
  // the visual state is correct on the first frame after the press
  // event, independent of how long the spring takes to settle.
  const backgroundColor = selected ? colors.inkSurface : colors.surface;
  const textColor = selected ? colors.textInverse : colors.textPrimary;

  return (
    <AnimatedPressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`Toggle ${condition} for family history`}
      style={[
        styles.card,
        {
          backgroundColor,
          borderColor,
          transform: [{ scale }],
        },
      ]}
    >
      <Text
        style={[styles.cardLabel, { color: textColor }]}
        numberOfLines={2}
      >
        {condition}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  headline: {
    ...typography.largeTitle,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  supporting: {
    ...typography.callout,
    color: colors.textSecondary,
    marginBottom: spacing.xxl,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: '48%',
    minHeight: 72,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: spacing.cardRadiusLg,
    borderWidth: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  cardLabel: {
    ...typography.headline,
  },
});
