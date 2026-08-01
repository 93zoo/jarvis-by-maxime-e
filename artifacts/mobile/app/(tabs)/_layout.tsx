import React from 'react';
import { Platform, StyleSheet, useColorScheme, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { SymbolView } from 'expo-symbols';

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
      {/* Profil lives inside Codex — hidden trigger keeps the route alive */}
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

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : colors.card,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={80}
              tint={isDark ? 'dark' : 'dark'}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]}
            />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Forge',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="hammer" tintColor={color} size={22} />
            ) : (
              <Feather name="tool" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="world"
        options={{
          title: 'Monde',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="map" tintColor={color} size={22} />
            ) : (
              <Feather name="map" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventaire',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="bag" tintColor={color} size={22} />
            ) : (
              <Feather name="archive" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="collections"
        options={{
          title: 'Sets',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="trophy" tintColor={color} size={22} />
            ) : (
              <Feather name="award" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          // Profil lives inside the Codex tab now — keep the route but hide the tab
          href: null,
          title: 'Profil',
        }}
      />
      <Tabs.Screen
        name="codex"
        options={{
          title: 'Codex',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="books.vertical" tintColor={color} size={22} />
            ) : (
              <Feather name="book-open" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="skills"
        options={{
          title: 'Compétences',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="star" tintColor={color} size={22} />
            ) : (
              <Feather name="star" size={22} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
