import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated as RNAnimated,
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
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';
import { useJarvis, Message } from '@/context/JarvisContext';
import { JarvisOrb } from '@/components/JarvisOrb';
import { MessageBubble } from '@/components/MessageBubble';
import { ChatInput } from '@/components/ChatInput';
import { ToolsMenu } from '@/components/ToolsMenu';

// ── Dimensions ───────────────────────────────────────────────────────────────

const { width: SW, height: SH } = Dimensions.get('window');
const CX = SW / 2;
const ORB_SIZE = Math.round(SW * 0.22); // ~88px on 402px
const ORB_R    = ORB_SIZE / 2;

// ── All 15 tools for home orbital ────────────────────────────────────────────

type ToolKey = 'search' | 'translate' | 'calculate' | 'weather' | 'news' | 'currency'
  | 'navigate' | 'email' | 'github' | 'task' | 'note' | 'password'
  | 'summarize' | 'timer' | 'quote';

interface HomeNode {
  key: ToolKey;
  emoji: string;
  label: string;
  color: string;
  noInput: boolean;  // true = execute immediately, false = open input modal
  dx: number;        // offset from CX
  dy: number;        // offset from orbital center CY
}

// Compute positions: inner ring r=108, outer ring rx=155 ry=160
const toRad = (d: number) => (d * Math.PI) / 180;

const ip = (deg: number, r = 108) => ({ dx: Math.round(r * Math.cos(toRad(deg))), dy: Math.round(r * Math.sin(toRad(deg))) });
const op = (deg: number, rx = 155, ry = 160) => ({ dx: Math.round(rx * Math.cos(toRad(deg))), dy: Math.round(ry * Math.sin(toRad(deg))) });

const HOME_NODES: HomeNode[] = [
  // Inner ring — 5 nodes, 72° apart, start -90°
  { key: 'search',   emoji: '🔍', label: 'RECHERCHE',  color: '#0099FF', noInput: false, ...ip(-90) },
  { key: 'weather',  emoji: '🌤', label: 'MÉTÉO',      color: '#38BDF8', noInput: false, ...ip(-18) },
  { key: 'navigate', emoji: '🗺', label: 'NAVIGATION', color: '#FB923C', noInput: false, ...ip( 54) },
  { key: 'task',     emoji: '✅', label: 'TÂCHE',      color: '#00E0FF', noInput: false, ...ip(126) },
  { key: 'github',   emoji: '🐙', label: 'GITHUB',     color: '#C084FC', noInput: true,  ...ip(198) },
  // Outer ring — 10 nodes, 36° apart, start -108°
  { key: 'news',     emoji: '📰', label: 'ACTUALITÉS', color: '#A78BFA', noInput: true,  ...op(-108) },
  { key: 'quote',    emoji: '💬', label: 'CITATION',   color: '#34D399', noInput: true,  ...op( -72) },
  { key: 'calculate',emoji: '🧮', label: 'CALCUL',     color: '#818CF8', noInput: false, ...op( -36) },
  { key: 'currency', emoji: '💱', label: 'DEVISES',    color: '#34D399', noInput: false, ...op(   0) },
  { key: 'email',    emoji: '📧', label: 'EMAIL',      color: '#F472B6', noInput: false, ...op(  36) },
  { key: 'note',     emoji: '📝', label: 'NOTE',       color: '#00E0FF', noInput: false, ...op(  72) },
  { key: 'summarize',emoji: '📊', label: 'RÉSUMÉ',     color: '#A78BFA', noInput: false, ...op( 108) },
  { key: 'timer',    emoji: '⏱', label: 'MINUTEUR',   color: '#FB923C', noInput: false, ...op( 144) },
  { key: 'translate',emoji: '🌍', label: 'TRADUCTEUR', color: '#00E0FF', noInput: false, ...op( 180) },
  { key: 'password', emoji: '🔐', label: 'SÉCURITÉ',   color: '#EF4444', noInput: false, ...op( 216) },
];

// Line endpoints: from orb edge to near-node
function lineCoords(dx: number, dy: number) {
  const len = Math.hypot(dx, dy);
  const nx = dx / len; const ny = dy / len;
  return {
    x1: Math.round(nx * (ORB_R + 10)),
    y1: Math.round(ny * (ORB_R + 10)),
    x2: Math.round(dx - nx * 18),
    y2: Math.round(dy - ny * 18),
  };
}

// Label direction based on node position
function labelSide(dx: number, dy: number): 'left' | 'right' | 'top' | 'bottom' {
  if (Math.abs(dx) > Math.abs(dy) * 1.4) return dx > 0 ? 'left' : 'right';
  return dy > 0 ? 'top' : 'bottom';
}

