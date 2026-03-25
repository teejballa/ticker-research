# Phase 7: Research Quality & Special Situation Coverage — Research

**Researched:** 2026-03-25
**Domain:** TypeScript data pipeline mutation — security type detection, prompt branching, Python script preamble injection, report badge rendering
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Security Type Detection**
- Use news-based detection: run a quick web search ("is [ticker] a SPAC?") to classify the security type
- Detection runs in parallel with the main data collection — no added latency to the pipeline; the classification search fires alongside Yahoo Finance + anthropic-search calls
- On ambiguous/failed detection: fall back to `'unknown'` internally and continue the pipeline with generic equity prompts
- Type hierarchy: quoteType from Yahoo Finance handles ETF/MUTUALFUND/CRYPTOCURRENCY directly; news-based search is specifically for SPAC detection within EQUITY-typed tickers
- `SecurityType` values: `equity | spac | etf | adr | preferred | crypto | unknown`

**Prompt Branching — SEC Filing Function**
- SPAC: Full prompt replacement — asks specifically for S-4 merger agreement, DEF 14A shareholder vote details, trust NAV, redemption deadline. No mention of 10-K/10-Q (irrelevant pre-merger)
- ETF: Replace 10-K/10-Q prompt with N-CEN/N-PORT filing search, fund structure, and expense documentation
- Equity (default): Existing prompt unchanged

**Prompt Branching — Analyst Sentiment Function**
- ETF: Skip entirely — return empty analyst section with `"Not applicable — ETF"` note. No API call made.
- SPAC: Keep analyst search but reframe toward merger arbitrage commentary, special situation coverage
- Equity (default): Existing prompt, but bump `max_uses` from 3 → 5 for broader coverage

**Prompt Branching — News Function**
- SPAC: Target merger agreement, PIPE investors, vote date, redemption deadline in prompt
- ETF: Target fund flows, AUM changes, index rebalancing, creation/redemption activity
- Equity (default): Existing prompt, bump `max_uses` from 3 → 5

**Prompt Branching — Social Sentiment Function**
- SPAC: Target merger speculation, retail arbitrage discussion, vote sentiment
- ETF: Keep as-is (ETFs get social discussion too)
- Equity (default): Existing prompt, `max_uses` stays at 3

**web_search max_uses Changes (Equity only)**
- `fetchNews`: 3 → 5
- `fetchAnalystSentiment`: 3 → 5
- `fetchSecFilingSummary`: stays at 3
- `fetchSocialSentiment`: stays at 3

**NotebookLM Question Adaptation**
- Add a single preamble prepended to all 6 questions per security type — same preamble text on every question (not varied per question)
- Example SPAC preamble: `"Note: this is a pre-merger SPAC. Evaluate in terms of merger probability, trust value, vote timeline, and redemption risk rather than operating financials or revenue metrics."`
- Example ETF preamble: `"Note: this is an ETF/fund, not an individual equity. Focus on expense ratio, AUM, tracking accuracy, and fund flow trends rather than company-level earnings or analyst ratings."`
- Equity type: no preamble (questions are already equity-focused)
- `scripts/notebooklm_research.py` reads `security_type` from the source package JSON and selects the appropriate preamble string before building questions

**Report Presentation**
- Security type shown as a small badge next to the ticker in the header (e.g., amber text badge "SPAC" or "ETF")
- Badge only shows for known types: equity, spac, etf, adr, preferred, crypto
- `unknown` type: no badge shown — report looks identical to pre-phase behavior; user sees no indication
- "EQUITY" badge omitted for standard equities (the default; no need to label it)

### Claude's Discretion
- Exact SPAC/ETF preamble wording
- Whether ADR/preferred/crypto get specialized prompts in this phase or just type detection
- Badge styling details (exact color, size, position within the terminal header)

