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

// ── Design tokens ────────────────────────────────────────────────────────────
const BLUE   = '#0099FF';
const CYAN   = '#00E0FF';
const SILVER = '#7A99B4';
const BG     = '#03050A';

// ── Boot sequence ────────────────────────────────────────────────────────────
const BOOT_LINES = [
  { text: '> NOYAU IA INITIALISÉ...............', status: '[OK]' },
  { text: '> MODULES NEURONAUX ACTIFS..........', status: '[OK]' },
  { text: '> CHIFFREMENT QUANTIQUE.............', status: '[OK]' },
  { text: '> MÉMOIRE CONTEXTUELLE 128GB........', status: '[OK]' },
  { text: '> PROTOCOLES JARVIS v4.1............', status: '[OK]' },
  { text: '> LIAISON RÉSEAU SÉCURISÉE..........', status: '[OK]' },
  { text: '> SYSTÈME OPÉRATIONNEL..............', status: '[PRÊT]' },
];

const BOOT_START_DELAY = 800;
const BOOT_INTERVAL    = 310;
const TOTAL_DURATION   = BOOT_START_DELAY + BOOT_LINES.length * BOOT_INTERVAL + 800;

// ── Corner bracket component ─────────────────────────────────────────────────
function Corner({ position }: { position: 'tl' | 'tr' | 'bl' | 'br' }) {
  const isTop    = position === 'tl' || position === 'tr';
  const isLeft   = position === 'tl' || position === 'bl';
  const LEN      = 20;
  const THICK    = 1.5;
  const COLOR    = CYAN + 'AA';

  return (
    <View style={[
      styles.corner,
      isTop  ? { top: 40 }    : { bottom: 50 },
      isLeft ? { left: 24 }   : { right: 24 },
    ]}>
      {/* Horizontal arm */}
      <View style={[styles.cornerH, {
        backgroundColor: COLOR,
        alignSelf: isLeft ? 'flex-start' : 'flex-end',
        width: LEN,
        height: THICK,
      }]} />
      {/* Vertical arm */}
      <View style={[styles.cornerV, {
        backgroundColor: COLOR,
        alignSelf: isLeft ? 'flex-start' : 'flex-end',
        width: THICK,
        height: LEN,
        marginTop: isTop ? 0 : -LEN,
        alignItems: isLeft ? 'flex-start' : 'flex-end',
      }]} />
    </View>
  );
}

