# Deferred Items — Phase 30 (Provider Health Hardening)

## 30-03 execution

- **gemini-analysis.ts line 12**: Direct Anthropic SDK import. Pre-existing
  pattern. Out of scope for Plan 30-03 (provider-health-hardening, not SDK
  migration). Could be addressed in a future phase that migrates the URL
  discovery / community summarization paths to @ai-sdk/anthropic via AI Gateway.
- **gemini-analysis.ts line 50**: Provider API keys bypass the gateway —
  flagged by validator. Pre-existing pattern. Anthropic client is server-only
  and uses ANTHROPIC_API_KEY at import time. Out of scope.
- **gemini-analysis.ts hyphenated model slugs (lines 34, 45, 698)**: Pre-
  existing slugs. The validator suggests dots-not-hyphens; the Phase 30 D-14
  Amendment 2026-05-14 explicitly pins `google/gemini-3-pro` /
  `google/gemini-3-flash` / `google/gemini-3.1-flash-lite`. The hyphens in
  `gemini-3-pro` are intentional — they match the AI Gateway's live slug
  format verified 2026-05-14 via grep. Keeping per D-14.