### Deferred Ideas (OUT OF SCOPE)
- ADR-specific prompts (e.g., for foreign ADRs: currency risk, home country regulatory filings) — type detection will classify ADRs, but specialized prompts deferred
- Preferred stock specialized prompts — type detection covers it; prompts deferred
- Crypto-specific prompts (on-chain data, tokenomics) — deferred; crypto detection included in SecurityType enum but prompt branching not in scope this phase
- Post-merger SPAC handling (ticker that was a SPAC but completed merger and now files 10-Ks) — edge case; deferred
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RQ-01 | ETHM research output mentions merger target, expected vote/close date, and trust NAV | SPAC-specific news + SEC prompt branches in `anthropic-search.ts`; SPAC preamble in Python script ensures Gemini frames analysis around merger probability |
| RQ-02 | ETF ticker (e.g., QQQ) research output mentions holdings, expense ratio, and tracking index — not "SEC 10-K filings" | ETF branches in news and SEC fetch functions; analyst sentinel return; preamble redirects Gemini away from earnings-centric questions |
| RQ-03 | Standard equity (AAPL, NVDA) research is at least as good as today — no regression | Equity is the untouched default path; `max_uses` bump from 3 → 5 for news and analyst adds breadth without changing prompt semantics |
| RQ-04 | Security type is logged in SourcePackage and visible in research report | `security_type` field added to `SourcePackage` type; NavBar sub-bar badge renders conditionally on known types |
</phase_requirements>

---

## Summary

Phase 7 is a targeted mutation of three existing files — `src/lib/data/anthropic-search.ts`, `src/lib/data/source-package.ts`, and `scripts/notebooklm_research.py` — plus creation of one new file (`src/lib/data/security-type.ts`) and a small addition to two UI files (`src/lib/types.ts`, `src/components/NavBar.tsx`). The core problem is that the Anthropic web search prompts are generic equity-centric; SPACs and ETFs require entirely different queries to surface the information that actually matters.

Detection is two-tier: Yahoo Finance's `quoteType` field directly resolves ETF (`ETF`), mutual fund (`MUTUALFUND`), and cryptocurrency (`CRYPTOCURRENCY`) without any extra API call. SPAC detection requires a news-based web search because Yahoo Finance returns `quoteType: 'EQUITY'` for all blank-check companies regardless of their status. The detection call is a standard `client.messages.create` using the same `web_search_20250305` tool already used throughout `anthropic-search.ts` — no new SDK dependency needed.

The changes are purely additive: each of the four fetch functions gains a `securityType: SecurityType` parameter and a conditional branch on the prompt text and `max_uses` value. The default (equity) path is untouched in logic; it only gains a larger search budget. Python-side, the preamble approach is a single-point change before the questions array is built — no changes to parsing logic or AnalysisResult schema. The badge in NavBar is a five-line conditional render in the sub-bar's left cluster.

**Primary recommendation:** Implement in four sequential tasks: (1) `security-type.ts` new file + unit tests, (2) `anthropic-search.ts` prompt branching + `source-package.ts` orchestration + `types.ts` field, (3) `notebooklm_research.py` preamble injection, (4) NavBar badge + Playwright visual confirmation.

---

## Standard Stack

### Core (all already installed — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/sdk` | existing | `web_search_20250305` tool for SPAC detection search | Already used in `anthropic-search.ts`; same client singleton is reused |
| `yahoo-finance2` | existing | `quoteType` field for ETF/crypto/mutualfund detection | Already returns `quoteType` in the `quote()` call in `/api/research/[ticker]/route.ts` |
| TypeScript | existing | `SecurityType` union type | Project-wide strict TypeScript |

### No New Packages Required

All functionality is achievable with the existing installed dependencies. The `detectSecurityType` function uses the same `Anthropic` client singleton already exported-style in `anthropic-search.ts`. The function will be in its own file and import that singleton or instantiate its own (same pattern).

**Installation:**
```bash
# No new packages — all dependencies already present
```

---

## Architecture Patterns

### Recommended Project Structure Addition

```
src/lib/data/
├── security-type.ts    # NEW: detectSecurityType() — returns SecurityType
├── anthropic-search.ts # MODIFY: add securityType param to all 4 functions
├── source-package.ts   # MODIFY: add detectSecurityType call, pass type through
└── yahoo.ts            # UNCHANGED
```

### Pattern 1: quoteType Field Mapping

Yahoo Finance `quoteType` values map cleanly to SecurityType for most instrument classes. Only SPAC requires a secondary detection pass because Yahoo returns `'EQUITY'` for all blank-check companies.

```typescript
// src/lib/data/security-type.ts

// quoteType values verified from yahoo-finance2 v3 actual responses (project history)
// [Phase 01-data-pipeline]: yahoo-finance2 v3 typeDisp is lowercase 'equity' — quoteType is uppercase
function classifyByQuoteType(quoteType: string | undefined): SecurityType | null {
  if (!quoteType) return null;
  const qt = quoteType.toUpperCase();
  if (qt === 'ETF') return 'etf';
  if (qt === 'MUTUALFUND') return 'etf';       // treat mutual funds like ETFs for prompt purposes
  if (qt === 'CRYPTOCURRENCY') return 'crypto';
  // ADR and preferred are sub-types of EQUITY — cannot distinguish by quoteType alone
  return null; // fall through to name-based or news-based detection
}
```

