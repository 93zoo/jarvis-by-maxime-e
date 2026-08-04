/**
 * SettingsModal — pause / paramètres complet.
 * Trois onglets : Général (save/quit/profil) · Son · Statistiques.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useGame } from '@/context/GameContext';
import AudioManager from '@/utils/AudioManager';
import { saveAudioSettings } from '@/utils/audioSettings';

const { height: SH } = Dimensions.get('window');

// ── Palette médiévale ─────────────────────────────────────────────────────────
const C = {
  ember:        '#FF7A1A',
  emberSoft:    '#E8862A',
  gold:         '#C9A227',
  dark:         '#0E0C06',
  panel:        '#1C1208',
  panelCard:    '#221A0C',
  border:       'rgba(200,140,60,0.30)',
  borderBright: 'rgba(255,150,50,0.60)',
  text:         '#F5E7CE',
  textDim:      '#A8927A',
  green:        '#4CAF50',
  red:          '#EF5350',
  purple:       '#9966CC',
  blue:         '#4FC3F7',
  steel:        '#607D8B',
};

type Tab = 'general' | 'audio' | 'stats';

// ── Slider de volume ──────────────────────────────────────────────────────────
function VolSlider({
  label, icon, color,
  getValue, setValue,
}: {
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  color: string;
  getValue: () => number;
  setValue: (v: number) => void;
}) {
  const [val, setVal] = useState(() => getValue());
  const trackW = useRef(0);
  const valRef = useRef(val);
  valRef.current = val;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: (e) => {
        const v = Math.max(0, Math.min(1, e.nativeEvent.locationX / (trackW.current || 1)));
        setVal(v); valRef.current = v; setValue(v);
      },
      onPanResponderMove: (e) => {
        const v = Math.max(0, Math.min(1, e.nativeEvent.locationX / (trackW.current || 1)));
        setVal(v); valRef.current = v; setValue(v);
      },
      onPanResponderRelease: () => {
        saveAudioSettings({
          muted: AudioManager.isMuted(),
          volume: AudioManager.getVolume(),
          musicVolume: AudioManager.getMusicVolume(),
          ambienceVolume: AudioManager.getAmbienceVolume(),
        }).catch(() => {});
      },
    }),
  ).current;

  return (
    <View style={ss.sliderRow}>
      <View style={ss.sliderLabelRow}>
        <Feather name={icon} size={13} color={color} />
        <Text style={ss.sliderLabel}>{label}</Text>
        <Text style={[ss.sliderPct, { color }]}>{Math.round(val * 100)} %</Text>
      </View>
      <View
        style={ss.sliderTrack}
        onLayout={(e) => { trackW.current = e.nativeEvent.layout.width; }}
        {...pan.panHandlers}
      >
        <View style={[ss.sliderFill, { width: `${Math.round(val * 100)}%` as `${number}%`, backgroundColor: color }]} />
        <View style={[ss.sliderThumb, { left: `${Math.round(val * 100)}%` as `${number}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

// ── Carte stat ────────────────────────────────────────────────────────────────
function StatCard({
  icon, label, value, color, wide,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  value: string | number;
  color?: string;
  wide?: boolean;
}) {
  const c = color ?? C.gold;
  return (
    <View style={[ss.statCard, wide && ss.statCardWide]}>
      <View style={[ss.statIconBox, { backgroundColor: c + '22', borderColor: c + '44' }]}>
        <Feather name={icon} size={15} color={c} />
      </View>
      <Text style={[ss.statValue, { color: c }]}>
        {typeof value === 'number' ? value.toLocaleString('fr-FR') : value}
      </Text>
      <Text style={ss.statLabel}>{label}</Text>
    </View>
  );
}

function StatSection({ icon, label }: { icon: React.ComponentProps<typeof Feather>['name']; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
      <Feather name={icon} size={13} color="rgba(200,160,80,0.7)" />
      <Text style={ss.statSection}>{label}</Text>
    </View>
  );
}

// ── Bouton d'action ───────────────────────────────────────────────────────────
function ActionBtn({
  icon, label, desc, color, onPress, disabled,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  desc: string;
  color: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[ss.actionBtn, disabled && { opacity: 0.4 }]}
      onPress={onPress}
      activeOpacity={0.8}
      disabled={disabled}
    >
      <View style={[ss.actionIcon, { backgroundColor: color + '22', borderColor: color + '55' }]}>
        <Feather name={icon} size={20} color={color} />
      </View>
      <View style={ss.actionText}>
        <Text style={[ss.actionLabel, { color }]}>{label}</Text>
        <Text style={ss.actionDesc}>{desc}</Text>
      </View>
      <Feather name="chevron-right" size={16} color={C.textDim} />
    </TouchableOpacity>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────
interface Props {
  visible:       boolean;
  onClose:       () => void;
  onGoToProfile: () => void;
  onQuit:        () => void;
}

export default function SettingsModal({ visible, onClose, onGoToProfile, onQuit }: Props) {
  const game = useGame();
  const player = game.player;

  const [tab, setTab] = useState<Tab>('general');
  const [muted, setMuted] = useState(() => AudioManager.isMuted());
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle');

  // Entrance animation
  const slideY = useRef(new Animated.Value(SH)).current;

  useEffect(() => {
    if (visible) {
      setTab('general');
      setSaveStatus('idle');
      setMuted(AudioManager.isMuted());
      Animated.spring(slideY, {
        toValue: 0,
        tension: 60,
        friction: 10,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideY, {
        toValue: SH,
        duration: 250,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (saveStatus === 'saving') return;
    setSaveStatus('saving');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await game.saveGame();
    setSaveStatus(result === 'ok' ? 'ok' : 'err');
    setTimeout(() => setSaveStatus('idle'), 2500);
  }, [game, saveStatus]);

  // ── Mute toggle ───────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const next = !AudioManager.isMuted();
    AudioManager.setMuted(next);
    setMuted(next);
    saveAudioSettings({
      muted: next,
      volume: AudioManager.getVolume(),
      musicVolume: AudioManager.getMusicVolume(),
      ambienceVolume: AudioManager.getAmbienceVolume(),
    }).catch(() => {});
    Haptics.selectionAsync();
  }, []);

  // ── Computed stats ────────────────────────────────────────────────────────
  const forgeLevel    = player.skills?.['forge']        ?? 0;
  const comLevel      = player.skills?.['commerce']     ?? 0;
  const constrLevel   = player.skills?.['construction'] ?? 0;
  const harvestLevel  = player.skills?.['harvest']      ?? 0;
  const combatLevel   = player.skills?.['combat']       ?? 0;

  const totalCrafted      = player.totalItemsCrafted       ?? 0;
  const legendaryCount    = player.craftedLegendaryCount   ?? 0;
  const excellentCount    = player.craftedExcellentCount   ?? 0;
  const goodCount         = player.craftedGoodCount        ?? 0;
  const ordersDelivered   = player.totalOrdersDelivered    ?? 0;
  const forgeXPTotal      = player.totalForgeXPEarned      ?? 0;
  const playerXPTotal     = player.totalPlayerXPEarned     ?? 0;
  const goldEarned        = player.totalGoldEarned         ?? 0;
  const bestPrice         = player.bestSalePrice           ?? 0;
  const bestQuality       = player.bestQualityScore        ?? 0;
  const streak            = player.streak                  ?? 0;
  const questsDone        = game.completedQuestIds.length;
  const regionsUnlocked   = game.unlockedRegions.length;
  const currentGold       = player.gold;

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      {/* Backdrop */}
      <TouchableOpacity style={ss.backdrop} activeOpacity={1} onPress={onClose} />

      {/* Sheet */}
      <Animated.View style={[ss.sheet, { transform: [{ translateY: slideY }] }]}>
        {/* ── Handle ── */}
        <View style={ss.handle} />

        {/* ── Header ── */}
        <View style={ss.header}>
          <View style={ss.headerLeft}>
            <Feather name="tool" size={20} color={C.ember} />
            <Text style={ss.headerTitle}>PARAMÈTRES</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={ss.closeBtn} activeOpacity={0.7}>
            <Feather name="x" size={20} color={C.textDim} />
          </TouchableOpacity>
        </View>

        {/* ── Tabs ── */}
        <View style={ss.tabs}>
          {([
            { id: 'general' as Tab, icon: 'sliders' as const, label: 'Général' },
            { id: 'audio'   as Tab, icon: 'volume-2' as const, label: 'Son' },
            { id: 'stats'   as Tab, icon: 'bar-chart-2' as const, label: 'Stats' },
          ] as const).map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[ss.tab, tab === t.id && ss.tabActive]}
              onPress={() => { setTab(t.id); Haptics.selectionAsync(); }}
              activeOpacity={0.8}
            >
              <Feather name={t.icon} size={14} color={tab === t.id ? C.ember : C.textDim} />
              <Text style={[ss.tabLabel, tab === t.id && { color: C.ember }]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Content ── */}
        <ScrollView
          style={ss.content}
          contentContainerStyle={ss.contentInner}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ══ GÉNÉRAL ══════════════════════════════════════════════════════ */}
          {tab === 'general' && (
            <View style={ss.section}>
              {/* Save button */}
              <ActionBtn
                icon={saveStatus === 'ok' ? 'check-circle' : saveStatus === 'err' ? 'alert-circle' : 'save'}
                label={
                  saveStatus === 'saving' ? 'Sauvegarde…'
                  : saveStatus === 'ok'   ? 'Sauvegardé !'
                  : saveStatus === 'err'  ? 'Erreur de sauvegarde'
                  : 'Sauvegarder'
                }
                desc="Sauvegarde locale et synchronisation cloud"
                color={
                  saveStatus === 'ok'  ? C.green
                  : saveStatus === 'err' ? C.red
                  : C.gold
                }
                onPress={handleSave}
                disabled={saveStatus === 'saving'}
              />

              {/* Profile */}
              <ActionBtn
                icon="user"
                label="Profil du forgeron"
                desc={`Niv. ${player.level} · ${currentGold.toLocaleString('fr-FR')} or · Voir tout`}
                color={C.blue}
                onPress={() => { onClose(); setTimeout(onGoToProfile, 300); }}
              />

              {/* Quit forge */}
              <ActionBtn
                icon="log-out"
                label="Quitter la forge"
                desc="Retourne au menu principal"
                color={C.red}
                onPress={() => { onClose(); setTimeout(onQuit, 300); }}
              />

              {/* Player info card */}
              <View style={ss.playerCard}>
                <View style={[ss.playerAvatar, { backgroundColor: player.avatarColor ?? C.ember }]}>
                  <Text style={ss.playerAvatarText}>{(player.forgeName ?? player.name ?? 'F')[0].toUpperCase()}</Text>
                </View>
                <View style={ss.playerInfo}>
                  <Text style={ss.playerName}>{player.forgeName ?? player.name ?? 'Forgeron'}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={ss.playerSub}>
                      Niv. {player.level} · Forge Niv. {forgeLevel} · {currentGold.toLocaleString('fr-FR')}
                    </Text>
                    <Feather name="dollar-sign" size={12} color={C.gold} />
                  </View>
                  <View style={ss.xpRow}>
                    <View style={ss.xpTrack}>
                      <View style={[ss.xpFill, {
                        width: `${Math.min(100, Math.round((player.xp / (player.xpToNextLevel || 1)) * 100))}%` as `${number}%`,
                        backgroundColor: C.ember,
                      }]} />
                    </View>
                    <Text style={ss.xpLabel}>{player.xp.toLocaleString()} / {(player.xpToNextLevel || 0).toLocaleString()} XP</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* ══ SON ══════════════════════════════════════════════════════════ */}
          {tab === 'audio' && (
            <View style={ss.section}>
              {/* Mute toggle */}
              <TouchableOpacity
                style={[ss.muteBtn, { borderColor: muted ? C.red : C.green }]}
                onPress={toggleMute}
                activeOpacity={0.8}
              >
                <View style={[ss.muteIcon, { backgroundColor: (muted ? C.red : C.green) + '22' }]}>
                  <Feather name={muted ? 'volume-x' : 'volume-2'} size={20} color={muted ? C.red : C.green} />
                </View>
                <View>
                  <Text style={[ss.muteBtnLabel, { color: muted ? C.red : C.green }]}>
                    {muted ? 'Son désactivé' : 'Son activé'}
                  </Text>
                  <Text style={ss.actionDesc}>
                    {muted ? 'Appuyer pour réactiver' : 'Appuyer pour couper tout le son'}
                  </Text>
                </View>
                <View style={[ss.muteToggle, { backgroundColor: muted ? C.red : C.green }]}>
                  <Text style={ss.muteToggleText}>{muted ? 'OFF' : 'ON'}</Text>
                </View>
              </TouchableOpacity>

              <View style={[ss.divider, { marginVertical: 16 }]} />
              <Text style={ss.sectionLabel}>VOLUMES INDÉPENDANTS</Text>

              <VolSlider
                label="Effets sonores"
                icon="zap"
                color={C.ember}
                getValue={() => AudioManager.getVolume()}
                setValue={(v) => AudioManager.setVolume(v)}
              />
              <VolSlider
                label="Musique"
                icon="music"
                color={C.purple}
                getValue={() => AudioManager.getMusicVolume()}
                setValue={(v) => AudioManager.setMusicVolume(v)}
              />
              <VolSlider
                label="Ambiance (feu, soufflet)"
                icon="wind"
                color="#D4851A"
                getValue={() => AudioManager.getAmbienceVolume()}
                setValue={(v) => AudioManager.setAmbienceVolume(v)}
              />

              <Text style={[ss.actionDesc, { textAlign: 'center', marginTop: 14, fontStyle: 'italic' }]}>
                Les réglages sont sauvegardés automatiquement
              </Text>
            </View>
          )}

          {/* ══ STATISTIQUES ═════════════════════════════════════════════════ */}
          {tab === 'stats' && (
            <View style={ss.section}>

              <StatSection icon="tool" label="FORGERON" />
              <View style={ss.statGrid}>
                <StatCard icon="user"    label="Niveau joueur"   value={player.level}    color={C.ember} />
                <StatCard icon="award"   label="Niveau forge"    value={forgeLevel}       color={C.gold} />
                <StatCard icon="star"    label="XP joueur total" value={playerXPTotal}    color={C.emberSoft} wide />
              </View>
              <View style={ss.statGrid}>
                <StatCard icon="zap"     label="XP forge total"  value={forgeXPTotal}    color={C.gold} wide />
              </View>

              <View style={ss.divider} />
              <StatSection icon="activity" label="PRODUCTION" />
              <View style={ss.statGrid}>
                <StatCard icon="package"    label="Forgés au total"   value={totalCrafted}    color={C.ember} />
                <StatCard icon="trending-up" label="Légendaires"      value={legendaryCount}  color="#9966CC" />
                <StatCard icon="star"        label="Excellents"        value={excellentCount}  color={C.gold} />
                <StatCard icon="thumbs-up"   label="Bons"             value={goodCount}       color={C.green} />
              </View>

              <View style={ss.divider} />
              <StatSection icon="dollar-sign" label="COMMERCE" />
              <View style={ss.statGrid}>
                <StatCard icon="dollar-sign" label="Or total gagné"     value={goldEarned} color={C.gold} wide />
              </View>
              <View style={ss.statGrid}>
                <StatCard icon="inbox"       label="Commandes livrées"  value={ordersDelivered}  color={C.blue} />
                <StatCard icon="tag"         label="Meilleur prix"      value={bestPrice}   color={C.gold} />
              </View>

              <View style={ss.divider} />
              <StatSection icon="map" label="EXPLORATION" />
              <View style={ss.statGrid}>
                <StatCard icon="map"           label="Régions explorées"   value={regionsUnlocked}  color={C.green} />
                <StatCard icon="check-circle"  label="Quêtes complétées"   value={questsDone}       color={C.green} />
              </View>

              <View style={ss.divider} />
              <StatSection icon="award" label="RECORDS" />
              <View style={ss.statGrid}>
                <StatCard icon="target"    label="Meilleur score qualité" value={bestQuality}     color="#FF6B6B" />
                <StatCard icon="activity"  label="Série active"           value={`${streak} j`}  color={C.ember} />
              </View>

              <View style={ss.divider} />
              <StatSection icon="settings" label="COMPÉTENCES" />
              <View style={ss.statGrid}>
                <StatCard icon="tool"       label="Construction" value={constrLevel}  color={C.steel} />
                <StatCard icon="shopping-bag" label="Commerce"   value={comLevel}     color={C.blue} />
                <StatCard icon="scissors"   label="Récolte"      value={harvestLevel} color={C.green} />
                <StatCard icon="shield"     label="Combat"       value={combatLevel}  color={C.red} />
              </View>

            </View>
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const ss = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.70)',
  },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    height: SH * 0.88,
    backgroundColor: C.panel,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1.5,
    borderColor: C.borderBright,
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    marginTop: 10,
    width: 44, height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderColor: C.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 17, fontWeight: '900', color: C.text, letterSpacing: 2 },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.07)',
    justifyContent: 'center', alignItems: 'center',
  },

  // Tabs
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 4,
    gap: 2,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 9, borderRadius: 10,
  },
  tabActive: { backgroundColor: 'rgba(255,122,26,0.18)', borderWidth: 1, borderColor: C.ember + '55' },
  tabLabel: { fontSize: 12, fontWeight: '700', color: C.textDim, letterSpacing: 0.5 },

  // Content
  content: { flex: 1 },
  contentInner: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },
  section: { gap: 10 },

  // Action button
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.panelCard,
    borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: C.border,
  },
  actionIcon: {
    width: 44, height: 44, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1,
  },
  actionText: { flex: 1 },
  actionLabel: { fontSize: 15, fontWeight: '800' },
  actionDesc: { fontSize: 11, color: C.textDim, marginTop: 2 },

  // Player card
  playerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.panelCard,
    borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: C.border,
    marginTop: 4,
  },
  playerAvatar: {
    width: 48, height: 48, borderRadius: 24,
    justifyContent: 'center', alignItems: 'center',
  },
  playerAvatarText: { fontSize: 22, fontWeight: '900', color: '#fff' },
  playerInfo: { flex: 1, gap: 4 },
  playerName: { fontSize: 15, fontWeight: '900', color: C.text },
  playerSub: { fontSize: 11, color: C.textDim },
  xpRow: { gap: 4 },
  xpTrack: {
    height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  xpFill: { height: '100%', borderRadius: 3 },
  xpLabel: { fontSize: 9, color: C.textDim },

  // Audio
  muteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.panelCard,
    borderRadius: 14, padding: 14,
    borderWidth: 1.5,
  },
  muteIcon: {
    width: 44, height: 44, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  muteBtnLabel: { fontSize: 15, fontWeight: '800' },
  muteToggle: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
  },
  muteToggleText: { fontSize: 11, fontWeight: '900', color: '#fff' },

  sliderRow: { gap: 6 },
  sliderLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sliderLabel: { flex: 1, fontSize: 13, color: C.text, fontWeight: '600' },
  sliderPct: { fontSize: 11, fontWeight: '800', minWidth: 38, textAlign: 'right' },
  sliderTrack: {
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14,
    overflow: 'hidden',
    justifyContent: 'center',
    borderWidth: 1, borderColor: C.border,
  },
  sliderFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 14 },
  sliderThumb: {
    position: 'absolute', width: 20, height: 20,
    borderRadius: 10, marginLeft: -10, top: 4,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
  },

  // Stats
  sectionLabel: {
    fontSize: 10, fontWeight: '800', color: C.gold + 'AA',
    letterSpacing: 2, marginBottom: 2,
  },
  statSection: {
    fontSize: 11, fontWeight: '900', color: C.textDim,
    letterSpacing: 1.5, marginTop: 4, marginBottom: 6,
  },
  statGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
  },
  statCard: {
    flex: 1, minWidth: '44%',
    backgroundColor: C.panelCard,
    borderRadius: 12, padding: 12,
    alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: C.border,
  },
  statCardWide: { minWidth: '100%' },
  statIconBox: {
    width: 32, height: 32, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1,
  },
  statValue: { fontSize: 22, fontWeight: '900' },
  statLabel: { fontSize: 10, color: C.textDim, textAlign: 'center', letterSpacing: 0.5 },

  divider: {
    height: 1, backgroundColor: C.border, marginVertical: 12,
  },
});
