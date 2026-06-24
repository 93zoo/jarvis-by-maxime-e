import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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

  const weatherIcon = () => {
    const cond = data.condition.toLowerCase();
    if (cond.includes('sun') || cond.includes('clear')) return '☀️';
    if (cond.includes('cloud')) return '☁️';
    if (cond.includes('rain') || cond.includes('drizzle')) return '🌧️';
    if (cond.includes('snow')) return '❄️';
    if (cond.includes('thunder') || cond.includes('storm')) return '⛈️';
    if (cond.includes('fog') || cond.includes('mist')) return '🌫️';
    if (cond.includes('wind')) return '💨';
    return '🌤️';
  };

  return (
    <LinearGradient
      colors={[colors.card, colors.secondary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.weatherCard, { borderColor: colors.primary + '40' }]}
    >
      <View style={styles.weatherTop}>
        <Text style={styles.weatherIcon}>{weatherIcon()}</Text>
        <View style={styles.weatherRight}>
          <Text style={[styles.weatherCity, { color: colors.primary }]}>{data.city}</Text>
          <Text style={[styles.weatherCondition, { color: colors.mutedForeground }]}>{data.condition}</Text>
        </View>
      </View>

      <Text style={[styles.weatherTemp, { color: colors.foreground }]}>
        {data.tempC}°C
        <Text style={[styles.weatherFeels, { color: colors.mutedForeground }]}>
          {'  '}Ressenti {data.feelsLikeC}°C
        </Text>
      </Text>

      <View style={[styles.weatherRow, { borderTopColor: colors.border }]}>
        <View style={styles.weatherStat}>
          <Text style={[styles.weatherStatLabel, { color: colors.mutedForeground }]}>💧 Humidité</Text>
          <Text style={[styles.weatherStatValue, { color: colors.foreground }]}>{data.humidity}%</Text>
        </View>
        <View style={[styles.weatherDivider, { backgroundColor: colors.border }]} />
        <View style={styles.weatherStat}>
          <Text style={[styles.weatherStatLabel, { color: colors.mutedForeground }]}>💨 Vent</Text>
          <Text style={[styles.weatherStatValue, { color: colors.foreground }]}>{data.windKmph} km/h</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

// ── Main Bubble ───────────────────────────────────────────────────────────────
export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const colors = useColors();
  const isUser = message.role === 'user';

  const entering = isUser
    ? FadeInDown.duration(280).springify().damping(18).stiffness(160)
    : FadeInUp.duration(320).springify().damping(18).stiffness(140);

  return (
    <Animated.View
      entering={entering}
      style={[styles.row, isUser ? styles.rowRight : styles.rowLeft]}
    >
      {/* JARVIS avatar */}
      {!isUser && (
        <LinearGradient
          colors={[colors.primary + '30', colors.secondary]}
          style={[styles.avatar, { borderColor: colors.primary + '70' }]}
        >
          <Text style={[styles.avatarText, { color: colors.primary }]}>J</Text>
        </LinearGradient>
      )}

      <View style={[styles.bubbleWrapper, isUser && styles.bubbleWrapperUser]}>
        {/* ── Content by type ── */}
        {message.type === 'weather' && message.weatherData ? (
          <WeatherCard data={message.weatherData} />
        ) : isUser ? (
          // User bubble — gradient glass
          <LinearGradient
            colors={[colors.primary + '28', colors.primary + '14']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.userBubble, { borderColor: colors.primary + '50' }]}
          >
            <Text style={[styles.messageText, { color: colors.foreground }]}>
              {message.content}
            </Text>
          </LinearGradient>
        ) : (
          // Assistant bubble — glassmorphism
          <BlurView intensity={18} tint="dark" style={[styles.assistantBubble, { borderColor: colors.border }]}>
            <View style={[styles.assistantInner, { backgroundColor: colors.card + 'cc' }]}>
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
        )}

        {/* Timestamp */}
        <Text
          style={[
            styles.timestamp,
            { color: colors.mutedForeground },
            isUser ? styles.timestampRight : styles.timestampLeft,
          ]}
        >
          {formatTime(message.timestamp)}
        </Text>
      </View>

      {/* User avatar */}
      {isUser && (
        <LinearGradient
          colors={[colors.accent + '50', colors.accent + '20']}
          style={[styles.avatar, { borderColor: colors.accent + '60' }]}
        >
          <Text style={[styles.avatarText, { color: colors.accent }]}>M</Text>
        </LinearGradient>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginVertical: 5,
    paddingHorizontal: 12,
    gap: 8,
  },
  rowLeft: { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },

  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 12,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },

  bubbleWrapper: {
    maxWidth: '75%',
    gap: 3,
  },
  bubbleWrapperUser: {
    alignItems: 'flex-end',
  },

  userBubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderBottomRightRadius: 5,
    borderWidth: 1,
  },

  assistantBubble: {
    borderRadius: 18,
    borderBottomLeftRadius: 5,
    borderWidth: 1,
    overflow: 'hidden',
  },
  assistantInner: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  messageText: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: 'Inter_400Regular',
  },

  timestamp: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    opacity: 0.7,
  },
  timestampLeft: { textAlign: 'left', paddingLeft: 4 },
  timestampRight: { textAlign: 'right', paddingRight: 4 },

  // Weather
  weatherCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 14,
    gap: 10,
    minWidth: 220,
  },
  weatherTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  weatherIcon: { fontSize: 36 },
  weatherRight: { flex: 1, gap: 2 },
  weatherCity: {
    fontSize: 15,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  weatherCondition: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  weatherTemp: {
    fontSize: 28,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
  weatherFeels: {
    fontSize: 13,
    fontWeight: '400' as const,
    fontFamily: 'Inter_400Regular',
  },
  weatherRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 10,
    gap: 8,
  },
  weatherStat: { flex: 1, gap: 3 },
  weatherStatLabel: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  weatherStatValue: { fontSize: 14, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  weatherDivider: { width: 1 },

});
