import React from 'react';
import { useColors } from '@/hooks/useColors';
import Feather from '@/components/Feather';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { LinearGradient } from '@/lib/LinearGradientSafe';
import { Platform, StyleSheet, useColorScheme } from 'react-native';
import Constants from 'expo-constants';
import { useLeaderboardPending } from '@/context/LeaderboardContext';

const MEDIEVAL = {
  gold: '#E8B84B',
  charcoal: '#0D0A07',
  ember: '#FF7A1A',
};

// NativeTabs layout for iOS 26+ (liquid glass)
function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: 'hammer', selected: 'hammer.fill' }} />
        <Label>Forge</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="world">
        <Icon sf={{ default: 'map', selected: 'map.fill' }} />
        <Label>Monde</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="inventory">
        <Icon sf={{ default: 'bag', selected: 'bag.fill' }} />
        <Label>Inventaire</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="collections">
        <Icon sf={{ default: 'trophy', selected: 'trophy.fill' }} />
        <Label>Sets</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="codex">
        <Icon sf={{ default: 'books.vertical', selected: 'books.vertical.fill' }} />
        <Label>Codex</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="skills">
        <Icon sf={{ default: 'star', selected: 'star.fill' }} />
        <Label>Compétences</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile" hidden>
        <Icon sf={{ default: 'person', selected: 'person.fill' }} />
        <Label>Profil</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

// Classic tab layout for older iOS, Android, and web
function ClassicTabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';
  const { pendingCount } = useLeaderboardPending();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: MEDIEVAL.gold,
        tabBarInactiveTintColor: 'rgba(232, 184, 75, 0.4)',
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : MEDIEVAL.charcoal,
          borderTopWidth: 2,
          borderTopColor: 'rgba(232, 184, 75, 0.15)',
          elevation: 10,
          shadowColor: MEDIEVAL.gold,
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.15,
          shadowRadius: 12,
          ...(isWeb ? { height: 84, paddingBottom: 24, paddingTop: 10 } : {}),
        },
        tabBarItemStyle: { justifyContent: 'center' },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={90}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <LinearGradient
              colors={['rgba(20,15,10,0.95)', 'rgba(10,8,5,1)']}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <LinearGradient
              colors={['#1a1410', '#0d0a07']}
              style={StyleSheet.absoluteFill}
            />
          ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Forge',
          tabBarIcon: ({ color }) => <Feather name="tool" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="world"
        options={{
          title: 'Monde',
          tabBarIcon: ({ color }) => <Feather name="map" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventaire',
          tabBarIcon: ({ color }) => <Feather name="archive" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="collections"
        options={{
          title: 'Sets',
          tabBarIcon: ({ color }) => <Feather name="award" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          href: null,
          title: 'Profil',
        }}
      />
      <Tabs.Screen
        name="codex"
        options={{
          title: 'Codex',
          tabBarIcon: ({ color }) => <Feather name="book-open" size={22} color={color} />,
          tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
          tabBarBadgeStyle: { backgroundColor: '#E53935', color: '#fff', fontSize: 10 },
        }}
      />
      <Tabs.Screen
        name="skills"
        options={{
          title: 'Compétences',
          tabBarIcon: ({ color }) => <Feather name="star" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (!IS_EXPO_GO && isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}

const IS_EXPO_GO =
  (Constants.appOwnership as string) === 'expo' ||
  Constants.executionEnvironment === 'storeClient';

let isLiquidGlassAvailable: () => boolean = () => false;
if (!IS_EXPO_GO) {
  try { isLiquidGlassAvailable = require('expo-glass-effect').isLiquidGlassAvailable; } catch { /* keep false */ }
}
