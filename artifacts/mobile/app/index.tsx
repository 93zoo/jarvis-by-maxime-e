import React, { useCallback, useEffect, useRef } from 'react';
import {
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  useAnimatedStyle,
  cancelAnimation,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient, Stop } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';
import { useJarvis, Message } from '@/context/JarvisContext';
import { JarvisOrb } from '@/components/JarvisOrb';
import { MessageBubble } from '@/components/MessageBubble';
import { ChatInput } from '@/components/ChatInput';

// ── Orbital system config ────────────────────────────────────────────────────

const { width: SW } = Dimensions.get('window');
const SYS_SIZE = Math.min(SW - 16, 380);
const CX = SYS_SIZE / 2;
const CY = SYS_SIZE / 2;
const ORB_SIZE = Math.round(SYS_SIZE * 0.30);   // orb diameter
const ORB_R = ORB_SIZE / 2;

type JarvisCtx = ReturnType<typeof useJarvis>;

interface OrbNode {
  cx: number;
  cy: number;
  emoji: string;
  label: string;
  color: string;
  onTap: (j: JarvisCtx) => void;
}

function buildNodes(s: number): OrbNode[] {
  const r = s * 0.44;   // orbital radius
  const a = (deg: number) => (deg * Math.PI) / 180;
  const pos = (deg: number, rx = r, ry = r) => ({
    cx: Math.round(CX + rx * Math.cos(a(deg))),
    cy: Math.round(CY + ry * Math.sin(a(deg))),
  });
  return [
    { ...pos(-75), emoji: '🌤', label: 'MÉTÉO',       color: '#38BDF8', onTap: j => j.fetchWeather('Paris') },
    { ...pos(-15), emoji: '📰', label: 'ACTUALITÉS',  color: '#A78BFA', onTap: j => j.fetchNews('') },
    { ...pos( 40), emoji: '💬', label: 'CITATION',    color: '#34D399', onTap: j => j.sendMessage("Donne-moi une citation inspirante avec son auteur.") },
    { ...pos(100), emoji: '🐙', label: 'GITHUB',      color: '#C084FC', onTap: j => j.fetchGithubNotifs() },
    { ...pos(160), emoji: '🌍', label: 'TRADUCTEUR',  color: '#00E0FF', onTap: j => j.sendMessage("Comment dit-on 'intelligence artificielle' en japonais, en arabe et en russe ?") },
    { ...pos(220), emoji: '🔐', label: 'SÉCURITÉ',    color: '#EF4444', onTap: j => j.sendMessage("Génère un mot de passe ultra-sécurisé de 24 caractères avec symboles.") },
  ];
}

const NODES = buildNodes(SYS_SIZE);

// ── Line coords between orb edge and node ─────────────────────────────────

function lineCoords(node: OrbNode) {
  const dx = node.cx - CX;
  const dy = node.cy - CY;
  const len = Math.hypot(dx, dy);
  const nx = dx / len;
  const ny = dy / len;
  return {
    x1: CX + nx * (ORB_R + 10),
    y1: CY + ny * (ORB_R + 10),
    x2: node.cx - nx * 18,
    y2: node.cy - ny * 18,
  };
}

// ── Node dot + label ──────────────────────────────────────────────────────

