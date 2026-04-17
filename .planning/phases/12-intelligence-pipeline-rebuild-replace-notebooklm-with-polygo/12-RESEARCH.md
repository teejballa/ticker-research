# Phase 12: Intelligence Pipeline Rebuild — Research

**Researched:** 2026-04-16
**Domain:** AI SDK structured output, Firecrawl scraping, SSE streaming continuity, container decommission
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Phase 12 is a targeted swap of the reasoning layer only — same data inputs (yahoo-finance2, Anthropic web search), different reasoning engine
- **D-02:** Phases 10 and 11 are not absorbed — they remain future phases to be executed against the new pipeline
- **D-03:** Call Gemini via AI SDK + Vercel AI Gateway — use `generateText()` with model string `'google/gemini-2.0-flash'` (as specified in CONTEXT.md; see Open Questions for research upgrade recommendation). OIDC auth via `vercel env pull`, no provider-specific API key needed.
- **D-04:** Reasoning logic lives inside `POST /api/analysis/[ticker]/route.ts` — no subprocess, no Python, no container for this step
- **D-05:** Keep existing SSE streaming protocol — emit `PROGRESS:` events from the TypeScript route the same way the Python script did. `<ResearchProgress />` UI requires zero changes
- **D-06:** Firecrawl scrapes niche community sentiment sources — Reddit threads, blog comment sections, small investor communities, StockTwits discussion pages
- **D-07:** URL discovery: Anthropic web search finds community discussion URLs; Firecrawl fetches full page content from those URLs
- **D-08:** Firecrawl scraped content is passed to Gemini as context as a distinct `=== COMMUNITY SENTIMENT ===` section in the Gemini prompt
- **D-09:** Expand from 3 to 5 bullish signals and 3 to 5 bearish signals
- **D-10:** Add `price_target` field to `AnalysisResult`
- **D-11:** Richer source attribution at Claude's discretion
- **D-12:** `StoredReport` wraps `AnalysisResult` — schema changes must be backward-compatible or include a migration path
- **D-13:** Decommission the Google Cloud Run container entirely
- **D-14:** Remove `CONTAINER_URL`, `CONTAINER_SECRET`, `CONTAINER_VNC_URL` env vars from Vercel
- **D-15:** Remove VNC auth API routes (`src/app/api/setup/nbm-auth/`, `src/app/api/setup/nbm-auth/status/`)
- **D-16:** Remove NotebookLM setup routes (`src/app/api/setup/install/`, `src/app/api/setup/auth/`)
- **D-17:** Remove `scripts/notebooklm_research.py`, `scripts/container_server.py`, `Dockerfile`, `scripts/setup.sh`, `scripts/notebooklm_auth.py`
- **D-18:** Remove all `DEPLOYMENT_MODE` branching — local and deployed behavior is now identical
- **D-19:** GCP project (`cipher-491101`) and Google OAuth credentials can remain — only Cloud Run service and Artifact Registry image are deleted

### Claude's Discretion

- Exact Gemini prompt structure — how market data, news, and community sentiment are formatted as context sections
- How many Firecrawl URLs to scrape per run (balance quality vs latency)
- Whether to call Firecrawl in parallel with the existing Anthropic news search or sequentially
- Exact `AnalysisSource` / `AnalysisSignal` type changes beyond what's specified above
- Error handling for Firecrawl failures (graceful degradation — analysis proceeds without community sentiment if Firecrawl fails)
- Whether `FIRECRAWL_API_KEY` is required or optional (suggest optional with graceful skip)

### Deferred Ideas (OUT OF SCOPE)

- Multi-source market data aggregation (Finnhub/Polygon market data enrichment) — Phase 10
- Institutionalized social sentiment pipeline with dedicated section in report — Phase 11
- Streaming Gemini tokens live to the frontend — future UX improvement requiring UI changes
</user_constraints>

---

## Summary

Phase 12 replaces the Python/NotebookLM/Cloud Run stack with a pure TypeScript pipeline: the `POST /api/analysis/[ticker]` route calls Gemini directly via the AI SDK and Vercel AI Gateway, receives structured `AnalysisResult` output via `generateText` + `Output.object()` (Zod schema), and emits the same SSE events the Python subprocess used to emit. The `<ResearchProgress />` UI component and all downstream report rendering require zero changes.

Firecrawl adds a community sentiment layer: Anthropic web search finds Reddit/StockTwits/forum URLs for the ticker, Firecrawl scrapes their full markdown content, and the scraped text is injected as a labeled `=== COMMUNITY SENTIMENT ===` section in the Gemini prompt. Firecrawl is optional — if `FIRECRAWL_API_KEY` is absent or scraping fails, the pipeline continues with the existing data sources.

The decommission work is surgical file/route/env-var deletion with no data migration needed (all runtime state lives in Neon, not the container). The only non-trivial decommission step is ensuring all container-related DEPLOYMENT_MODE branch logic is completely removed so no dead-code paths reference deleted infrastructure.

