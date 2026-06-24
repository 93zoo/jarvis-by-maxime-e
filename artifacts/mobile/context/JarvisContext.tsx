import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetch } from 'expo/fetch';
import * as Speech from 'expo-speech';
import { Share } from 'react-native';

// ── Types ─────────────────────────────────────────────────────────────────────

export type MessageType = 'text' | 'weather';

export interface WeatherData {
  city: string;
  tempC: string;
  feelsLikeC: string;
  condition: string;
  humidity: string;
  windKmph: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  type?: MessageType;
  weatherData?: WeatherData;
}

interface JarvisContextType {
  messages: Message[];
  isStreaming: boolean;
  model: string;
  voiceEnabled: boolean;
  isSpeaking: boolean;
  systemPrompt: string;
  sendMessage: (text: string) => Promise<void>;
  sendEmail: (opts: { to: string; subject: string; body: string }) => Promise<void>;
  searchWeb: (query: string) => Promise<void>;
  fetchWeather: (city: string) => Promise<void>;
  exportConversation: () => Promise<void>;
  clearConversation: () => void;
  setModel: (model: string) => Promise<void>;
  setVoiceEnabled: (v: boolean) => Promise<void>;
  setSystemPrompt: (p: string) => Promise<void>;
  stopSpeaking: () => void;
  transcribeAudio: (uri: string) => Promise<string | null>;
  error: string | null;
  clearError: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const JarvisContext = createContext<JarvisContextType | null>(null);

const STORAGE_MESSAGES_KEY = '@jarvis_messages';
const STORAGE_MODEL_KEY = '@jarvis_model';
const STORAGE_VOICE_KEY = '@jarvis_voice_enabled';
const STORAGE_SYSTEM_PROMPT_KEY = '@jarvis_system_prompt';

const DEFAULT_SYSTEM_PROMPT =
  "You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), an advanced AI assistant created by Maxime-E. You are highly intelligent, precise, and helpful. You speak in a calm, sophisticated manner — like the AI from Iron Man. You are concise but thorough. You refer to the user as \"sir\" or \"ma'am\" occasionally.";

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

// ── Provider ──────────────────────────────────────────────────────────────────

export function JarvisProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [model, setModelState] = useState('gpt-4o-mini');
  const [voiceEnabled, setVoiceEnabledState] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [systemPrompt, setSystemPromptState] = useState(DEFAULT_SYSTEM_PROMPT);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPersistedData();
  }, []);

  async function loadPersistedData() {
    try {
      const [savedMessages, savedModel, savedVoice, savedPrompt] = await Promise.all([
        AsyncStorage.getItem(STORAGE_MESSAGES_KEY),
        AsyncStorage.getItem(STORAGE_MODEL_KEY),
        AsyncStorage.getItem(STORAGE_VOICE_KEY),
        AsyncStorage.getItem(STORAGE_SYSTEM_PROMPT_KEY),
      ]);
      if (savedMessages) setMessages(JSON.parse(savedMessages));
      if (savedModel) setModelState(savedModel);
      if (savedVoice !== null) setVoiceEnabledState(savedVoice === 'true');
      if (savedPrompt) setSystemPromptState(savedPrompt);
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

  const setSystemPrompt = useCallback(async (p: string) => {
    setSystemPromptState(p);
    await AsyncStorage.setItem(STORAGE_SYSTEM_PROMPT_KEY, p);
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

  // ── Transcription ───────────────────────────────────────────────────────────
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

  // ── Chat (streaming) ────────────────────────────────────────────────────────
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

      const apiMessages = currentMessages
        .filter((m) => m.type === 'text' || !m.type)
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

      const userMsg: Message = { id: generateId(), role: 'user', content: trimmed, timestamp: Date.now(), type: 'text' };
      const assistantMsgId = generateId();
      const assistantMsg: Message = { id: assistantMsgId, role: 'assistant', content: '', timestamp: Date.now(), type: 'text' };

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
            systemPrompt,
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
    [isStreaming, model, voiceEnabled, systemPrompt]
  );

  // ── Web search ───────────────────────────────────────────────────────────────
  const searchWeb = useCallback(async (query: string) => {
    if (!query.trim() || isStreaming) return;

    const trimmed = query.trim();
    const userMsg: Message = {
      id: generateId(),
      role: 'user',
      content: `🔍 ${trimmed}`,
      timestamp: Date.now(),
      type: 'text',
    };
    const loadingId = generateId();
    const loadingMsg: Message = {
      id: loadingId,
      role: 'assistant',
      content: '🌐 Recherche en cours...',
      timestamp: Date.now(),
      type: 'text',
    };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setIsStreaming(true);
    setError(null);

    try {
      const response = await globalThis.fetch(`${API_BASE}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed }),
      });

      if (!response.ok) throw new Error(`Erreur serveur ${response.status}`);
      const data = await response.json() as { result: string };

      const resultMsg: Message = {
        id: loadingId,
        role: 'assistant',
        content: data.result,
        timestamp: Date.now(),
        type: 'text',
      };

      setMessages((prev) => {
        const updated = prev.map((m) => (m.id === loadingId ? resultMsg : m));
        persistMessages(updated);
        return updated;
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(msg);
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== loadingId);
        persistMessages(filtered);
        return filtered;
      });
    } finally {
      setIsStreaming(false);
    }
  }, [isStreaming]);

  // ── Weather ──────────────────────────────────────────────────────────────────
  const fetchWeather = useCallback(async (city: string) => {
    if (!city.trim() || isStreaming) return;

    const trimmed = city.trim();
    const userMsg: Message = {
      id: generateId(),
      role: 'user',
      content: `🌤 Météo à ${trimmed}`,
      timestamp: Date.now(),
      type: 'text',
    };
    const loadingId = generateId();
    const loadingMsg: Message = {
      id: loadingId,
      role: 'assistant',
      content: '🌍 Récupération météo...',
      timestamp: Date.now(),
      type: 'text',
    };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setIsStreaming(true);
    setError(null);

    try {
      const encoded = encodeURIComponent(trimmed);
      const response = await globalThis.fetch(`${API_BASE}/weather?city=${encoded}`);

      if (!response.ok) throw new Error(`Erreur serveur ${response.status}`);
      const data = await response.json() as WeatherData;

      const weatherMsg: Message = {
        id: loadingId,
        role: 'assistant',
        content: `Météo pour ${data.city}`,
        timestamp: Date.now(),
        type: 'weather',
        weatherData: data,
      };

      setMessages((prev) => {
        const updated = prev.map((m) => (m.id === loadingId ? weatherMsg : m));
        persistMessages(updated);
        return updated;
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(msg);
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== loadingId);
        persistMessages(filtered);
        return filtered;
      });
    } finally {
      setIsStreaming(false);
    }
  }, [isStreaming]);

  // ── Export conversation ──────────────────────────────────────────────────────
  const exportConversation = useCallback(async () => {
    if (messages.length === 0) return;

    const lines = messages.map((m) => {
      const time = new Date(m.timestamp).toLocaleString();
      const role = m.role === 'user' ? 'Vous' : 'JARVIS';
      const content = m.type === 'weather' ? `[Météo] ${m.weatherData?.city} — ${m.weatherData?.tempC}°C, ${m.weatherData?.condition}` :
                      m.content;
      return `[${time}] ${role}: ${content}`;
    });

    const text = `JARVIS BY Maxime-E — Conversation\n${'─'.repeat(40)}\n\n${lines.join('\n\n')}`;

    await Share.share({ message: text, title: 'Conversation JARVIS' });
  }, [messages]);

  // ── Send email via Gmail ─────────────────────────────────────────────────────
  const sendEmail = useCallback(async ({ to, subject, body }: { to: string; subject: string; body: string }) => {
    const toTrimmed = to.trim();
    const bodyTrimmed = body.trim();
    if (!toTrimmed || !bodyTrimmed || isStreaming) return;

    const userMsg: Message = {
      id: generateId(),
      role: 'user',
      content: `📧 Email à ${toTrimmed}${subject ? ` — ${subject}` : ''}`,
      timestamp: Date.now(),
      type: 'text',
    };
    const loadingId = generateId();
    const loadingMsg: Message = {
      id: loadingId,
      role: 'assistant',
      content: '📤 Envoi en cours...',
      timestamp: Date.now(),
      type: 'text',
    };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setIsStreaming(true);
    setError(null);

    try {
      const BACKEND = `https://${_domain || PROD_DOMAIN}`;
      const response = await globalThis.fetch(`${BACKEND}/api/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: toTrimmed, subject: subject.trim() || '(sans objet)', body: bodyTrimmed }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: `Erreur ${response.status}` })) as { error: string };
        throw new Error(err.error);
      }

      const resultMsg: Message = {
        id: loadingId,
        role: 'assistant',
        content: `✅ Email envoyé à ${toTrimmed} avec succès, sir.`,
        timestamp: Date.now(),
        type: 'text',
      };

      setMessages((prev) => {
        const updated = prev.map((m) => (m.id === loadingId ? resultMsg : m));
        persistMessages(updated);
        return updated;
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(msg);
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== loadingId);
        persistMessages(filtered);
        return filtered;
      });
    } finally {
      setIsStreaming(false);
    }
  }, [isStreaming]);

  // ── Provider value ───────────────────────────────────────────────────────────
  return (
    <JarvisContext.Provider
      value={{
        messages,
        isStreaming,
        model,
        voiceEnabled,
        isSpeaking,
        systemPrompt,
        sendMessage,
        sendEmail,
        searchWeb,
        fetchWeather,
        exportConversation,
        clearConversation,
        setModel,
        setVoiceEnabled,
        setSystemPrompt,
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
