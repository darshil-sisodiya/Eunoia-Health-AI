import React from 'react';
import '../utils/axiosDebug';
import { Stack } from 'expo-router';
import { AuthProvider } from '../contexts/AuthContext';
import { HealthProfileProvider } from '../contexts/HealthProfileContext';
import { StatusBar } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, YoungSerif_400Regular } from '@expo-google-fonts/young-serif';
import {
  Onest_400Regular,
  Onest_500Medium,
  Onest_600SemiBold,
  Onest_700Bold,
} from '@expo-google-fonts/onest';
import { colors } from '../constants/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    YoungSerif_400Regular,
    Onest_400Regular,
    Onest_500Medium,
    Onest_600SemiBold,
    Onest_700Bold,
  });
  const ready = fontsLoaded || !!fontError;

  React.useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  // Rendering before the fonts land would flash system type, then reflow.
  if (!ready) return null;

  return (
    // HealthProfileProvider sits inside AuthProvider so it can read the token,
    // and clears itself on logout. It is a sibling rather than part of
    // AuthContext because AuthContext.isLoading gates the splash screen, and
    // startup must not wait on a profile fetch.
    <AuthProvider>
      <HealthProfileProvider>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="auth/login" />
          <Stack.Screen name="auth/register" />
          {/* Adaptive preventive onboarding. Step order and which steps apply
              are defined in constants/onboardingSteps.ts, not here. */}
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="risk-detail" />
          <Stack.Screen name="cost-estimator" />
          <Stack.Screen name="profile/edit/[section]" />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </HealthProfileProvider>
    </AuthProvider>
  );
}
