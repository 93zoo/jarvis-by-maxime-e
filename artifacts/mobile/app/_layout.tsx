import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
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
import { JarvisProvider } from '@/context/JarvisContext';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// ── Animated intro overlay ───────────────────────────────────────────────────
function JarvisIntro({ onDone }: { onDone: () => void }) {
  const bgOpacity = useRef(new Animated.Value(1)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleScale = useRef(new Animated.Value(0.82)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const scanLine = useRef(new Animated.Value(0)).current;
  const dotsOpacity = useRef(new Animated.Value(0)).current;
  const scanLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    // 1) Title fades in
    Animated.sequence([
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(titleScale, { toValue: 1, duration: 700, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }),
      ]),
      // 2) Subtitle fades in
      Animated.timing(subtitleOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(dotsOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();

    // Scan line loops
    scanLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLine, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(scanLine, { toValue: 0, duration: 0, useNativeDriver: false }),
      ])
    );
    scanLoop.current.start();

    // After 2.4s, fade out and call onDone
    const timer = setTimeout(() => {
      scanLoop.current?.stop();
      Animated.timing(bgOpacity, {
        toValue: 0,
        duration: 500,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }).start(() => onDone());
    }, 2400);

    return () => {
      clearTimeout(timer);
      scanLoop.current?.stop();
    };
  }, []);

  const scanTop = scanLine.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, styles.intro, { opacity: bgOpacity }]}>
      {/* Scan line */}
      <Animated.View style={[styles.scanLine, { top: scanTop }]} />

      {/* Grid overlay */}
      <View style={styles.gridOverlay} />

      {/* Content */}
      <View style={styles.introContent}>
        <Animated.Text
          style={[
            styles.introTitle,
            { opacity: titleOpacity, transform: [{ scale: titleScale }] },
          ]}
        >
          J.A.R.V.I.S.
        </Animated.Text>

        <Animated.Text style={[styles.introSubtitle, { opacity: subtitleOpacity }]}>
          JUST A RATHER VERY INTELLIGENT SYSTEM
        </Animated.Text>

        <Animated.Text style={[styles.introTagline, { opacity: subtitleOpacity }]}>
          Votre agent IA de poche JARVIS{'\n'}codé par Maxime Etivant
        </Animated.Text>

        <Animated.View style={[styles.initRow, { opacity: dotsOpacity }]}>
          <View style={styles.initDot} />
          <Text style={styles.initText}>INITIALISATION DU SYSTÈME...</Text>
          <View style={styles.initDot} />
        </Animated.View>
      </View>

      {/* Bottom brand */}
      <Animated.Text style={[styles.introBrand, { opacity: subtitleOpacity }]}>
        BY MAXIME-E
      </Animated.Text>
    </Animated.View>
  );
}

// ── Stack navigator ──────────────────────────────────────────────────────────
function RootLayoutNav() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="settings"
        options={{ headerShown: false, presentation: 'card' }}
      />
    </Stack>
  );
}

// ── Root layout ──────────────────────────────────────────────────────────────
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [showIntro, setShowIntro] = useState(true);
  const appReady = fontsLoaded || !!fontError;

  useEffect(() => {
    if (appReady) {
      SplashScreen.hideAsync();
    }
  }, [appReady]);

  if (!appReady) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <JarvisProvider>
                <RootLayoutNav />
                {showIntro && <JarvisIntro onDone={() => setShowIntro(false)} />}
              </JarvisProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const CYAN = '#00d4ff';
const BG = '#020b14';

const styles = StyleSheet.create({
  intro: {
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: CYAN + '40',
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.04,
  },
  introContent: {
    alignItems: 'center',
    gap: 14,
  },
  introTitle: {
    fontSize: 42,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
    color: CYAN,
    letterSpacing: 8,
    textShadowColor: CYAN,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  introSubtitle: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: CYAN + 'aa',
    letterSpacing: 3,
    textAlign: 'center',
  },
  introTagline: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#ffffff99',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 14,
    letterSpacing: 0.3,
  },
  initRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
  },
  initDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: CYAN,
    opacity: 0.8,
  },
  initText: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: CYAN + '99',
    letterSpacing: 2,
  },
  introBrand: {
    position: 'absolute',
    bottom: 48,
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: CYAN + '60',
    letterSpacing: 4,
  },
});
