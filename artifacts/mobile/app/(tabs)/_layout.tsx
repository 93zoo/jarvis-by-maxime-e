import React from 'react';
import { Platform, StyleSheet, useColorScheme, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';

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
          ...(isWeb ? { height: 84 } : { height: 65 }),
          paddingBottom: isWeb ? 34 : (isIOS ? 20 : 10),
          paddingTop: 8,
        },
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
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView name="hammer.fill" tintColor={color} size={24} />
            ) : (
              <MaterialCommunityIcons name="anvil" size={26} color={color} style={focused ? {textShadowColor: MEDIEVAL.ember, textShadowRadius: 8} : {}} />
            ),
        }}
      />
      <Tabs.Screen
        name="world"
        options={{
          title: 'Monde',
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView name="map.fill" tintColor={color} size={24} />
            ) : (
              <MaterialCommunityIcons name="earth" size={26} color={color} style={focused ? {textShadowColor: MEDIEVAL.ember, textShadowRadius: 8} : {}} />
            ),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Stock',
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView name="bag.fill" tintColor={color} size={24} />
            ) : (
              <MaterialCommunityIcons name="bag-personal" size={26} color={color} style={focused ? {textShadowColor: MEDIEVAL.ember, textShadowRadius: 8} : {}} />
            ),
        }}
      />
      <Tabs.Screen
        name="collections"
        options={{
          title: 'Sets',
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView name="trophy.fill" tintColor={color} size={24} />
            ) : (
              <MaterialCommunityIcons name="shield-star" size={26} color={color} style={focused ? {textShadowColor: MEDIEVAL.ember, textShadowRadius: 8} : {}} />
            ),
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
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView name="books.vertical.fill" tintColor={color} size={24} />
            ) : (
              <MaterialCommunityIcons name="book-open-page-variant" size={26} color={color} style={focused ? {textShadowColor: MEDIEVAL.ember, textShadowRadius: 8} : {}} />
            ),
        }}
      />
      <Tabs.Screen
        name="skills"
        options={{
          title: 'Talents',
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView name="star.fill" tintColor={color} size={24} />
            ) : (
              <MaterialCommunityIcons name="auto-fix" size={26} color={color} style={focused ? {textShadowColor: MEDIEVAL.ember, textShadowRadius: 8} : {}} />
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