**Primary recommendation:** Install `ai@6.0.168` and `@mendable/firecrawl-js@4.18.3`. Auth via OIDC — `VERCEL_OIDC_TOKEN` is already in `.env.local` from `vercel env pull`; on Vercel deployments the token is injected automatically with no env var configuration. Rewrite `route.ts` to emit progress events then call `generateText({ model: 'google/gemini-3-flash', output: Output.object({ schema }), messages })`. Delete everything else.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` | 6.0.168 | AI SDK — `generateText`, `Output.object()`, gateway provider | Vercel-native; model string routing; OIDC auto-auth; no provider-specific key |
| `@mendable/firecrawl-js` | 4.18.3 | Scrape community discussion URLs to markdown | Official Firecrawl SDK; handles retries/proxies internally |
| `zod` | ^3.24.2 (already installed) | Schema definition for `Output.object()` | Already in project; required by AI SDK structured output |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@ai-sdk/vercel` | — | Alternative Vercel provider package | Only needed if you want explicit `vercel()` calls; plain model strings work without it |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| OIDC via `VERCEL_OIDC_TOKEN` | Manual token management | OIDC is zero-config on Vercel — token is auto-injected on deployments and written to `.env.local` by `vercel env pull` for local dev |
| `google/gemini-3-flash` via gateway | `@ai-sdk/google` + direct `GOOGLE_API_KEY` | Direct provider key bypasses the gateway — loses unified billing, monitoring, and fallback routing |
| `generateText` + `Output.object()` | `generateObject()` | Both work; `generateText` with `Output.object()` is the current AI SDK v6 documented pattern and provides fallback text via `NoObjectGeneratedError.text` when schema validation fails |
| Firecrawl | Cheerio/Playwright scraping | Firecrawl handles JS-rendered pages, bot protection bypass, and markdown extraction — all hard problems to hand-roll |

**Installation:**
```bash
npm install ai @mendable/firecrawl-js
```

**Version verification:** [VERIFIED: npm registry]
- `ai` latest: 6.0.168 (dist-tag `latest`)
- `@mendable/firecrawl-js` latest: 4.18.3

**Model string:** [VERIFIED: Vercel AI Gateway `/v1/models` endpoint, 2026-04-16]
```
google/gemini-3-flash
```
This is the highest-versioned non-preview Gemini Flash model on the gateway. CONTEXT.md D-03 specifies `google/gemini-2.0-flash` (written when 2.x was current). Research recommends upgrading to `google/gemini-3-flash` — see Open Questions #1. Available models confirmed: `google/gemini-3-flash`, `google/gemini-2.5-flash`, `google/gemini-2.0-flash`.

---

## Architecture Patterns

### AI SDK + Vercel AI Gateway Auth

**Primary auth: OIDC (zero-config)** [VERIFIED: vercel.com/docs/ai-gateway/authentication]

- **Vercel deployment:** OIDC token is auto-injected by the Vercel runtime. No env var configuration required in the Vercel dashboard.
- **Local dev:** `vercel env pull` writes `VERCEL_OIDC_TOKEN` to `.env.local`. This token is already present in this project's `.env.local` (verified by codebase read).
- **Note:** OIDC is the only recommended auth path. The Vercel docs describe a static API key option but OIDC is preferred — it requires zero configuration and the token is already present in this project.

When passing a plain model string to `generateText` (e.g., `'google/gemini-3-flash'`), the AI SDK automatically routes through the Vercel AI Gateway using the OIDC token — no provider import, no additional configuration.

```typescript
// Source: vercel.com/docs/ai-gateway/getting-started/text
import { generateText, Output } from 'ai';
// No provider import needed — plain string model uses the gateway automatically
// Auth: VERCEL_OIDC_TOKEN from .env.local (local) or auto-injected (Vercel deployment)
```

### Pattern 1: `generateText` with Structured Output (AI SDK v6)

**What:** Call `generateText` with `Output.object({ schema })` to get a typed `AnalysisResult` directly from Gemini, eliminating the regex-parsing layer entirely.

**When to use:** Any time you need a fully typed JSON object from the model in a single call.

```typescript
// Source: ai-sdk.dev/docs/ai-sdk-core/generating-structured-data
import { generateText, Output, NoObjectGeneratedError } from 'ai';
import { z } from 'zod';

const AnalysisResultSchema = z.object({
  market_sentiment: z.enum(['bullish', 'neutral', 'bearish']),
  sentiment_reasoning: z.string(),
  bullish_signals: z.array(z.object({
    signal: z.string(),
    source_citation: z.string(),
  })).min(1).max(5),
  bearish_signals: z.array(z.object({
    signal: z.string(),
    source_citation: z.string(),
  })).min(1).max(5),
  // ... remaining fields
});

try {
  const { output } = await generateText({
    model: 'google/gemini-3-flash',
    output: Output.object({ schema: AnalysisResultSchema }),
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: buildUserPrompt(pkg, communityContent) },
    ],
  });
  // output is typed as z.infer<typeof AnalysisResultSchema>
} catch (err) {
  if (NoObjectGeneratedError.isInstance(err)) {
    // err.text — raw generated text; err.cause — parse/validation error
  }
}
```

### Pattern 2: SSE Progress Emission (Carry Forward)

**What:** The existing `ReadableStream` + `TransformStream` pattern in `route.ts`. Replace the Python subprocess with inline `enqueue()` calls.

