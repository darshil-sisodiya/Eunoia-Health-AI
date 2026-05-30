import React, { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Animated, Easing, Text, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { colors, typography } from '../constants/theme';
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

      // Authenticated: resume the redesigned onboarding flow if a recent draft
      // exists, otherwise drop into the main app. The 30-minute TTL is enforced
      // inside `loadDraft`, which clears stale entries before returning null.
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
        <Image source={require('../assets/images/icon.png')} style={styles.logo} />
        <Text style={styles.title}>Eunoia</Text>
        <Text style={styles.tagline}>Personalised insights, calmly delivered.</Text>
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
  logo: {
    width: 72,
    height: 72,
    marginBottom: 20,
    borderRadius: 16,
  },
  title: {
    ...typography.largeTitle,
    color: colors.textPrimary,
  },
  titleAccent: {
    color: colors.accent,
  },
  tagline: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 8,
    letterSpacing: 0.4,
  },
  loaderContainer: {
    position: 'absolute',
    bottom: 64,
  },
});