**Confidence:** HIGH — yahoo-finance2 v3 quoteType behavior is documented in STATE.md project decisions.

### Pattern 2: News-Based SPAC Detection

When quoteType is `'EQUITY'` (or resolves to null above), run a single Anthropic web search to determine if the ticker is a SPAC. This runs in parallel with the main data collection using `Promise.allSettled` so it adds zero sequential latency.

```typescript
// src/lib/data/security-type.ts
export async function detectSecurityType(
  ticker: string,
  quoteType: string | undefined,
  longName: string | undefined,
): Promise<SecurityType> {
  // Tier 1: quoteType-based classification (no API call)
  const fromQuoteType = classifyByQuoteType(quoteType);
  if (fromQuoteType !== null) return fromQuoteType;

  // Tier 2: Name-based heuristics (no API call)
  if (longName) {
    const lower = longName.toLowerCase();
    if (lower.includes('acquisition') || lower.includes('blank check')) return 'spac';
    if (lower.includes('adr') || lower.includes('american depositary')) return 'adr';
    if (lower.includes('preferred')) return 'preferred';
  }

  // Tier 3: News-based SPAC detection (1 Anthropic web search call)
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1 }],
      messages: [{
        role: 'user',
        content: `Is ${ticker} a SPAC (Special Purpose Acquisition Company) or blank-check company? Answer with only "yes" or "no".`,
      }],
    });
    const text = extractTextContent(response).toLowerCase().trim();
    if (text.startsWith('yes')) return 'spac';
  } catch {
    // Detection failure is non-fatal — fall back to unknown
  }

  return 'equity'; // default for unclassified EQUITY-typed tickers
}
```

**Confidence:** HIGH — pattern reuses `extractTextContent` and `client` from `anthropic-search.ts` exactly as noted in CONTEXT.md's Reusable Assets section.

### Pattern 3: Parallel Detection in collectAllData()

The detection call slots into `source-package.ts` as a 7th parallel call. Because it finishes quickly (1 search with `max_uses: 1`) and the Yahoo quote data is already available from the route handler, the result is available before any fetch function needs to use it. The implementation requires a two-phase approach: resolve detection first (it needs `quoteType` and `longName` from the Yahoo quote), then run the 6 data-collection functions.

**Key architectural constraint:** The current `collectAllData()` receives `companyName` and `exchange` as parameters — the Yahoo `quote()` call happens in the API route, not inside `collectAllData`. The `quoteType` and `longName` are therefore available in the route handler at the point `collectAllData` is called. The cleanest approach is to pass `securityType` into `collectAllData` as a pre-resolved parameter, or run detection inside `collectAllData` using a dedicated parameter set.

Looking at `/api/research/[ticker]/route.ts` (line 43–47):
```typescript
const quote = await yf.quote(upperTicker);
companyName = quote.longName ?? quote.shortName ?? upperTicker;
exchange = quote.fullExchangeName ?? null;
// ADD: resolve security type here using quote.quoteType and quote.longName
```

Then pass `securityType` to `collectAllData`, which threads it through to each fetch function.

**Recommended signature change:**
```typescript
// source-package.ts
export async function collectAllData(
  ticker: string,
  companyName: string = ticker,
  exchange: string | null = null,
  securityType: SecurityType = 'equity',   // new param, defaults to equity
): Promise<SourcePackage>
```

**Confidence:** HIGH — derived directly from reading the existing code.

### Pattern 4: Prompt Branching in Fetch Functions

Each of the four functions in `anthropic-search.ts` gains a `securityType: SecurityType = 'equity'` parameter and a conditional branch. The branching is on prompt text and `max_uses` only — the response shape (return type) is unchanged for all functions except `fetchAnalystSentiment` for ETFs, which returns early with a sentinel value.

