import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useJarvis } from '@/context/JarvisContext';

const MODELS = [
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', desc: 'Fast & cost-effective' },
  { id: 'gpt-4o', label: 'GPT-4o', desc: 'Most capable' },
  { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', desc: 'High intelligence' },
];

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { apiKey, setApiKey, model, setModel, clearConversation } = useJarvis();

  const [keyInput, setKeyInput] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  async function handleSave() {
    await setApiKey(keyInput.trim());
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Settings</Text>
        <View style={{ width: 36 }} />
      </View>
      <View style={[styles.headerGlow, { backgroundColor: colors.primary + '20' }]} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* API Key section */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            OPENAI API KEY
          </Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.keyInputRow}>
              <TextInput
                style={[styles.keyInput, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}
                value={keyInput}
                onChangeText={(t) => { setKeyInput(t); setSaved(false); }}
                placeholder="sk-..."
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry={!showKey}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                onPress={() => setShowKey((v) => !v)}
                style={({ pressed }) => [styles.eyeBtn, { opacity: pressed ? 0.5 : 1 }]}
                hitSlop={6}
              >
                <Feather
                  name={showKey ? 'eye-off' : 'eye'}
                  size={16}
                  color={colors.mutedForeground}
                />
              </Pressable>
            </View>

            <Pressable
              onPress={handleSave}
              disabled={!keyInput.trim()}
              style={({ pressed }) => [
                styles.saveBtn,
                {
                  backgroundColor: saved ? colors.accent + '20' : colors.primary + '18',
                  borderColor: saved ? colors.accent : colors.primary,
                  opacity: pressed ? 0.7 : keyInput.trim() ? 1 : 0.4,
                },
              ]}
            >
              <Feather
                name={saved ? 'check' : 'save'}
                size={14}
                color={saved ? colors.accent : colors.primary}
              />
              <Text
                style={[
                  styles.saveBtnText,
                  { color: saved ? colors.accent : colors.primary },
                ]}
              >
                {saved ? 'Saved' : 'Save Key'}
              </Text>
            </Pressable>
          </View>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Your key is stored locally on this device. Get one at platform.openai.com
          </Text>
        </View>

        {/* Model selection */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            AI MODEL
          </Text>
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
                  <Text style={[styles.modelName, { color: colors.foreground }]}>
                    {m.label}
                  </Text>
                  <Text style={[styles.modelDesc, { color: colors.mutedForeground }]}>
                    {m.desc}
                  </Text>
                </View>
                {model === m.id && (
                  <View
                    style={[
                      styles.selectedDot,
                      { backgroundColor: colors.primary + '20', borderColor: colors.primary },
                    ]}
                  >
                    <View
                      style={[styles.selectedDotInner, { backgroundColor: colors.primary }]}
                    />
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </View>

        {/* Danger zone */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            CONVERSATION
          </Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Pressable
              onPress={handleClear}
              style={({ pressed }) => [styles.dangerRow, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Feather name="trash-2" size={16} color={colors.destructive} />
              <Text style={[styles.dangerText, { color: colors.destructive }]}>
                Clear conversation history
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
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  headerGlow: {
    height: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingTop: 24,
    paddingHorizontal: 16,
    gap: 24,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.2,
    paddingLeft: 4,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  keyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 8,
  },
  keyInput: {
    flex: 1,
    fontSize: 14,
    height: 36,
    padding: 0,
  },
  eyeBtn: {
    padding: 4,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 14,
    marginBottom: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '500' as const,
    fontFamily: 'Inter_500Medium',
  },
  hint: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    paddingLeft: 4,
    lineHeight: 17,
  },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  modelDivider: {
    borderBottomWidth: 1,
  },
  modelInfo: {
    gap: 2,
  },
  modelName: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500' as const,
  },
  modelDesc: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  selectedDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedDotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
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
  aboutContainer: {
    alignItems: 'center',
    paddingTop: 8,
  },
  aboutText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 18,
    letterSpacing: 0.5,
  },
});
