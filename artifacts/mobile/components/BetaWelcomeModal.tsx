/**
 * BetaWelcomeModal — shown once on first launch to thank beta testers.
 * Grants 2 000 gold + 20 of every resource with a cinematic animation.
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

const { width: SW } = Dimensions.get('window');

// ── Colour palette (matches game's medieval theme) ───────────────────────────
const GOLD   = '#D4AF37';
const EMBER  = '#C8613A';
const DARK   = '#1A1208';
const DARKER = '#0E0C06';

// ── All resource IDs (order matters for display) ─────────────────────────────
export const BETA_RESOURCE_IDS = [
  'iron', 'copper', 'wood', 'stone', 'clay', 'coal',
  'bronze', 'steel', 'silver', 'gold_ore', 'platinum', 'mithril',
  'obsidian', 'crystal', 'adamantium', 'ruby', 'sapphire', 'emerald',
  'diamond', 'dragon_scale', 'topaz', 'amethyst', 'onyx', 'brass',
  'electrum', 'darksteel', 'mithrilite', 'dragonite', 'staralloy',
];

// ── Grouped icon display ─────────────────────────────────────────────────────
const RESOURCE_GROUPS = [
  { label: 'Métaux & Bois',  items: ['iron','copper','wood','stone','clay','coal','bronze','steel'] },
  { label: 'Précieux',       items: ['silver','gold_ore','platinum','mithril','brass','electrum'] },
  { label: 'Exotiques',      items: ['obsidian','crystal','adamantium','darksteel','mithrilite','dragonite','staralloy'] },
  { label: 'Gemmes & Rares', items: ['ruby','sapphire','emerald','diamond','dragon_scale','topaz','amethyst','onyx'] },
];

const RESOURCE_ICON: Record<string, any> = {
  iron: 'tool', copper: 'tool', wood: 'feather', stone: 'shield',
  clay: 'tool', coal: 'activity', bronze: 'scissors', steel: 'scissors',
  silver: 'star', gold_ore: 'dollar-sign', platinum: 'star',
  mithril: 'star', obsidian: 'shield', crystal: 'hexagon',
  adamantium: 'shield', ruby: 'hexagon', sapphire: 'hexagon', emerald: 'hexagon',
  diamond: 'hexagon', dragon_scale: 'activity', topaz: 'hexagon',
  amethyst: 'hexagon', onyx: 'shield', brass: 'dollar-sign', electrum: 'zap',
  darksteel: 'alert-octagon', mithrilite: 'star', dragonite: 'activity',
  staralloy: 'star',
};

// ── Falling coin particle ─────────────────────────────────────────────────────
function Coin({ delay, startX }: { delay: number; startX: number }) {
  const y   = useRef(new Animated.Value(0)).current;
  const op  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(y,  { toValue: 1, duration: 2200, easing: Easing.linear, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(op, { toValue: 1, duration: 200, useNativeDriver: true }),
            Animated.timing(op, { toValue: 1, duration: 1700, useNativeDriver: true }),
            Animated.timing(op, { toValue: 0, duration: 300, useNativeDriver: true }),
          ]),
        ]),
        Animated.parallel([
          Animated.timing(y,  { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(op, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const translateY = y.interpolate({ inputRange: [0, 1], outputRange: [-20, 320] });

  return (
    <Animated.View
      style={[styles.coin, { left: startX, opacity: op, transform: [{ translateY }] }]}
    >
      <Feather name="dollar-sign" size={20} color={GOLD} />
    </Animated.View>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
interface Props {
  visible: boolean;
  onClaim: () => void;
}

const COINS = [
  { delay: 0,    startX: SW * 0.08 },
  { delay: 280,  startX: SW * 0.22 },
  { delay: 550,  startX: SW * 0.40 },
  { delay: 130,  startX: SW * 0.57 },
  { delay: 700,  startX: SW * 0.70 },
  { delay: 400,  startX: SW * 0.84 },
  { delay: 900,  startX: SW * 0.15 },
  { delay: 1100, startX: SW * 0.62 },
];

export default function BetaWelcomeModal({ visible, onClaim }: Props) {
  const backdropOp = useRef(new Animated.Value(0)).current;
  const cardScale  = useRef(new Animated.Value(0.5)).current;
  const cardOp     = useRef(new Animated.Value(0)).current;
  const titleScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return;

    // Entrance: backdrop fade + card spring
    Animated.parallel([
      Animated.timing(backdropOp, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.spring(cardScale,  { toValue: 1, tension: 55, friction: 7, useNativeDriver: true }),
      Animated.timing(cardOp,     { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    // Title heartbeat loop
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(titleScale, { toValue: 1.06, duration: 700, easing: Easing.out(Easing.sin), useNativeDriver: true }),
        Animated.timing(titleScale, { toValue: 1.00, duration: 700, easing: Easing.in(Easing.sin),  useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [visible]);

  const handleClaim = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Shrink out
    Animated.parallel([
      Animated.timing(backdropOp, { toValue: 0, duration: 250, useNativeDriver: true }),
      Animated.timing(cardOp,     { toValue: 0, duration: 250, useNativeDriver: true }),
      Animated.spring(cardScale,  { toValue: 0.7, tension: 80, friction: 8, useNativeDriver: true }),
    ]).start(onClaim);
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => {}}>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: backdropOp }]} />

      {/* Falling coins (behind card) */}
      {COINS.map((c, i) => <Coin key={i} delay={c.delay} startX={c.startX} />)}

      {/* Card */}
      <Animated.View
        style={[
          styles.cardWrap,
          { opacity: cardOp, transform: [{ scale: cardScale }] },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.card}>
          {/* Header glow ring */}
          <View style={styles.iconRing}>
            <Feather name="tool" size={36} color={GOLD} />
          </View>

          <Animated.Text style={[styles.title, { transform: [{ scale: titleScale }] }]}>
            MERCI, BÊTE TESTEUR !
          </Animated.Text>
          <Text style={styles.subtitle}>
            Voici un petit boost pour bien démarrer ton aventure dans le royaume 🎁
          </Text>

          {/* Rewards */}
          <View style={styles.rewardsBox}>
            {/* Gold */}
            <View style={styles.goldRow}>
              <Feather name="dollar-sign" size={22} color={GOLD} />
              <Text style={styles.goldAmount}>+2 000 Or</Text>
            </View>

            {/* Resource groups */}
            <ScrollView
              style={styles.groupsScroll}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              {RESOURCE_GROUPS.map((g) => (
                <View key={g.label} style={styles.group}>
                  <Text style={styles.groupLabel}>{g.label}</Text>
                  <View style={styles.groupItems}>
                    {g.items.map((id) => (
                      <View key={id} style={styles.resourceChip}>
                        <Feather name={RESOURCE_ICON[id] ?? 'box'} size={14} color="#CCBBAA" />
                        <Text style={styles.resourceQty}>×20</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>

            <Text style={styles.resourceNote}>
              {BETA_RESOURCE_IDS.length} ressources différentes · 20 de chaque
            </Text>
          </View>

          {/* CTA */}
          <TouchableOpacity
            style={styles.claimBtn}
            onPress={handleClaim}
            activeOpacity={0.85}
          >
            <Feather name="gift" size={18} color={DARK} />
            <Text style={styles.claimText}>Récupérer mon boost !</Text>
          </TouchableOpacity>

          <Text style={styles.footer}>
            Ce cadeau est offert une seule fois 💫
          </Text>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.88)',
  },
  coin: {
    position: 'absolute',
    top: 0,
    fontSize: 20,
    zIndex: 10,
  },
  cardWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 20,
  },
  card: {
    width: '100%',
    backgroundColor: DARKER,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: GOLD + '88',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
    alignItems: 'center',
    gap: 12,
    // Shadow
    shadowColor: GOLD,
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 20,
  },
  iconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: GOLD,
    backgroundColor: EMBER + '22',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconEmoji: { fontSize: 36 },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: GOLD,
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#C8B89A',
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 8,
  },
  rewardsBox: {
    width: '100%',
    backgroundColor: '#FFFFFF09',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GOLD + '33',
    padding: 14,
    gap: 10,
  },
  goldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: GOLD + '18',
    borderRadius: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: GOLD + '55',
  },
  goldEmoji: { fontSize: 22 },
  goldAmount: {
    fontSize: 22,
    fontWeight: '900',
    color: GOLD,
    letterSpacing: 0.5,
  },
  groupsScroll: { maxHeight: 180 },
  group: { marginBottom: 10 },
  groupLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: GOLD + 'AA',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  groupItems: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  resourceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFFFFF0D',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#FFFFFF18',
  },
  resourceEmoji: { fontSize: 14 },
  resourceQty: { fontSize: 11, fontWeight: '700', color: '#CCBBAA' },
  resourceNote: {
    fontSize: 10,
    color: '#887766',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  claimBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: GOLD,
    borderRadius: 14,
    paddingVertical: 15,
    width: '100%',
  },
  claimText: {
    fontSize: 16,
    fontWeight: '900',
    color: DARK,
    letterSpacing: 0.5,
  },
  footer: {
    fontSize: 11,
    color: '#665544',
    textAlign: 'center',
  },
});
