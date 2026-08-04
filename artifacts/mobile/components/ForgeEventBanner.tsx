/**
 * ForgeEventBanner — Bandeau d'événements aléatoires de la forge
 *
 * Style médiéval/fantasy avec texte défilant, animations de braises,
 * système de cooldown 1h et renouvellement automatique toutes les 10 min.
 *
 * Hermes hoisting rule: hooks-bearing sub-components defined BEFORE main.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Feather from '@/components/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGame } from '@/context/GameContext';
import {
  FE_KEY_EVENT_ID,
  FE_KEY_ACTIVATED,
  FE_COOLDOWN_MS,
  type ForgeEventId,
} from '@/utils/forgeEvent';

// ── Event catalog — only events wired into game systems ───────────────────────

interface ForgeEvent {
  id: ForgeEventId;
  /** Relative draw weight — higher = more common. */
  weight: number;
  /** Feather icon name */
  icon: React.ComponentProps<typeof Feather>['name'];
  color: string;
  label: string;
  /** Duration the bonus is active in milliseconds (0 = one-shot). */
  durationMs: number;
}

export const FORGE_EVENTS: ForgeEvent[] = [
  { id: 'gem_chance',    weight: 2, icon: 'hexagon',    color: '#AA44FF', label: 'Qualité de gemme forgée +20 pts (1h)',          durationMs: FE_COOLDOWN_MS },
  { id: 'gold_bonus',    weight: 3, icon: 'dollar-sign',        color: '#FFD700', label: '+30 % de pièces sur chaque vente d\'objet (1h)', durationMs: FE_COOLDOWN_MS },
  { id: 'double_xp',     weight: 2, icon: 'star',        color: '#00CED1', label: 'Double XP lors des combats de boss (1h)',         durationMs: FE_COOLDOWN_MS },
  { id: 'free_chest',    weight: 1, icon: 'gift',        color: '#44FF88', label: 'Coffre de ressources offert — touchez pour ouvrir !', durationMs: 0           },
  { id: 'mystery_reward',weight: 1, icon: 'help-circle', color: '#FF69B4', label: 'Récompense mystère — touchez pour révéler !',       durationMs: 0           },
];

// Weighted random draw
function pickRandomEvent(): ForgeEvent {
  const total = FORGE_EVENTS.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const ev of FORGE_EVENTS) {
    r -= ev.weight;
    if (r <= 0) return ev;
  }
  return FORGE_EVENTS[0];
}

// ── AsyncStorage keys (shared with utils/forgeEvent.ts) ──────────────────────

const KEY_EVENT_ID    = FE_KEY_EVENT_ID;
const KEY_EVENT_AT    = '@fk_event_selected_at';   // when it was selected
const KEY_ACTIVATED   = FE_KEY_ACTIVATED;

const REFRESH_INTERVAL_MS = 10 * 60_000;  // new event every 10 min
const COOLDOWN_MS         = FE_COOLDOWN_MS;

function msToCountdown(ms: number): string {
  if (ms <= 0) return '0:00';
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Animated ember dot ────────────────────────────────────────────────────────
// Defined BEFORE main component (Hermes hoisting)

function EmberDot({ color, delay }: { color: string; delay: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 600 + Math.random() * 400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
    ).start();
  }, []);
  return (
    <Animated.View style={[eds.dot, { backgroundColor: color, opacity: anim, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }]} />
  );
}
const eds = StyleSheet.create({ dot: { width: 4, height: 4, borderRadius: 2, position: 'absolute' } });

// ── Main component ────────────────────────────────────────────────────────────

