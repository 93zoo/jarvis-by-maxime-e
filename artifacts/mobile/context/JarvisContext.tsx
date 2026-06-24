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
  apiKey: string;
  model: string;
  voiceEnabled: boolean;
  isSpeaking: boolean;
  sendMessage: (text: string) => Promise<void>;
  clearConversation: () => void;
  setApiKey: (key: string) => Promise<void>;
  setModel: (model: string) => Promise<void>;
  setVoiceEnabled: (v: boolean) => Promise<void>;
  stopSpeaking: () => void;
  transcribeAudio: (uri: string) => Promise<string | null>;
  error: string | null;
  clearError: () => void;
}

const JarvisContext = createContext<JarvisContextType | null>(null);

const STORAGE_MESSAGES_KEY = '@jarvis_messages';
const STORAGE_API_KEY = '@jarvis_api_key';
const STORAGE_MODEL_KEY = '@jarvis_model';
const STORAGE_VOICE_KEY = '@jarvis_voice_enabled';

const SYSTEM_PROMPT = `You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), an advanced AI assistant. You are highly intelligent, precise, and helpful. You speak in a calm, sophisticated manner — like the AI from Iron Man. You are concise but thorough. You refer to the user as "sir" or "ma'am" occasionally. Keep responses clear and actionable.`;

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
      const delta: string | undefined = parsed?.choices?.[0]?.delta?.content;
      if (delta) tokens.push(delta);
    } catch {}
  }

  return { tokens, nextLeftover };
}

export function JarvisProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [apiKey, setApiKeyState] = useState('');
  const [model, setModelState] = useState('gpt-4o-mini');
  const [voiceEnabled, setVoiceEnabledState] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPersistedData();
  }, []);

  async function loadPersistedData() {
    try {
      const [savedMessages, savedKey, savedModel, savedVoice] = await Promise.all([
        AsyncStorage.getItem(STORAGE_MESSAGES_KEY),
        AsyncStorage.getItem(STORAGE_API_KEY),
        AsyncStorage.getItem(STORAGE_MODEL_KEY),
        AsyncStorage.getItem(STORAGE_VOICE_KEY),
      ]);
      if (savedMessages) setMessages(JSON.parse(savedMessages));
      if (savedKey) setApiKeyState(savedKey);
      if (savedModel) setModelState(savedModel);
      if (savedVoice !== null) setVoiceEnabledState(savedVoice === 'true');
    } catch {}
  }

  async function persistMessages(msgs: Message[]) {
    try {
      await AsyncStorage.setItem(STORAGE_MESSAGES_KEY, JSON.stringify(msgs));
    } catch {}
  }

  const setApiKey = useCallback(async (key: string) => {
    setApiKeyState(key);
    await AsyncStorage.setItem(STORAGE_API_KEY, key);
  }, []);

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

  /** Transcribe a recorded audio file via OpenAI Whisper */
  const transcribeAudio = useCallback(
    async (uri: string): Promise<string | null> => {
      if (!apiKey) {
        setError('Clé API requise pour la transcription vocale.');
        return null;
      }
      try {
        const formData = new FormData();
        formData.append('file', {
          uri,
          type: 'audio/m4a',
          name: 'voice.m4a',
        } as unknown as Blob);
        formData.append('model', 'whisper-1');

        const response = await globalThis.fetch(
          'https://api.openai.com/v1/audio/transcriptions',
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}` },
            body: formData,
          }
        );

        if (!response.ok) return null;
        const data = await response.json();
        return (data.text as string) || null;
      } catch {
        return null;
      }
    },
    [apiKey]
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      if (!apiKey) {
        setError('Clé API requise. Allez dans les paramètres pour ajouter votre clé OpenAI.');
        return;
      }

      const trimmed = text.trim();

      // Stop any ongoing speech before a new response
      Speech.stop();
      setIsSpeaking(false);

      // ── 1. Snapshot current history BEFORE any state update ──────────────
      const currentMessages = await new Promise<Message[]>((resolve) => {
        setMessages((prev) => {
          resolve(prev);
          return prev;
        });
      });

      const apiMessages = [
        { role: 'system' as const, content: SYSTEM_PROMPT },
        ...currentMessages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content: trimmed },
      ];

      // ── 2. Optimistic bubbles ─────────────────────────────────────────────
      const userMsg: Message = { id: generateId(), role: 'user', content: trimmed, timestamp: Date.now() };
      const assistantMsgId = generateId();
      const assistantMsg: Message = { id: assistantMsgId, role: 'assistant', content: '', timestamp: Date.now() };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);
      setError(null);

      // ── 3. Stream from OpenAI ─────────────────────────────────────────────
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ model, messages: apiMessages, stream: true, max_tokens: 2048 }),
        });

        if (!response.ok) {
          let errMsg = `OpenAI error ${response.status}`;
          try {
            const errText = await response.text();
            const parsed = JSON.parse(errText);
            errMsg = parsed?.error?.message ?? errMsg;
          } catch {}
          throw new Error(errMsg);
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

        // Persist final state
        setMessages((prev) => {
          const final = prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content: fullContent } : m
          );
          persistMessages(final);
          return final;
        });

        // ── 4. Speak response if voice enabled ────────────────────────────
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
        const msg = err instanceof Error ? err.message : 'Une erreur inconnue est survenue';
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
    [apiKey, isStreaming, model, voiceEnabled]
  );

  return (
    <JarvisContext.Provider
      value={{
        messages,
        isStreaming,
        apiKey,
        model,
        voiceEnabled,
        isSpeaking,
        sendMessage,
        clearConversation,
        setApiKey,
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
