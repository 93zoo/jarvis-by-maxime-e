import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetch } from 'expo/fetch';

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
  sendMessage: (text: string) => Promise<void>;
  clearConversation: () => void;
  setApiKey: (key: string) => Promise<void>;
  setModel: (model: string) => Promise<void>;
  error: string | null;
  clearError: () => void;
}

const JarvisContext = createContext<JarvisContextType | null>(null);

const STORAGE_MESSAGES_KEY = '@jarvis_messages';
const STORAGE_API_KEY = '@jarvis_api_key';
const STORAGE_MODEL_KEY = '@jarvis_model';

const SYSTEM_PROMPT = `You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), an advanced AI assistant. You are highly intelligent, precise, and helpful. You speak in a calm, sophisticated manner — like the AI from Iron Man. You are concise but thorough. You refer to the user as "sir" or "ma'am" occasionally. Keep responses clear and actionable.`;

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

/**
 * Buffered SSE parser — handles JSON payloads split across TCP chunks.
 * Maintains a `leftover` buffer so partial lines are never dropped.
 */
function parseSSEChunk(
  raw: string,
  leftover: string
): { tokens: string[]; nextLeftover: string } {
  const tokens: string[] = [];
  const combined = leftover + raw;
  const lines = combined.split('\n');

  // The last element may be an incomplete line — keep it for the next chunk
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
    } catch {
      // Incomplete JSON shouldn't reach here because we held it in leftover,
      // but swallow truly malformed lines gracefully.
    }
  }

  return { tokens, nextLeftover };
}

export function JarvisProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [apiKey, setApiKeyState] = useState('');
  const [model, setModelState] = useState('gpt-4o-mini');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPersistedData();
  }, []);

  async function loadPersistedData() {
    try {
      const [savedMessages, savedKey, savedModel] = await Promise.all([
        AsyncStorage.getItem(STORAGE_MESSAGES_KEY),
        AsyncStorage.getItem(STORAGE_API_KEY),
        AsyncStorage.getItem(STORAGE_MODEL_KEY),
      ]);
      if (savedMessages) setMessages(JSON.parse(savedMessages));
      if (savedKey) setApiKeyState(savedKey);
      if (savedModel) setModelState(savedModel);
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

  const clearConversation = useCallback(() => {
    setMessages([]);
    AsyncStorage.removeItem(STORAGE_MESSAGES_KEY);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      if (!apiKey) {
        setError('API key required. Go to settings to add your OpenAI key.');
        return;
      }

      const trimmed = text.trim();

      // ── 1. Snapshot current history BEFORE any state update ──────────────
      // Build the OpenAI messages array from the *current* messages ref so the
      // user message is appended exactly once and there is no stale-closure risk.
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

      // ── 2. Optimistically add user + empty assistant bubble ───────────────
      const userMsg: Message = {
        id: generateId(),
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
      };
      const assistantMsgId = generateId();
      const assistantMsg: Message = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);
      setError(null);

      // ── 3. Stream from OpenAI with buffered SSE parser ───────────────────
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: apiMessages,
            stream: true,
            max_tokens: 2048,
          }),
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

        // Final persist
        setMessages((prev) => {
          const final = prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content: fullContent } : m
          );
          persistMessages(final);
          return final;
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error occurred';
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
    [apiKey, isStreaming, model]
  );

  return (
    <JarvisContext.Provider
      value={{
        messages,
        isStreaming,
        apiKey,
        model,
        sendMessage,
        clearConversation,
        setApiKey,
        setModel,
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
