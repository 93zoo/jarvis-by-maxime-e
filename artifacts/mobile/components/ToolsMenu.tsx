import React, { useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useJarvis } from '@/context/JarvisContext';
import { useTasks } from '@/context/TasksContext';

interface ToolsMenuProps {
  visible: boolean;
  onClose: () => void;
}

const TOOLS = [
  { key: 'search',   icon: '🔍', label: 'Recherche web',     desc: 'Temps réel',             color: '#3b82f6' },
  { key: 'weather',  icon: '🌤', label: 'Météo',              desc: "N'importe quelle ville", color: '#06b6d4' },
  { key: 'navigate', icon: '🗺', label: 'Navigation GPS',     desc: 'Ouvre les cartes',       color: '#f97316' },
  { key: 'news',     icon: '📰', label: 'Actualités',         desc: 'Dernières nouvelles',    color: '#8b5cf6' },
  { key: 'email',    icon: '📧', label: 'Envoyer un email',   desc: 'Via Gmail',              color: '#22c55e' },
  { key: 'task',     icon: '✅', label: 'Créer une tâche',    desc: 'Agenda JARVIS',          color: '#0099FF' },
  { key: 'note',     icon: '📝', label: 'Créer une note',     desc: 'Mémo rapide',            color: '#00E0FF' },
] as const;

type ToolKey = typeof TOOLS[number]['key'];

