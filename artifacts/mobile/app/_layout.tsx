import React, { useEffect, useState } from 'react';
import { Modal } from 'react-native';
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
import { MaterialCommunityIcons } from '@expo/vector-icons';
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

// Prevent the splash screen from auto-hiding before asset loading is complete.
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

function AppWithSplash() {
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
  const shouldShowTutorial = splashDone && isLoaded && !hasCompletedFirstForgeTutorial && !tutorialResolved;
  const canShowDailyReward = splashDone && isLoaded && (hasCompletedFirstForgeTutorial || tutorialResolved);

  const finishTutorial = async () => {
    await completeFirstForgeTutorial();
    setTutorialResolved(true);
  };

  return (
    <>
      <RootLayoutNav />
      {shouldShowTutorial && <FirstForgeTutorial onDone={finishTutorial} />}
      {canShowDailyReward && <DailyRewardModal />}
      <Modal
        visible={!splashDone}
        animationType="none"
        transparent={false}
        statusBarTranslucent
        hardwareAccelerated
        onRequestClose={() => setSplashDone(true)}
      >
        <StudioSplash onDone={() => setSplashDone(true)} />
      </Modal>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    // Explicit load prevents MCI glyphs rendering as system emoji on Android
    ...MaterialCommunityIcons.font,
  });

  // Defer RevenueCat init off the synchronous module-load hot path.
  useEffect(() => {
    try { initializeRevenueCat(); }
    catch (err) { console.warn('RevenueCat unavailable:', err); }
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Wait for fonts before mounting providers — prevents race conditions
  // in GameProvider's AsyncStorage load and SubscriptionProvider init.
  if (!fontsLoaded && !fontError) return null;

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
                      <AppWithSplash />
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
