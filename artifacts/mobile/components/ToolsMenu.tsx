import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useJarvis } from '@/context/JarvisContext';
import { useTasks } from '@/context/TasksContext';

const { width: SCREEN_W } = Dimensions.get('window');
const TILE_W = (SCREEN_W - 32 - 16) / 3;

// ── Tool definitions ──────────────────────────────────────────────────────────

type ToolKey =
  | 'search' | 'translate' | 'calculate'
  | 'weather' | 'news' | 'currency'
  | 'navigate' | 'email' | 'github'
  | 'task' | 'note' | 'password'
  | 'summarize' | 'timer' | 'quote';

interface Tool {
  key: ToolKey;
  sym: string;
  emoji: string;
  label: string;
  desc: string;
  color: string;
  noInput: boolean;
}

interface ToolCategory {
  id: string;
  label: string;
  tools: Tool[];
}

const CATEGORIES: ToolCategory[] = [
  {
    id: 'intel',
    label: '◈ INTELLIGENCE',
    tools: [
      { key: 'search',    sym: '⌖', emoji: '🔍', label: 'RECHERCHE',    desc: 'Web temps réel',   color: '#0099FF', noInput: false },
      { key: 'translate', sym: '⊞', emoji: '🌍', label: 'TRADUCTEUR',   desc: 'Toutes langues',   color: '#00E0FF', noInput: false },
      { key: 'calculate', sym: '∑', emoji: '🧮', label: 'CALCUL',       desc: 'Maths & IA',       color: '#818CF8', noInput: false },
    ],
  },
  {
    id: 'info',
    label: '◈ INFORMATIONS',
    tools: [
      { key: 'weather',   sym: '◈', emoji: '🌤', label: 'MÉTÉO',        desc: 'Global & précis',  color: '#38BDF8', noInput: false },
      { key: 'news',      sym: '⊡', emoji: '📰', label: 'ACTUALITÉS',   desc: 'Flux en direct',   color: '#A78BFA', noInput: false },
      { key: 'currency',  sym: '⊛', emoji: '💱', label: 'DEVISES',      desc: 'Conversion live',  color: '#34D399', noInput: false },
    ],
  },
  {
    id: 'action',
    label: '◈ ACTIONS',
    tools: [
      { key: 'navigate',  sym: '⊕', emoji: '🗺', label: 'NAVIGATION',   desc: 'GPS itinéraire',   color: '#FB923C', noInput: false },
      { key: 'email',     sym: '⊠', emoji: '📧', label: 'EMAIL',        desc: 'Envoi Gmail',      color: '#F472B6', noInput: false },
      { key: 'github',    sym: '⊟', emoji: '🐙', label: 'GITHUB',       desc: 'Notifications',    color: '#C084FC', noInput: true  },
    ],
  },
  {
    id: 'create',
    label: '◈ CRÉATION',
    tools: [
      { key: 'task',      sym: '⊗', emoji: '✅', label: 'TÂCHE',        desc: 'Agenda JARVIS',    color: '#0099FF', noInput: false },
      { key: 'note',      sym: '⊙', emoji: '📝', label: 'NOTE',         desc: 'Mémo rapide',      color: '#00E0FF', noInput: false },
      { key: 'password',  sym: '◉', emoji: '🔐', label: 'SÉCURITÉ',     desc: 'Mot de passe',     color: '#EF4444', noInput: false },
    ],
  },
  {
    id: 'sys',
    label: '◈ SYSTÈME',
    tools: [
      { key: 'summarize', sym: '◫', emoji: '📊', label: 'RÉSUMÉ',       desc: 'Synthèse IA',      color: '#A78BFA', noInput: false },
      { key: 'timer',     sym: '◎', emoji: '⏱', label: 'MINUTEUR',     desc: 'Alerte chrono',    color: '#FB923C', noInput: false },
      { key: 'quote',     sym: '◌', emoji: '💬', label: 'CITATION',     desc: 'Inspire-moi',      color: '#34D399', noInput: true  },
    ],
  },
];

const ALL_TOOLS: Tool[] = CATEGORIES.flatMap(c => c.tools);

