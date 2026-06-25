import React, { useCallback, useRef } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
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

// ── Quick action chips ────────────────────────────────────────────────────────

const QUICK_CHIPS = [
  { emoji: '🌤', label: 'MÉTÉO PARIS',   action: (j: ReturnType<typeof useJarvis>) => j.fetchWeather('Paris') },
  { emoji: '📰', label: 'ACTUALITÉS',    action: (j: ReturnType<typeof useJarvis>) => j.fetchNews('') },
  { emoji: '💬', label: 'CITATION',      action: (j: ReturnType<typeof useJarvis>) => j.sendMessage("Donne-moi une citation inspirante avec son auteur.") },
  { emoji: '🐙', label: 'GITHUB',        action: (j: ReturnType<typeof useJarvis>) => j.fetchGithubNotifs() },
  { emoji: '🔐', label: 'MOT DE PASSE',  action: (j: ReturnType<typeof useJarvis>) => j.sendMessage("Génère un mot de passe ultra-sécurisé de 20 caractères avec des symboles.") },
  { emoji: '🌍', label: 'TRADUCTEUR',    action: (j: ReturnType<typeof useJarvis>) => j.sendMessage("Comment dit-on 'intelligence artificielle' en japonais, arabe et russe ?") },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const jarvis = useJarvis();
  const { messages, isStreaming, sendMessage, clearConversation, error, clearError } = jarvis;

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
          {/* Targeting diamond */}
          <View style={styles.statusWrapper}>
            <View style={[styles.statusDiamond, { backgroundColor: colors.accent, shadowColor: colors.accent }]} />
            <View style={[styles.statusRing, { borderColor: colors.accent + '40' }]} />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: colors.primary }]}>J.A.R.V.I.S.</Text>
            <Text style={[styles.headerSub, { color: colors.silver }]}>UNITÉ 001 · EN LIGNE</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {/* System stat pills */}
          <View style={[styles.statPill, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <View style={[styles.statDot, { backgroundColor: '#22c55e' }]} />
            <Text style={[styles.statText, { color: colors.mutedForeground }]}>GPT-4o</Text>
          </View>

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
              <Feather name="trash-2" size={15} color={colors.mutedForeground} />
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
            <Feather name="check-square" size={15} color={colors.mutedForeground} />
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
            <Feather name="settings" size={15} color={colors.mutedForeground} />
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

            {/* ── Quick action chips ── */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipsScroll}
              contentContainerStyle={styles.chipsContent}
            >
              {QUICK_CHIPS.map((chip) => (
                <Pressable
                  key={chip.label}
                  onPress={async () => {
                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    chip.action(jarvis);
                  }}
                  disabled={isStreaming}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      borderColor: pressed ? colors.primary + '80' : colors.border,
                      backgroundColor: pressed ? colors.primary + '12' : colors.card,
                      opacity: isStreaming ? 0.4 : pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <Text style={styles.chipEmoji}>{chip.emoji}</Text>
                  <Text style={[styles.chipLabel, { color: colors.mutedForeground }]}>{chip.label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* HUD corner decorations */}
            <View style={[styles.hudCornerTL, { borderColor: colors.primary + '30' }]} />
            <View style={[styles.hudCornerBR, { borderColor: colors.primary + '30' }]} />
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
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusWrapper: { alignItems: 'center', justifyContent: 'center', width: 24, height: 24 },
  statusDiamond: {
    width: 8, height: 8,
    transform: [{ rotate: '45deg' }],
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    position: 'absolute',
  },
  statusRing: {
    width: 18, height: 18,
    borderRadius: 9,
    borderWidth: 1,
    position: 'absolute',
  },
  headerTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  headerSub: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 1.5, marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  statPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1 },
  statDot: { width: 5, height: 5, borderRadius: 3 },
  statText: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 0.5 },

  headerBtn: {
    width: 32, height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Separator
  separatorRow: { flexDirection: 'row', alignItems: 'center', height: 1 },
  separatorLeft:  { flex: 2, height: 1 },
  separatorGlow:  { width: 80, height: 1.5 },
  separatorRight: { flex: 1, height: 1 },

  keyboardView: { flex: 1 },

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    position: 'relative',
  },
  emptyTextBlock: { alignItems: 'center', gap: 6, marginTop: 20, marginBottom: 28 },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 },
  emptySubtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', letterSpacing: 0.3 },

  // Quick chips
  chipsScroll: { maxHeight: 44, flexGrow: 0, width: '100%' },
  chipsContent: { paddingHorizontal: 0, gap: 8, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  chipEmoji: { fontSize: 13 },
  chipLabel: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.2 },

  // HUD corner decorations on empty screen
  hudCornerTL: {
    position: 'absolute', top: 20, left: 20,
    width: 20, height: 20,
    borderTopWidth: 1, borderLeftWidth: 1,
  },
  hudCornerBR: {
    position: 'absolute', bottom: 20, right: 20,
    width: 20, height: 20,
    borderBottomWidth: 1, borderRightWidth: 1,
  },

  // List
  list: { flex: 1 },
  listContent: { paddingHorizontal: 12, paddingVertical: 12, gap: 6 },

  // Typing indicator
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  typingDot: {
    width: 5, height: 5, borderRadius: 3,
  },
  typingDot2: { opacity: 0.6 },
  typingDot3: { opacity: 0.3 },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  errorText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular' },
});
