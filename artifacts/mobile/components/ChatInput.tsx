import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { useJarvis } from '@/context/JarvisContext';
import { ToolsMenu } from '@/components/ToolsMenu';

interface ChatInputProps {
  onSend: (text: string) => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export function ChatInput({ onSend, isStreaming, disabled }: ChatInputProps) {
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { transcribeAudio, isSpeaking, stopSpeaking } = useJarvis();

  const recordingRef = useRef<Audio.Recording | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  const canSend = text.trim().length > 0 && !isStreaming && !disabled;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  // Pulse animation while recording
  useEffect(() => {
    if (isRecording) {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.35, duration: 550, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 550, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      pulseAnim.setValue(1);
    }
  }, [isRecording, pulseAnim]);

  async function handleSend() {
    if (!canSend) return;
    const msg = text.trim();
    setText('');
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSend(msg);
  }

  async function handleToolsPress() {
    if (isStreaming || disabled) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setToolsOpen(true);
  }

  async function handleMicPress() {
    if (Platform.OS === 'web') return;
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  }

  async function startRecording() {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) return;

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setIsRecording(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
  }

  async function stopRecording() {
    if (!recordingRef.current) return;
    try {
      setIsRecording(false);
      setIsTranscribing(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) { setIsTranscribing(false); return; }

      const transcription = await transcribeAudio(uri);
      setIsTranscribing(false);

      if (transcription?.trim()) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onSend(transcription.trim());
      }
    } catch {
      setIsTranscribing(false);
      recordingRef.current = null;
    }
  }

  const micBusy = isRecording || isTranscribing;
  const showMic = Platform.OS !== 'web';

  return (
    <>
      <ToolsMenu visible={toolsOpen} onClose={() => setToolsOpen(false)} />

      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            paddingBottom: bottomPad + 8,
          },
        ]}
      >
        {/* Glowing top line */}
        <View style={[styles.topGlow, { backgroundColor: colors.primary + '35' }]} />

        <View style={styles.inputRow}>
          {/* Tools button */}
          <Pressable
            onPress={handleToolsPress}
            disabled={isStreaming || disabled}
            style={({ pressed }) => [
              styles.iconButton,
              {
                backgroundColor: toolsOpen ? colors.primary + '20' : colors.card,
                borderColor: toolsOpen ? colors.primary + '70' : colors.border,
                opacity: pressed ? 0.65 : disabled ? 0.4 : 1,
              },
            ]}
          >
            <Feather name="plus" size={18} color={toolsOpen ? colors.primary : colors.mutedForeground} />
          </Pressable>

          {/* Text input */}
          <View
            style={[
              styles.inputWrapper,
              {
                backgroundColor: colors.card,
                borderColor: isRecording
                  ? colors.destructive + '60'
                  : text
                  ? colors.primary + '55'
                  : colors.border,
              },
            ]}
          >
            <TextInput
              style={[styles.input, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}
              value={isRecording ? '🎙 Enregistrement...' : isTranscribing ? '⏳ Transcription...' : text}
              onChangeText={setText}
              placeholder="Message JARVIS..."
              placeholderTextColor={colors.mutedForeground}
              multiline
              maxLength={4000}
              returnKeyType="default"
              onSubmitEditing={Platform.OS !== 'web' ? undefined : handleSend}
              editable={!disabled && !isRecording && !isTranscribing}
            />
          </View>

          {/* Mic button */}
          {showMic && (
            <Pressable
              onPress={micBusy ? undefined : handleMicPress}
              onLongPress={isRecording ? stopRecording : undefined}
              disabled={isTranscribing || disabled}
              style={({ pressed }) => [
                styles.iconButton,
                {
                  backgroundColor: isRecording
                    ? colors.destructive + '25'
                    : isSpeaking
                    ? colors.accent + '20'
                    : colors.card,
                  borderColor: isRecording
                    ? colors.destructive
                    : isSpeaking
                    ? colors.accent
                    : colors.border,
                  opacity: pressed ? 0.65 : disabled ? 0.4 : 1,
                },
              ]}
            >
              {isTranscribing ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : isRecording ? (
                <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                  <Feather name="mic" size={18} color={colors.destructive} />
                </Animated.View>
              ) : isSpeaking ? (
                <Feather name="volume-2" size={18} color={colors.accent} onPress={stopSpeaking} />
              ) : (
                <Feather name="mic" size={18} color={colors.mutedForeground} />
              )}
            </Pressable>
          )}

          {/* Send button */}
          <Pressable
            onPress={handleSend}
            disabled={!canSend}
            style={({ pressed }) => [
              styles.sendButton,
              {
                backgroundColor: canSend ? colors.primary : colors.muted,
                opacity: pressed ? 0.75 : 1,
                shadowColor: canSend ? colors.primary : 'transparent',
              },
            ]}
          >
            {isStreaming ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Feather name="send" size={16} color={canSend ? colors.primaryForeground : colors.mutedForeground} />
            )}
          </Pressable>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    paddingTop: 8,
    paddingHorizontal: 10,
  },
  topGlow: {
    height: 1,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 7,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrapper: {
    flex: 1,
    borderRadius: 21,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxHeight: 120,
  },
  input: {
    fontSize: 15,
    lineHeight: 22,
    padding: 0,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 10,
    elevation: 5,
  },
});