// ── Intro overlay ─────────────────────────────────────────────────────────────
function JarvisIntro({ onDone }: { onDone: () => void }) {
  const bgOpacity     = useRef(new Animated.Value(1)).current;
  const titleOpacity  = useRef(new Animated.Value(0)).current;
  const titleScale    = useRef(new Animated.Value(0.80)).current;
  const subtitleOp    = useRef(new Animated.Value(0)).current;
  const scanLine      = useRef(new Animated.Value(0)).current;
  const scanLoop      = useRef<Animated.CompositeAnimation | null>(null);
  const [bootLines, setBootLines] = React.useState<number>(0);

  useEffect(() => {
    // Title entrance
    Animated.sequence([
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 650, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(titleScale,   { toValue: 1, duration: 750, easing: Easing.out(Easing.back(1.15)), useNativeDriver: true }),
      ]),
      Animated.timing(subtitleOp, { toValue: 1, duration: 420, useNativeDriver: true }),
    ]).start();

    // Horizontal scan line
    scanLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLine, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(scanLine, { toValue: 0, duration: 0, useNativeDriver: false }),
      ])
    );
    scanLoop.current.start();

    // Boot lines
    const timers: ReturnType<typeof setTimeout>[] = [];
    BOOT_LINES.forEach((_, i) => {
      timers.push(setTimeout(() => setBootLines(i + 1), BOOT_START_DELAY + i * BOOT_INTERVAL));
    });

    // Fade out
    const exitTimer = setTimeout(() => {
      scanLoop.current?.stop();
      Animated.timing(bgOpacity, {
        toValue: 0, duration: 550, easing: Easing.in(Easing.ease), useNativeDriver: true,
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

      {/* Corner brackets */}
      <Corner position="tl" />
      <Corner position="tr" />
      <Corner position="bl" />
      <Corner position="br" />

      {/* Horizontal dividers */}
      <View style={styles.dividerTop} />
      <View style={styles.dividerBottom} />

      {/* Content */}
      <View style={styles.introContent}>

        {/* Unit label */}
        <Animated.Text style={[styles.unitLabel, { opacity: subtitleOp }]}>
          SYSTÈME IA · UNITÉ 001
        </Animated.Text>

        {/* Title */}
        <Animated.Text style={[styles.introTitle, { opacity: titleOpacity, transform: [{ scale: titleScale }] }]}>
          J.A.R.V.I.S.
        </Animated.Text>

        {/* Subtitle */}
        <Animated.Text style={[styles.introSubtitle, { opacity: subtitleOp }]}>
          JUSTE UN SYSTÈME VRAIMENT TRÈS INTELLIGENT
        </Animated.Text>

        {/* Tagline */}
        <Animated.Text style={[styles.introTagline, { opacity: subtitleOp }]}>
          Votre agent IA de poche{'\n'}codé par Maxime Etivant
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
      <Animated.Text style={[styles.introBrand, { opacity: subtitleOp }]}>
        BY MAXIME-E · ROBOT EDITION
      </Animated.Text>
    </Animated.View>
  );
}

// ── Stack navigator ──────────────────────────────────────────────────────────
function RootLayoutNav() {
  return (
    <Stack>
      <Stack.Screen name="index"    options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ headerShown: false, presentation: 'card' }} />
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
    if (appReady) SplashScreen.hideAsync();
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

const styles = StyleSheet.create({
  intro: {
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },

  // Scan line
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: CYAN + '30',
  },

  // Corner brackets
  corner: {
    position: 'absolute',
  },
  cornerH: {},
  cornerV: {},

  // Dividers
  dividerTop: {
    position: 'absolute',
    top: 120,
    left: 44,
    right: 44,
    height: 1,
    backgroundColor: SILVER + '25',
  },
  dividerBottom: {
    position: 'absolute',
    bottom: 80,
    left: 44,
    right: 44,
    height: 1,
    backgroundColor: SILVER + '25',
  },

  // Content
  introContent: {
    alignItems: 'center',
    width: 310,
    gap: 8,
  },
  unitLabel: {
    fontSize: 9,
    fontFamily: 'Inter_400Regular',
    color: SILVER + 'BB',
    letterSpacing: 3.5,
    textAlign: 'center',
    marginBottom: 4,
  },
  introTitle: {
    fontSize: 46,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
    color: BLUE,
    letterSpacing: 10,
    textAlign: 'center',
    textShadowColor: CYAN,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 22,
  },
  introSubtitle: {
    fontSize: 9,
    fontFamily: 'Inter_400Regular',
    color: SILVER + 'BB',
    letterSpacing: 2.5,
    textAlign: 'center',
    marginTop: 2,
  },
  introTagline: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: CYAN + 'CC',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 4,
    letterSpacing: 0.3,
  },

  // Boot log
  bootLog: {
    marginTop: 20,
    width: 310,
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
    color: SILVER + '55',
    letterSpacing: 0.3,
    flex: 1,
  },
  bootTextActive: {
    color: BLUE + 'DD',
  },
  bootStatus: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600' as const,
    letterSpacing: 0.5,
    width: 46,
    textAlign: 'right',
  },
  bootStatusOk: {
    color: '#22d45a',
  },
  bootStatusReady: {
    color: CYAN,
  },

  // Brand
  introBrand: {
    position: 'absolute',
    bottom: 44,
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: SILVER + '55',
    letterSpacing: 4,
  },
});
