// Phase: 30 — Provider Health Hardening
// Phase 30 D-14 (with Amendment 2026-05-14 slug values)
//
// RED-state scaffold for explicit per-call-site Gemini model pinning. No more
// fuzzy AI-Gateway routing — every generateText / generateObject call passes an
// explicit `model:` field hard-coded to the slug appropriate for its tier:
//
//   - src/lib/gemini-analysis.ts (main analysis):
//       model: 'google/gemini-3-pro'        (Pro tier — reasoning-heavy)
//   - URL discovery + lightweight community summarization + Flash-tier prompts:
//       model: 'google/gemini-3-flash'      (Flash tier — triage)
//   - src/lib/sentiment/per-doc-classifier.ts:
//       model: 'google/gemini-3.1-flash-lite' (already pinned — verify)
//
// The slug values come from the 2026-05-14 amendment to D-14; the underlying
// intent (explicit per-call-site pins, no implicit defaults) is unchanged.
// Plan 30-03 lands the source-code edits; until then every entry is a pending
// todo.

import { describe, it } from 'vitest';

describe('Phase 30 / D-14: explicit per-call-site Gemini model pins', () => {
  it.todo('D-14: runGeminiAnalysis call passes model: "google/gemini-3-pro" — no fallback to flash for analysis');
  it.todo('D-14: URL-discovery Gemini call passes model: "google/gemini-3-flash"');
  it.todo('D-14: lightweight-community-scan summarization passes model: "google/gemini-3-flash"');
  it.todo('D-14: per-doc-classifier passes model: "google/gemini-3.1-flash-lite"');
  it.todo('D-14: no generateText/generateObject call in src/lib/gemini-analysis.ts uses a dynamic model variable');
  it.todo('D-14: GEMINI_TOKEN_RATES constants comment cites the 3.x slug family, not 2.5 (Amendment 2026-05-14)');
});
