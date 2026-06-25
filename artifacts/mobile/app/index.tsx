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
  const reversedMessages = [...messages].reverse();

  const renderItem = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const isLastAssistant = item.role === 'assistant' && index === 0 && isStreaming;
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

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <View style={styles.headerLeft}>
          {/* Robot status indicator — angular diamond */}
          <View style={styles.statusWrapper}>
            <View style={[styles.statusDiamond, { backgroundColor: colors.accent, shadowColor: colors.accent }]} />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: colors.primary }]}>J.A.R.V.I.S.</Text>
            <Text style={[styles.headerSub, { color: colors.silver }]}>UNITÉ 001 · EN LIGNE</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {messages.length > 0 && (
            <Pressable
              onPress={handleClear}
              style={({ pressed }) => [styles.headerBtn, {
                borderColor: colors.border,
                backgroundColor: colors.card,
                opacity: pressed ? 0.5 : 1,
              }]}
              hitSlop={8}
            >
              <Feather name="trash-2" size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
          <Pressable
            onPress={() => router.push('/tasks' as never)}
            style={({ pressed }) => [styles.headerBtn, {
              borderColor: colors.border,
              backgroundColor: colors.card,
              opacity: pressed ? 0.5 : 1,
            }]}
            hitSlop={8}
          >
            <Feather name="check-square" size={16} color={colors.mutedForeground} />
          </Pressable>
          <Pressable
            onPress={() => router.push('/settings')}
            style={({ pressed }) => [styles.headerBtn, {
              borderColor: colors.border,
              backgroundColor: colors.card,
              opacity: pressed ? 0.5 : 1,
            }]}
            hitSlop={8}
          >
            <Feather name="settings" size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>

      {/* ── Header separator with glow ── */}
      <View style={styles.separatorRow}>
        <View style={[styles.separatorLeft,  { backgroundColor: colors.border }]} />
        <View style={[styles.separatorGlow,  { backgroundColor: colors.primary + '90' }]} />
        <View style={[styles.separatorRight, { backgroundColor: colors.border }]} />
      </View>

      <KeyboardAvoidingView style={styles.keyboardView} behavior="padding" keyboardVerticalOffset={0}>

        {/* ── Chat area ── */}
        {messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <JarvisOrb isActive={isStreaming} size={110} />
            <View style={styles.emptyTextBlock}>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                Online and ready, sir.
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
                Comment puis-je vous aider ?
              </Text>
            </View>
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

        {/* ── Error banner ── */}
        {error && (
          <Pressable
            onPress={clearError}
            style={[styles.errorBanner, { backgroundColor: colors.destructive + '20', borderColor: colors.destructive }]}
          >
            <Feather name="alert-circle" size={14} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive }]} numberOfLines={2}>{error}</Text>
            <Feather name="x" size={14} color={colors.destructive} />
          </Pressable>
        )}

        <ChatInput onSend={sendMessage} isStreaming={isStreaming} disabled={false} />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusWrapper: {
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDiamond: {
    width: 8,
    height: 8,
    transform: [{ rotate: '45deg' }],
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 2.5,
  },
  headerSub: {
    fontSize: 8,
    fontFamily: 'Inter_400Regular',
    letterSpacing: 2,
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Separator
  separatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 1,
    marginBottom: 0,
  },
  separatorLeft: {
    flex: 1,
    height: 1,
  },
  separatorGlow: {
    width: 60,
    height: 1,
  },
  separatorRight: {
    flex: 1,
    height: 1,
  },

  // Keyboard view
  keyboardView: { flex: 1 },

  // List
  list: { flex: 1 },
  listContent: { paddingVertical: 12, paddingBottom: 4 },

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 20,
  },
  emptyTextBlock: {
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.5,
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Typing indicator
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
  },
  typingDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    opacity: 0.9,
  },
  typingDot2: { opacity: 0.55 },
  typingDot3: { opacity: 0.25 },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
});