function NodeDot({ node, onPress, disabled }: { node: OrbNode; onPress: () => void; disabled: boolean }) {
  const pulse = useSharedValue(0.6);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200 }),
        withTiming(0.55, { duration: 1200 }),
      ), -1, false
    );
    return () => cancelAnimation(pulse);
  }, []);

  const glowStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  // Label position: push label away from center
  const dx = node.cx - CX;
  const dy = node.cy - CY;
  const labelStyle: Record<string, number | string> = {};

  if (Math.abs(dx) >= Math.abs(dy)) {
    // Predominantly horizontal node
    labelStyle[dx > 0 ? 'left' : 'right'] = 26;
    labelStyle.top = 6;
  } else {
    // Predominantly vertical node
    labelStyle[dy > 0 ? 'top' : 'bottom'] = 26;
    labelStyle.left = -12;
  }

  return (
    <View style={{ position: 'absolute', left: node.cx - 20, top: node.cy - 20 }}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={node.label}
        style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
      >
        {/* Glow ring */}
        <Animated.View style={[{
          position: 'absolute',
          width: 36, height: 36, borderRadius: 18,
          backgroundColor: node.color + '20',
          borderWidth: 1,
          borderColor: node.color + '70',
        }, glowStyle]} />

        {/* Emoji */}
        <Text style={{ fontSize: 17, lineHeight: 20 }}>{node.emoji}</Text>

        {/* Label */}
        <View style={[{ position: 'absolute' }, labelStyle]}>
          <Text style={{ color: node.color + 'CC', fontSize: 8, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 }}>
            {node.label}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

// ── Orbital system ─────────────────────────────────────────────────────────

function OrbitalSystem({ jarvis, isActive }: { jarvis: JarvisCtx; isActive: boolean }) {
  const rotOrbit = useSharedValue(0);

  useEffect(() => {
    rotOrbit.value = withRepeat(
      withTiming(360, { duration: isActive ? 20000 : 40000 }),
      -1, false
    );
    return () => cancelAnimation(rotOrbit);
  }, [isActive]);

  const orbitRingStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotOrbit.value}deg` }],
  }));

  const nodeLines = NODES.map(n => lineCoords(n));
  const orbR = ORB_R;

  return (
    <View style={{ width: SYS_SIZE, height: SYS_SIZE, alignSelf: 'center' }}>

      {/* ── SVG layer: orbital ring + connection lines ── */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width={SYS_SIZE} height={SYS_SIZE}>
          <Defs>
            {NODES.map((node, i) => (
              <LinearGradient
                key={`lg${i}`}
                id={`line${i}`}
                x1={nodeLines[i].x1} y1={nodeLines[i].y1}
                x2={nodeLines[i].x2} y2={nodeLines[i].y2}
                gradientUnits="userSpaceOnUse"
              >
                <Stop offset="0%"   stopColor={node.color} stopOpacity="0.08" />
                <Stop offset="50%"  stopColor={node.color} stopOpacity="0.35" />
                <Stop offset="100%" stopColor={node.color} stopOpacity="0.7"  />
              </LinearGradient>
            ))}
          </Defs>

          {/* Orbital guide ring */}
          <Circle
            cx={CX} cy={CY}
            r={orbR + SYS_SIZE * 0.44 - orbR}
            fill="none"
            stroke="#0099FF"
            strokeWidth={0.5}
            strokeDasharray="4 18"
            opacity={0.2}
          />

          {/* Connection lines per node */}
          {NODES.map((_, i) => (
            <Line
              key={i}
              x1={nodeLines[i].x1} y1={nodeLines[i].y1}
              x2={nodeLines[i].x2} y2={nodeLines[i].y2}
              stroke={`url(#line${i})`}
              strokeWidth={1}
            />
          ))}

          {/* Small dot at each line endpoint near orb */}
          {NODES.map((node, i) => (
            <Circle
              key={`d${i}`}
              cx={nodeLines[i].x1} cy={nodeLines[i].y1}
              r={2}
              fill={node.color}
              opacity={0.6}
            />
          ))}
        </Svg>
      </View>

      {/* ── Slow-rotating orbital ring overlay ── */}
      <Animated.View style={[StyleSheet.absoluteFill, orbitRingStyle]} pointerEvents="none">
        <Svg width={SYS_SIZE} height={SYS_SIZE}>
          <Circle
            cx={CX} cy={CY}
            r={SYS_SIZE * 0.44}
            fill="none"
            stroke="#00E0FF"
            strokeWidth={0.8}
            strokeDasharray="2 50"
            opacity={0.5}
          />
        </Svg>
      </Animated.View>

      {/* ── JarvisOrb centered ── */}
      <View style={{
        position: 'absolute',
        left: CX - ORB_SIZE * 1.4,
        top: CY - ORB_SIZE * 1.4,
      }}>
        <JarvisOrb isActive={isActive} size={ORB_SIZE} />
      </View>

      {/* ── Orbital nodes ── */}
      {NODES.map((node, i) => (
        <NodeDot
          key={i}
          node={node}
          disabled={isActive}
          onPress={async () => {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            node.onTap(jarvis);
          }}
        />
      ))}
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const jarvis = useJarvis();
  const { messages, isStreaming, sendMessage, clearConversation, error, clearError } = jarvis;

  const flatListRef = useRef<FlatList>(null);
  const reversedMessages = [...messages].reverse();

  const renderItem = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const isLastAssistant = item.role === 'assistant' && index === 0 && isStreaming;
      return <MessageBubble message={item} isStreaming={isLastAssistant} />;
    },
    [isStreaming]
  );
  const keyExtractor = useCallback((item: Message) => item.id, []);

  const handleClear = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    clearConversation();
  };

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <View style={styles.headerLeft}>
          <View style={styles.statusWrapper}>
            <View style={[styles.statusDiamond, { backgroundColor: colors.accent, shadowColor: colors.accent }]} />
            <View style={[styles.statusRing, { borderColor: colors.accent + '40' }]} />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: colors.primary }]}>J.A.R.V.I.S.</Text>
            <Text style={[styles.headerSub, { color: colors.silver }]}>UNITÉ 001 · EN LIGNE</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <View style={[styles.statPill, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <View style={[styles.statDot, { backgroundColor: '#22c55e' }]} />
            <Text style={[styles.statText, { color: colors.mutedForeground }]}>GPT-4o</Text>
          </View>

          {messages.length > 0 && (
            <Pressable
              onPress={handleClear}
              style={({ pressed }) => [styles.headerBtn, { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.5 : 1 }]}
              hitSlop={8}
            >
              <Feather name="trash-2" size={15} color={colors.mutedForeground} />
            </Pressable>
          )}
          <Pressable
            onPress={() => router.push('/tasks' as never)}
            style={({ pressed }) => [styles.headerBtn, { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.5 : 1 }]}
            hitSlop={8}
          >
            <Feather name="check-square" size={15} color={colors.mutedForeground} />
          </Pressable>
          <Pressable
            onPress={() => router.push('/settings')}
            style={({ pressed }) => [styles.headerBtn, { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.5 : 1 }]}
            hitSlop={8}
          >
            <Feather name="settings" size={15} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>

      {/* Header separator */}
      <View style={styles.separatorRow}>
        <View style={[styles.separatorLeft,  { backgroundColor: colors.border }]} />
        <View style={[styles.separatorGlow,  { backgroundColor: colors.primary + '90' }]} />
        <View style={[styles.separatorRight, { backgroundColor: colors.border }]} />
      </View>

      <KeyboardAvoidingView style={styles.keyboardView} behavior="padding" keyboardVerticalOffset={0}>

        {messages.length === 0 ? (
          /* ── Empty state: orbital system ── */
          <View style={styles.emptyOuter}>
            {/* Status row */}
            <View style={styles.statusRow}>
              <View style={[styles.statusChip, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <View style={[styles.statusChipDot, { backgroundColor: '#22c55e' }]} />
                <Text style={[styles.statusChipText, { color: colors.mutedForeground }]}>6 MODULES ACTIFS</Text>
              </View>
            </View>

            {/* Orbital system */}
            <OrbitalSystem jarvis={jarvis} isActive={isStreaming} />

            {/* Subtitle */}
            <View style={styles.subtitleBlock}>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Online and ready, sir.</Text>
              <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
                Appuyez sur un module ou parlez-moi
              </Text>
            </View>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={reversedMessages}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            inverted
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            scrollEnabled={!!reversedMessages.length}
            ListHeaderComponent={
              isStreaming ? (
                <View style={styles.typingRow}>
                  <View style={[styles.typingDot, { backgroundColor: colors.primary }]} />
                  <View style={[styles.typingDot, styles.typingDot2, { backgroundColor: colors.primary }]} />
                  <View style={[styles.typingDot, styles.typingDot3, { backgroundColor: colors.primary }]} />
                </View>
              ) : null
            }
          />
        )}

        {error && (
          <Pressable
            onPress={clearError}
            style={[styles.errorBanner, { backgroundColor: colors.destructive + '20', borderColor: colors.destructive }]}
          >
            <Feather name="alert-circle" size={14} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive }]} numberOfLines={2}>{error}</Text>
            <Feather name="x" size={14} color={colors.destructive} />
          </Pressable>
        )}

        <ChatInput onSend={sendMessage} isStreaming={isStreaming} disabled={false} />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 10 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusWrapper: { alignItems: 'center', justifyContent: 'center', width: 24, height: 24 },
  statusDiamond: { width: 8, height: 8, transform: [{ rotate: '45deg' }], shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 6, position: 'absolute' },
  statusRing: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, position: 'absolute' },
  headerTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  headerSub: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 1.5, marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1 },
  statDot: { width: 5, height: 5, borderRadius: 3 },
  statText: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 0.5 },
  headerBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  // Separator
  separatorRow: { flexDirection: 'row', alignItems: 'center', height: 1 },
  separatorLeft:  { flex: 2, height: 1 },
  separatorGlow:  { width: 80, height: 1.5 },
  separatorRight: { flex: 1, height: 1 },

  keyboardView: { flex: 1 },

  // Empty state — orbital
  emptyOuter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 8,
    gap: 0,
  },

  statusRow: { alignItems: 'center', marginBottom: 10 },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  statusChipDot: { width: 5, height: 5, borderRadius: 3 },
  statusChipText: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5 },

  subtitleBlock: { alignItems: 'center', gap: 4, marginTop: 12 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.3 },
  emptySubtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', letterSpacing: 0.2 },

  // List
  list: { flex: 1 },
  listContent: { paddingHorizontal: 12, paddingVertical: 12, gap: 6 },

  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 10, paddingHorizontal: 16 },
  typingDot: { width: 5, height: 5, borderRadius: 3 },
  typingDot2: { opacity: 0.6 },
  typingDot3: { opacity: 0.3 },

  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 10, padding: 10, borderRadius: 8, borderWidth: 1 },
  errorText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular' },
});