```typescript
// Existing pattern in src/app/api/analysis/[ticker]/route.ts — carries forward unchanged
const encode = (data: string) =>
  new TextEncoder().encode(`data: ${data}\n\n`);

// Before Gemini call — emit progress events matching existing step labels
enqueue(JSON.stringify({ type: 'progress', message: 'Preparing research context...' }));
enqueue(JSON.stringify({ type: 'progress', message: 'Querying sentiment analysis...' }));

// After Gemini returns — emit result
enqueue(JSON.stringify({ type: 'result', data: analysisResult }));
```

**Key constraint:** `<ResearchProgress />` matches progress messages with `toLowerCase().includes()` checks. The new TypeScript progress messages must match these substrings to advance the visual stepper:

| Progress message substring | Visual step triggered |
|----------------------------|-----------------------|
| `'creating'` | Step 0 (Collecting market data) |
| `'adding market'` | Step 1 (Gathering news & filings) |
| `'adding news'` | Step 2 (same) |
| `'querying sentiment'` or `'querying bullish'` | Step 3 (Synthesizing intelligence) |
| `'querying confidence'` or `'querying sources'` | Step 4 (Generating report) |
| `'cleaning'` | Step 5 |

New progress messages should use these same substrings or the stepper will not advance.

### Pattern 3: Firecrawl URL Scraping

**What:** Scrape a list of community discussion URLs to markdown content.

```typescript
// Source: docs.firecrawl.dev/sdks/node
import Firecrawl from '@mendable/firecrawl-js';

const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY ?? '' });

async function scrapeCommunitySentiment(urls: string[]): Promise<string> {
  const results = await Promise.allSettled(
    urls.map(url =>
      firecrawl.scrape(url, {
        formats: ['markdown'],
        onlyMainContent: true,
        timeout: 30000,
      })
    )
  );
  const pages = results
    .filter((r): r is PromiseFulfilledResult<{ markdown?: string }> => r.status === 'fulfilled')
    .map(r => r.value.markdown ?? '')
    .filter(Boolean);
  return pages.join('\n\n---\n\n');
}
```

**Graceful skip pattern:**
```typescript
let communityContent = '';
if (process.env.FIRECRAWL_API_KEY) {
  try {
    communityContent = await scrapeCommunitySentiment(communityUrls);
  } catch {
    // Non-fatal — proceed without community sentiment
  }
}
```

### Pattern 4: Gemini Prompt Structure

**What:** The research brief sections become prompt context sections, replacing NotebookLM's "add text source" workflow.

```typescript
function buildUserPrompt(pkg: SourcePackage, communityContent: string): string {
  const brief = formatResearchBrief(pkg); // existing function — reuse unchanged
  const newsText = extractNewsUrls(pkg).map(url => `- ${url}`).join('\n');

  let prompt = `${brief}\n\n`;
  prompt += `=== NEWS SOURCES ===\n${newsText}\n\n`;
  if (communityContent) {
    prompt += `=== COMMUNITY SENTIMENT ===\n${communityContent}\n\n`;
  }
  prompt += `Analyze ${pkg.ticker} based on the above research data and return structured analysis.`;
  return prompt;
}
```

### Pattern 5: DEPLOYMENT_MODE Removal

**What:** Remove container-related `if (process.env.DEPLOYMENT_MODE === 'web')` branches from the analysis and setup routes. The new pipeline runs identically everywhere.

Files containing `DEPLOYMENT_MODE` that need cleanup:

| File | What to do |
|------|-----------|
| `src/app/api/analysis/[ticker]/route.ts` | Remove entire `web` branch (lines 32–130); remove local branch Python spawn; replace with Gemini call |
| `src/app/api/setup/status/route.ts` | Remove `web` branch check; simplify to always return `{ allOk: true }` (no local Python checks needed) |
| `src/app/api/history/route.ts` | Keep `web` branch (Neon vs local) — this DEPLOYMENT_MODE usage is unrelated to container |
| `src/app/api/history/[filename]/route.ts` | Keep `web` branch (Neon vs local) — same |
| `src/middleware.ts` | Keep `NEXT_PUBLIC_DEPLOYMENT_MODE` check — auth gating is still needed in web mode |
| `src/app/page.tsx` | Keep `NEXT_PUBLIC_DEPLOYMENT_MODE` check — UI branching is still needed |
| `src/app/terminal/page.tsx` | Keep `NEXT_PUBLIC_DEPLOYMENT_MODE` check — same |

**Critical:** `DEPLOYMENT_MODE` must remain set to `'web'` in Vercel production for history routes and auth middleware. Only the analysis route and setup status route lose their DEPLOYMENT_MODE branches.

### Recommended Project Structure (changes only)