```typescript
// Pattern for fetchNews — illustrative, exact wording is Claude's discretion
export async function fetchNews(
  ticker: string,
  securityType: SecurityType = 'equity',
): Promise<NewsSection> {
  const max_uses = securityType === 'equity' ? 5 : 3;  // equity gets broader search
  let prompt: string;
  if (securityType === 'spac') {
    prompt = `Search for recent news about ${ticker} SPAC. Focus on: merger target and agreement, PIPE investors, shareholder vote date, redemption deadline, trust NAV per share, deal timeline. Return JSON array...`;
  } else if (securityType === 'etf') {
    prompt = `Search for recent news about ${ticker} ETF. Focus on: fund flows and AUM changes, index rebalancing events, expense ratio changes, creation/redemption activity, tracking error. Return JSON array...`;
  } else {
    prompt = /* existing equity prompt with same text */ `Search for recent news headlines about ${ticker} stock...`;
  }
  // rest of function unchanged
}
```

**ETF analyst sentinel pattern:**
```typescript
export async function fetchAnalystSentiment(
  ticker: string,
  securityType: SecurityType = 'equity',
): Promise<AnalystSentimentSection> {
  if (securityType === 'etf') {
    // ETFs don't have analyst stock ratings — skip the API call entirely
    return {
      collected_at: new Date().toISOString(),
      consensus: null,
      avg_price_target: null,
      analyst_count: null,
      recent_changes: [],
      error: 'Not applicable — ETF',
    };
  }
  // ... existing logic, with SPAC prompt variant and equity max_uses bump
}
```

**Confidence:** HIGH — return type `AnalystSentimentSection` already has an optional `error` field; returning `error: 'Not applicable — ETF'` is schema-compatible.

### Pattern 5: Python Preamble Injection

In `scripts/notebooklm_research.py`, the preamble is selected once based on `pkg.get('security_type', 'equity')` and prepended to each question string before the questions array is built. No changes to `parse_answers`, `_parse_signals`, or any downstream parsing.

```python
# After loading pkg, before building QUESTIONS list:
PREAMBLES = {
    'spac': (
        "Note: this is a pre-merger SPAC. Evaluate in terms of merger probability, "
        "trust value, vote timeline, and redemption risk rather than operating financials "
        "or revenue metrics. "
    ),
    'etf': (
        "Note: this is an ETF/fund, not an individual equity. Focus on expense ratio, AUM, "
        "tracking accuracy, and fund flow trends rather than company-level earnings or "
        "analyst ratings. "
    ),
}

security_type = pkg.get('security_type', 'equity')
preamble = PREAMBLES.get(security_type, '')  # empty string for equity, adr, preferred, crypto, unknown

QUESTIONS = [preamble + Q for Q in [Q1, Q2, Q3, Q4, Q5, Q6]]
```

**Confidence:** HIGH — direct string concatenation, no schema changes, falls back to empty preamble for any unrecognized type.

### Pattern 6: NavBar Security Type Badge

The badge belongs in the NavBar sub-bar (`showSubBar=true`) immediately after the ticker chip. The NavBar currently receives `ticker` and `companyName` props. A `securityType` prop must be added.

In `NavBar.tsx`:
```tsx
// Add to NavBarProps:
securityType?: string | null;

// In the sub-bar left cluster, after the existing ticker chip:
{securityType && securityType !== 'unknown' && securityType !== 'equity' && (
  <span className="text-[10px] font-bold tracking-widest uppercase text-amber-400 border border-amber-400/40 px-1.5 py-0.5 font-mono">
    {securityType.toUpperCase()}
  </span>
)}
```

The amber color (`text-amber-400`) is consistent with the existing amber accent usage documented in CONTEXT.md specifics. The flat-bordered chip style (`border`, no `rounded`) matches the terminal aesthetic (sharp edges, no `rounded-xl` — see STATE.md Phase 03 decision).

`ResearchReport.tsx` passes `securityType` from `analysisResult` (which requires `AnalysisResult` to carry the type, either directly or extracted from source package data).

**Alternative propagation path:** Since `AnalysisResult` is what the report page has access to, the cleanest approach is to carry `security_type` in both `SourcePackage` (for the Python script) and `AnalysisResult` (for the report renderer). The Python `parse_answers` function already reads top-level fields from `pkg` — add `security_type` to the returned dict.

**Confidence:** HIGH — derived from reading NavBar.tsx, ResearchReport.tsx, and the existing badge/chip pattern.

### Anti-Patterns to Avoid

