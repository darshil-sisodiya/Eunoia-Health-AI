import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, shadows } from '../../constants/theme';

export default function TabLayout() {
  return (
    <View style={styles.container}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: {
            position: 'absolute',
            left: 20,
            right: 20,
            bottom: Platform.OS === 'ios' ? 28 : 16,
            height: 64,
            paddingBottom: 8,
            paddingTop: 8,
            borderRadius: 20,
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderTopWidth: 0,
            borderWidth: 1,
            borderColor: 'rgba(226, 232, 240, 0.8)',
            ...shadows.lg,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
            marginTop: -2,
          },
          tabBarIconStyle: {
            marginTop: 4,
          },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, focused }) => (
              <View style={focused ? styles.activeIconBg : undefined}>
                <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="prescriptions"
          options={{
            title: 'Analyzer',
            tabBarIcon: ({ color, focused }) => (
              <View style={focused ? styles.activeIconBg : undefined}>
                <Ionicons name={focused ? 'document-text' : 'document-text-outline'} size={22} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            title: 'Chat',
            tabBarIcon: ({ color, focused }) => (
              <View style={focused ? styles.activeIconBg : undefined}>
                <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={22} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, focused }) => (
              <View style={focused ? styles.activeIconBg : undefined}>
                <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
              </View>
            ),
          }}
        />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  activeIconBg: {
    backgroundColor: colors.accentLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
});