export function ToolsMenu({ visible, onClose }: ToolsMenuProps) {
  const colors = useColors();
  const { searchWeb, fetchWeather, sendEmail, fetchNews, navigateTo, isStreaming } = useJarvis();
  const { addTask, addNote } = useTasks();

  const [activeInput, setActiveInput] = useState<ToolKey | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const inputRef = useRef<TextInput>(null);

  const placeholders: Record<ToolKey, string> = {
    search:   'Que voulez-vous rechercher ?',
    weather:  'Entrez une ville (ex: Paris)',
    navigate: 'Destination (ex: Tour Eiffel, Paris)',
    news:     'Sujet (vide = actualités générales)',
    email:    'Corps du message...',
    task:     'Titre de la tâche...',
    note:     'Contenu de la note...',
  };

  const handleToolSelect = async (key: ToolKey) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveInput(key);
    setInputValue('');
    setEmailTo('');
    setEmailSubject('');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleSubmit = async () => {
    if (!activeInput || isStreaming) return;
    const val = inputValue.trim();

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClose();

    switch (activeInput) {
      case 'search':   if (val) await searchWeb(val); break;
      case 'weather':  if (val) await fetchWeather(val); break;
      case 'navigate': if (val) await navigateTo(val); break;
      case 'news':     await fetchNews(val); break;
      case 'email':    if (val) await sendEmail({ to: emailTo.trim(), subject: emailSubject.trim(), body: val }); break;
      case 'task':
        if (val) {
          await addTask({ title: val, priority: 'medium' });
          Alert.alert('✅ Tâche créée', `"${val}" ajoutée à votre agenda.`);
        }
        break;
      case 'note':
        if (val) {
          await addNote({ title: 'Mémo', content: val });
        }
        break;
    }

    setActiveInput(null);
    setInputValue('');
  };

  const handleClose = () => {
    Keyboard.dismiss();
    setActiveInput(null);
    setInputValue('');
    onClose();
  };

  const canSubmit = () => {
    if (!activeInput) return false;
    if (activeInput === 'news') return true;
    if (activeInput === 'email') return inputValue.trim().length > 0 && emailTo.trim().length > 0;
    return inputValue.trim().length > 0;
  };

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={handleClose} statusBarTranslucent>
      <TouchableWithoutFeedback onPress={handleClose}>
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(150)}
          style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.7)' }]}
        />
      </TouchableWithoutFeedback>

      <Animated.View
        entering={SlideInDown.duration(280).springify().damping(22)}
        exiting={SlideOutDown.duration(200)}
        style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        {/* Handle */}
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        {/* Header */}
        <View style={styles.sheetHeader}>
          <View style={styles.headerLeft}>
            <View style={[styles.headerDot, { backgroundColor: colors.accent }]} />
            <Text style={[styles.sheetTitle, { color: colors.primary }]}>OUTILS JARVIS</Text>
          </View>
          <View style={styles.headerRight}>
            <Pressable
              onPress={() => { handleClose(); setTimeout(() => router.push('/tasks' as never), 50); }}
              style={[styles.agendaBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
            >
              <Feather name="calendar" size={14} color={colors.primary} />
              <Text style={[styles.agendaBtnText, { color: colors.primary }]}>Agenda</Text>
            </Pressable>
            <Pressable onPress={handleClose} hitSlop={8}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </View>

        {!activeInput ? (
          // Tool list
          <View style={styles.toolList}>
            {TOOLS.map((tool) => (
              <Pressable
                key={tool.key}
                onPress={() => handleToolSelect(tool.key)}
                disabled={isStreaming && tool.key !== 'task' && tool.key !== 'note'}
                style={({ pressed }) => [
                  styles.toolRow,
                  { borderColor: colors.border, opacity: pressed ? 0.7 : isStreaming && tool.key !== 'task' && tool.key !== 'note' ? 0.4 : 1 },
                ]}
              >
                <View style={[styles.toolIcon, { backgroundColor: tool.color + '22' }]}>
                  <Text style={styles.toolIconText}>{tool.icon}</Text>
                </View>
                <View style={styles.toolInfo}>
                  <Text style={[styles.toolLabel, { color: colors.foreground }]}>{tool.label}</Text>
                  <Text style={[styles.toolDesc, { color: colors.mutedForeground }]}>{tool.desc}</Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </Pressable>
            ))}
          </View>
        ) : (
          // Input for selected tool
          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>
              {TOOLS.find((t) => t.key === activeInput)?.icon}{' '}
              {TOOLS.find((t) => t.key === activeInput)?.label}
            </Text>

            {/* Email extra fields */}
            {activeInput === 'email' && (
              <>
                <View style={[styles.inputWrapper, { backgroundColor: colors.background, borderColor: emailTo ? colors.primary + '60' : colors.border }]}>
                  <TextInput value={emailTo} onChangeText={setEmailTo} placeholder="Destinataire (ex: ami@gmail.com)" placeholderTextColor={colors.mutedForeground} style={[styles.textInput, { color: colors.foreground }]} keyboardType="email-address" autoCapitalize="none" returnKeyType="next" />
                </View>
                <View style={[styles.inputWrapper, { backgroundColor: colors.background, borderColor: emailSubject ? colors.primary + '60' : colors.border }]}>
                  <TextInput value={emailSubject} onChangeText={setEmailSubject} placeholder="Objet" placeholderTextColor={colors.mutedForeground} style={[styles.textInput, { color: colors.foreground }]} returnKeyType="next" />
                </View>
              </>
            )}

            <View style={[styles.inputWrapper, { backgroundColor: colors.background, borderColor: inputValue ? colors.primary + '60' : colors.border }]}>
              <TextInput
                ref={inputRef}
                value={inputValue} onChangeText={setInputValue}
                placeholder={placeholders[activeInput]}
                placeholderTextColor={colors.mutedForeground}
                style={[styles.textInput, { color: colors.foreground }]}
                multiline={activeInput === 'email' || activeInput === 'note'}
                maxLength={activeInput === 'email' || activeInput === 'note' ? 2000 : 200}
                onSubmitEditing={activeInput !== 'email' && activeInput !== 'note' && Platform.OS !== 'web' ? handleSubmit : undefined}
                returnKeyType={activeInput === 'email' || activeInput === 'note' ? 'default' : 'send'}
                autoFocus={activeInput !== 'email'}
              />
            </View>

            <View style={styles.inputActions}>
              <Pressable
                onPress={() => { setActiveInput(null); setInputValue(''); setEmailTo(''); setEmailSubject(''); }}
                style={({ pressed }) => [styles.cancelBtn, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Retour</Text>
              </Pressable>
              <Pressable
                onPress={handleSubmit}
                disabled={!canSubmit()}
                style={({ pressed }) => [styles.submitBtn, { backgroundColor: canSubmit() ? colors.primary : colors.muted, opacity: pressed ? 0.75 : 1 }]}
              >
                <Text style={[styles.submitText, { color: canSubmit() ? colors.primaryForeground : colors.mutedForeground }]}>
                  {activeInput === 'email' ? '📧 Envoyer' : activeInput === 'news' ? '📰 Actualités' : activeInput === 'navigate' ? '🗺 Naviguer' : activeInput === 'task' ? '✅ Créer' : activeInput === 'note' ? '📝 Sauvegarder' : 'Lancer'}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    paddingHorizontal: 16,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerDot: { width: 6, height: 6, transform: [{ rotate: '45deg' }] },
  sheetTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', fontWeight: '700', letterSpacing: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  agendaBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  agendaBtnText: { fontSize: 12, fontFamily: 'Inter_500Medium', fontWeight: '500' },

  toolList: { gap: 7, paddingBottom: 8 },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1 },
  toolIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  toolIconText: { fontSize: 20 },
  toolInfo: { flex: 1, gap: 1 },
  toolLabel: { fontSize: 14, fontFamily: 'Inter_500Medium', fontWeight: '500' },
  toolDesc: { fontSize: 11, fontFamily: 'Inter_400Regular' },

  inputContainer: { gap: 10, paddingBottom: 8 },
  inputLabel: { fontSize: 12, fontFamily: 'Inter_400Regular', letterSpacing: 0.3 },
  inputWrapper: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, minHeight: 48, maxHeight: 140 },
  textInput: { fontSize: 15, fontFamily: 'Inter_400Regular', padding: 0, lineHeight: 22 },
  inputActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  cancelText: { fontSize: 14, fontFamily: 'Inter_500Medium', fontWeight: '500' },
  submitBtn: { flex: 2, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  submitText: { fontSize: 14, fontFamily: 'Inter_500Medium', fontWeight: '500' },
});