- **Changing AnalystSentimentSection return type shape for ETFs:** The `error` field already exists on the type. Do not add a new `not_applicable: boolean` field — use the existing `error` string convention.
- **Running detection sequentially before data collection:** Detection must be parallel with the Yahoo quote lookup, not a blocking pre-step. Resolution is done in the route handler where `quote()` is already called.
- **Passing `SecurityType` as a string to Python:** Pass it as a literal string value in the JSON (which it already is, since TypeScript string literals serialize as JSON strings). No enum/int conversion needed.
- **Adding preamble to individual question constants (Q1–Q6):** Keep Q1–Q6 as pure question text. Preamble is applied at runtime via string concatenation. This preserves the ability to read/test questions in isolation.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SPAC keyword detection heuristics | Custom regex on ticker symbol | `longName` name-based check + web search | Ticker symbols are not reliably SPAC-indicative (e.g., "ETHM" is not obviously a SPAC from the symbol alone) |
| ETF detection without API | Hardcoded ETF symbol lists | Yahoo Finance `quoteType` field | Yahoo returns `'ETF'` for all ETF instruments; maintaining symbol lists is a maintenance burden |
| New Anthropic SDK client per function | Instantiate client in `security-type.ts` | Import or re-instantiate using same `new Anthropic()` pattern | SDK reads `ANTHROPIC_API_KEY` from env automatically; existing module-level pattern is correct |

---

## Common Pitfalls

### Pitfall 1: quoteType Casing Inconsistency

**What goes wrong:** `quoteType` from `yf.quote()` returns uppercase strings (`'ETF'`, `'EQUITY'`, `'CRYPTOCURRENCY'`) but project history documents that `typeDisp` is lowercase. Mixing these up causes detection to fall through to the web search path unnecessarily.

**Why it happens:** yahoo-finance2 v3 has different casing for different fields. `typeDisp` (display string) is lowercase `'equity'`; `quoteType` (API enum) is uppercase `'EQUITY'`.

**How to avoid:** Always `toUpperCase()` before comparing against quoteType constants. Document the casing at the function callsite.

**Warning signs:** All non-equity types (ETFs, crypto) falling through to `'equity'` classification despite correct ticker input.

### Pitfall 2: SecurityType Not Flowing Into AnalysisResult

**What goes wrong:** `security_type` is written to `SourcePackage` and available in `scripts/notebooklm_research.py`, but the report page (`/research/[ticker]/page.tsx`) only has access to `AnalysisResult` — not the source package. The badge in the NavBar cannot render.

**Why it happens:** The pipeline produces two separate JSON blobs: `SourcePackage` (temp file, consumed by Python) and `AnalysisResult` (returned via stdout, rendered in the UI). `security_type` lives on `SourcePackage` but the report renderer needs it.

**How to avoid:** Add `security_type: SecurityType` to `AnalysisResult` type in `src/lib/types.ts`. In Python `parse_answers()`, include `'security_type': pkg.get('security_type', 'equity')` in the returned dict. This is the same pattern used for `market_snapshot` (also extracted from `pkg` and added to the AnalysisResult dict).

**Warning signs:** Badge never renders in the UI even after implementing NavBar changes; `analysisResult.security_type` is `undefined`.

### Pitfall 3: ETF Analyst Sentinel Breaking the Research Brief

**What goes wrong:** The Python `format_research_brief()` function renders the `analyst_sentiment` section unconditionally. If the ETF sentinel value (`error: 'Not applicable — ETF'`) is present, the brief renders `Consensus: N/A` — which is correct — but should ideally note explicitly that no analyst ratings apply to ETFs so Gemini isn't confused by the absence of data.

**Why it happens:** The brief format is generic across all security types.

**How to avoid:** In `format_research_brief()`, check `pkg.get('security_type')` when rendering the analyst section. For ETFs, emit `Consensus: Not applicable (ETF — no stock analyst ratings)` instead of `N/A`. This is a minor Python-side improvement that helps Gemini interpret the absence correctly.

### Pitfall 4: Detection Web Search Consuming Rate Limit

**What goes wrong:** SPAC detection fires a web search call for every equity ticker, even ones that are obviously not SPACs (AAPL, NVDA). At 6 queries per research run already, adding a detection call for every ticker risks hitting the daily NotebookLM rate limit or Anthropic API costs.

**Why it happens:** If name-based heuristics are skipped or miss the SPAC indicator, every equity falls through to the web search path.