// ── Nebula clouds ────────────────────────────────────────────────────────────

function NebulaBackground() {
  const a1 = useRef(new RNAnimated.Value(0.7)).current;
  const a2 = useRef(new RNAnimated.Value(0.4)).current;
  const a3 = useRef(new RNAnimated.Value(0.8)).current;
  const a4 = useRef(new RNAnimated.Value(0.5)).current;

  useEffect(() => {
    const pulse = (v: RNAnimated.Value, lo: number, hi: number, dur: number) =>
      RNAnimated.loop(RNAnimated.sequence([
        RNAnimated.timing(v, { toValue: hi, duration: dur, useNativeDriver: true }),
        RNAnimated.timing(v, { toValue: lo, duration: dur, useNativeDriver: true }),
      ])).start();

    pulse(a1, 0.4, 1,   4200);
    pulse(a2, 0.3, 0.9, 5800);
    pulse(a3, 0.5, 1,   3600);
    pulse(a4, 0.3, 0.8, 6500);
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Cloud 1 — blue, top-left */}
      <RNAnimated.View style={[StyleSheet.absoluteFill, { opacity: a1 }]}>
        <Svg width={SW} height={SH}>
          <Defs>
            <RadialGradient id="nb1" cx="20%" cy="18%" r="55%">
              <Stop offset="0%"   stopColor="#0099FF" stopOpacity="0.22" />
              <Stop offset="55%"  stopColor="#0066CC" stopOpacity="0.06" />
              <Stop offset="100%" stopColor="#0099FF" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={SW} height={SH} fill="url(#nb1)" />
        </Svg>
      </RNAnimated.View>

      {/* Cloud 2 — purple, right */}
      <RNAnimated.View style={[StyleSheet.absoluteFill, { opacity: a2 }]}>
        <Svg width={SW} height={SH}>
          <Defs>
            <RadialGradient id="nb2" cx="82%" cy="55%" r="50%">
              <Stop offset="0%"   stopColor="#7C3AED" stopOpacity="0.18" />
              <Stop offset="60%"  stopColor="#A78BFA" stopOpacity="0.05" />
              <Stop offset="100%" stopColor="#7C3AED" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={SW} height={SH} fill="url(#nb2)" />
        </Svg>
      </RNAnimated.View>

      {/* Cloud 3 — cyan, bottom-left */}
      <RNAnimated.View style={[StyleSheet.absoluteFill, { opacity: a3 }]}>
        <Svg width={SW} height={SH}>
          <Defs>
            <RadialGradient id="nb3" cx="15%" cy="78%" r="45%">
              <Stop offset="0%"   stopColor="#00E0FF" stopOpacity="0.14" />
              <Stop offset="70%"  stopColor="#00B4D8" stopOpacity="0.04" />
              <Stop offset="100%" stopColor="#00E0FF" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={SW} height={SH} fill="url(#nb3)" />
        </Svg>
      </RNAnimated.View>

      {/* Cloud 4 — teal, center */}
      <RNAnimated.View style={[StyleSheet.absoluteFill, { opacity: a4 }]}>
        <Svg width={SW} height={SH}>
          <Defs>
            <RadialGradient id="nb4" cx="55%" cy="45%" r="38%">
              <Stop offset="0%"   stopColor="#0D9488" stopOpacity="0.10" />
              <Stop offset="100%" stopColor="#0D9488" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={SW} height={SH} fill="url(#nb4)" />
        </Svg>
      </RNAnimated.View>
    </View>
  );
}

// ── Orbital node dot ─────────────────────────────────────────────────────────

