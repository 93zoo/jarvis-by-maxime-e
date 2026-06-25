import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { Message } from '@/context/JarvisContext';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Weather Card ──────────────────────────────────────────────────────────────
function WeatherCard({ data }: { data: NonNullable<Message['weatherData']> }) {
  const colors = useColors();
  return (
    <View style={[styles.weatherCard, { backgroundColor: colors.card, borderColor: colors.primary + '40' }]}>
      <View style={styles.weatherTop}>
        <Text style={[styles.weatherCity, { color: colors.foreground }]}>{data.city}</Text>
        <Text style={styles.weatherEmoji}>{data.emoji}</Text>
      </View>
      <View style={styles.weatherRow}>
        <Text style={[styles.weatherTemp, { color: colors.primary }]}>{data.temp}</Text>
        <Text style={[styles.weatherDesc, { color: colors.mutedForeground }]}>{data.description}</Text>
      </View>
      {data.humidity && (
        <Text style={[styles.weatherDetail, { color: colors.mutedForeground }]}>
          💧 {data.humidity}  💨 {data.wind ?? '—'}
        </Text>
      )}
    </View>
  );
}

// ── Message Bubble ────────────────────────────────────────────────────────────
export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const colors = useColors();
  const isUser = message.role === 'user';

  return (
    <Animated.View
      entering={isUser ? FadeInUp.duration(220).springify().damping(18) : FadeInDown.duration(220).springify().damping(18)}
      style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}
    >
      {/* Role tag */}
      <Text style={[styles.roleTag, { color: isUser ? colors.primary + 'AA' : colors.silver + '88' }]}>
        {isUser ? 'VOUS' : 'JARVIS'}
      </Text>

      {/* Weather card */}
      {message.weatherData && <WeatherCard data={message.weatherData} />}

      {/* Text bubble */}
      {(message.content || isStreaming) && (
        isUser ? (
          // ── User bubble: electric blue gradient, sharp left corners ──
          <LinearGradient
            colors={[colors.primary + 'CC', colors.primary + '88']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.userBubble, { borderColor: colors.primary + '55' }]}
          >
            <Text style={[styles.messageText, { color: '#E8F6FF' }]}>
              {message.content}
            </Text>
          </LinearGradient>
        ) : (
          // ── Assistant bubble: dark angular, glassmorphism iOS / solid Android ──
          Platform.OS === 'ios' ? (
            <BlurView
              intensity={14}
              tint="dark"
              style={[styles.assistantBubble, { borderColor: colors.primary + '35' }]}
            >
              <View style={[styles.assistantInner, { backgroundColor: colors.card + 'DD' }]}>
                {/* Top accent line */}
                <View style={[styles.assistantAccent, { backgroundColor: colors.primary + '60' }]} />
                {message.content ? (
                  <Text style={[styles.messageText, { color: colors.foreground }]}>
                    {message.content}
                    {isStreaming && <Text style={{ color: colors.primary }}>▊</Text>}
                  </Text>
                ) : isStreaming ? (
                  <Text style={[styles.messageText, { color: colors.primary }]}>▊</Text>
                ) : null}
              </View>
            </BlurView>
          ) : (
            <View style={[styles.assistantBubble, styles.assistantBubbleAndroid, {
              borderColor: colors.primary + '35',
              backgroundColor: colors.card + 'F0',
            }]}>
              {/* Top accent line */}
              <View style={[styles.assistantAccent, { backgroundColor: colors.primary + '60' }]} />
              {message.content ? (
                <Text style={[styles.messageText, { color: colors.foreground }]}>
                  {message.content}
                  {isStreaming && <Text style={{ color: colors.primary }}>▊</Text>}
                </Text>
              ) : isStreaming ? (
                <Text style={[styles.messageText, { color: colors.primary }]}>▊</Text>
              ) : null}
            </View>
          )
        )
      )}

      {/* Timestamp */}
      <Text style={[
        styles.timestamp,
        { color: colors.mutedForeground },
        isUser ? styles.timestampRight : styles.timestampLeft,
      ]}>
        {formatTime(message.timestamp)}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    maxWidth: '90%',
  },
  rowUser: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  rowAssistant: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },

  // Role tag
  roleTag: {
    fontSize: 8,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 2.5,
    marginBottom: 4,
  },

  // User bubble — sharp top-left corner, rounded rest
  userBubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderTopRightRadius: 4,   // sharp top-right (robot feel)
    borderWidth: 1,
  },

  // Assistant bubble — sharp top-left corner
  assistantBubble: {
    borderRadius: 16,
    borderTopLeftRadius: 4,    // sharp top-left (robot feel)
    borderWidth: 1,
    overflow: 'hidden',
  },
  assistantBubbleAndroid: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  assistantInner: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  assistantAccent: {
    height: 1.5,
    marginBottom: 8,
    borderRadius: 1,
  },

  // Text
  messageText: {
    fontSize: 15,
    lineHeight: 23,
    fontFamily: 'Inter_400Regular',
  },

  // Timestamp
  timestamp: {
    fontSize: 9,
    fontFamily: 'Inter_400Regular',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  timestampRight: { alignSelf: 'flex-end' },
  timestampLeft:  { alignSelf: 'flex-start' },

  // Weather card
  weatherCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    marginBottom: 6,
    minWidth: 180,
  },
  weatherTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  weatherCity: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600' as const,
  },
  weatherEmoji: { fontSize: 24 },
  weatherRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 4,
  },
  weatherTemp: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    fontWeight: '700' as const,
  },
  weatherDesc: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textTransform: 'capitalize',
  },
  weatherDetail: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
});