**How to avoid:** Use `max_uses: 1` (already specified in the pattern above) and rely on name-based heuristics as a primary filter. The web search fires only when `longName` does not contain obvious SPAC keywords AND quoteType is `'EQUITY'`. This should cover the vast majority of standard equities without a web search call.

### Pitfall 5: Parallel Detection Ordering — quoteType Available Before collectAllData

**What goes wrong:** `detectSecurityType` needs `quoteType` and `longName` from the Yahoo quote. The current `route.ts` calls `yf.quote()` and then `collectAllData()`. If `detectSecurityType` is incorrectly placed inside `collectAllData` but after the parallel data fetch starts, it may try to access data that isn't resolved yet.

**How to avoid:** Run `detectSecurityType` after `yf.quote()` completes (in the route handler), before `collectAllData()` starts. Pass the resolved `securityType` as a parameter to `collectAllData`. This is sequential in wall-clock time but the latency is negligible (name-based detection is synchronous; web-search detection adds ~1s but runs after quote() which already takes ~1s).

---

## Code Examples

Verified patterns from reading existing source files:

### SecurityType Union Type
```typescript
// src/lib/data/security-type.ts
// Add to src/lib/types.ts export:
export type SecurityType = 'equity' | 'spac' | 'etf' | 'adr' | 'preferred' | 'crypto' | 'unknown';
```

### SourcePackage Type Extension
```typescript
// src/lib/types.ts — add to SourcePackage interface
export interface SourcePackage {
  // ... existing fields ...
  security_type: SecurityType;   // new field — defaults to 'equity' if detection fails
  collection_errors: string[];
}
```

### AnalysisResult Type Extension
```typescript
// src/lib/types.ts — add to AnalysisResult interface
export interface AnalysisResult {
  // ... existing fields ...
  security_type?: SecurityType;  // optional for backward compat with persisted reports
}
```

### Python AnalysisResult Extension
```python
# In parse_answers() return dict:
return {
    'ticker': ticker,
    'company_name': company_name,
    'analyzed_at': datetime.now(timezone.utc).isoformat(),
    # ... existing fields ...
    'security_type': pkg.get('security_type', 'equity'),   # new field
    'market_snapshot': market_snapshot,
}
```

### source-package.ts collectAllData Signature
```typescript
// Existing pattern (source-package.ts line 42-46):
export async function collectAllData(
  ticker: string,
  companyName: string = ticker,
  exchange: string | null = null,
  securityType: SecurityType = 'equity',   // add this
): Promise<SourcePackage>

// And in the return object:
return {
  ticker,
  company_name: companyName,
  exchange,
  security_type: securityType,   // add this
  assembled_at: new Date().toISOString(),
  // ... rest unchanged
};
```

### Route Handler Integration Point
```typescript
// src/app/api/research/[ticker]/route.ts — after yf.quote() block (line 43-48):
let companyName = upperTicker;
let exchange: string | null = null;
let quoteType: string | undefined;
let longName: string | undefined;
try {
  const quote = await yf.quote(upperTicker);
  companyName = quote.longName ?? quote.shortName ?? upperTicker;
  exchange = quote.fullExchangeName ?? null;
  quoteType = (quote as Record<string, unknown>).quoteType as string | undefined;
  longName = quote.longName ?? undefined;
} catch { /* non-fatal */ }

// Detect security type (may fire one web search for SPAC detection)
const securityType = await detectSecurityType(upperTicker, quoteType, longName);

// Then pass to collectAllData:
const sourcePackage = await collectAllData(upperTicker, companyName, exchange, securityType);
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Generic equity prompts for all tickers | Security-type-branched prompts | SPAC/ETF research surfaces instrument-specific facts |
| `max_uses: 3` for all search functions | `max_uses: 5` for equity news + analyst | ~67% more search capacity for standard equity coverage |
| Flat questions sent to Gemini for all instruments | Preamble-prefixed questions by type | Gemini interprets absence of earnings data for SPACs/ETFs correctly |
| No instrument classification in SourcePackage | `security_type` field persisted in JSON | Pipeline is observable; type drives downstream behavior deterministically |

---

## Open Questions

1. **quoteType field availability from yahoo-finance2 v3**
   - What we know: STATE.md documents `typeDisp` is lowercase in v3; `quoteType` (uppercase) is the raw API enum used by the search route for type filtering
   - What's unclear: Whether `yf.quote()` returns `quoteType` at the TypeScript type level (it may require a type cast or module augmentation)
   - Recommendation: Use `(quote as Record<string, unknown>).quoteType` with a string cast as shown in the code example above. Check the TypeScript build error on first compile and add a proper type assertion if needed.

2. **SPAC detection false positive rate**
   - What we know: Name-based heuristics ("acquisition", "blank check") catch many SPACs; the web search fallback catches the rest
   - What's unclear: How many standard equities have "acquisition" in their company name (e.g., "Data Acquisition Corp" that is no longer a SPAC)
   - Recommendation: Accept a small false-positive rate. SPAC prompts are still useful for de-SPACed companies; at worst the analysis is slightly less relevant than generic equity prompts. Post-merger SPAC edge cases are explicitly deferred per CONTEXT.md.

3. **StoredReport backward compatibility with `security_type`**
   - What we know: Phase 5 persisted `StoredReport` files in `~/.cipher/reports/`; Phase 6 persisted to Neon DB. Neither includes `security_type`.
   - What's unclear: Whether old stored reports accessed from history will cause TypeScript errors when `security_type` is undefined
   - Recommendation: Add `security_type?: SecurityType` (optional) to `AnalysisResult` so existing persisted reports parse correctly. The badge simply does not render when the field is absent.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (existing) |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npm test` |