function NodeDot({ node, cx, cy, onPress, disabled }: {
  node: HomeNode;
  cx: number; cy: number;
  onPress: () => void;
  disabled: boolean;
}) {
  const pulse = useSharedValue(0.55);
  const scale = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withTiming(1, { duration: 1400 }), withTiming(0.5, { duration: 1400 })),
      -1, false
    );
    scale.value = withRepeat(
      withSequence(withTiming(1.06, { duration: 1800 }), withTiming(1, { duration: 1800 })),
      -1, false
    );
    return () => { cancelAnimation(pulse); cancelAnimation(scale); };
  }, []);

  const glowStyle  = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const scaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const side = labelSide(node.dx, node.dy);
  const labelPos: Record<string, number | string> = {};
  if (side === 'left')   { labelPos.right = 24; labelPos.top = 8; }
  if (side === 'right')  { labelPos.left  = 24; labelPos.top = 8; }
  if (side === 'top')    { labelPos.bottom = 26; labelPos.left = -14; }
  if (side === 'bottom') { labelPos.top = 26; labelPos.left = -14; }

  return (
    <View style={{ position: 'absolute', left: cx - 20, top: cy - 20 }}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${node.label} — JARVIS module`}
        style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
      >
        {/* Ambient glow ring */}
        <Animated.View style={[{
          position: 'absolute', width: 38, height: 38, borderRadius: 19,
          backgroundColor: node.color + '18', borderWidth: 1, borderColor: node.color + '60',
        }, glowStyle]} />

        {/* Node icon */}
        <Animated.View style={scaleStyle}>
          <Text style={{ fontSize: 18, lineHeight: 22 }}>{node.emoji}</Text>
        </Animated.View>

        {/* Label */}
        <View style={[{ position: 'absolute' }, labelPos]}>
          <Text numberOfLines={1} style={{ color: node.color + 'CC', fontSize: 7.5, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8 }}>
            {node.label}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

// ── Orbital hub component ─────────────────────────────────────────────────────

function OrbitalHub({
  isActive,
  onNodeTap,
  containerH,
}: {
  isActive: boolean;
  onNodeTap: (node: HomeNode) => void;
  containerH: number;
}) {
  const CY = Math.round(containerH * 0.44);

  const ringRot = useSharedValue(0);
  useEffect(() => {
    ringRot.value = withRepeat(withTiming(360, { duration: isActive ? 18000 : 38000 }), -1, false);
    return () => cancelAnimation(ringRot);
  }, [isActive]);
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${ringRot.value}deg` }] }));

  const lineDefs = HOME_NODES.map(n => lineCoords(n.dx, n.dy));

  return (
    <View style={{ width: SW, height: containerH }}>

      {/* ── SVG layer: lines + orbital rings ── */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width={SW} height={containerH}>
          <Defs>
            {/* Outer orbital ring gradient — rotating shimmer via separate Animated.View */}
            {HOME_NODES.map((n, i) => (
              <LinearGradient
                key={`lg${i}`}
                id={`l${i}`}
                x1={CX + lineDefs[i].x1} y1={CY + lineDefs[i].y1}
                x2={CX + lineDefs[i].x2} y2={CY + lineDefs[i].y2}
                gradientUnits="userSpaceOnUse"
              >
                <Stop offset="0%"   stopColor={n.color} stopOpacity="0.05" />
                <Stop offset="40%"  stopColor={n.color} stopOpacity="0.30" />
                <Stop offset="100%" stopColor={n.color} stopOpacity="0.75" />
              </LinearGradient>
            ))}
          </Defs>

          {/* Inner orbital guide */}
          <Circle cx={CX} cy={CY} r={108} fill="none" stroke="#0099FF" strokeWidth={0.4} strokeDasharray="3 20" opacity={0.18} />

          {/* Outer orbital guide */}
          <Circle cx={CX} cy={CY} r={157} fill="none" stroke="#A78BFA" strokeWidth={0.4} strokeDasharray="3 26" opacity={0.14} />

          {/* Connection lines */}
          {HOME_NODES.map((n, i) => (
            <Line
              key={i}
              x1={CX + lineDefs[i].x1} y1={CY + lineDefs[i].y1}
              x2={CX + lineDefs[i].x2} y2={CY + lineDefs[i].y2}
              stroke={`url(#l${i})`}
              strokeWidth={0.9}
            />
          ))}

          {/* Small dot at line start (near orb) */}
          {HOME_NODES.map((n, i) => (
            <Circle key={`sd${i}`} cx={CX + lineDefs[i].x1} cy={CY + lineDefs[i].y1} r={1.8} fill={n.color} opacity={0.7} />
          ))}
        </Svg>
      </View>

      {/* ── Rotating orbital ring ── */}
      <Animated.View style={[StyleSheet.absoluteFill, ringStyle]} pointerEvents="none">
        <Svg width={SW} height={containerH}>
          <Circle cx={CX} cy={CY} r={157} fill="none" stroke="#00E0FF" strokeWidth={1} strokeDasharray="2 60" opacity={0.45} />
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

      {/* ── 15 orbital nodes ── */}
      {HOME_NODES.map((node, i) => (
        <NodeDot
          key={node.key}
          node={node}
          cx={CX + node.dx}
          cy={CY + node.dy}
          disabled={isActive}
          onPress={async () => {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onNodeTap(node);
          }}
        />
      ))}

      {/* ── Module count label ── */}
      <View style={{ position: 'absolute', bottom: 10, alignSelf: 'center', left: 0, right: 0, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#22c55e' }} />
          <Text style={{ color: '#2E4E6A', fontSize: 8, fontFamily: 'Inter_400Regular', letterSpacing: 1.5 }}>
            15 MODULES ACTIFS · J.A.R.V.I.S v2.4
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const jarvis = useJarvis();
  const { messages, isStreaming, sendMessage, clearConversation, error, clearError, fetchWeather, fetchNews, fetchGithubNotifs } = jarvis;

  const flatListRef = useRef<FlatList>(null);
  const reversedMessages = [...messages].reverse();

  // ToolsMenu state — lifted here so orbital nodes can trigger it
  const [toolsOpen, setToolsOpen]       = useState(false);
  const [initialTool, setInitialTool]   = useState<ToolKey | undefined>(undefined);

  const openTool = (key?: ToolKey) => {
    setInitialTool(key);
    setToolsOpen(true);
  };

  const handleNodeTap = (node: HomeNode) => {
    if (node.noInput) {
      // Execute immediately
      switch (node.key) {
        case 'github': fetchGithubNotifs(); break;
        case 'news':   fetchNews(''); break;
        case 'quote':  sendMessage("Donne-moi une citation inspirante ou philosophique avec son auteur."); break;
      }
    } else {
      openTool(node.key);
    }
  };

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

      {/* ── Nebula clouds (full screen, behind everything) ── */}
      <NebulaBackground />

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
          <View style={[styles.statPill, { borderColor: colors.border, backgroundColor: colors.card + 'CC' }]}>
            <View style={[styles.statDot, { backgroundColor: '#22c55e' }]} />
            <Text style={[styles.statText, { color: colors.mutedForeground }]}>GPT-4o</Text>
          </View>
          {messages.length > 0 && (
            <Pressable onPress={handleClear} style={({ pressed }) => [styles.headerBtn, { borderColor: colors.border, backgroundColor: colors.card + 'CC', opacity: pressed ? 0.5 : 1 }]} hitSlop={8}>
              <Feather name="trash-2" size={15} color={colors.mutedForeground} />
            </Pressable>
          )}
          <Pressable onPress={() => router.push('/tasks' as never)} style={({ pressed }) => [styles.headerBtn, { borderColor: colors.border, backgroundColor: colors.card + 'CC', opacity: pressed ? 0.5 : 1 }]} hitSlop={8}>
            <Feather name="check-square" size={15} color={colors.mutedForeground} />
          </Pressable>
          <Pressable onPress={() => router.push('/settings')} style={({ pressed }) => [styles.headerBtn, { borderColor: colors.border, backgroundColor: colors.card + 'CC', opacity: pressed ? 0.5 : 1 }]} hitSlop={8}>
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
          /* ── Empty state: orbital hub ── */
          <View style={styles.emptyOuter}>
            <OrbitalHub
              isActive={isStreaming}
              onNodeTap={handleNodeTap}
              containerH={Math.round(SH * 0.60)}
            />
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
          <Pressable onPress={clearError} style={[styles.errorBanner, { backgroundColor: colors.destructive + '20', borderColor: colors.destructive }]}>
            <Feather name="alert-circle" size={14} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive }]} numberOfLines={2}>{error}</Text>
            <Feather name="x" size={14} color={colors.destructive} />
          </Pressable>
        )}

        <ChatInput onSend={sendMessage} isStreaming={isStreaming} disabled={false} onOpenTools={() => openTool(undefined)} />
      </KeyboardAvoidingView>

      {/* ToolsMenu — lifted here from ChatInput */}
      <ToolsMenu
        visible={toolsOpen}
        onClose={() => { setToolsOpen(false); setInitialTool(undefined); }}
        initialTool={initialTool}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

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

  separatorRow: { flexDirection: 'row', alignItems: 'center', height: 1 },
  separatorLeft:  { flex: 2, height: 1 },
  separatorGlow:  { width: 80, height: 1.5 },
  separatorRight: { flex: 1, height: 1 },

  keyboardView: { flex: 1 },

  emptyOuter: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  list: { flex: 1 },
  listContent: { paddingHorizontal: 12, paddingVertical: 12, gap: 6 },

  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 10, paddingHorizontal: 16 },
  typingDot: { width: 5, height: 5, borderRadius: 3 },
  typingDot2: { opacity: 0.6 },
  typingDot3: { opacity: 0.3 },

  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 10, padding: 10, borderRadius: 8, borderWidth: 1 },
  errorText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular' },
});
