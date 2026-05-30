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
import { router } from 'expo-router';
import { colors, spacing, typography } from '../../constants/theme';
import { ONBOARDING_COPY } from '../../constants/onboarding';

/**
 * Step 1 of the Eunoia onboarding flow — the redesigned Welcome screen.
 *
 * Visual contract (Requirements 1.1, 1.5, 2.1–2.7, 16.1–16.3):
 *   - `EUNOIA` overline brand mark, centered hero composition.
 *   - Primary headline rendered in `typography.largeTitle` and the
 *     supporting line in `typography.body`. Both use monochrome
 *     neutrals only; no accent or status colors are introduced
 *     (Requirement 2.6).
 *   - Exactly one primary CTA ("Begin") that advances to step 2 and
 *     one tertiary affordance for returning users ("I already have an
 *     account") that routes to login.
 *   - Entrance animation: 700 ms parallel opacity (0→1) and 8 px
 *     translateY (8→0) using `Animated` + `Easing.out(Easing.cubic)`,
 *     mirroring the splash pattern in `frontend/app/index.tsx`.
 *   - The animation is started inside a `useEffect` whose cleanup
 *     cancels the timing if the screen unmounts before the effect
 *     fires (Requirement 2.5).
 *
 * All values come from `frontend/constants/theme.ts` and
 * `frontend/constants/onboarding.ts`; no inline color or copy literals.
 */
export default function Welcome() {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    let cancelled = false;
    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    // Defer .start() into a microtask so an unmount that happens before
    // the effect's body finishes (i.e. before the React commit phase
    // releases control) cancels the entrance entirely (Requirement 2.5).
    Promise.resolve().then(() => {
      if (cancelled) return;
      animation.start();
    });

    return () => {
      cancelled = true;
      animation.stop();
    };
  }, [opacity, translateY]);

  const handleBegin = () => {
    // The `/onboarding/basic` route is created by task 10.2; until that
    // file exists, expo-router's typed-routes generator does not list
    // it. Casting through `any` keeps the welcome screen self-contained
    // without coupling its compilation to subsequent tasks.
    router.push('/onboarding/basic' as any);
  };

  const handleSignIn = () => {
    router.push('/auth/login');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <Animated.View
        style={[
          styles.hero,
          { opacity, transform: [{ translateY }] },
        ]}
      >
        <Text style={styles.brand} accessibilityRole="text">
          {ONBOARDING_COPY.welcome.eyebrow}
        </Text>
        <Text style={styles.headline} accessibilityRole="header">
          {ONBOARDING_COPY.welcome.headline}
        </Text>
        <Text style={styles.subtitle}>
          {ONBOARDING_COPY.welcome.subtitle}
        </Text>
      </Animated.View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primaryCta}
          onPress={handleBegin}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel={ONBOARDING_COPY.welcome.primaryCta}
        >
          <Text style={styles.primaryCtaText}>
            {ONBOARDING_COPY.welcome.primaryCta}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tertiaryCta}
          onPress={handleSignIn}
          activeOpacity={0.7}
          accessibilityRole="link"
          accessibilityLabel={ONBOARDING_COPY.welcome.secondaryCta}
        >
          <Text style={styles.tertiaryCtaText}>
            {ONBOARDING_COPY.welcome.secondaryCta}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.screenPadding,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    ...typography.overline,
    color: colors.textPrimary,
    marginBottom: spacing.xxl,
  },
  headline: {
    ...typography.largeTitle,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 320,
  },
  actions: {
    paddingBottom: spacing.xxl,
    alignItems: 'stretch',
  },
  primaryCta: {
    backgroundColor: colors.inkSurface,
    borderRadius: spacing.buttonRadius,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  primaryCtaText: {
    ...typography.headline,
    color: colors.textInverse,
  },
  tertiaryCta: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  tertiaryCtaText: {
    ...typography.callout,
    color: colors.textTertiary,
  },
});