```
src/
├── app/api/analysis/[ticker]/
│   └── route.ts          # Rewritten: Gemini call + SSE, no subprocess
├── app/api/setup/
│   ├── status/route.ts   # Simplified: no Python checks
│   └── [nbm-auth/]       # DELETE entire directory
│   └── [auth/route.ts]   # DELETE
│   └── [install/]        # DELETE entire directory
├── lib/
│   ├── types.ts           # Add price_target, expand signals 3 to 5
│   ├── research-brief.ts  # Unchanged — reused for Gemini prompt
│   └── gemini-analysis.ts # NEW: Gemini call logic extracted from route
scripts/
│   ├── [notebooklm_research.py]  # DELETE
│   ├── [container_server.py]     # DELETE
│   ├── [notebooklm_auth.py]      # DELETE
│   ├── [setup.sh]                # DELETE (or simplify to Node-only checks)
│   └── requirements.txt          # DELETE or empty
Dockerfile                        # DELETE
Dockerfile.daytona               # DELETE
```

### Anti-Patterns to Avoid

- **Leaving dead DEPLOYMENT_MODE branches in analysis route:** The `if (process.env.DEPLOYMENT_MODE === 'web')` container-proxy branch must be deleted entirely — it references `CONTAINER_URL` which will no longer exist, causing 500 errors.
- **Using `generateObject()` when schema validation fails:** `generateText` + `Output.object()` provides fallback text via `NoObjectGeneratedError.text`; `generateObject()` throws without the raw output. Prefer `generateText` + `Output.object()` for resilience.
- **Using a direct provider package (`@ai-sdk/google`) instead of the gateway:** Direct provider packages bypass the gateway's unified billing, monitoring, and fallback routing. Use plain model strings with OIDC.
- **Calling Firecrawl on news URLs:** Firecrawl is for community sentiment pages only. Standard financial news (already in `NewsSection`) does not need Firecrawl.
- **Blocking SSE stream on Firecrawl:** Run Firecrawl scraping in parallel with the existing Anthropic research phase or before the Gemini call — never after. Blocking the stream on Firecrawl would delay user feedback.
- **Over-specifying Gemini prompt:** Gemini Flash handles long context well. Prefer one large user message over many messages — the entire research brief + news + community content can be a single user turn.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Structured JSON output from LLM | Custom JSON parser with regex | `Output.object({ schema: zodSchema })` | Handles partial JSON, retries, validation errors, type safety |
| Web scraping community pages | Playwright / Cheerio / fetch + parse | `@mendable/firecrawl-js` | Handles JS rendering, bot detection, cookie popups, markdown extraction |
| Retry logic for LLM failures | Custom retry loop | AI SDK built-in (handles rate limits and transient errors) | SDK retries automatically; `NoObjectGeneratedError` provides raw fallback |
| Gemini authentication | Custom OIDC token exchange | `VERCEL_OIDC_TOKEN` auto-detected by AI SDK | Already present in `.env.local`; zero-config on Vercel deployments |

**Key insight:** The structured output layer from `Output.object()` eliminates the entire `parse_answers()` function from `notebooklm_research.py` (~200 lines of regex-based text parsing). The Zod schema IS the contract — validation happens at the SDK layer, not in application code.

---

## Runtime State Inventory

This is a decommission phase that replaces infrastructure. Checking for runtime state that requires migration beyond file deletion.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Neon DB: `user_credentials` table stores encrypted NotebookLM `storage_state.json` per user. After decommission, these rows become orphaned (no code reads them for analysis). | The table can remain (no harm); optionally drop after Phase 12 ships to clean up |
| Live service config | Google Cloud Run service `ticker-research-container` in `us-central1`, GCP project `cipher-491101`. Artifact Registry image. | Manual deletion: `gcloud run services delete ticker-research-container --region us-central1` + delete Artifact Registry repo |
| OS-registered state | None — no Task Scheduler, launchd, or systemd units registered for this project | None |
| Secrets/env vars | Vercel: Remove `CONTAINER_URL`, `CONTAINER_SECRET`, `CONTAINER_VNC_URL`. Add `FIRECRAWL_API_KEY` (optional). Keep `DEPLOYMENT_MODE=web`, `NEXT_PUBLIC_DEPLOYMENT_MODE=web` for history/auth routes. AI Gateway auth uses `VERCEL_OIDC_TOKEN` (auto-injected on Vercel — no env var to add). | `vercel env rm CONTAINER_URL` etc. Optionally `vercel env add FIRECRAWL_API_KEY`. |
| Build artifacts | `Dockerfile`, `Dockerfile.daytona` — delete from repo. `scripts/requirements.txt` — delete or empty. Any Docker image cached locally. | File deletions; `docker rmi` locally if desired |

**`DEPLOYMENT_MODE` is NOT fully removable.** D-18 says to remove "all DEPLOYMENT_MODE branching" but the history routes (`api/history/route.ts`, `api/history/[filename]/route.ts`) and `src/middleware.ts` still require this distinction. What gets removed is the analysis route's container-proxy branch and the setup status route's Python-check skip. The env var stays.

**`NEXT_PUBLIC_DEPLOYMENT_MODE` stays.** Used in `page.tsx`, `terminal/page.tsx`, and `middleware.ts` for auth gating and UI mode.

---

## Common Pitfalls

### Pitfall 1: `<ResearchProgress />` Step Stepper Breaks

