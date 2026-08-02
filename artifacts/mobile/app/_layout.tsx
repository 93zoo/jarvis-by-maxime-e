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
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
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
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Modal, Platform } from 'react-native';
import AudioManager from '@/utils/AudioManager';

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

  // Global AppState handler — lives here so it stays mounted across all tabs.
  // The forge tab used to own this, but if the player navigated away before
  // backgrounding, the listener was gone and audio never recovered on return.
  const appStateRef = useRef(AppState.currentState);
  useEffect(() => {
    if (Platform.OS === 'web') return; // web uses visibilitychange, handled per-tab
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && appStateRef.current !== 'active') {
        AudioManager.handleForeground();
      } else if (
        (nextState === 'background' || nextState === 'inactive') &&
        appStateRef.current === 'active'
      ) {
        AudioManager.handleBackground();
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, []);

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
    // Preload icon fonts before any render — prevents □ glyphs on Android.
    // The studio splash covers this extra loading time.
    ...MaterialCommunityIcons.font,
    ...Feather.font,
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