export default function ForgeEventBanner() {
  const game = useGame();

  const [event, setEvent] = useState<ForgeEvent | null>(null);
  const [activatedAt, setActivatedAt] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [activated, setActivated] = useState(false); // flash animation triggered

  // Scroll animation
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollAnim = useRef<Animated.CompositeAnimation | null>(null);
  const [textWidth, setTextWidth] = useState(0);
  const [containerWidth, setContainerWidth] = useState(300);

  // Glow pulse animation
  const glowAnim = useRef(new Animated.Value(0.4)).current;
  // Activation flash
  const flashAnim = useRef(new Animated.Value(0)).current;

  // Ember positions (randomized once)
  const embers = useMemo(() => Array.from({ length: 5 }, (_, i) => ({
    key: i,
    left: 8 + i * 18,
    delay: i * 250,
  })), []);

  // ── Load persisted state ────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const [eventId, selectedAt, actAt] = await Promise.all([
          AsyncStorage.getItem(KEY_EVENT_ID),
          AsyncStorage.getItem(KEY_EVENT_AT),
          AsyncStorage.getItem(KEY_ACTIVATED),
        ]);
        const now = Date.now();
        const selAt = selectedAt ? parseInt(selectedAt, 10) : 0;
        const actAtMs = actAt ? parseInt(actAt, 10) : null;

        // Was activated — check cooldown
        if (actAtMs !== null) {
          const elapsed = now - actAtMs;
          if (elapsed < COOLDOWN_MS) {
            setActivatedAt(actAtMs);
            setRemainingMs(COOLDOWN_MS - elapsed);
            // Show the event that was active
            const ev = FORGE_EVENTS.find(e => e.id === eventId) ?? null;
            setEvent(ev);
            return;
          }
          // Cooldown expired — clear activation, maybe pick new event
          await AsyncStorage.removeItem(KEY_ACTIVATED);
        }

        // Check if current event has expired (10 min window)
        if (eventId && selAt && now - selAt < REFRESH_INTERVAL_MS) {
          setEvent(FORGE_EVENTS.find(e => e.id === eventId) ?? pickRandomEvent());
          return;
        }

        // Pick a new event
        const newEv = pickRandomEvent();
        setEvent(newEv);
        await AsyncStorage.setItem(KEY_EVENT_ID, newEv.id);
        await AsyncStorage.setItem(KEY_EVENT_AT, String(now));
      } catch {
        setEvent(FORGE_EVENTS[0]);
      }
    })();
  }, []);

  // ── Auto-refresh every 10 min (when not in cooldown) ─────────────────────

  useEffect(() => {
    if (activatedAt !== null) return; // skip during cooldown
    const id = setInterval(async () => {
      const newEv = pickRandomEvent();
      setEvent(newEv);
      try {
        await AsyncStorage.setItem(KEY_EVENT_ID, newEv.id);
        await AsyncStorage.setItem(KEY_EVENT_AT, String(Date.now()));
      } catch { /* ignore */ }
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [activatedAt]);

  // ── Countdown timer ───────────────────────────────────────────────────────

  useEffect(() => {
    if (activatedAt === null) return;
    const id = setInterval(() => {
      const left = COOLDOWN_MS - (Date.now() - activatedAt);
      if (left <= 0) {
        setActivatedAt(null);
        setRemainingMs(0);
        // Pick fresh event
        (async () => {
          const newEv = pickRandomEvent();
          setEvent(newEv);
          await AsyncStorage.setItem(KEY_EVENT_ID, newEv.id);
          await AsyncStorage.setItem(KEY_EVENT_AT, String(Date.now()));
          await AsyncStorage.removeItem(KEY_ACTIVATED);
        })();
      } else {
        setRemainingMs(left);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [activatedAt]);

  // ── Glow pulse ─────────────────────────────────────────────────────────────

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 0.9, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.3, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  // ── Scroll animation ───────────────────────────────────────────────────────

  useEffect(() => {
    if (textWidth === 0 || containerWidth === 0) return;
    if (activatedAt !== null) { scrollAnim.current?.stop(); return; }

    scrollAnim.current?.stop();
    const totalTravel = textWidth + containerWidth;
    scrollX.setValue(containerWidth);

    scrollAnim.current = Animated.loop(
      Animated.timing(scrollX, {
        toValue: -textWidth,
        duration: (totalTravel / 60) * 1000, // ~60px/s
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    scrollAnim.current.start();
    return () => scrollAnim.current?.stop();
  }, [textWidth, containerWidth, activatedAt]);

  // ── Activation handler ────────────────────────────────────────────────────

  const handleActivate = useCallback(async () => {
    if (!event || activatedAt !== null) return;
    const now = Date.now();
    setActivatedAt(now);
    setRemainingMs(COOLDOWN_MS);
    setActivated(true);
    setTimeout(() => setActivated(false), 600);

    // Flash animation
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();

    try {
      await AsyncStorage.setItem(KEY_ACTIVATED, String(now));
    } catch { /* ignore */ }

    // Immediately propagate to GameContext so event bonuses apply without lag
    game.setActiveForgeEvent(event.id);

    // Apply immediate one-shot effects
    if (event.id === 'free_chest') {
      game.grantResources([
        { resourceId: 'iron', qty: 10 },
        { resourceId: 'coal', qty: 8 },
        { resourceId: 'crystal', qty: 2 },
      ]);
    } else if (event.id === 'mystery_reward') {
      const pool = [
        { resourceId: 'mithril', qty: 1 },
        { resourceId: 'obsidian', qty: 3 },
        { resourceId: 'crystal', qty: 5 },
        { resourceId: 'dragon_scale', qty: 1 },
      ];
      game.grantResources([pool[Math.floor(Math.random() * pool.length)]]);
    }
    // Timed bonuses (gem_chance, gold_bonus, double_xp) are now active in GameContext
    // via activeForgeEventIdRef — no polling needed.
  }, [event, activatedAt, game]);

  if (!event) return null;

  const locked = activatedAt !== null;
  const bannerColor = locked ? '#555' : event.color;
  const bgColor = locked ? '#1A1A1A' : '#1C1008';

  return (
    <View style={[bs.wrapper, { borderColor: bannerColor + '80' }]}>
      {/* Metallic top border with rivets */}
      <View style={[bs.metalBar, { backgroundColor: locked ? '#333' : '#2A1A08' }]}>
        <View style={[bs.rivet, { backgroundColor: bannerColor }]} />
        <View style={[bs.rivet, { backgroundColor: bannerColor }]} />
        <View style={[bs.rivet, { backgroundColor: bannerColor }]} />
        <View style={[bs.rivet, { backgroundColor: bannerColor }]} />
      </View>

      {/* Main banner body */}
      <TouchableOpacity
        style={[bs.body, { backgroundColor: bgColor }]}
        onPress={handleActivate}
        disabled={locked}
        activeOpacity={0.85}>

        {/* Flash overlay */}
        <Animated.View style={[bs.flashOverlay, { opacity: flashAnim }]} pointerEvents="none" />

        {/* Glow border */}
        {!locked && (
          <Animated.View style={[bs.glowBorder, { borderColor: event.color, opacity: glowAnim }]} pointerEvents="none" />
        )}

        {/* Embers (decorative) */}
        {!locked && embers.map(e => (
          <EmberDot key={e.key} color={event.color} delay={e.delay} />
        ))}

        {/* Left icon */}
        <View style={[bs.iconWrap, { backgroundColor: bannerColor + '22' }]}>
          <Feather
            name={locked ? 'lock' : event.icon}
            size={18}
            color={bannerColor}
          />
        </View>

        {/* Scrolling text or locked state */}
        {locked ? (
          <View style={bs.lockedContent}>
            <Text style={bs.lockedTitle}>Événement déjà utilisé</Text>
            <View style={bs.countdownRow}>
              <Feather name="clock" size={12} color="#888" />
              <Text style={bs.countdownTxt}> Disponible dans {msToCountdown(remainingMs)}</Text>
            </View>
          </View>
        ) : (
          <View
            style={bs.scrollClip}
            onLayout={(e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width)}>
            <Animated.Text
              style={[bs.scrollText, { color: event.color, transform: [{ translateX: scrollX }] }]}
              numberOfLines={1}
              onLayout={(e: LayoutChangeEvent) => setTextWidth(e.nativeEvent.layout.width)}>
              {event.label}{'  ·  '}Touchez pour activer
            </Animated.Text>
          </View>
        )}

        {/* Right chevron or check */}
        <View style={bs.rightIcon}>
          {locked
            ? <Feather name="check-circle" size={16} color="#555" />
            : <Feather name="chevron-right" size={14} color={event.color + 'AA'} />}
        </View>
      </TouchableOpacity>

      {/* Metallic bottom border */}
      <View style={[bs.metalBar, { backgroundColor: locked ? '#333' : '#2A1A08' }]}>
        <View style={[bs.rivet, { backgroundColor: bannerColor }]} />
        <View style={[bs.rivet, { backgroundColor: bannerColor }]} />
        <View style={[bs.rivet, { backgroundColor: bannerColor }]} />
        <View style={[bs.rivet, { backgroundColor: bannerColor }]} />
      </View>
    </View>
  );
}

// ── Public hook: active event data for game systems ───────────────────────────

export interface ActiveForgeEvent {
  id: ForgeEventId;
  activatedAt: number;
  expiresAt: number;
  event: ForgeEvent;
}

export async function getActiveForgeEvent(): Promise<ActiveForgeEvent | null> {
  try {
    const [eventId, actAt] = await Promise.all([
      AsyncStorage.getItem(KEY_EVENT_ID),
      AsyncStorage.getItem(KEY_ACTIVATED),
    ]);
    if (!eventId || !actAt) return null;
    const activatedAt = parseInt(actAt, 10);
    if (Date.now() - activatedAt >= COOLDOWN_MS) return null;
    const event = FORGE_EVENTS.find(e => e.id === eventId);
    if (!event) return null;
    return { id: eventId as ForgeEventId, activatedAt, expiresAt: activatedAt + COOLDOWN_MS, event };
  } catch {
    return null;
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────

const bs = StyleSheet.create({
  wrapper: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  metalBar: {
    height: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  rivet: {
    width: 5, height: 5, borderRadius: 2.5, opacity: 0.7,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 8,
    overflow: 'hidden',
  },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
  },
  glowBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
  },
  iconWrap: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  scrollClip: {
    flex: 1, overflow: 'hidden',
  },
  scrollText: {
    fontSize: 13, fontWeight: '600', letterSpacing: 0.3,
    // Must not wrap — text scrolls on a single line
  },
  lockedContent: { flex: 1 },
  lockedTitle: { fontSize: 12, color: '#888', fontWeight: '600' },
  countdownRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  countdownTxt: { fontSize: 11, color: '#666' },
  rightIcon: { flexShrink: 0 },
});
