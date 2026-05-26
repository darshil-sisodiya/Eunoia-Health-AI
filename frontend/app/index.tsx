import React, { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Animated, Easing, Text, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { colors } from '../constants/theme';

export default function Index() {
  const { token, isLoading } = useAuth();
  const router = useRouter();
  const opacity = useRef(new Animated.Value(0)).current;
  const [animationDone, setAnimationDone] = useState(false);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 600,
        delay: 500,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setAnimationDone(true);
    });
  }, []);

  useEffect(() => {
    if (animationDone && !isLoading) {
      if (token) {
        router.replace('/(tabs)/home');
      } else {
        router.replace('/auth/login');
      }
    }
  }, [token, isLoading]);
  
  useEffect(() => {
    if (animationDone && !isLoading) {
      if (token) {
        router.replace('/(tabs)/home');
      } else {
        router.replace('/auth/login');
      }
    }
  }, [animationDone]);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.welcomeContainer, { opacity }]}>        
        <Image source={require('../assets/images/icon.png')} style={styles.logo} />
        <Text style={styles.title}>Huro.AI</Text>
      </Animated.View>

      <ActivityIndicator size="large" color={colors.accent} />
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
    width: 80,
    height: 80,
    marginBottom: 16,
    borderRadius: 18,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
});
