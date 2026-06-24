import React, { useCallback, useRef } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useJarvis, Message } from '@/context/JarvisContext';
import { JarvisOrb } from '@/components/JarvisOrb';
import { MessageBubble } from '@/components/MessageBubble';
import { ChatInput } from '@/components/ChatInput';

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { messages, isStreaming, sendMessage, clearConversation, error, clearError } = useJarvis();

  const flatListRef = useRef<FlatList>(null);

  // Inverted FlatList so newest messages appear at bottom
  const reversedMessages = [...messages].reverse();

  const renderItem = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const isLastAssistant =
        item.role === 'assistant' && index === 0 && isStreaming;
      return <MessageBubble message={item} isStreaming={isLastAssistant} />;
    },
    [isStreaming]
  );

  const keyExtractor = useCallback((item: Message) => item.id, []);

  const handleClear = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    clearConversation();
  };

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <View style={styles.headerLeft}>
          <View style={[styles.statusDot, { backgroundColor: colors.accent }]} />
          <Text style={[styles.headerTitle, { color: colors.primary }]}>
            J.A.R.V.I.S.
          </Text>
        </View>
        <View style={styles.headerRight}>
          {messages.length > 0 && (
            <Pressable
              onPress={handleClear}
              style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.5 : 1 }]}
              hitSlop={8}
            >
              <Feather name="trash-2" size={18} color={colors.mutedForeground} />
            </Pressable>
          )}
          <Pressable
            onPress={() => router.push('/settings')}
            style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.5 : 1 }]}
            hitSlop={8}
          >
            <Feather name="settings" size={18} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>

      {/* Separator glow */}
      <View style={[styles.headerGlow, { backgroundColor: colors.primary + '20' }]} />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {/* Chat area */}
        {messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <JarvisOrb isActive={isStreaming} size={100} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              Online and ready, sir.
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
              Comment puis-je vous aider ?
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={reversedMessages}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            inverted
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            scrollEnabled={!!reversedMessages.length}
            ListHeaderComponent={
              isStreaming ? (
                <View style={styles.typingRow}>
                  <View style={[styles.typingDot, { backgroundColor: colors.primary }]} />
                  <View style={[styles.typingDot, styles.typingDot2, { backgroundColor: colors.primary }]} />
                  <View style={[styles.typingDot, styles.typingDot3, { backgroundColor: colors.primary }]} />
                </View>
              ) : null
            }
          />
        )}

        {/* Error banner */}
        {error && (
          <Pressable
            onPress={clearError}
            style={[styles.errorBanner, { backgroundColor: colors.destructive + '20', borderColor: colors.destructive }]}
          >
            <Feather name="alert-circle" size={14} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive }]} numberOfLines={2}>
              {error}
            </Text>
            <Feather name="x" size={14} color={colors.destructive} />
          </Pressable>
        )}

        <ChatInput
          onSend={sendMessage}
          isStreaming={isStreaming}
          disabled={false}
        />
      </KeyboardAvoidingView>
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
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerBtn: {
    padding: 6,
  },
  headerGlow: {
    height: 1,
  },
  keyboardView: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 12,
    paddingBottom: 4,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.5,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  setupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 8,
  },
  setupBtnText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500' as const,
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.8,
  },
  typingDot2: {
    opacity: 0.5,
  },
  typingDot3: {
    opacity: 0.3,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
});