const PLACEHOLDERS: Record<ToolKey, string> = {
  search:    'Que cherchez-vous ?',
  translate: 'Texte à traduire (ex: Bonjour → English)',
  calculate: 'Expression (ex: 42 * 3.14 / sin(π))',
  weather:   'Ville (ex: Tokyo, Londres, Dubai)',
  news:      'Sujet (vide = actus générales)',
  currency:  'Montant + devises (ex: 100 EUR en USD)',
  navigate:  'Destination (ex: Tour Eiffel, Paris)',
  email:     'Corps du message...',
  github:    '',
  task:      'Titre de la tâche...',
  note:      'Contenu de la note...',
  password:  'Longueur (ex: 20) ou règles spéciales',
  summarize: 'Collez le texte à résumer...',
  timer:     'Durée en minutes (ex: 5)',
  quote:     '',
};

// ── Pulsing glow animation hook ───────────────────────────────────────────────

function usePulse() {
  const opacity = useSharedValue(0.18);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.45, { duration: 1400 }),
        withTiming(0.18, { duration: 1400 }),
      ),
      -1,
      false,
    );
  }, [opacity]);
  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

// ── Blinking cursor ───────────────────────────────────────────────────────────

function BlinkingCursor({ color }: { color: string }) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(withTiming(0, { duration: 500 }), withTiming(1, { duration: 500 })),
      -1,
      false,
    );
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[{ width: 2, height: 18, borderRadius: 1, backgroundColor: color, marginLeft: 3 }, style]} />;
}

// ── Corner brackets ───────────────────────────────────────────────────────────

function CornerBrackets({ color, size = 10 }: { color: string; size?: number }) {
  const s = StyleSheet.create({
    tl:  { position: 'absolute', top: 0,    left: 0,  width: size, height: 2,    backgroundColor: color },
    tl2: { position: 'absolute', top: 0,    left: 0,  width: 2,    height: size, backgroundColor: color },
    br:  { position: 'absolute', bottom: 0, right: 0, width: size, height: 2,    backgroundColor: color },
    br2: { position: 'absolute', bottom: 0, right: 0, width: 2,    height: size, backgroundColor: color },
    tr:  { position: 'absolute', top: 0,    right: 0, width: size, height: 2,    backgroundColor: color },
    tr2: { position: 'absolute', top: 0,    right: 0, width: 2,    height: size, backgroundColor: color },
    bl:  { position: 'absolute', bottom: 0, left: 0,  width: size, height: 2,    backgroundColor: color },
    bl2: { position: 'absolute', bottom: 0, left: 0,  width: 2,    height: size, backgroundColor: color },
  });
  return (
    <>
      <View style={s.tl} /><View style={s.tl2} />
      <View style={s.tr} /><View style={s.tr2} />
      <View style={s.br} /><View style={s.br2} />
      <View style={s.bl} /><View style={s.bl2} />
    </>
  );
}

// ── Tool Tile ─────────────────────────────────────────────────────────────────

