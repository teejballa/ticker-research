# Phase 2: Research Integration — Research

**Researched:** 2026-03-12
**Status:** RESEARCH COMPLETE

---

## Validation Architecture

### Test Categories

| Category | What to test | Type |
|----------|-------------|------|
| Setup status endpoint | Python detection, notebooklm-py check, storage_state.json check | Unit + Integration |
| Research Brief formatter | All SourcePackage sections produce correct text + URL list | Unit |
| Python script contract | PROGRESS:/RESULT:/ERROR: stdout protocol | Integration |
| SSE streaming | Lines stream correctly to browser | Integration |
| AnalysisResult schema | All required fields present after parse | Unit |
| Error states | Rate limit, crash, failed URLs | Integration |

---

## Critical Discovery: Auth File Path Discrepancy

**The CLAUDE.md and CONTEXT.md reference `~/.notebooklm/auth.json` — this path is INCORRECT.**

The teng-lin `notebooklm-py` library (the one used in the automated pipeline) uses:

```
~/.notebooklm/storage_state.json   ← actual auth file (Playwright storage state)
```

`auth.json` is used by the PleasePrompto notebooklm-skill (interactive dev tool) — a completely separate library. All API routes that check for auth must check for `storage_state.json`. This affects:
- `GET /api/setup/status` auth check
- `POST /api/setup/auth` polling logic
- Documentation, comments, and error messages

**Environment variable override:** `NOTEBOOKLM_HOME` overrides the base directory (defaults to `~/.notebooklm`). Useful for Daytona container deployment.

---

## notebooklm-py (teng-lin) — Exact API

### Installation & Import
```bash
pip install "notebooklm-py[browser]==0.3.4"
playwright install chromium
notebooklm login   # opens browser → Google login → saves storage_state.json
```

```python
from notebooklm import NotebookLMClient, RPCError
```

### Client Lifecycle (ALWAYS async context manager)
```python
async with await NotebookLMClient.from_storage() as client:
    # all operations here
```

`NotebookLMClient.from_storage()` loads `~/.notebooklm/storage_state.json`.
Override via `NOTEBOOKLM_AUTH_JSON` env var (inline JSON) or `NOTEBOOKLM_HOME` env var.

### Notebook Operations
```python
nb = await client.notebooks.create("AAPL Research 2026-03-12")
# nb.id → string notebook ID

await client.notebooks.delete(nb.id)
# Returns bool
```

### Source Operations — EXACT SIGNATURES (no wait= parameter)
```python
# Add text (market data + fundamentals as structured plain text)
source = await client.sources.add_text(nb.id, title, content)
# title: str, content: str
# Returns Source(id, title, url, created_at, kind)

# Add URL (news articles — Gemini fetches and indexes)
source = await client.sources.add_url(nb.id, url)
# Returns Source

# Source processing is ASYNC — sources need time to index before chat.ask()
# No wait= parameter exists. Use asyncio.sleep() after adding sources.
# Example from official docs: await asyncio.sleep(3) minimum
# For our pipeline with multiple sources, use 15-20 seconds after add_text,
# then add URLs (which process in parallel), then sleep again if needed.
```

