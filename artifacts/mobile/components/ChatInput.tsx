import React, { useState } from 'react';
import {
  ActivityIndicator,
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

interface ChatInputProps {
  onSend: (text: string) => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export function ChatInput({ onSend, isStreaming, disabled }: ChatInputProps) {
  const [text, setText] = useState('');
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const canSend = text.trim().length > 0 && !isStreaming && !disabled;

  async function handleSend() {
    if (!canSend) return;
    const msg = text.trim();
    setText('');
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSend(msg);
  }

  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  return (
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
      {/* Glowing top border */}
      <View style={[styles.topGlow, { backgroundColor: colors.primary + '30' }]} />

      <View style={styles.inputRow}>
        <View
          style={[
            styles.inputWrapper,
            {
              backgroundColor: colors.card,
              borderColor: text ? colors.primary + '60' : colors.border,
            },
          ]}
        >
          <TextInput
            style={[
              styles.input,
              {
                color: colors.foreground,
                fontFamily: 'Inter_400Regular',
              },
            ]}
            value={text}
            onChangeText={setText}
            placeholder="Ask JARVIS anything..."
            placeholderTextColor={colors.mutedForeground}
            multiline
            maxLength={4000}
            returnKeyType="default"
            onSubmitEditing={Platform.OS !== 'web' ? undefined : handleSend}
            editable={!disabled}
          />
        </View>

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
            <Feather
              name="send"
              size={18}
              color={canSend ? colors.primaryForeground : colors.mutedForeground}
            />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    paddingTop: 8,
    paddingHorizontal: 12,
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
    gap: 8,
  },
  inputWrapper: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 120,
  },
  input: {
    fontSize: 15,
    lineHeight: 22,
    padding: 0,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 10,
    elevation: 4,
  },
});
