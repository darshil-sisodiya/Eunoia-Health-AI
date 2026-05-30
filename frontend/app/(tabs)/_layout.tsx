import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet, Platform, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, shadows, typography } from '../../constants/theme';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  // Keep the bar a consistent visual distance above the system gesture
  // bar / home indicator on every device. On iOS we pad above the home
  // indicator; on Android we account for the gesture inset under
  // edge-to-edge mode and fall back to a sensible default on devices
  // that report no inset.
  const bottomOffset =
    Platform.OS === 'ios'
      ? Math.max(insets.bottom, 12) + 4
      : Math.max(insets.bottom, 8) + 8;

  return (
    <View style={styles.container}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.textPrimary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarShowLabel: false,
          tabBarHideOnKeyboard: Platform.OS === 'android',
          tabBarStyle: {
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: bottomOffset,
            height: 64,
            paddingTop: 0,
            paddingBottom: 0,
            borderRadius: 18,
            backgroundColor: 'rgba(255, 255, 255, 0.96)',
            borderTopWidth: 0,
            borderWidth: 1,
            borderColor: colors.surfaceBorder,
            ...shadows.lg,
            elevation: 12,
          },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name={focused ? 'home' : 'home-outline'} label="Home" color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="prescriptions"
          options={{
            title: 'Analyzer',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name={focused ? 'document-text' : 'document-text-outline'} label="Rx" color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            title: 'Chat',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name={focused ? 'sparkles' : 'sparkles-outline'} label="AI" color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name={focused ? 'person' : 'person-outline'} label="You" color={color} focused={focused} />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}

interface TabIconProps {
  name: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  focused: boolean;
}

const TabIcon: React.FC<TabIconProps> = ({ name, label, color, focused }) => {
  return (
    <View style={styles.tabIconWrap}>
      <View style={focused ? styles.activePill : styles.inactivePill}>
        <Ionicons name={name} size={focused ? 18 : 20} color={focused ? colors.textInverse : color} />
        {focused && <Text style={styles.activeLabel}>{label}</Text>}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabIconWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
  },
  inactivePill: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.inkSurface,
  },
  activeLabel: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '600',
    color: colors.textInverse,
    letterSpacing: 0.2,
  },
});