**What goes wrong:** The visual stepper in `ResearchProgress.tsx` does not advance — all steps remain pending.
**Why it happens:** `matchStepIndex()` uses `toLowerCase().includes()` against specific substrings. If the new TypeScript progress messages don't contain the expected substrings (e.g., `'creating'`, `'adding market'`, `'querying sentiment'`), the step index returns -1.
**How to avoid:** Use progress message strings that contain the exact expected substrings. The full list is in the Architecture Patterns section above.
**Warning signs:** Test with a real run and watch the stepper — if it sticks at step 0, check message substrings.

### Pitfall 2: `NoObjectGeneratedError` on Schema Validation Failures

**What goes wrong:** `generateText` with `Output.object()` throws `NoObjectGeneratedError` if Gemini returns JSON that fails Zod validation.
**Why it happens:** The model occasionally omits required fields or uses wrong types.
**How to avoid:** Use `.optional()` liberally on non-critical fields. Use `.min(1).max(5)` rather than `.length(5)` for signal arrays. Catch `NoObjectGeneratedError` and fall back to a default `AnalysisResult` with the raw text in `confidence_explanation`.
**Warning signs:** First run on a ticker with sparse data (thinly-traded stocks, recent IPOs).

### Pitfall 3: Firecrawl Blocks the SSE Stream

**What goes wrong:** User sees no progress for 30+ seconds at the start of a run.
**Why it happens:** Firecrawl scraping was called synchronously before any progress events were emitted.
**How to avoid:** Emit at least one `PROGRESS:` event before initiating Firecrawl. Start the Firecrawl `Promise.allSettled()` before awaiting it — let it run in parallel while emitting progress. Cap the number of URLs (3-5 max per run).
**Warning signs:** Frontend shows spinner with no step advancement.

### Pitfall 4: Dead DEPLOYMENT_MODE Container Branch Causes 500s

**What goes wrong:** Deployed app returns 500 on analysis requests even though Gemini call works locally.
**Why it happens:** `DEPLOYMENT_MODE=web` is still set in Vercel (required for history routes), so the analysis route enters the old `web` branch and tries to read `CONTAINER_URL` which was removed.
**How to avoid:** The analysis route must have its `web` branch removed entirely — the entire `if (process.env.DEPLOYMENT_MODE === 'web') { ... }` block (lines 32–130 in the current file). Verify with `grep -n CONTAINER_URL src/app/api/analysis/` — should return nothing after the rewrite.
**Warning signs:** 500 errors in production; works locally.

### Pitfall 5: `price_target` Breaks Existing StoredReport Reads

**What goes wrong:** Old reports stored before Phase 12 fail to render or throw type errors.
**Why it happens:** `AnalysisResult.price_target` added as a required field.
**How to avoid:** Add `price_target` as optional: `price_target?: string | null`. The report renderer should handle `undefined` gracefully.
**Warning signs:** Report history page breaks after deploy; individual old reports return 422.

### Pitfall 6: `ai` Package Not Installed

**What goes wrong:** TypeScript compiler errors on `import { generateText, Output } from 'ai'`.
**Why it happens:** `ai` is not in `package.json` — this project does not currently have the AI SDK installed.
**How to avoid:** Wave 0 must install `ai@6.0.168` and `@mendable/firecrawl-js@4.18.3` before any other work. Verify with `npm ls ai`.
**Warning signs:** `Cannot find module 'ai'` at compile time.

### Pitfall 7: `setup.sh` `prestart` Hook References Deleted Python Checks

**What goes wrong:** `npm start` fails locally because `scripts/setup.sh` checks for Python 3.10+ and `notebooklm-py`.
**Why it happens:** `package.json` has `"prestart": "bash scripts/setup.sh"` and `setup.sh` validates Python/NbLM prerequisites.
**How to avoid:** Delete `setup.sh` and remove the `prestart` hook entirely — the app has no local Python prerequisites after Phase 12. The data collection layer (yahoo-finance2 and Anthropic web search) requires only Node.js — no setup wizard is needed.
**Warning signs:** `npm start` exits with setup error before the build runs.

---

## Code Examples

### Full Analysis Route Skeleton (After Rewrite)

