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
        <Stack.Screen name="onboarding/questions" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </AuthProvider>
  );
}
