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
import { GameProvider, useGame } from '@/context/GameContext';
import { AchievementProvider } from '@/context/AchievementContext';
import { initializeRevenueCat, SubscriptionProvider } from '@/lib/revenuecat';
import GoldGrantReconciler from '@/components/GoldGrantReconciler';
import { RewardedAdsProvider } from '@/lib/rewardedAds';
import StudioSplash from '@/components/StudioSplash';
import DailyRewardModal from '@/components/DailyRewardModal';
import FirstForgeTutorial from '@/components/FirstForgeTutorial';

// Prevents native splash from auto-hiding. We hide it ourselves once fonts are ready.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="boutique" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="a-propos" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="classement" options={{ headerShown: false, presentation: 'modal' }} />
    </Stack>
  );
}

function AppWithSplash({ fontsReady }: { fontsReady: boolean }) {
  const { isLoaded, hasCompletedFirstForgeTutorial, completeFirstForgeTutorial } = useGame();
  const [splashDone, setSplashDone] = useState(
    // Dev web uniquement : ?nosplash=1 saute l'intro (captures d'écran/tests)
    () =>
      __DEV__ &&
      require('react-native').Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      window.location?.search?.includes('nosplash'),
  );
  const [tutorialResolved, setTutorialResolved] = useState(false);

  // Don't dismiss StudioSplash until both the animation/video is done AND fonts are loaded.
  // This prevents a brief flash of system-font text if fonts were still loading.
  const fullyDone = splashDone && fontsReady;

  const shouldShowTutorial = fullyDone && isLoaded && !hasCompletedFirstForgeTutorial && !tutorialResolved;
  const canShowDailyReward = fullyDone && isLoaded && (hasCompletedFirstForgeTutorial || tutorialResolved);

  const finishTutorial = async () => {
    await completeFirstForgeTutorial();
    setTutorialResolved(true);
  };

  return (
    <>
      <RootLayoutNav />
      {shouldShowTutorial && <FirstForgeTutorial onDone={finishTutorial} />}
      {canShowDailyReward && <DailyRewardModal />}
      {!fullyDone && <StudioSplash onDone={() => setSplashDone(true)} />}
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

  // Defer RevenueCat init off the synchronous module-load hot path.
  // initializeRevenueCat() does AsyncStorage + network; running it after the
  // first frame means nothing blocks the initial render.
  useEffect(() => {
    try { initializeRevenueCat(); }
    catch (err) { console.warn('RevenueCat unavailable:', err); }
  }, []);

  // Hide the native splash as soon as fonts are ready.
  // StudioSplash renders immediately underneath and covers the UI during font loading.
  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  // Do NOT return null while fonts load. Rendering the providers immediately lets
  // GameProvider start its AsyncStorage read in parallel with font loading.
  // StudioSplash covers any briefly-unstyled content.
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <SubscriptionProvider>
                <GameProvider>
                  <RewardedAdsProvider>
                    <AchievementProvider>
                      <GoldGrantReconciler />
                      <AppWithSplash fontsReady={fontsLoaded || !!fontError} />
                    </AchievementProvider>
                  </RewardedAdsProvider>
                </GameProvider>
              </SubscriptionProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
