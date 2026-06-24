import React, { useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  Linking,
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

const DEFAULT_PROMPT =
  'You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), an advanced AI assistant created by Maxime-E. You are highly intelligent, precise, and helpful. You speak in a calm, sophisticated manner — like the AI from Iron Man. You are concise but thorough. You refer to the user as "sir" or "ma\'am" occasionally.';

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    model, setModel,
    clearConversation,
    voiceEnabled, setVoiceEnabled,
    isSpeaking, stopSpeaking,
    systemPrompt, setSystemPrompt,
    gmailAddress, gmailAppPassword, setGmailCredentials,
    messages, exportConversation,
  } = useJarvis();

  const [editingPrompt, setEditingPrompt] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState(systemPrompt);

  const [editingEmail, setEditingEmail] = useState(false);
  const [draftGmailAddress, setDraftGmailAddress] = useState(gmailAddress);
  const [draftGmailPassword, setDraftGmailPassword] = useState(gmailAppPassword);
  const [showPassword, setShowPassword] = useState(false);

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

  async function handleSavePrompt() {
    const trimmed = draftPrompt.trim();
    if (!trimmed) return;
    await setSystemPrompt(trimmed);
    setEditingPrompt(false);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function handleResetPrompt() {
    setDraftPrompt(DEFAULT_PROMPT);
    await setSystemPrompt(DEFAULT_PROMPT);
    setEditingPrompt(false);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  async function handleExport() {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await exportConversation();
  }

  async function handleSaveEmail() {
    const addr = draftGmailAddress.trim();
    const pw = draftGmailPassword.trim();
    if (!addr || !pw) return;
    await setGmailCredentials(addr, pw);
    setEditingEmail(false);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Voice ── */}
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

        {/* ── AI Model ── */}
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

        {/* ── Personality ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>PERSONNALITÉ JARVIS</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {!editingPrompt ? (
              <>
                <View style={styles.promptPreviewRow}>
                  <Text style={[styles.promptPreview, { color: colors.mutedForeground }]} numberOfLines={3}>
                    {systemPrompt}
                  </Text>
                </View>
                <View style={[styles.promptActions, { borderTopColor: colors.border }]}>
                  <Pressable
                    onPress={() => { setDraftPrompt(systemPrompt); setEditingPrompt(true); }}
                    style={({ pressed }) => [styles.promptBtn, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <Feather name="edit-2" size={14} color={colors.primary} />
                    <Text style={[styles.promptBtnText, { color: colors.primary }]}>Modifier</Text>
                  </Pressable>
                  <View style={[styles.promptDivider, { backgroundColor: colors.border }]} />
                  <Pressable
                    onPress={handleResetPrompt}
                    style={({ pressed }) => [styles.promptBtn, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <Feather name="rotate-ccw" size={14} color={colors.mutedForeground} />
                    <Text style={[styles.promptBtnText, { color: colors.mutedForeground }]}>Réinitialiser</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={styles.promptEditorContainer}>
                <TextInput
                  value={draftPrompt}
                  onChangeText={setDraftPrompt}
                  multiline
                  style={[
                    styles.promptEditor,
                    { color: colors.foreground, borderColor: colors.primary + '40', backgroundColor: colors.background },
                  ]}
                  placeholderTextColor={colors.mutedForeground}
                  placeholder="Décrivez la personnalité de JARVIS..."
                  autoFocus
                />
                <View style={styles.promptEditorActions}>
                  <Pressable
                    onPress={() => setEditingPrompt(false)}
                    style={({ pressed }) => [styles.cancelBtn, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
                  >
                    <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>Annuler</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleSavePrompt}
                    disabled={!draftPrompt.trim()}
                    style={({ pressed }) => [
                      styles.saveBtn,
                      { backgroundColor: draftPrompt.trim() ? colors.primary : colors.muted, opacity: pressed ? 0.75 : 1 },
                    ]}
                  >
                    <Text style={[styles.saveBtnText, { color: draftPrompt.trim() ? colors.primaryForeground : colors.mutedForeground }]}>
                      Sauvegarder
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            💡 Définissez la personnalité et le comportement de JARVIS.
          </Text>
        </View>

        {/* ── Email Gmail ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>EMAIL (GMAIL)</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {!editingEmail ? (
              <>
                <View style={styles.emailPreviewRow}>
                  {gmailAddress ? (
                    <View style={styles.emailConfigured}>
                      <View style={[styles.emailDot, { backgroundColor: '#22c55e' }]} />
                      <Text style={[styles.emailAddress, { color: colors.foreground }]} numberOfLines={1}>
                        {gmailAddress}
                      </Text>
                    </View>
                  ) : (
                    <Text style={[styles.emailNotSet, { color: colors.mutedForeground }]}>
                      Non configuré
                    </Text>
                  )}
                </View>
                <View style={[styles.promptActions, { borderTopColor: colors.border }]}>
                  <Pressable
                    onPress={() => { setDraftGmailAddress(gmailAddress); setDraftGmailPassword(gmailAppPassword); setEditingEmail(true); }}
                    style={({ pressed }) => [styles.promptBtn, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <Feather name="edit-2" size={14} color={colors.primary} />
                    <Text style={[styles.promptBtnText, { color: colors.primary }]}>
                      {gmailAddress ? 'Modifier' : 'Configurer'}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={styles.promptEditorContainer}>
                <View style={[styles.inputWrapper, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <TextInput
                    value={draftGmailAddress}
                    onChangeText={setDraftGmailAddress}
                    placeholder="Adresse Gmail (ex: moi@gmail.com)"
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.emailInput, { color: colors.foreground }]}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                <View style={[styles.inputWrapper, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <TextInput
                    value={draftGmailPassword}
                    onChangeText={setDraftGmailPassword}
                    placeholder="Mot de passe d'application Google"
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.emailInput, { color: colors.foreground }]}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8} style={styles.eyeBtn}>
                    <Feather name={showPassword ? 'eye-off' : 'eye'} size={16} color={colors.mutedForeground} />
                  </Pressable>
                </View>
                <View style={styles.promptEditorActions}>
                  <Pressable
                    onPress={() => setEditingEmail(false)}
                    style={({ pressed }) => [styles.cancelBtn, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
                  >
                    <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>Annuler</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleSaveEmail}
                    disabled={!draftGmailAddress.trim() || !draftGmailPassword.trim()}
                    style={({ pressed }) => {
                      const ok = draftGmailAddress.trim() && draftGmailPassword.trim();
                      return [styles.saveBtn, { backgroundColor: ok ? colors.primary : colors.muted, opacity: pressed ? 0.75 : 1 }];
                    }}
                  >
                    <Text style={[styles.saveBtnText, { color: (draftGmailAddress.trim() && draftGmailPassword.trim()) ? colors.primaryForeground : colors.mutedForeground }]}>
                      Sauvegarder
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            🔐 Mot de passe d'application requis (pas ton vrai mot de passe).{' '}
            <Text
              style={{ color: colors.primary, textDecorationLine: 'underline' }}
              onPress={() => Linking.openURL('https://myaccount.google.com/apppasswords')}
            >
              Générer →
            </Text>
          </Text>
        </View>

        {/* ── Conversation ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>CONVERSATION</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {messages.length > 0 && (
              <Pressable
                onPress={handleExport}
                style={({ pressed }) => [
                  styles.actionRow,
                  { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Feather name="share-2" size={16} color={colors.primary} />
                <Text style={[styles.actionText, { color: colors.primary }]}>
                  Exporter la conversation
                </Text>
                <Text style={[styles.actionBadge, { backgroundColor: colors.primary + '20', color: colors.primary }]}>
                  {messages.length} msg
                </Text>
              </Pressable>
            )}
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
  headerTitle: { fontSize: 17, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
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
  hint: { fontSize: 12, fontFamily: 'Inter_400Regular', paddingLeft: 4, lineHeight: 17 },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  toggleInfo: { flex: 1, gap: 2 },
  toggleLabel: { fontSize: 15, fontFamily: 'Inter_500Medium', fontWeight: '500' as const },
  toggleDesc: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  stopText: { fontSize: 14, fontFamily: 'Inter_500Medium', fontWeight: '500' as const },

  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  modelDivider: { borderBottomWidth: 1 },
  modelInfo: { gap: 2 },
  modelName: { fontSize: 15, fontFamily: 'Inter_500Medium', fontWeight: '500' as const },
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

  // Personality
  promptPreviewRow: { padding: 16 },
  promptPreview: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 19 },
  promptActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
  },
  promptBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  promptBtnText: { fontSize: 14, fontFamily: 'Inter_500Medium', fontWeight: '500' as const },
  promptDivider: { width: 1 },
  promptEditorContainer: { padding: 14, gap: 12 },
  promptEditor: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
    minHeight: 110,
    textAlignVertical: 'top',
  },
  promptEditorActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 14, fontFamily: 'Inter_500Medium', fontWeight: '500' as const },
  saveBtn: {
    flex: 2,
    paddingVertical: 11,
    borderRadius: 22,
    alignItems: 'center',
  },
  saveBtnText: { fontSize: 14, fontFamily: 'Inter_500Medium', fontWeight: '500' as const },

  // Conversation
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderBottomWidth: 1,
  },
  actionText: { flex: 1, fontSize: 15, fontFamily: 'Inter_500Medium', fontWeight: '500' as const },
  actionBadge: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500' as const,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  dangerText: { fontSize: 15, fontFamily: 'Inter_500Medium', fontWeight: '500' as const },

  // Email
  emailPreviewRow: { padding: 16 },
  emailConfigured: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  emailDot: { width: 8, height: 8, borderRadius: 4 },
  emailAddress: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular' },
  emailNotSet: { fontSize: 14, fontFamily: 'Inter_400Regular', fontStyle: 'italic' },
  inputWrapper: {
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  emailInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  eyeBtn: { padding: 4 },

  aboutContainer: { alignItems: 'center', paddingTop: 8 },
  aboutText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 18,
    letterSpacing: 0.5,
  },
});
