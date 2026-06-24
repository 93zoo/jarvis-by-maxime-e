import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetch } from 'expo/fetch';
import * as Speech from 'expo-speech';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface JarvisContextType {
  messages: Message[];
  isStreaming: boolean;
  model: string;
  voiceEnabled: boolean;
  isSpeaking: boolean;
  sendMessage: (text: string) => Promise<void>;
  clearConversation: () => void;
  setModel: (model: string) => Promise<void>;
  setVoiceEnabled: (v: boolean) => Promise<void>;
  stopSpeaking: () => void;
  transcribeAudio: (uri: string) => Promise<string | null>;
  error: string | null;
  clearError: () => void;
}

const JarvisContext = createContext<JarvisContextType | null>(null);

const STORAGE_MESSAGES_KEY = '@jarvis_messages';
const STORAGE_MODEL_KEY = '@jarvis_model';
const STORAGE_VOICE_KEY = '@jarvis_voice_enabled';

// Backend base URL — uses env var in dev, falls back to deployed prod server in APK builds
const PROD_DOMAIN = 'jarvis-ai--maximeetivant.replit.app';
const _domain = process.env.EXPO_PUBLIC_DOMAIN;
if (__DEV__ && !_domain) {
  console.warn('[JARVIS] EXPO_PUBLIC_DOMAIN is not set — falling back to production server.');
}
const API_BASE = `https://${_domain || PROD_DOMAIN}/api/ai`;

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

/**
 * Buffered SSE parser — handles JSON payloads split across TCP chunks.
 */
function parseSSEChunk(
  raw: string,
  leftover: string
): { tokens: string[]; nextLeftover: string } {
  const tokens: string[] = [];
  const combined = leftover + raw;
  const lines = combined.split('\n');
  const nextLeftover = lines.pop() ?? '';

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (!trimmed.startsWith('data: ')) continue;
    const payload = trimmed.slice(6).trim();
    if (payload === '[DONE]') continue;
    try {
      const parsed = JSON.parse(payload);
      if (parsed?.error) throw new Error(parsed.error);
      const delta: string | undefined = parsed?.choices?.[0]?.delta?.content;
      if (delta) tokens.push(delta);
    } catch (e) {
      if (e instanceof Error && e.message !== 'Unexpected end of JSON input') throw e;
    }
  }

  return { tokens, nextLeftover };
}

export function JarvisProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [model, setModelState] = useState('gpt-4o-mini');
  const [voiceEnabled, setVoiceEnabledState] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPersistedData();
  }, []);

  async function loadPersistedData() {
    try {
      const [savedMessages, savedModel, savedVoice] = await Promise.all([
        AsyncStorage.getItem(STORAGE_MESSAGES_KEY),
        AsyncStorage.getItem(STORAGE_MODEL_KEY),
        AsyncStorage.getItem(STORAGE_VOICE_KEY),
      ]);
      if (savedMessages) setMessages(JSON.parse(savedMessages));
      if (savedModel) setModelState(savedModel);
      if (savedVoice !== null) setVoiceEnabledState(savedVoice === 'true');
    } catch {}
  }

  async function persistMessages(msgs: Message[]) {
    try {
      await AsyncStorage.setItem(STORAGE_MESSAGES_KEY, JSON.stringify(msgs));
    } catch {}
  }

  const setModel = useCallback(async (m: string) => {
    setModelState(m);
    await AsyncStorage.setItem(STORAGE_MODEL_KEY, m);
  }, []);

  const setVoiceEnabled = useCallback(async (v: boolean) => {
    setVoiceEnabledState(v);
    await AsyncStorage.setItem(STORAGE_VOICE_KEY, String(v));
    if (!v) Speech.stop();
  }, []);

  const stopSpeaking = useCallback(() => {
    Speech.stop();
    setIsSpeaking(false);
  }, []);

  const clearConversation = useCallback(() => {
    Speech.stop();
    setIsSpeaking(false);
    setMessages([]);
    AsyncStorage.removeItem(STORAGE_MESSAGES_KEY);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  /** Transcribe a recorded audio file via the backend (Whisper) */
  const transcribeAudio = useCallback(async (uri: string): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append('file', {
        uri,
        type: 'audio/m4a',
        name: 'voice.m4a',
      } as unknown as Blob);

      const response = await globalThis.fetch(`${API_BASE}/transcribe`, {
        method: 'POST',
        headers: {},
        body: formData,
      });

      if (!response.ok) return null;
      const data = await response.json();
      return (data.text as string) || null;
    } catch {
      return null;
    }
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      const trimmed = text.trim();

      Speech.stop();
      setIsSpeaking(false);

      // Snapshot history before optimistic update
      const currentMessages = await new Promise<Message[]>((resolve) => {
        setMessages((prev) => { resolve(prev); return prev; });
      });

      const apiMessages = currentMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      // Optimistic bubbles
      const userMsg: Message = { id: generateId(), role: 'user', content: trimmed, timestamp: Date.now() };
      const assistantMsgId = generateId();
      const assistantMsg: Message = { id: assistantMsgId, role: 'assistant', content: '', timestamp: Date.now() };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);
      setError(null);

      try {
        const response = await fetch(`${API_BASE}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...apiMessages, { role: 'user', content: trimmed }],
            model,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(errText || `Erreur serveur ${response.status}`);
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        let leftover = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const raw = decoder.decode(value, { stream: true });
          const { tokens, nextLeftover } = parseSSEChunk(raw, leftover);
          leftover = nextLeftover;

          if (tokens.length > 0) {
            fullContent += tokens.join('');
            const snapshot = fullContent;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMsgId ? { ...m, content: snapshot } : m))
            );
          }
        }

        setMessages((prev) => {
          const final = prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content: fullContent } : m
          );
          persistMessages(final);
          return final;
        });

        if (voiceEnabled && fullContent) {
          setIsSpeaking(true);
          Speech.speak(fullContent, {
            rate: 0.95,
            pitch: 0.85,
            onDone: () => setIsSpeaking(false),
            onError: () => setIsSpeaking(false),
            onStopped: () => setIsSpeaking(false),
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erreur inconnue';
        setError(msg);
        setMessages((prev) => {
          const filtered = prev.filter((m) => m.id !== assistantMsgId);
          persistMessages(filtered);
          return filtered;
        });
      } finally {
        setIsStreaming(false);
      }
    },
    [isStreaming, model, voiceEnabled]
  );

  return (
    <JarvisContext.Provider
      value={{
        messages,
        isStreaming,
        model,
        voiceEnabled,
        isSpeaking,
        sendMessage,
        clearConversation,
        setModel,
        setVoiceEnabled,
        stopSpeaking,
        transcribeAudio,
        error,
        clearError,
      }}
    >
      {children}
    </JarvisContext.Provider>
  );
}

export function useJarvis() {
  const ctx = useContext(JarvisContext);
  if (!ctx) throw new Error('useJarvis must be used inside JarvisProvider');
  return ctx;
}