```typescript
// Source: research synthesis of verified patterns
// src/app/api/analysis/[ticker]/route.ts
import { generateText, Output, NoObjectGeneratedError } from 'ai';
import { z } from 'zod';
import { NextRequest } from 'next/server';
import { readFile } from 'fs/promises';
import { writeReport } from '@/lib/reports';
import { formatResearchBrief, extractNewsUrls } from '@/lib/research-brief';
import type { AnalysisResult, SourcePackage } from '@/lib/types';
import Firecrawl from '@mendable/firecrawl-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const AnalysisResultSchema = z.object({
  market_sentiment: z.enum(['bullish', 'neutral', 'bearish']),
  sentiment_reasoning: z.string(),
  bullish_signals: z.array(z.object({
    signal: z.string(),
    source_citation: z.string(),
  })).min(1).max(5),
  bearish_signals: z.array(z.object({
    signal: z.string(),
    source_citation: z.string(),
  })).min(1).max(5),
  assessment: z.object({
    buy_pct: z.number(),
    hold_pct: z.number(),
    sell_pct: z.number(),
    buy_rationale: z.string(),
    hold_rationale: z.string(),
    sell_rationale: z.string(),
  }),
  confidence_level: z.enum(['Low', 'Medium', 'High']),
  confidence_explanation: z.string(),
  price_target: z.string().optional().nullable(),
  sources_used: z.array(z.object({
    name: z.string(),
    key_fact: z.string(),
  })),
  source_warnings: z.array(z.string()).optional().default([]),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const { filePath } = await request.json() as { filePath: string };

  const encode = (data: string) =>
    new TextEncoder().encode(`data: ${data}\n\n`);

  let closed = false;
  let controller!: ReadableStreamDefaultController;

  const stream = new ReadableStream({
    start(ctrl) { controller = ctrl; },
  });

  const enqueue = (data: string) => {
    if (!closed) {
      try { controller.enqueue(encode(data)); } catch { /* closed */ }
    }
  };
  const close = () => {
    if (!closed) {
      closed = true;
      try { controller.close(); } catch { /* already closed */ }
    }
  };

  // Run pipeline asynchronously, stream events
  (async () => {
    try {
      const pkg: SourcePackage = JSON.parse(await readFile(filePath, 'utf-8'));

      enqueue(JSON.stringify({ type: 'progress', message: 'Preparing research context...' }));
      const brief = formatResearchBrief(pkg);

      // Community sentiment via Firecrawl (optional — graceful skip)
      enqueue(JSON.stringify({ type: 'progress', message: 'Gathering community sentiment...' }));
      let communityContent = '';
      if (process.env.FIRECRAWL_API_KEY) {
        // (community URL discovery and scraping happens here)
      }

      enqueue(JSON.stringify({ type: 'progress', message: 'Querying sentiment analysis...' }));

      // Auth: VERCEL_OIDC_TOKEN auto-detected from env (local) or injected by Vercel runtime (deployed)
      // No provider import needed — plain model string routes through AI Gateway automatically
      const { output } = await generateText({
        model: 'google/gemini-3-flash',
        output: Output.object({ schema: AnalysisResultSchema }),
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(brief, communityContent) },
        ],
      });

      const result: AnalysisResult = {
        ticker,
        company_name: pkg.company_name,
        analyzed_at: new Date().toISOString(),
        security_type: pkg.security_type,
        market_snapshot: extractMarketSnapshot(pkg),
        source_warnings: output.source_warnings ?? [],
        ...output,
      };

      // Persist report (non-fatal) — DEPLOYMENT_MODE still valid for history persistence
      if (process.env.DEPLOYMENT_MODE === 'web') {
        // Neon persist path (keep for web mode history — unchanged from current web branch)
      } else {
        try { await writeReport(result); } catch { /* non-fatal */ }
      }

      enqueue(JSON.stringify({ type: 'result', data: result }));
    } catch (err) {
      const msg = NoObjectGeneratedError.isInstance(err)
        ? 'Gemini returned unstructured response — try again'
        : err instanceof Error ? err.message : 'Analysis failed';
      enqueue(JSON.stringify({ type: 'error', message: msg }));
    } finally {
      close();
    }
  })();

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

### `AnalysisResult` Type Changes

```typescript
// src/lib/types.ts — additions only (all backward-compatible)
export interface AnalysisResult {
  // ... existing fields unchanged ...
  bullish_signals: AnalysisSignal[];   // comment: was exactly 3, now 1-5 per D-09
  bearish_signals: AnalysisSignal[];   // comment: was exactly 3, now 1-5 per D-09
  price_target?: string | null;        // NEW per D-10 — optional for backward compat
}
```

### Firecrawl Scrape Call

```typescript
// Source: docs.firecrawl.dev/sdks/node + npm registry verification
import Firecrawl from '@mendable/firecrawl-js';

const fc = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY! });

const result = await fc.scrape('https://reddit.com/r/stocks/...', {
  formats: ['markdown'],
  onlyMainContent: true,  // excludes nav/footer/ads
  timeout: 30000,
});

const content: string = result.markdown ?? '';
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| NotebookLM browser automation + Python subprocess | Direct LLM call via AI SDK | Phase 12 | Eliminates ~500ms Python startup, ~30s NotebookLM indexing wait, ~50 req/day rate limit |
| Regex-based text parsing of LLM answers | Zod schema via `Output.object()` | Phase 12 | Type-safe output; no parsing fragility |
| `DEPLOYMENT_MODE=web` routes to container proxy | Same Gemini call everywhere | Phase 12 | No cold-start wait, no container auth complexity |
| 3 bullish signals + 3 bearish signals (fixed) | 1-5 signals (target: 5) | Phase 12 | More complete analysis |