**Source status polling (if asyncio.sleep isn't enough):**
```python
# SourceStatus values: PROCESSING=1, READY=2, ERROR=3, PREPARING=5
import asyncio
source = await client.sources.add_text(nb.id, title, content)
for _ in range(30):  # poll up to 5 minutes
    s = await client.sources.get(nb.id, source.id)
    if s.status == 2:  # READY
        break
    await asyncio.sleep(10)
```

### Chat Operations — EXACT SIGNATURES
```python
result = await client.chat.ask(
    notebook_id,           # str
    question,              # str
    source_ids=None,       # list[str] | None — limit to specific sources
    conversation_id=None,  # str | None — for follow-up threading
)
```

**AskResult dataclass:**
```python
@dataclass
class AskResult:
    answer: str                    # Full text with inline citations [1], [2]
    conversation_id: str           # Use for follow-up questions
    turn_number: int
    is_follow_up: bool
    references: list[ChatReference]
    raw_response: str              # First 1000 chars of raw response
```

**ChatReference dataclass:**
```python
@dataclass
class ChatReference:
    source_id: str
    citation_number: int | None
    cited_text: str | None
    start_char: int | None
    end_char: int | None
    chunk_id: str | None
```

### Error Handling
```python
from notebooklm import RPCError

try:
    result = await client.chat.ask(nb.id, question)
except RPCError as e:
    # Rate limited, session expired, or invalid parameters
    print(f"ERROR: RPC failed: {e}")
```

Automatic retry: On 401/403 auth errors, the library automatically refreshes CSRF tokens and retries once. Manual refresh: `await client.refresh_auth()`.

---

## The 6 Structured Query Strategy

Each `chat.ask()` call must produce a specific piece of the AnalysisResult. Questions are designed for NotebookLM's source-grounded response style:

**Q1 — Market Sentiment Classification:**
```
"Based exclusively on the sources provided, what is the overall market sentiment for this stock? Classify it as bullish, bearish, or neutral. Explain the primary factors driving this sentiment, citing specific sources."
```

**Q2 — Bullish Signals (exactly 3):**
```
"Identify exactly 3 bullish signals or positive factors for this stock based on the provided sources. For each signal, state the signal clearly and cite the specific source that supports it. Format: Signal 1: [signal text] (Source: [source name/URL]). Signal 2: ... Signal 3: ..."
```

**Q3 — Bearish Signals (exactly 3):**
```
"Identify exactly 3 bearish signals or risk factors for this stock based on the provided sources. For each signal, state the signal clearly and cite the specific source that supports it. Format: Signal 1: [signal text] (Source: [source name/URL]). Signal 2: ... Signal 3: ..."
```

**Q4 — Buy/Hold/Sell Assessment:**
```
"Based on all provided sources, give a probability breakdown for this stock: what percentage likelihood would you assign to Buy, Hold, and Sell recommendations? The three percentages must sum to 100. Provide a one-sentence rationale for each tier, citing sources where possible. Format: Buy: X% - [rationale]. Hold: Y% - [rationale]. Sell: Z% - [rationale]."
```

**Q5 — Confidence Level:**
```
"How confident are you in this overall assessment, on a scale of Low, Medium, or High? Base this on the quality, quantity, and consistency of the sources provided. Explain your confidence level in one sentence (e.g., 'High — multiple independent analyst reports agree on direction' or 'Low — limited data and conflicting signals')."
```

**Q6 — Source Attribution Summary:**
```
"List the key sources that most influenced this analysis and the specific facts from each that were most important to the assessment. Format as: Source 1: [name/type] — [key fact used]. Source 2: ..."
```

**Conversation threading:** Use `conversation_id` from Q1's result for Q2-Q6 to maintain context:
```python
r1 = await client.chat.ask(nb.id, Q1)
r2 = await client.chat.ask(nb.id, Q2, conversation_id=r1.conversation_id)
# etc.
```

---

## AnalysisResult Schema

```typescript
// src/lib/types.ts additions

export interface AnalysisSignal {
  signal: string;
  source_citation: string;  // e.g. "Reuters - AAPL earnings beat estimates"
}

export interface BuySellBreakdown {
  buy_pct: number;       // 0-100
  hold_pct: number;
  sell_pct: number;
  buy_rationale: string;
  hold_rationale: string;
  sell_rationale: string;
}

export interface AnalysisSource {
  name: string;
  key_fact: string;
}

export interface AnalysisResult {
  ticker: string;
  company_name: string;
  analyzed_at: string;           // ISO 8601
  market_sentiment: 'bullish' | 'neutral' | 'bearish';
  sentiment_reasoning: string;
  bullish_signals: AnalysisSignal[];   // exactly 3
  bearish_signals: AnalysisSignal[];   // exactly 3
  assessment: BuySellBreakdown;
  confidence_level: 'Low' | 'Medium' | 'High';
  confidence_explanation: string;
  sources_used: AnalysisSource[];
  source_warnings: string[];     // URLs that failed to load
}
```

---

## Python Script Architecture (`scripts/notebooklm_research.py`)

### Stdout Protocol
```
PROGRESS: Creating notebook...
PROGRESS: Adding market data source...
PROGRESS: Adding news sources (12 URLs)...
PROGRESS: Querying sentiment (1/6)...
PROGRESS: Querying bullish signals (2/6)...
PROGRESS: Querying bearish signals (3/6)...
PROGRESS: Querying assessment (4/6)...
PROGRESS: Querying confidence (5/6)...
PROGRESS: Querying sources (6/6)...
PROGRESS: Cleaning up notebook...
RESULT: {"ticker":"AAPL","company_name":"Apple Inc.",...}
```
Or on error:
```
ERROR: RPC failed: rate limit exceeded
```

### Script Skeleton
```python
#!/usr/bin/env python3
"""
scripts/notebooklm_research.py

Usage: python3 scripts/notebooklm_research.py <source_package_path>
Reads SourcePackage JSON, runs 6 NotebookLM queries, prints RESULT: to stdout.
"""

import asyncio
import json
import sys
import os
from datetime import datetime, timezone
from notebooklm import NotebookLMClient, RPCError

def progress(msg: str):
    print(f"PROGRESS: {msg}", flush=True)

def result(data: dict):
    print(f"RESULT: {json.dumps(data)}", flush=True)

def error(msg: str):
    print(f"ERROR: {msg}", flush=True)

async def main():
    if len(sys.argv) < 2:
        error("No source package path provided")
        sys.exit(1)

    file_path = sys.argv[1]

    # Load source package
    with open(file_path, 'r') as f:
        pkg = json.load(f)

    notebook_id = None

    try:
        async with await NotebookLMClient.from_storage() as client:

            # 1. Create notebook
            progress("Creating notebook...")
            ticker = pkg['ticker']
            ts = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
            nb = await client.notebooks.create(f"{ticker} Research — {ts}")
            notebook_id = nb.id

            # 2. Add market data as text source (formatted research brief)
            progress("Adding market data source...")
            brief = format_research_brief(pkg)  # pure Python, no async
            await client.sources.add_text(nb.id, f"{ticker} Market Data", brief)

            # Wait for text source to index
            await asyncio.sleep(15)

            # 3. Add news URLs
            news_urls = extract_news_urls(pkg)
            source_warnings = []
            progress(f"Adding news sources ({len(news_urls)} URLs)...")
            for url in news_urls:
                try:
                    await asyncio.wait_for(
                        client.sources.add_url(nb.id, url),
                        timeout=120.0
                    )
                except (asyncio.TimeoutError, RPCError, Exception) as e:
                    source_warnings.append(f"Failed to load: {url} ({e})")

            # Wait for URL sources to index
            if news_urls:
                await asyncio.sleep(20)

            # 4. Run 6 queries
            QUESTIONS = [Q1, Q2, Q3, Q4, Q5, Q6]  # defined as module constants
            labels = [
                "sentiment (1/6)", "bullish signals (2/6)", "bearish signals (3/6)",
                "assessment (4/6)", "confidence (5/6)", "sources (6/6)"
            ]

            conversation_id = None
            answers = []
            for i, (q, label) in enumerate(zip(QUESTIONS, labels)):
                progress(f"Querying {label}...")
                r = await client.chat.ask(
                    nb.id, q,
                    conversation_id=conversation_id
                )
                answers.append(r.answer)
                if i == 0:
                    conversation_id = r.conversation_id

            # 5. Parse answers into AnalysisResult
            analysis = parse_answers(answers, pkg, source_warnings)

            # 6. Cleanup
            progress("Cleaning up notebook...")
            await client.notebooks.delete(nb.id)
            notebook_id = None

            result(analysis)

    except RPCError as e:
        if notebook_id:
            try:
                async with await NotebookLMClient.from_storage() as c2:
                    await c2.notebooks.delete(notebook_id)
            except Exception:
                pass
        error_msg = str(e).lower()
        if 'rate' in error_msg or 'quota' in error_msg or 'limit' in error_msg:
            error("NotebookLM daily limit reached. Resets at midnight PST — try again tomorrow.")
        else:
            error(f"NotebookLM error: {e}")
        sys.exit(1)
    except Exception as e:
        if notebook_id:
            try:
                async with await NotebookLMClient.from_storage() as c2:
                    await c2.notebooks.delete(notebook_id)
            except Exception:
                pass
        error(f"Script failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
```

---

## Next.js SSE Streaming Pattern

The existing `ChartConfirmation.tsx` pattern is the blueprint. Adapt for analysis:

```typescript
// POST /api/analysis/[ticker]/route.ts
import { spawn } from 'child_process';
import { NextRequest } from 'next/server';
import { readSourcePackage } from '@/lib/temp-file';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const { filePath } = await request.json();

  const stream = new ReadableStream({
    start(controller) {
      const encode = (data: string) =>
        new TextEncoder().encode(`data: ${data}\n\n`);

      const proc = spawn('python3', [
        'scripts/notebooklm_research.py',
        filePath
      ]);

      let buffer = '';
      proc.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('PROGRESS: ')) {
            const msg = line.slice('PROGRESS: '.length);
            controller.enqueue(encode(JSON.stringify({ type: 'progress', message: msg })));
          } else if (line.startsWith('RESULT: ')) {
            const json = line.slice('RESULT: '.length);
            controller.enqueue(encode(JSON.stringify({ type: 'result', data: JSON.parse(json) })));
            proc.kill();
            controller.close();
          } else if (line.startsWith('ERROR: ')) {
            const msg = line.slice('ERROR: '.length);
            controller.enqueue(encode(JSON.stringify({ type: 'error', message: msg })));
            proc.kill();
            controller.close();
          }
        }
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        // Log to server console only — not streamed to client
        console.error('[notebooklm_research.py stderr]', chunk.toString());
      });

      proc.on('close', (code) => {
        if (code !== 0 && !controller.desiredSize === null) {
          controller.enqueue(encode(JSON.stringify({ type: 'error', message: 'Analysis script exited unexpectedly.' })));
          controller.close();
        }
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
}
```

---

## Setup Wizard API Routes

### GET /api/setup/status

Checks:
1. Python 3.10+ → `python3 --version` or `python --version`; parse major.minor
2. `notebooklm-py` installed → `pip show notebooklm-py` or `python3 -c "import notebooklm; print(notebooklm.__version__)"`
3. `~/.notebooklm/storage_state.json` exists → `fs.existsSync(path.join(os.homedir(), '.notebooklm', 'storage_state.json'))`

Response:
```typescript
{
  pythonOk: boolean;       // Python 3.10+ found
  pythonVersion?: string;  // e.g. "3.11.4"
  pythonPath?: string;     // which python3
  notebooklmOk: boolean;   // notebooklm-py installed
  authOk: boolean;         // storage_state.json exists
  allOk: boolean;          // all three true
}
```

### POST /api/setup/install

Spawns: `pip install -r scripts/requirements.txt && playwright install chromium`

SSE progress lines → client. On exit 0: `{ type: 'complete' }`. On non-zero: `{ type: 'error', message: stderr }`.

### POST /api/setup/auth

Spawns: `notebooklm login` (opens browser on user's screen).

Poll for `~/.notebooklm/storage_state.json` every 2 seconds, timeout 10 minutes.
Stream: `{ type: 'waiting' }` every 5s, `{ type: 'complete' }` when file appears.

---

## Research Brief Format

The `formatResearchBrief(pkg: SourcePackage): string` function produces structured plain text consumed by `add_text()`. Target ~2000-4000 characters.

```
=== TICKER RESEARCH BRIEF: AAPL ===
Company: Apple Inc.
Exchange: NASDAQ
Data Assembled: 2026-03-12T14:23:00Z

--- MARKET DATA ---
Current Price: $178.45
Market Cap: $2.8T
52-Week High: $199.62
52-Week Low: $143.90
% Change Today: +1.23%
Volume: 52,345,678

--- FUNDAMENTALS ---
P/E Ratio: 28.5
EPS: $6.25
Revenue: $394.3B
Debt/Equity: 1.45
Profit Margin: 25.3%

--- ANALYST SENTIMENT ---
Consensus: Buy
Avg Price Target: $205.00
Number of Analysts: 42
Recent Changes:
  - Morgan Stanley (Overweight, 2026-03-10)
  - Goldman Sachs upgraded to Buy (2026-03-08)

--- SEC FILINGS ---
Most Recent 10-K: Filed 2025-11-01; strong iPhone revenue growth...
Most Recent 10-Q: Filed 2026-01-28; services segment record revenue...

--- SOCIAL SENTIMENT ---
Overall Tone: Bullish
Signals: AI integration excitement, Vision Pro launch momentum
Sources Checked: Reddit, StockTwits, Twitter/X

--- COLLECTION NOTES ---
Data collected: 2026-03-12T14:22:45Z
[Collection errors if any]
```

`extractNewsUrls(pkg: SourcePackage): string[]` returns `pkg.news.items.map(i => i.url).filter(Boolean)`, deduplicated, max 15 URLs (NotebookLM source limits).

---

## Claude Agent SDK — Phase 2 Relevance

The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) is used for Phase 1 data collection. In Phase 2, the Agent SDK is NOT used for the notebooklm pipeline — that runs as a Python subprocess. However, the Agent SDK may be relevant for:

- **Setup wizard**: using `query()` to orchestrate setup steps if needed (not required — direct child_process.spawn is simpler)
- **Future phases**: the Agent SDK pattern is already established in the codebase

**Key Agent SDK pattern for reference (already established in Phase 1):**
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "...",
  options: {
    allowedTools: ["WebSearch", "WebFetch"],
    permissionMode: "bypassPermissions"
  }
})) {
  if (message.type === "result" && message.subtype === "success") {
    return message.result;
  }
}
```

**V2 SDK (unstable preview):** Do NOT use for production. The V1 `query()` function is the stable interface.

---

## Timing and Rate Limit Considerations

- **Source indexing time:** 15-20 seconds for text source, 20-30 seconds for URL sources collectively
- **Per-query time:** 10-30 seconds each (Gemini reasoning over indexed sources)
- **Total per run:** ~3-5 minutes for a full 6-query run
- **Rate limit:** ~50 queries/day free tier → 6 per run → ~8 full runs/day
- **Individual URL timeout:** 120 seconds per `add_url()` call
- **Script total timeout:** Next.js should allow 10 minutes for the Python script

---

## Windows Compatibility (future)

- Set `PYTHONUTF8=1` environment variable for Unicode handling
- The library auto-applies `WindowsSelectorEventLoopPolicy` on Windows
- CLI hangs on Windows → handled by library internally

---

## Environment Variables Used by notebooklm-py

| Variable | Purpose | Default |
|---|---|---|
| `NOTEBOOKLM_HOME` | Base dir for auth/config files | `~/.notebooklm` |
| `NOTEBOOKLM_AUTH_JSON` | Inline auth JSON for CI/CD | None |
| `NOTEBOOKLM_LOG_LEVEL` | DEBUG/INFO/WARNING/ERROR | WARNING |
| `NOTEBOOKLM_DEBUG_RPC` | RPC debug logging | false |

For Daytona container: set `NOTEBOOKLM_HOME` to a persistent path within the container.

---

## Phase Requirement Coverage

| Requirement | How covered |
|---|---|
| RSRCH-01 | `formatResearchBrief()` + `extractNewsUrls()` → no manual upload |
| RSRCH-02 | `notebooklm_research.py` full notebook lifecycle: create→sources→ask×6→delete |
| RSRCH-03 | 6 structured questions covering all report sections |
| RSRCH-04 | Q1 explicitly classifies sentiment as bullish/neutral/bearish |
| RSRCH-05 | Q2+Q3 produce exactly 3 bullish + 3 bearish signals with source citations |
| RSRCH-06 | Q4 produces Buy/Hold/Sell probability breakdown with reasoning |
| RSRCH-07 | Q2+Q3 require source citations; Q5+Q6 enforce source attribution throughout |

---

## Validation Architecture

### Test Strategy for Phase 2

**Unit tests (no network, no Python subprocess):**
- `formatResearchBrief(pkg)` → verify all 6 sections present, correct labels, timestamps
- `extractNewsUrls(pkg)` → verify dedup, max 15, filters null URLs
- AnalysisResult TypeScript interface parsing → mock RESULT: JSON → typed object
- SSE line parser → mock stdout lines → correct event types streamed

**Integration tests (mock subprocess, no real NotebookLM):**
- `POST /api/analysis/[ticker]` → mock spawn → PROGRESS/RESULT/ERROR lines → correct SSE events
- `GET /api/setup/status` → mock exec outputs → correct status flags
- `POST /api/setup/install` → mock spawn → SSE complete event
- Error states: non-zero exit, malformed RESULT JSON, ERROR: line

**E2E validation (real NotebookLM — manual/CI with auth):**
- Full run: SourcePackage JSON → RESULT: JSON with all required fields
- AnalysisResult has exactly 3 bullish + 3 bearish signals
- Each signal has non-empty source_citation
- market_sentiment is one of bullish/neutral/bearish
- confidence_level is Low/Medium/High
- buy_pct + hold_pct + sell_pct == 100

**Setup wizard validation:**
- Python missing → correct error + OS instructions
- notebooklm-py missing → install triggers, progress streams
- storage_state.json missing → auth flow triggers, polls correctly
- All complete → allOk: true, wizard disappears

---

## ## RESEARCH COMPLETE

All technical details verified against official documentation (teng-lin/notebooklm-py docs, Anthropic Agent SDK docs). Key corrections from existing project assumptions:
1. Auth file is `storage_state.json` not `auth.json`
2. No `wait=True` parameter on `add_text()`/`add_url()` — use `asyncio.sleep()`
3. Import is `from notebooklm import NotebookLMClient` (not `notebooklm_py`)
