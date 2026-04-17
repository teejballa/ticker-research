# Phase 12: Intelligence Pipeline Rebuild — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 12-intelligence-pipeline-rebuild-replace-notebooklm-with-polygo
**Areas discussed:** Scope & phases 10/11, Gemini integration, Firecrawl role, Container & Cloud Run fate

---

## Scope & Phases 10/11

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 12 absorbs all of it | Skip phases 10 and 11, Phase 12 builds full pipeline including multi-source data + sentiment | |
| Do 10 & 11 first, then 12 | Execute phases 10 and 11 against NotebookLM, then Phase 12 replaces reasoning layer | |
| Phase 12 replaces NotebookLM only | Same data inputs, targeted swap of reasoning layer | ✓ |

**User's choice:** Phase 12 replaces NotebookLM only — phases 10 and 11 remain queued for later.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Same AnalysisResult schema | Preserve 6-question output format, no report renderer changes | |
| Evolve the schema | Improve structure, add fields, better source attribution | ✓ |

**Schema improvements selected:** More signals (5 each), price target field, plus Claude discretion.

---

## Gemini Integration

| Option | Description | Selected |
|--------|-------------|----------|
| AI SDK + Vercel AI Gateway | model string 'google/gemini-2.0-flash', OIDC auth, no API keys | ✓ |
| Direct @google/generative-ai SDK | Requires GOOGLE_API_KEY, explicit API calls | |
| Keep in Python | Replace notebooklm calls with google-generativeai in Python | |

**User's choice:** AI SDK + Vercel AI Gateway.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Inside POST /api/analysis route | generateText() directly in Next.js route, no subprocess | ✓ |
| New src/lib/intelligence.ts module | Separate testable module | |
| Separate Edge Function | Isolated route for reasoning step | |

**User's choice:** Inside the existing analysis route.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Keep SSE, emit PROGRESS events from TS | Same ResearchProgress UI, no frontend changes | ✓ |
| Stream Gemini tokens live | Real-time generation but requires UI changes | |
| Single response, no streaming | Simpler but no progress feedback | |

**User's choice:** Keep SSE protocol, emit same PROGRESS events from TypeScript.

---

## Firecrawl Role

| Option | Description | Selected |
|--------|-------------|----------|
| Scrape URLs from Anthropic search results | Anthropic finds URLs, Firecrawl fetches content | |
| Replace Anthropic search entirely | Firecrawl search finds AND fetches | |
| Scrape specific financial sites | Target known sources directly | |
| Niche community sentiment (user specified) | Reddit, blogs, comment sections, small investor communities | ✓ |

**User's choice (free text):** Firecrawl scrapes niche comment sections, discussions, Reddit blogs, and similar small-group niche sentiment sources. Anthropic search finds the URLs, Firecrawl fetches the full content.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Anthropic search finds URLs, Firecrawl scrapes them | Two-step: search → scrape | ✓ |
| Firecrawl search endpoint does both | One-step: find + scrape | |
| Hardcoded target URL patterns | Direct platform patterns | |

**User's choice:** Anthropic search finds URLs, Firecrawl scrapes full content.

---

## Container & Cloud Run Fate

| Option | Description | Selected |
|--------|-------------|----------|
| Decommission in Phase 12 | Remove container, VNC routes, CONTAINER_* env vars | ✓ |
| Leave it running, clean up later | Stop using but don't tear down | |
| Repurpose for Firecrawl | Change what the container runs | |

**User's choice:** Decommission in Phase 12. GCP project and Google OAuth credentials stay (may be useful for future GCP work). Only the Cloud Run service and container image are deleted.

**User's note:** Asked whether the container had any remaining purpose since Google OAuth is already set up there. Clarified that the container's Google OAuth was for NotebookLM authentication specifically, not for the app's user authentication (which lives in Next.js + Prisma). No remaining purpose once NotebookLM is gone.

---

## Claude's Discretion

- Exact Gemini prompt structure and context section formatting
- Number of Firecrawl URLs per run
- Parallel vs sequential Firecrawl execution relative to Anthropic news search
- Exact AnalysisSignal/AnalysisSource type improvements
- Error handling strategy for Firecrawl failures
- Whether FIRECRAWL_API_KEY is required or optional

## Deferred Ideas

- Multi-source market data (Finnhub/Polygon enrichment) → Phase 10
- Institutionalized social sentiment pipeline with dedicated report section → Phase 11
- Streaming Gemini tokens live to frontend → future UX improvement
