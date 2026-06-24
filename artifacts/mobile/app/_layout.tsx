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
const BOOT_LINES = [
  { text: '> NOYAU IA CHARGÉ................', status: '[OK]' },
  { text: '> MODULES VOCAUX ACTIFS..........', status: '[OK]' },
  { text: '> CONNEXION SÉCURISÉE............', status: '[OK]' },
  { text: '> MÉMOIRE CONTEXTUELLE...........', status: '[OK]' },
  { text: '> PROTOCOLES JARVIS V3...........', status: '[OK]' },
  { text: '> ACCÈS INTERNET.................', status: '[OK]' },
  { text: '> SYSTÈME OPÉRATIONNEL...........', status: '[PRÊT]' },
];

// Each line appears every 320ms, starting after 900ms
const BOOT_START_DELAY = 900;
const BOOT_INTERVAL = 320;
// Total duration = start + all lines + small pause before fade
const TOTAL_DURATION = BOOT_START_DELAY + BOOT_LINES.length * BOOT_INTERVAL + 700;

function JarvisIntro({ onDone }: { onDone: () => void }) {
  const bgOpacity = useRef(new Animated.Value(1)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleScale = useRef(new Animated.Value(0.82)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const scanLine = useRef(new Animated.Value(0)).current;
  const scanLoop = useRef<Animated.CompositeAnimation | null>(null);
  const [bootLines, setBootLines] = React.useState<number>(0);

  useEffect(() => {
    // Title → subtitle → tagline
    Animated.sequence([
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(titleScale, { toValue: 1, duration: 700, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }),
      ]),
      Animated.timing(subtitleOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    // Scan line
    scanLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLine, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(scanLine, { toValue: 0, duration: 0, useNativeDriver: false }),
      ])
    );
    scanLoop.current.start();

    // Boot lines — appear one by one
    const timers: ReturnType<typeof setTimeout>[] = [];
    BOOT_LINES.forEach((_, i) => {
      timers.push(setTimeout(() => {
        setBootLines(i + 1);
      }, BOOT_START_DELAY + i * BOOT_INTERVAL));
    });

    // Fade out after all lines shown
    const exitTimer = setTimeout(() => {
      scanLoop.current?.stop();
      Animated.timing(bgOpacity, {
        toValue: 0,
        duration: 500,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }).start(() => onDone());
    }, TOTAL_DURATION);

    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(exitTimer);
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
        <Animated.Text style={[styles.introTitle, { opacity: titleOpacity, transform: [{ scale: titleScale }] }]}>
          J.A.R.V.I.S.
        </Animated.Text>

        <Animated.Text style={[styles.introSubtitle, { opacity: subtitleOpacity }]}>
          JUSTE UN SYSTÈME VRAIMENT TRÈS INTELLIGENT
        </Animated.Text>

        <Animated.Text style={[styles.introTagline, { opacity: subtitleOpacity }]}>
          Votre agent IA de poche JARVIS{'\n'}codé par Maxime Etivant
        </Animated.Text>

        {/* Boot log */}
        <View style={styles.bootLog}>
          {BOOT_LINES.slice(0, bootLines).map((line, i) => (
            <View key={i} style={styles.bootLine}>
              <Text style={[styles.bootText, i === bootLines - 1 && styles.bootTextActive]}>
                {line.text}
              </Text>
              <Text style={[
                styles.bootStatus,
                line.status === '[PRÊT]' ? styles.bootStatusReady : styles.bootStatusOk,
              ]}>
                {line.status}
              </Text>
            </View>
          ))}
        </View>
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
  bootLog: {
    marginTop: 22,
    alignSelf: 'stretch',
    paddingHorizontal: 24,
    gap: 5,
  },
  bootLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bootText: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: CYAN + '66',
    letterSpacing: 0.5,
  },
  bootTextActive: {
    color: CYAN + 'cc',
  },
  bootStatus: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600' as const,
    letterSpacing: 0.5,
  },
  bootStatusOk: {
    color: '#22c55e',
  },
  bootStatusReady: {
    color: CYAN,
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
