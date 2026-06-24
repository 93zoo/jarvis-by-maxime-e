import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Message } from '@/context/JarvisContext';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const colors = useColors();
  const isUser = message.role === 'user';

  return (
    <View style={[styles.row, isUser ? styles.rowRight : styles.rowLeft]}>
      {!isUser && (
        <View
          style={[
            styles.avatar,
            { backgroundColor: colors.primary + '20', borderColor: colors.primary + '60' },
          ]}
        >
          <Text style={[styles.avatarText, { color: colors.primary }]}>J</Text>
        </View>
      )}

      <View style={styles.bubbleWrapper}>
        <View
          style={[
            styles.bubble,
            isUser
              ? [styles.userBubble, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]
              : [styles.assistantBubble, { backgroundColor: colors.card, borderColor: colors.border }],
          ]}
        >
          {message.content ? (
            <Text
              style={[
                styles.messageText,
                { color: isUser ? colors.foreground : colors.foreground },
              ]}
            >
              {message.content}
              {isStreaming && !isUser && (
                <Text style={{ color: colors.primary }}>▊</Text>
              )}
            </Text>
          ) : (
            isStreaming && !isUser ? (
              <Text style={[styles.messageText, { color: colors.primary }]}>▊</Text>
            ) : null
          )}
        </View>
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

      {isUser && (
        <View
          style={[
            styles.avatar,
            { backgroundColor: colors.secondary, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.avatarText, { color: colors.secondaryForeground }]}>U</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginVertical: 4,
    paddingHorizontal: 12,
    gap: 8,
  },
  rowLeft: {
    justifyContent: 'flex-start',
  },
  rowRight: {
    justifyContent: 'flex-end',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
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
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  userBubble: {
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: 'Inter_400Regular',
  },
  timestamp: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  timestampLeft: {
    textAlign: 'left',
    paddingLeft: 4,
  },
  timestampRight: {
    textAlign: 'right',
    paddingRight: 4,
  },
});
