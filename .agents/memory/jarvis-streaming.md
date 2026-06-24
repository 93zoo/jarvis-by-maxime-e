---
name: JARVIS AI streaming fix
description: SSE streaming and message-building pitfalls in the JARVIS AI Expo app (JarvisContext.tsx)
---

## Rules

1. **Buffered SSE parser**: `decoder.decode(value)` + `chunk.split('\n')` drops tokens when JSON spans TCP chunks. Always keep a `leftover` string between reads and split/parse only complete `data:` lines.

2. **Build apiMessages before state update**: snapshot `currentMessages` via a zero-mutation `setMessages(prev => { resolve(prev); return prev; })` BEFORE adding the optimistic user+assistant bubbles. Appending the new user message explicitly afterwards means it appears exactly once. Never capture state after the optimistic update — it will include the new user bubble and result in a duplicate prompt sent to OpenAI.

**Why:** Both issues were caught by code review on first build. The streaming parser bug causes silent token loss on slow/fragmented connections; the duplicate message bug wastes tokens and degrades response quality.

**How to apply:** Any time streaming OpenAI SSE in React Native (expo/fetch), use `parseSSEChunk(raw, leftover)` pattern from `artifacts/mobile/context/JarvisContext.tsx`.