function ToolTile({
  tool, delay, onPress, disabled,
}: {
  tool: typeof CATEGORIES[number]['tools'][number];
  delay: number;
  onPress: () => void;
  disabled: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  const glowStyle = usePulse();

  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(350).springify().damping(18)}>
      <Pressable
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${tool.label} — ${tool.desc}`}
        accessibilityState={{ disabled }}
        style={[
          styles.tile,
          {
            width: TILE_W,
            borderColor: tool.color + (pressed ? '90' : '35'),
            backgroundColor: pressed ? tool.color + '18' : tool.color + '09',
            opacity: disabled ? 0.35 : 1,
            shadowColor: tool.color,
            shadowOpacity: pressed ? 0.6 : 0,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 0 },
            elevation: pressed ? 8 : 0,
          },
        ]}
      >
        <CornerBrackets color={tool.color + (pressed ? 'CC' : '60')} size={8} />

        {/* Glow pulse overlay — always animating */}
        <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 10, backgroundColor: tool.color + '10' }, glowStyle]} />

        {/* Symbol + emoji */}
        <View style={styles.tileIconRow}>
          <Text style={[styles.tileSym, { color: tool.color + '60' }]}>{tool.sym}</Text>
        </View>
        <Text style={styles.tileEmoji}>{tool.emoji}</Text>
        <Text style={[styles.tileLabel, { color: pressed ? tool.color : tool.color + 'CC' }]}>{tool.label}</Text>
        <Text style={[styles.tileDesc, { color: tool.color + '70' }]} numberOfLines={1}>{tool.desc}</Text>

        {/* Status dot */}
        <View style={styles.tileStatus}>
          <View style={[styles.tileStatusDot, { backgroundColor: tool.color }]} />
          <Text style={[styles.tileStatusText, { color: tool.color + '70' }]}>ACTIF</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface ToolsMenuProps {
  visible: boolean;
  onClose: () => void;
  initialTool?: ToolKey;  // when set, opens directly to that tool's input panel
}

export function ToolsMenu({ visible, onClose, initialTool }: ToolsMenuProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { searchWeb, fetchWeather, sendEmail, fetchNews, navigateTo, isStreaming, sendMessage, fetchGithubNotifs } = useJarvis();
  const { addTask, addNote } = useTasks();

  const [activeKey, setActiveKey] = useState<ToolKey | null>(null);
  const [inputVal, setInputVal] = useState('');
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const inputRef = useRef<TextInput>(null);

  const activeTool = activeKey ? ALL_TOOLS.find(t => t.key === activeKey) : null;
  const totalTools = CATEGORIES.reduce((n, c) => n + c.tools.length, 0);

  // When opened with a specific tool from the orbital hub, jump straight to its input panel
  useEffect(() => {
    if (visible && initialTool) {
      setActiveKey(initialTool);
      setInputVal('');
      setEmailTo('');
      setEmailSubject('');
      const t = setTimeout(() => inputRef.current?.focus(), 160);
      return () => clearTimeout(t);
    }
    if (!visible) {
      setActiveKey(null);
      setInputVal('');
      setEmailTo('');
      setEmailSubject('');
    }
    return undefined;
  }, [visible, initialTool]);

  const handleClose = () => {
    Keyboard.dismiss();
    setActiveKey(null);
    setInputVal('');
    setEmailTo('');
    setEmailSubject('');
    onClose();
  };

  const handleSelect = async (key: ToolKey, noInput: boolean) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (noInput) {
      // Execute immediately
      handleClose();
      if (key === 'quote') {
        sendMessage("Donne-moi une citation inspirante ou motivante — une seule, bien choisie, avec son auteur.");
      } else if (key === 'github') {
        fetchGithubNotifs();
      }
      return;
    }

    setActiveKey(key);
    setInputVal('');
    setTimeout(() => inputRef.current?.focus(), 120);
  };

  const canSubmit = () => {
    if (!activeKey) return false;
    if (activeKey === 'email') return inputVal.trim().length > 0 && emailTo.trim().length > 0;
    return inputVal.trim().length > 0;
  };

  const handleSubmit = async () => {
    if (!activeKey || !canSubmit()) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const val = inputVal.trim();
    handleClose();

    switch (activeKey) {
      case 'search':    searchWeb(val); break;
      case 'translate': sendMessage(`Traduis ce texte : "${val}"`); break;
      case 'calculate': sendMessage(`Calcule et explique : ${val}`); break;
      case 'weather':   fetchWeather(val); break;
      case 'news':      fetchNews(val); break;
      case 'currency':  sendMessage(`Convertis : ${val}. Donne le taux actuel approximatif.`); break;
      case 'navigate':  navigateTo(val); break;
      case 'email':     sendEmail({ to: emailTo.trim(), subject: emailSubject.trim(), body: val }); break;
      case 'task':      addTask({ title: val, priority: 'medium' }); break;
      case 'note':      addNote({ title: 'Note', content: val }); break;
      case 'password':  sendMessage(`Génère un mot de passe ultra-sécurisé${val ? ` de ${val} caractères` : ''}. Explique sa robustesse.`); break;
      case 'summarize': sendMessage(`Résume ce texte de façon concise et structurée :\n\n${val}`); break;
      case 'timer': {
        const mins = parseInt(val) || 1;
        try {
          await Notifications.requestPermissionsAsync();
          await Notifications.scheduleNotificationAsync({
            content: { title: '⏱ JARVIS — Minuteur', body: `${mins} minute${mins > 1 ? 's' : ''} écoulée${mins > 1 ? 's' : ''}.`, sound: true },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: mins * 60 },
          });
        } catch {}
        sendMessage(`Minuteur de ${mins} minute${mins > 1 ? 's' : ''} programmé. Je vous alerterai dans ${mins * 60} secondes.`);
        break;
      }
      default: break;
    }
  };

  const bottomPad = Platform.OS === 'ios' ? insets.bottom : 20;
  const topPad = Platform.OS === 'ios' ? insets.top : 20;

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={handleClose} statusBarTranslucent>
      {/* Dark overlay */}
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(180)}
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,4,0.93)' }]}
      />

      {/* Scanline decorations */}
      <Animated.View entering={FadeIn.duration(300)} style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={i} style={[styles.scanline, { top: 80 + i * 90, opacity: 0.018 }]} />
        ))}
      </Animated.View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Animated.View
          entering={FadeIn.duration(250)}
          style={[styles.panel, { paddingTop: topPad + 4, paddingBottom: bottomPad }]}
        >
          {/* ── Header ── */}
          <Animated.View entering={FadeInDown.delay(0).duration(280)} style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={[styles.headerDiamond, { backgroundColor: '#0099FF', shadowColor: '#0099FF' }]} />
              <View>
                <Text style={[styles.headerTitle, { color: '#0099FF' }]}>MODULES JARVIS</Text>
                <Text style={[styles.headerSub, { color: '#0099FF60' }]}>{totalTools} OUTILS ACTIFS · SYS v2.4</Text>
              </View>
            </View>
            <View style={styles.headerRight}>
              <Pressable
                onPress={() => { handleClose(); setTimeout(() => router.push('/tasks' as never), 60); }}
                style={[styles.headerChip, { borderColor: '#0099FF40', backgroundColor: '#0099FF12' }]}
              >
                <Feather name="calendar" size={12} color="#0099FF" />
                <Text style={[styles.headerChipText, { color: '#0099FF' }]}>AGENDA</Text>
              </Pressable>
              <Pressable onPress={handleClose} style={styles.closeBtn} hitSlop={12}>
                <Feather name="x" size={18} color="#2E4E6A" />
              </Pressable>
            </View>
          </Animated.View>

          {/* Header separator */}
          <Animated.View entering={FadeInDown.delay(60).duration(280)} style={styles.sep}>
            <View style={[styles.sepLine, { backgroundColor: '#0C1C2E' }]} />
            <View style={[styles.sepGlow, { backgroundColor: '#0099FF' }]} />
            <View style={[styles.sepLine, { backgroundColor: '#0C1C2E' }]} />
          </Animated.View>

          {/* ── Content ── */}
          {!activeKey ? (
            // Grid view
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {CATEGORIES.map((cat, ci) => (
                <View key={cat.id} style={styles.category}>
                  <Animated.View entering={FadeInDown.delay(80 + ci * 50).duration(250)}>
                    <View style={styles.catLabelRow}>
                      <View style={[styles.catLine, { backgroundColor: '#0C1C2E' }]} />
                      <Text style={styles.catLabel}>{cat.label}</Text>
                      <View style={[styles.catLine, { flex: 1, backgroundColor: '#0C1C2E' }]} />
                    </View>
                  </Animated.View>
                  <View style={styles.tileRow}>
                    {cat.tools.map((tool, ti) => (
                      <ToolTile
                        key={tool.key}
                        tool={tool}
                        delay={120 + ci * 60 + ti * 40}
                        onPress={() => handleSelect(tool.key, tool.noInput)}
                        disabled={isStreaming && !tool.noInput}
                      />
                    ))}
                  </View>
                </View>
              ))}

              {/* Bottom status bar */}
              <Animated.View entering={FadeInDown.delay(500).duration(250)} style={styles.statusBar}>
                <View style={[styles.statusDot, { backgroundColor: '#22c55e' }]} />
                <Text style={styles.statusText}>TOUS LES SYSTÈMES OPÉRATIONNELS</Text>
                <Text style={styles.statusVersion}>J.A.R.V.I.S. v2.4.1</Text>
              </Animated.View>
            </ScrollView>
          ) : (
            // Input panel
            <Animated.View entering={FadeIn.duration(220)} style={styles.inputPanel}>
              {/* Back */}
              <View style={styles.inputHeader}>
                <Pressable onPress={() => { setActiveKey(null); setInputVal(''); }} style={styles.backBtn} hitSlop={8}>
                  <Feather name="chevron-left" size={16} color={activeTool?.color ?? '#0099FF'} />
                  <Text style={[styles.backText, { color: activeTool?.color ?? '#0099FF' }]}>RETOUR</Text>
                </Pressable>
                <View style={[styles.inputToolBadge, { borderColor: (activeTool?.color ?? '#0099FF') + '50', backgroundColor: (activeTool?.color ?? '#0099FF') + '12' }]}>
                  <Text style={styles.inputToolEmoji}>{activeTool?.emoji}</Text>
                  <Text style={[styles.inputToolLabel, { color: activeTool?.color ?? '#0099FF' }]}>{activeTool?.label}</Text>
                </View>
              </View>

              {/* Input separator */}
              <View style={[styles.inputSep, { backgroundColor: (activeTool?.color ?? '#0099FF') + '30' }]} />

              <View style={styles.inputFields}>
                {/* Email extra fields */}
                {activeKey === 'email' && (
                  <>
                    <View style={[styles.fieldWrapper, { borderColor: emailTo ? (activeTool?.color ?? '#0099FF') + '60' : '#0C1C2E' }]}>
                      <Text style={[styles.fieldTag, { color: (activeTool?.color ?? '#0099FF') + '80' }]}>DESTINATAIRE</Text>
                      <TextInput
                        value={emailTo} onChangeText={setEmailTo}
                        placeholder="adresse@email.com"
                        placeholderTextColor="#2E4E6A"
                        style={[styles.fieldInput, { color: '#C0DCF4' }]}
                        keyboardType="email-address" autoCapitalize="none"
                      />
                    </View>
                    <View style={[styles.fieldWrapper, { borderColor: emailSubject ? (activeTool?.color ?? '#0099FF') + '60' : '#0C1C2E' }]}>
                      <Text style={[styles.fieldTag, { color: (activeTool?.color ?? '#0099FF') + '80' }]}>OBJET</Text>
                      <TextInput
                        value={emailSubject} onChangeText={setEmailSubject}
                        placeholder="Objet du message..."
                        placeholderTextColor="#2E4E6A"
                        style={[styles.fieldInput, { color: '#C0DCF4' }]}
                      />
                    </View>
                  </>
                )}

                {/* Main input */}
                <View style={[styles.mainInputWrapper, { borderColor: inputVal ? (activeTool?.color ?? '#0099FF') + '70' : '#0C1C2E' }]}>
                  <Text style={[styles.fieldTag, { color: (activeTool?.color ?? '#0099FF') + '80' }]}>
                    {activeKey === 'email' ? 'MESSAGE' : 'SAISIE'}
                  </Text>
                  <View style={styles.mainInputRow}>
                    <TextInput
                      ref={inputRef}
                      value={inputVal}
                      onChangeText={setInputVal}
                      placeholder={PLACEHOLDERS[activeKey]}
                      placeholderTextColor="#2E4E6A"
                      style={[
                        styles.mainInput,
                        { color: '#C0DCF4', height: activeKey === 'summarize' || activeKey === 'note' || activeKey === 'email' ? 120 : undefined },
                      ]}
                      multiline={activeKey === 'summarize' || activeKey === 'note' || activeKey === 'email'}
                      keyboardType={activeKey === 'timer' || activeKey === 'password' ? 'number-pad' : 'default'}
                      autoFocus
                      onSubmitEditing={activeKey !== 'summarize' && activeKey !== 'note' && activeKey !== 'email' ? handleSubmit : undefined}
                    />
                    {!inputVal && <BlinkingCursor color={(activeTool?.color ?? '#0099FF') + '80'} />}
                  </View>
                </View>
              </View>

              {/* Actions */}
              <View style={styles.inputActions}>
                <Pressable
                  onPress={() => { setActiveKey(null); setInputVal(''); }}
                  style={[styles.cancelBtn, { borderColor: '#0C1C2E' }]}
                >
                  <Text style={[styles.cancelText, { color: '#2E4E6A' }]}>ANNULER</Text>
                </Pressable>
                <Pressable
                  onPress={handleSubmit}
                  disabled={!canSubmit()}
                  style={[styles.submitBtn, {
                    backgroundColor: canSubmit() ? (activeTool?.color ?? '#0099FF') + '20' : '#070D18',
                    borderColor: canSubmit() ? (activeTool?.color ?? '#0099FF') : '#0C1C2E',
                    shadowColor: canSubmit() ? (activeTool?.color ?? '#0099FF') : 'transparent',
                  }]}
                >
                  <Text style={[styles.submitText, { color: canSubmit() ? (activeTool?.color ?? '#0099FF') : '#2E4E6A' }]}>
                    LANCER ▶
                  </Text>
                </Pressable>
              </View>
            </Animated.View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scanline: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#0099FF' },

  panel: {
    flex: 1,
    paddingHorizontal: 0,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 12,
    paddingTop: 4,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerDiamond: { width: 8, height: 8, transform: [{ rotate: '45deg' }], shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 8 },
  headerTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 2.5 },
  headerSub: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 1.5, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1 },
  headerChipText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 },
  closeBtn: { padding: 4 },

  // Separator
  sep: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  sepLine: { flex: 1, height: 1 },
  sepGlow: { width: 80, height: 1.5 },

  // Scroll
  scrollContent: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 24, gap: 4 },

  // Category
  category: { gap: 8, marginBottom: 6 },
  catLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catLine: { width: 12, height: 1 },
  catLabel: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 2, color: '#2E4E6A' },

  // Tile row
  tileRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },

  // Tile
  tile: {
    height: 104,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  tileIconRow: { position: 'absolute', top: 6, right: 8 },
  tileSym: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  tileEmoji: { fontSize: 26, marginBottom: 4 },
  tileLabel: { fontSize: 8, fontFamily: 'Inter_700Bold', letterSpacing: 1.5, textAlign: 'center', paddingHorizontal: 4 },
  tileDesc: { fontSize: 8, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 6, marginTop: 2 },
  tileStatus: { position: 'absolute', bottom: 6, flexDirection: 'row', alignItems: 'center', gap: 3 },
  tileStatusDot: { width: 4, height: 4, borderRadius: 2 },
  tileStatusText: { fontSize: 7, fontFamily: 'Inter_400Regular', letterSpacing: 1 },

  // Status bar
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginTop: 8,
  },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 8, fontFamily: 'Inter_400Regular', letterSpacing: 1.5, color: '#2E4E6A', flex: 1 },
  statusVersion: { fontSize: 8, fontFamily: 'Inter_400Regular', letterSpacing: 1, color: '#2E4E6A' },

  // Input panel
  inputPanel: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  inputHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 },
  inputToolBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  inputToolEmoji: { fontSize: 16 },
  inputToolLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.5 },
  inputSep: { height: 1, marginBottom: 16 },

  inputFields: { flex: 1, gap: 10 },
  fieldWrapper: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  fieldTag: { fontSize: 8, fontFamily: 'Inter_600SemiBold', letterSpacing: 2, marginBottom: 4 },
  fieldInput: { fontSize: 14, fontFamily: 'Inter_400Regular', padding: 0 },

  mainInputWrapper: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  mainInputRow: { flexDirection: 'row', alignItems: 'flex-start', flex: 1 },
  mainInput: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular', padding: 0, lineHeight: 22 },

  inputActions: { flexDirection: 'row', gap: 10, paddingTop: 14 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  cancelText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 2 },
  submitBtn: { flex: 2, paddingVertical: 14, borderRadius: 8, borderWidth: 1, alignItems: 'center', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 8 },
  submitText: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
});
