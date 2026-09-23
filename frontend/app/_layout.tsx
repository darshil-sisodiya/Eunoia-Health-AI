import React from 'react';
import '../utils/axiosDebug';
import { Stack } from 'expo-router';
import { AuthProvider } from '../contexts/AuthContext';
import { HealthProfileProvider } from '../contexts/HealthProfileContext';
import { StatusBar } from 'react-native';

export default function RootLayout() {
  return (
    // HealthProfileProvider sits inside AuthProvider so it can read the token,
    // and clears itself on logout. It is a sibling rather than part of
    // AuthContext because AuthContext.isLoading gates the splash screen, and
    // startup must not wait on a profile fetch.
    <AuthProvider>
      <HealthProfileProvider>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FFFFFF' } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="auth/login" />
          <Stack.Screen name="auth/register" />
          {/* Adaptive preventive onboarding. Step order and which steps apply
              are defined in constants/onboardingSteps.ts, not here. */}
          <Stack.Screen name="onboarding/welcome" />
          <Stack.Screen name="onboarding/basic" />
          <Stack.Screen name="onboarding/vitals" />
          <Stack.Screen name="onboarding/lifestyle" />
          <Stack.Screen name="onboarding/conditions" />
          <Stack.Screen name="onboarding/medications" />
          <Stack.Screen name="onboarding/family" />
          <Stack.Screen name="onboarding/mental" />
          <Stack.Screen name="onboarding/womens" />
          <Stack.Screen name="onboarding/location" />
          <Stack.Screen name="onboarding/analyzing" />
          <Stack.Screen name="onboarding/result" />
          <Stack.Screen name="risk-detail" />
          <Stack.Screen name="cost-estimator" />
          <Stack.Screen name="profile/edit/[section]" />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </HealthProfileProvider>
    </AuthProvider>
  );
}
