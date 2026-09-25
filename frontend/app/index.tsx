import React, { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Animated, Easing, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, typography } from '../constants/theme';
import { BrandMark } from '../components/ui';
import { loadDraft } from '../utils/onboardingDraft';

export default function Index() {
  const { token, isLoading } = useAuth();
  const router = useRouter();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  const [animationDone, setAnimationDone] = useState(false);

  useEffect(() => {
    Animated.parallel([
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
    ]).start(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 500,
        delay: 600,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => setAnimationDone(true));
    });
  }, []);

  useEffect(() => {
    if (!animationDone || isLoading) return;

    let cancelled = false;
    (async () => {
      if (!token) {
        if (!cancelled) router.replace('/auth/login');
        return;
      }

      // Authenticated: resume onboarding if a draft survives, otherwise drop
      // into the main app. The TTL is enforced inside `loadDraft`, which
      // clears stale entries before returning null. We land on welcome and
      // let the onboarding layout resolve the actual step, because which
      // steps apply depends on the answers in the draft.
      let hasDraft = false;
      try {
        const stored = await loadDraft();
        hasDraft = stored != null;
      } catch {
        hasDraft = false;
      }

      if (cancelled) return;
      if (hasDraft) {
        router.replace('/onboarding/welcome');
      } else {
        router.replace('/(tabs)/home');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [animationDone, isLoading, token]);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.welcomeContainer, { opacity, transform: [{ translateY }] }]}>
        <BrandMark size={52} />
        <Text style={styles.tagline}>Preventive health, made personal.</Text>
      </Animated.View>

      <View style={styles.loaderContainer}>
        <ActivityIndicator size="small" color={colors.textTertiary} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagline: {
    ...typography.callout,
    color: colors.textSecondary,
    marginTop: spacing.lg,
  },
  loaderContainer: {
    position: 'absolute',
    bottom: 64,
  },
});
