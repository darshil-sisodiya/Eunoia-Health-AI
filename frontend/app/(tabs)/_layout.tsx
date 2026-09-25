import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet, Platform, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../../constants/theme';
import { tap } from '../../components/ui';

type IconName = keyof typeof Ionicons.glyphMap;

const TABS: { name: string; label: string; icon: IconName; iconActive: IconName }[] = [
  { name: 'home', label: 'Today', icon: 'sunny-outline', iconActive: 'sunny' },
  { name: 'prescriptions', label: 'Prescriptions', icon: 'document-text-outline', iconActive: 'document-text' },
  { name: 'chat', label: 'Ask', icon: 'chatbubble-ellipses-outline', iconActive: 'chatbubble-ellipses' },
  { name: 'profile', label: 'Profile', icon: 'person-outline', iconActive: 'person' },
];

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  // Docked bar: labels are always visible so every destination is legible
  // at a glance. Bottom padding clears the home indicator / gesture bar.
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'ios' ? 12 : 10);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarHideOnKeyboard: Platform.OS === 'android',
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: {
          height: 60 + bottomPad,
          paddingTop: 8,
          paddingBottom: bottomPad,
          backgroundColor: colors.surface,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.surfaceBorderStrong,
          elevation: 0,
        },
      }}
      screenListeners={{ tabPress: () => tap() }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.label,
            tabBarAccessibilityLabel: t.label,
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? t.iconActive : t.icon} label={t.label} focused={focused} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

function TabIcon({ name, label, focused }: { name: IconName; label: string; focused: boolean }) {
  return (
    <View style={styles.item}>
      <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
        <Ionicons name={name} size={21} color={focused ? colors.textPrimary : colors.textTertiary} />
      </View>
      <Text
        style={[styles.label, focused && styles.labelActive]}
        numberOfLines={1}
        allowFontScaling={false}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    width: 92,
  },
  iconWrap: {
    width: 52,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: colors.accentSoft,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 11.5,
    lineHeight: 14,
    color: colors.textTertiary,
  },
  labelActive: {
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
  },
});
