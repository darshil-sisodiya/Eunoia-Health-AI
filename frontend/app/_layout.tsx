import React from 'react';
import '../utils/axiosDebug';
import { Stack } from 'expo-router';
import { AuthProvider } from '../contexts/AuthContext';
import { StatusBar } from 'react-native';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FFFFFF' } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="auth/login" />
        <Stack.Screen name="auth/register" />
        {/* Redesigned preventive onboarding flow (Welcome → Basic → Lifestyle → Medical →
            Family → Location → Analyzing → Result). */}
        <Stack.Screen name="onboarding/welcome" />
        <Stack.Screen name="onboarding/basic" />
        <Stack.Screen name="onboarding/lifestyle" />
        <Stack.Screen name="onboarding/medical" />
        <Stack.Screen name="onboarding/family" />
        <Stack.Screen name="onboarding/location" />
        <Stack.Screen name="onboarding/analyzing" />
        <Stack.Screen name="onboarding/result" />
        <Stack.Screen name="risk-detail" />
        <Stack.Screen name="cost-estimator" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </AuthProvider>
  );
}