**Deprecated/outdated after Phase 12:**
- `notebooklm-py==0.3.4`: Removed entirely — was browser automation, not a real API
- `scripts/notebooklm_research.py`: Replaced by inline TypeScript
- `CONTAINER_URL` / `CONTAINER_SECRET` / `CONTAINER_VNC_URL`: Removed from Vercel
- VNC auth flow (`/setup/nbm-auth`): Deleted — no browser auth needed for Gemini
- `CREDENTIAL_ENCRYPTION_KEY`: May become unused if `user_credentials` Neon table is dropped

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `ai` npm package | Gemini structured output | Not installed | — | Must install (Wave 0) |
| `@mendable/firecrawl-js` npm package | Community sentiment scraping | Not installed | — | Must install (Wave 0) |
| `VERCEL_OIDC_TOKEN` | AI Gateway auth (primary, local dev) | Present in `.env.local` | — | Refresh with `vercel env pull` if expired (valid 12 hours) |
| `FIRECRAWL_API_KEY` | Firecrawl scraping | Not yet in Vercel env | — | Graceful skip — analysis works without it |
| Node.js 18+ | `fetch()` built-in | Present | Darwin | — |
| `gcloud` CLI | Cloud Run decommission | Available (project uses GCP) | — | GCP Console UI fallback |

**Missing dependencies with no fallback:**
- `ai` package — blocks compilation; install in Wave 0

**Missing dependencies with fallback:**
- `FIRECRAWL_API_KEY` — graceful skip when absent (community sentiment section omitted)

**AI Gateway production auth:** On Vercel deployments, `VERCEL_OIDC_TOKEN` is automatically injected by the Vercel runtime — no env var to add in the Vercel dashboard. The AI SDK reads it automatically. No additional gateway credential is required.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.0.9 |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npm test` (runs `vitest run`) |
| Full suite command | `npm test` |
| E2E run command | `npm run test:e2e` (Playwright, chromium) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RSRCH-01 | Analysis route calls Gemini (not spawn) | unit | `vitest run src/app/api/analysis` | Partially — existing tests check container proxy; must be rewritten |
| RSRCH-02–06 | `AnalysisResult` schema fields present in response | unit | `vitest run src/app/api/analysis` | Partially |
| RSRCH-07 | `source_citation` populated in signals | unit | `vitest run src/app/api/analysis` | Partially |
| D-09 | 5 bullish + 5 bearish signals (not 3) | unit | `vitest run tests/unit` | No — Wave 0 |
| D-10 | `price_target` field present (optional) | unit | `vitest run tests/unit` | No — Wave 0 |
| D-13/D-17 | No Python spawn, no container proxy code | unit | `vitest run src/app/api/analysis` | Must update existing tests |
| D-05 | SSE events emit `progress`/`result`/`error` format | unit | `vitest run src/app/api/analysis` | Partially |

### Sampling Rate

- **Per task commit:** `npm test` (vitest unit suite)
- **Per wave merge:** `npm test && npm run test:e2e`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/app/api/analysis/__tests__/route.test.ts` — rewrite: mock `ai` module, remove container proxy tests, add Gemini call assertions
- [ ] `tests/unit/analysis-schema.test.ts` — covers D-09 (5 signals), D-10 (price_target optional)
- [ ] Install `ai` and `@mendable/firecrawl-js` packages before any test runs
- [ ] Update `tests/unit/analysis-web-mode.test.ts` — remove `CONTAINER_URL` references

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (Gemini auth is OIDC, handled by platform) | — |
| V3 Session Management | No change from existing NextAuth | NextAuth (unchanged) |
| V4 Access Control | Yes — analysis route in web mode requires session | `getServerSession` (keep existing) |
| V5 Input Validation | Yes — ticker parameter, filePath parameter | `filePath` must be validated; Zod schema on Gemini output |
| V6 Cryptography | Reduced — `CREDENTIAL_ENCRYPTION_KEY` / `user_credentials` may become unused | AES-256-GCM (unchanged; keep until table dropped) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via `filePath` parameter | Tampering | Validate `filePath` is inside `os.tmpdir()` before `readFile` |
| AI Gateway OIDC token misuse | Information Disclosure | Token auto-managed by Vercel; never log or expose `VERCEL_OIDC_TOKEN` in responses |
| Firecrawl scraping of user-controlled URLs | Tampering / SSRF | Only scrape URLs returned by Anthropic web search; never scrape user-provided URLs directly |
| Gemini structured output injection | Tampering | `Output.object()` schema validation rejects unexpected fields; do not `eval()` or `Function()` on output |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `google/gemini-3-flash` supports structured output (`Output.object()`) via Vercel AI Gateway | Standard Stack | Must fall back to `google/gemini-2.5-flash` or `generateObject()` |
| A2 | `VERCEL_OIDC_TOKEN` in `.env.local` is sufficient for AI Gateway auth in local dev | Environment Availability | Local dev fails; run `vercel env pull` to refresh (token valid 12 hours) |
| A3 | Firecrawl `scrape()` method name is correct (not `scrapeUrl()`) in `@mendable/firecrawl-js@4.18.3` | Code Examples | TypeScript compile error; check `node_modules/@mendable/firecrawl-js/dist/index.d.ts` after install |
| A4 | `DEPLOYMENT_MODE=web` can remain set in Vercel production after Phase 12 (history/auth routes depend on it) | Runtime State Inventory | If removed, history routes break for web users |

