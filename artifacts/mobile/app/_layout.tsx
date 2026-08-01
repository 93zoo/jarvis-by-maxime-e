import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GameProvider } from '@/context/GameContext';
import { AchievementProvider } from '@/context/AchievementContext';
import IntroCinematic from '@/components/IntroCinematic';
import { initializeRevenueCat, SubscriptionProvider } from '@/lib/revenuecat';

let revenueCatReady = false;
try {
  initializeRevenueCat();
  revenueCatReady = true;
} catch (err) {
  console.warn('RevenueCat unavailable:', err);
}

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

const INTRO_SEEN_KEY = '@fk_intro_seen_v1';

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="boutique" options={{ headerShown: false, presentation: 'modal' }} />
    </Stack>
  );
}

function AppWithCinematic() {
  const [introChecked, setIntroChecked] = useState(false);
  const [showIntro, setShowIntro] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(INTRO_SEEN_KEY);
        setShowIntro(!seen);
      } catch {
        setShowIntro(false);
      }
      setIntroChecked(true);
    })();
  }, []);

  const handleIntroFinish = async () => {
    try {
      await AsyncStorage.setItem(INTRO_SEEN_KEY, '1');
    } catch {}
    setShowIntro(false);
  };

  if (!introChecked) return null;

  return (
    <>
      <RootLayoutNav />
      {showIntro && <IntroCinematic onFinish={handleIntroFinish} />}
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <SubscriptionProvider>
                <GameProvider>
                  <AchievementProvider>
                    <AppWithCinematic />
                  </AchievementProvider>
                </GameProvider>
              </SubscriptionProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
