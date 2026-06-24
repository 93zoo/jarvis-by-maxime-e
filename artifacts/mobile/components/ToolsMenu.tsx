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
import { useColors } from '@/hooks/useColors';
import { useJarvis } from '@/context/JarvisContext';

interface ToolsMenuProps {
  visible: boolean;
  onClose: () => void;
}

const TOOLS = [
  { key: 'search', icon: '🔍', label: 'Recherche web', desc: 'Temps réel', color: '#3b82f6' },
  { key: 'weather', icon: '🌤', label: 'Météo', desc: 'N\'importe quelle ville', color: '#06b6d4' },
  { key: 'email', icon: '📧', label: 'Envoyer un email', desc: 'Via Gmail', color: '#22c55e' },
] as const;

type ToolKey = typeof TOOLS[number]['key'];

export function ToolsMenu({ visible, onClose }: ToolsMenuProps) {
  const colors = useColors();
  const { searchWeb, fetchWeather, sendEmail, isStreaming } = useJarvis();

  const [activeInput, setActiveInput] = useState<ToolKey | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const inputRef = useRef<TextInput>(null);

  const placeholders: Record<ToolKey, string> = {
    search: 'Que voulez-vous rechercher ?',
    weather: 'Entrez une ville (ex: Paris)',
    email: 'Corps du message...',
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
    const val = inputValue.trim();
    if (!val || !activeInput || isStreaming) return;

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClose();

    switch (activeInput) {
      case 'search': await searchWeb(val); break;
      case 'weather': await fetchWeather(val); break;
      case 'email': await sendEmail({ to: emailTo.trim(), subject: emailSubject.trim(), body: val }); break;
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

  if (!visible) return null;

  return (
    <Modal
      transparent
      animationType="none"
      visible={visible}
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(150)}
          style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.65)' }]}
        />
      </TouchableWithoutFeedback>

      <Animated.View
        entering={SlideInDown.duration(280).springify().damping(22)}
        exiting={SlideOutDown.duration(200)}
        style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        {/* Header */}
        <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
        <View style={styles.sheetHeader}>
          <Text style={[styles.sheetTitle, { color: colors.primary }]}>Outils JARVIS</Text>
          <Pressable onPress={handleClose} hitSlop={8}>
            <Feather name="x" size={20} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {!activeInput ? (
          // Tool list
          <View style={styles.toolList}>
            {TOOLS.map((tool) => (
              <Pressable
                key={tool.key}
                onPress={() => handleToolSelect(tool.key)}
                disabled={isStreaming}
                style={({ pressed }) => [
                  styles.toolRow,
                  { borderColor: colors.border, opacity: pressed ? 0.7 : isStreaming ? 0.4 : 1 },
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

            {/* Extra fields for email */}
            {activeInput === 'email' && (
              <>
                <View style={[styles.inputWrapper, { backgroundColor: colors.background, borderColor: emailTo ? colors.primary + '60' : colors.border }]}>
                  <TextInput
                    value={emailTo}
                    onChangeText={setEmailTo}
                    placeholder="Destinataire (ex: ami@gmail.com)"
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.textInput, { color: colors.foreground }]}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    returnKeyType="next"
                  />
                </View>
                <View style={[styles.inputWrapper, { backgroundColor: colors.background, borderColor: emailSubject ? colors.primary + '60' : colors.border }]}>
                  <TextInput
                    value={emailSubject}
                    onChangeText={setEmailSubject}
                    placeholder="Objet"
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.textInput, { color: colors.foreground }]}
                    returnKeyType="next"
                  />
                </View>
              </>
            )}

            <View style={[styles.inputWrapper, { backgroundColor: colors.background, borderColor: inputValue ? colors.primary + '60' : colors.border }]}>
              <TextInput
                ref={inputRef}
                value={inputValue}
                onChangeText={setInputValue}
                placeholder={placeholders[activeInput]}
                placeholderTextColor={colors.mutedForeground}
                style={[styles.textInput, { color: colors.foreground }]}
                multiline={activeInput === 'email'}
                maxLength={activeInput === 'email' ? 2000 : 200}
                onSubmitEditing={activeInput !== 'email' && Platform.OS !== 'web' ? handleSubmit : undefined}
                returnKeyType={activeInput === 'email' ? 'default' : 'send'}
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
                disabled={!inputValue.trim() || (activeInput === 'email' && !emailTo.trim())}
                style={({ pressed }) => {
                  const canSubmit = inputValue.trim() && (activeInput !== 'email' || emailTo.trim());
                  return [styles.submitBtn, { backgroundColor: canSubmit ? colors.primary : colors.muted, opacity: pressed ? 0.75 : 1 }];
                }}
              >
                <Text style={[styles.submitText, { color: (inputValue.trim() && (activeInput !== 'email' || emailTo.trim())) ? colors.primaryForeground : colors.mutedForeground }]}>
                  {activeInput === 'email' ? '📧 Envoyer' : 'Lancer'}
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
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    paddingHorizontal: 16,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
  },

  toolList: { gap: 8, paddingBottom: 8 },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  toolIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolIconText: { fontSize: 22 },
  toolInfo: { flex: 1, gap: 2 },
  toolLabel: { fontSize: 15, fontWeight: '500' as const, fontFamily: 'Inter_500Medium' },
  toolDesc: { fontSize: 12, fontFamily: 'Inter_400Regular' },

  inputContainer: { gap: 12, paddingBottom: 8 },
  inputLabel: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  inputWrapper: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 52,
    maxHeight: 140,
  },
  textInput: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    padding: 0,
    lineHeight: 22,
  },
  inputActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelText: { fontSize: 15, fontFamily: 'Inter_500Medium', fontWeight: '500' as const },
  submitBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: 'center',
  },
  submitText: { fontSize: 15, fontFamily: 'Inter_500Medium', fontWeight: '500' as const },
});
