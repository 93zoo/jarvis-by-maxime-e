import React from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useJarvis } from '@/context/JarvisContext';

const MODELS = [
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', desc: 'Rapide et économique' },
  { id: 'gpt-4o', label: 'GPT-4o', desc: 'Le plus puissant' },
  { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', desc: 'Haute intelligence' },
];

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    model, setModel,
    clearConversation,
    voiceEnabled, setVoiceEnabled,
    isSpeaking, stopSpeaking,
  } = useJarvis();

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  async function handleModelSelect(m: string) {
    await setModel(m);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  async function handleClear() {
    clearConversation();
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.5 : 1 }]}
          hitSlop={8}
        >
          <Feather name="chevron-left" size={24} color={colors.primary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Paramètres</Text>
        <View style={{ width: 36 }} />
      </View>
      <View style={[styles.headerGlow, { backgroundColor: colors.primary + '20' }]} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Voice section */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>VOIX</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={[styles.toggleLabel, { color: colors.foreground }]}>Réponse vocale</Text>
                <Text style={[styles.toggleDesc, { color: colors.mutedForeground }]}>
                  JARVIS vous répond à voix haute
                </Text>
              </View>
              <Switch
                value={voiceEnabled}
                onValueChange={setVoiceEnabled}
                trackColor={{ false: colors.muted, true: colors.primary + '60' }}
                thumbColor={voiceEnabled ? colors.primary : colors.mutedForeground}
              />
            </View>
            {isSpeaking && (
              <Pressable
                onPress={stopSpeaking}
                style={({ pressed }) => [
                  styles.stopRow,
                  { borderTopColor: colors.border, opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Feather name="volume-x" size={16} color={colors.accent} />
                <Text style={[styles.stopText, { color: colors.accent }]}>Arrêter la lecture</Text>
              </Pressable>
            )}
          </View>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            🎤 Appuie sur le micro pour parler à JARVIS — pas besoin de clé API.
          </Text>
        </View>

        {/* Model selection */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>MODÈLE IA</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {MODELS.map((m, i) => (
              <Pressable
                key={m.id}
                onPress={() => handleModelSelect(m.id)}
                style={({ pressed }) => [
                  styles.modelRow,
                  i < MODELS.length - 1 && [styles.modelDivider, { borderBottomColor: colors.border }],
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <View style={styles.modelInfo}>
                  <Text style={[styles.modelName, { color: colors.foreground }]}>{m.label}</Text>
                  <Text style={[styles.modelDesc, { color: colors.mutedForeground }]}>{m.desc}</Text>
                </View>
                {model === m.id && (
                  <View style={[styles.selectedDot, { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}>
                    <View style={[styles.selectedDotInner, { backgroundColor: colors.primary }]} />
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </View>

        {/* Conversation */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>CONVERSATION</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Pressable
              onPress={handleClear}
              style={({ pressed }) => [styles.dangerRow, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Feather name="trash-2" size={16} color={colors.destructive} />
              <Text style={[styles.dangerText, { color: colors.destructive }]}>
                Effacer l'historique
              </Text>
            </Pressable>
          </View>
        </View>

        {/* About */}
        <View style={styles.aboutContainer}>
          <Text style={[styles.aboutText, { color: colors.mutedForeground }]}>
            JARVIS BY Maxime-E{'\n'}Just A Rather Very Intelligent System
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  headerGlow: { height: 1 },
  scroll: { flex: 1 },
  content: { paddingTop: 24, paddingHorizontal: 16, gap: 24 },
  section: { gap: 8 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.2,
    paddingLeft: 4,
  },
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  hint: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    paddingLeft: 4,
    lineHeight: 17,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  toggleInfo: { flex: 1, gap: 2 },
  toggleLabel: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500' as const,
  },
  toggleDesc: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  stopText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500' as const,
  },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  modelDivider: { borderBottomWidth: 1 },
  modelInfo: { gap: 2 },
  modelName: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500' as const,
  },
  modelDesc: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  selectedDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedDotInner: { width: 10, height: 10, borderRadius: 5 },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  dangerText: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500' as const,
  },
  aboutContainer: { alignItems: 'center', paddingTop: 8 },
  aboutText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 18,
    letterSpacing: 0.5,
  },
});
