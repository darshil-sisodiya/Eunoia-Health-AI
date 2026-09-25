import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, ClipPath, Defs, G, Rect } from 'react-native-svg';
import { router } from 'expo-router';
import { colors, fonts, spacing, typography } from '../../constants/theme';
import { ONBOARDING_COPY } from '../../constants/onboarding';
import { BrandMark, Button } from '../../components/ui';

/**
 * First screen of onboarding: an indigo hero carrying the BrandMark sun at
 * full scale, one primary action, and a link for returning users.
 *
 * The entrance animation starts in a microtask so an unmount before the
 * effect body finishes cancels it entirely; cleanup stops it either way.
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
    router.push('/onboarding/basic' as any);
  };

  const handleSignIn = () => {
    router.push('/auth/login');
  };

  const C = ONBOARDING_COPY.welcome;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.hero}>
        <BrandMark size={28} inverse />

        <Animated.View style={[styles.heroBody, { opacity, transform: [{ translateY }] }]}>
          <View style={styles.sun} importantForAccessibility="no-hide-descendants">
            <RisingSun />
          </View>
          <Text style={styles.headline} accessibilityRole="header">
            {C.headline}
          </Text>
          <Text style={styles.subtitle}>{C.subtitle}</Text>
        </Animated.View>
      </View>

      <View style={styles.actions}>
        <Button label={C.primaryCta} onPress={handleBegin} />
        <Pressable
          onPress={handleSignIn}
          hitSlop={12}
          accessibilityRole="link"
          style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
        >
          <Text style={styles.linkText}>{C.secondaryCta}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// The BrandMark sun (marigold disc clipped at a white horizon) at hero
// scale, with two faint halos. Scales down to fit shorter screens.
function RisingSun() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 240 132" preserveAspectRatio="xMidYMax meet">
      <Defs>
        <ClipPath id="welcomeHorizon">
          <Rect x="0" y="0" width="240" height="112" />
        </ClipPath>
      </Defs>
      <G clipPath="url(#welcomeHorizon)">
        {/* White rings, not tinted marigold: marigold over indigo turns muddy brown. */}
        <Circle cx="120" cy="112" r="106" fill="none" stroke={colors.surface} strokeOpacity={0.08} strokeWidth={2} />
        <Circle cx="120" cy="112" r="85" fill="none" stroke={colors.surface} strokeOpacity={0.14} strokeWidth={2} />
        <Circle cx="120" cy="112" r="64" fill={colors.accent} />
      </G>
      <Rect x="36" y="120" width="168" height="6" rx="3" fill={colors.surface} opacity={0.9} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.sm,
  },
  hero: {
    flex: 1,
    backgroundColor: colors.inkSurface,
    borderRadius: spacing.cardRadiusXl,
    padding: spacing.xxl,
    overflow: 'hidden',
  },
  heroBody: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sun: {
    flex: 1,
    minHeight: 96,
    maxHeight: 220,
    marginBottom: spacing.xxl,
  },
  headline: {
    ...typography.display,
    color: colors.textInverse,
    marginBottom: spacing.md,
  },
  subtitle: {
    ...typography.body,
    color: colors.textInverseMuted,
  },
  actions: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  link: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkPressed: {
    opacity: 0.7,
  },
  linkText: {
    ...typography.callout,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
    textDecorationLine: 'underline',
  },
});
