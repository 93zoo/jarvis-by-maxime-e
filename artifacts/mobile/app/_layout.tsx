import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Constants from 'expo-constants';

// react-native-keyboard-controller crashes Expo Go on Android at module-load time.
// Lazy-require so it is never touched inside Expo Go.
const IS_EXPO_GO_LAYOUT =
  (Constants.appOwnership as string) === 'expo' ||
  Constants.executionEnvironment === 'storeClient';

let KeyboardProvider: React.ComponentType<{ children: React.ReactNode }> = ({ children }) => <>{children}</>;
if (!IS_EXPO_GO_LAYOUT) {
  try {
    KeyboardProvider = require('react-native-keyboard-controller').KeyboardProvider;
  } catch { /* fallback already set */ }
}
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

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Modal, Platform, View } from 'react-native';
import AudioManager from '@/utils/AudioManager';
import { LeaderboardProvider } from '@/context/LeaderboardContext';

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
  const { isLoaded, hasCompletedFirstForgeTutorial, completeFirstForgeTutorial, saveGame } = useGame();

  // Global AppState handler — lives here so it stays mounted across all tabs.
  // The forge tab used to own this, but if the player navigated away before
  // backgrounding, the listener was gone and audio never recovered on return.
  const appStateRef = useRef(AppState.currentState);
  // Keep a stable ref so the AppState listener always calls the latest saveGame
  // (saveGame is a useCallback that depends on state, so it changes every update).
  const saveGameRef = useRef(saveGame);
  useEffect(() => { saveGameRef.current = saveGame; }, [saveGame]);

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
        saveGameRef.current();
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
        {/* Fond noir plein écran : sans ça, la zone non couverte par le splash
            (barre de navigation Android) laisse voir le fond blanc du Modal */}
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <StudioSplash onDone={() => setSplashDone(true)} />
        </View>
      </Modal>
    </>
  );
}

export default function RootLayout() {
  // Load all fonts — text AND icon — in one useFonts call.
  // useFonts guarantees that fonts are fully registered natively before the
  // hook resolves, avoiding the race condition where Font.isLoaded() returns
  // true in JS but the native Android text renderer hasn't applied the font yet.
  // NOTE: Ionicons is pre-bundled in Expo Go with mismatched codepoints (v5 vs
  // our v7) → CJK glyphs. All icons have been migrated to Feather only.
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    // Icons are pure SVG (components/Feather.tsx) — no icon font to load.
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

  // Block rendering until all fonts (text + icons) are ready.
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
                      <LeaderboardProvider>
                        <GoldGrantReconciler />
                        <AppWithSplash />
                      </LeaderboardProvider>
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