| Full suite command | `npm test && npx playwright test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RQ-01 | SPAC detection returns `'spac'` for ETHM | unit | `npm test -- security-type` | ❌ Wave 0 |
| RQ-01 | SPAC fetch functions use SPAC-specific prompts | unit | `npm test -- anthropic-search` | ❌ Wave 0 (extend existing) |
| RQ-02 | ETF detection returns `'etf'` for QQQ | unit | `npm test -- security-type` | ❌ Wave 0 |
| RQ-02 | ETF analyst function returns sentinel without API call | unit | `npm test -- anthropic-search` | ❌ Wave 0 |
| RQ-03 | Equity path: max_uses bumped to 5, prompts unchanged | unit | `npm test -- anthropic-search` | ❌ Wave 0 |
| RQ-04 | SourcePackage type includes `security_type` field | unit (type check) | `npm test -- source-package` | ❌ Wave 0 |
| RQ-04 | Badge renders for SPAC/ETF, not for equity/unknown | e2e | `npx playwright test -- security-badge` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test`
- **Per wave merge:** `npm test && npx playwright test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/security-type.test.ts` — covers RQ-01, RQ-02, RQ-03: unit tests for `detectSecurityType()` with mocked Anthropic client; tests quoteType mapping, name-based detection, web-search fallback, default equity fallback
- [ ] `tests/unit/anthropic-search-branching.test.ts` — covers RQ-01, RQ-02, RQ-03: verify prompt text and `max_uses` differ by security type; verify ETF analyst sentinel return shape
- [ ] `tests/e2e/security-badge.spec.ts` — covers RQ-04: Playwright test that loads a mocked research report with `security_type: 'spac'` and confirms badge renders with correct text; confirms no badge for `security_type: 'equity'`

---

## Sources

### Primary (HIGH confidence)

- Existing source files (read directly): `src/lib/data/anthropic-search.ts`, `src/lib/data/source-package.ts`, `src/lib/types.ts`, `src/components/NavBar.tsx`, `src/components/ResearchReport.tsx`, `scripts/notebooklm_research.py`, `src/app/api/research/[ticker]/route.ts`
- `.planning/phases/07-.../07-CONTEXT.md` — locked decisions, canonical references, code context
- `.planning/STATE.md` — all project decisions including yahoo-finance2 v3 quoteType casing, terminal aesthetic rules (no rounded corners), amber accent usage

### Secondary (MEDIUM confidence)

- `.planning/ROADMAP.md` Phase 7 success criteria — confirms RQ-01 through RQ-04 scope
- `.planning/REQUIREMENTS.md` — requirement traceability confirms no existing v1 requirement covers security type detection

### Tertiary (LOW confidence)

- None — all findings based on primary source code reads and project documentation.

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — no new dependencies; all tools already in the project
- Architecture: HIGH — derived from reading actual source files; patterns match existing code conventions precisely
- Pitfalls: HIGH — quoteType casing pitfall confirmed by STATE.md project history; AnalysisResult propagation pitfall derived from data flow analysis of existing code
- Validation architecture: HIGH — vitest already installed and running; test file gaps are confirmed by file listing

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable — no fast-moving dependencies involved)