**High-confidence claims (verified this session):**
- `ai` latest version: 6.0.168 [VERIFIED: npm registry]
- `@mendable/firecrawl-js` latest version: 4.18.3 [VERIFIED: npm registry]
- `google/gemini-3-flash` model ID on Vercel AI Gateway [VERIFIED: ai-gateway.vercel.sh/v1/models, 2026-04-16]
- Available Gemini flash models: `google/gemini-3-flash`, `google/gemini-2.5-flash`, `google/gemini-2.0-flash` [VERIFIED: gateway endpoint]
- AI Gateway primary auth is OIDC via `VERCEL_OIDC_TOKEN` (auto-injected on Vercel) [VERIFIED: vercel.com/docs/ai-gateway/authentication]
- `generateText` + `Output.object({ schema })` is the AI SDK v6 structured output pattern [VERIFIED: ai-sdk.dev/docs/ai-sdk-core/generating-structured-data]
- Firecrawl `scrape()` method (not `scrapeUrl()`) [VERIFIED: docs.firecrawl.dev/sdks/node]
- `VERCEL_OIDC_TOKEN` already exists in `.env.local` [VERIFIED: codebase read]
- `ai` package is NOT currently installed in this project [VERIFIED: codebase read]
- All DEPLOYMENT_MODE-using files inventoried [VERIFIED: grep across codebase]

---

## Open Questions (RESOLVED)

1. **Model string: D-03 specifies `gemini-2.0-flash` but `gemini-3-flash` is available**
   - What we know: Gateway has `google/gemini-3-flash` (newest), `google/gemini-2.5-flash`, `google/gemini-2.0-flash` (D-03 original)
   - What's unclear: CONTEXT.md D-03 was written when 2.x was the latest available
   - Recommendation: Use `google/gemini-3-flash` — higher version, better reasoning, same cost tier as flash. The planner should default to `google/gemini-3-flash` unless the user wants to pin to `gemini-2.0-flash` for cost predictability.
   - RESOLVED: Plans use `google/gemini-3-flash` throughout (12-02 Task 1 action and interface block).

2. **`user_credentials` Neon table fate after NotebookLM removal**
   - What we know: Table stores encrypted NotebookLM `storage_state.json` per user. No code will read it after Phase 12.
   - What's unclear: Whether to drop the table in Phase 12 or leave it
   - Recommendation: Leave the table in Phase 12 (zero cost, zero risk). Schedule cleanup in a separate maintenance phase.
   - RESOLVED: Table left in place. No migration or deletion in Phase 12 plans (12-03 decommission scope excludes DB).

3. **`setup.sh` `prestart` hook scope**
   - What we know: `package.json` runs `bash scripts/setup.sh` before `npm start`. `setup.sh` validates Python/NbLM.
   - What's unclear: Should `setup.sh` be deleted or simplified to Node-only checks?
   - Recommendation: Delete `setup.sh` and remove `prestart` hook — the app no longer has local Python prerequisites. The data collection layer (yahoo-finance2 and Anthropic web search via existing env vars) requires only Node.js — no setup wizard is needed.
   - RESOLVED: `setup.sh` deletion and `prestart` hook removal included in 12-03 decommission plan.

4. **Community sentiment URL count for Firecrawl**
   - What we know: Each Firecrawl scrape takes up to 30s with basic proxy
   - What's unclear: How many URLs per run before latency becomes user-noticeable
   - Recommendation: 3 URLs max, scraped in parallel with `Promise.allSettled`. Total community sentiment phase target: under 15 seconds.
   - RESOLVED: Cap of 3 URLs enforced in 12-02 route.ts via `.slice(0, 3)` on `pkg.social_sentiment.sources_checked`.

---

## Sources

### Primary (HIGH confidence)
- `vercel.com/docs/ai-gateway/authentication` — OIDC vs static key, auto-injection on Vercel [VERIFIED]
- `vercel.com/docs/ai-gateway/getting-started/text` — AI SDK model string format, no import needed [VERIFIED]
- `ai-sdk.dev/docs/ai-sdk-core/generating-structured-data` — `generateText` + `Output.object()` pattern [VERIFIED]
- `ai-gateway.vercel.sh/v1/models` — live model list, verified `google/gemini-3-flash` [VERIFIED]
- `docs.firecrawl.dev/sdks/node` — `scrape()` method, `formats`, `onlyMainContent` [VERIFIED]
- `docs.firecrawl.dev/api-reference/endpoint/scrape` — response shape, `timeout`, rate limit behavior [VERIFIED]
- npm registry (`npm view`) — `ai@6.0.168`, `@mendable/firecrawl-js@4.18.3` [VERIFIED]
- Codebase reads — all TypeScript source files, types.ts, route.ts, research-brief.ts, ResearchProgress.tsx [VERIFIED]

### Secondary (MEDIUM confidence)
- `ai-sdk.dev/docs/ai-sdk-core/generating-text` — `generateText` parameters
- `ai-sdk.dev/docs/ai-sdk-core/provider-management` — gateway as default provider

### Tertiary (LOW confidence / ASSUMED)
- A1–A4 in Assumptions Log above

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified from npm registry and gateway models endpoint
- Architecture: HIGH — SSE pattern verified from existing code; AI SDK patterns from official docs
- Pitfalls: HIGH — mostly derived from reading existing code and understanding removal surface area
- Decommission inventory: HIGH — verified from grep across codebase

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (AI SDK and Firecrawl move fast — re-verify versions before executing)
