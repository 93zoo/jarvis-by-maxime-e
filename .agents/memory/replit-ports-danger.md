---
name: Replit ports config danger
description: Manually adding [[ports]] to .replit breaks Expo Go and the proxy routing.
---

Never manually add `[[ports]]` sections to `.replit` in this project.

**Why:** Replit manages port routing automatically via the artifacts system. Adding `[[ports]]` overrides that. Specifically, mapping `localPort = 8081 → externalPort = 80` reassigned Replit's primary external port (80) to the mockup-sandbox server instead of the Expo/Metro server. This caused Expo Go on Android to get stuck at "100% loading" with no React logs — the bundle was delivered but the JS runtime couldn't bootstrap because the proxy was routing to the wrong backend.

**How to apply:** If port forwarding is needed, use the artifacts skill or workflow tools — never edit `[[ports]]` in `.replit` directly. If you see "Android Bundled … (N modules)" followed by absolute silence in Metro logs, check `.replit` for stray `[[ports]]` entries first.
