# Phase 5: User Identity & Report History - Research

**Researched:** 2026-03-18
**Domain:** Local filesystem persistence, Google session identity extraction, Next.js API routes, React client state
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Report Storage**
- Format: Filesystem JSON files — one file per report
- Location: `~/.cipher/reports/` (user's home directory, survives git ops and project moves)
- Contents per file: Full `AnalysisResult` JSON plus metadata: ticker, company_name, analyzed_at, market_sentiment, confidence_level
- Filename convention: `{TICKER}-{analyzed_at_iso}.json` (e.g., `AAPL-2026-03-18T14-32-00Z.json`) — sortable, unique
- Write trigger: After `POST /api/analysis/[ticker]` returns a successful `AnalysisResult`, the API route writes the file before streaming the final RESULT line to the frontend
- Read: `GET /api/history` reads all files in `~/.cipher/reports/`, parses each, and returns sorted list (newest first)

**History UI (Home Page)**
- Placement: Below the ticker search input on the home page, above or replacing the "How it works" section
- Entry design: Compact terminal-style rows — one row per report: `AAPL | Apple Inc. | Mar 18 2026 | BULLISH | HIGH`
- Columns: SYMBOL, COMPANY, DATE, SENTIMENT, CONFIDENCE
- Each row has two actions: `[OPEN]` (view the saved report) and `[REGENERATE]` (restart full pipeline for same ticker)
- Sorting: Newest first, no pagination — show all reports
- Empty state: Inline terminal-style message: `No reports yet. Analyze a ticker to get started.` — no illustration, no hidden section
- Section header: Terminal-style label: `RESEARCH HISTORY`

**Identity Display**
- Location: Fixed nav bar, top-right — visible on every page
- Format: Compact — `you@gmail.com` or truncated if long (max ~24 chars visible)
- Data source: Extend `GET /api/setup/status` to also parse and return `email` from `~/.notebooklm/storage_state.json` (confirmed auth file path from Phase 2)
- If auth.json is missing or email can't be parsed: Show `NOT CONNECTED` as a link that scrolls to or opens the SetupWizard

**Regeneration UX**
- Pipeline: Full pipeline restart — navigates to `/research/[ticker]` which triggers chart confirmation, then fresh data collection, then NotebookLM analysis
- Trigger location: `[REGENERATE]` button in the history row
- Navigation: Clicking Regenerate navigates to `/research/[ticker]` — same as entering a new ticker. Chart confirmation step is included.
- Old reports: Kept — new report is saved as a separate entry. User can compare AAPL Mar 12 vs AAPL Mar 18.

### Claude's Discretion
- Exact truncation behavior for long email addresses in the nav
- Precise column widths and spacing in the history table rows
- Error handling if `~/.cipher/reports/` can't be created (permissions issue)
- Loading state while history is being fetched from the server

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | The Google account connected for NotebookLM is the user's app identity — no separate signup or login required | Email extraction via Playwright + stored `storage_state.json`; extend `GET /api/setup/status` to return `userEmail` field |
| HIST-01 | Completed research reports are persisted locally (ticker, timestamp, full AnalysisResult, source summary) | Node.js `fs/promises` write in `POST /api/analysis/[ticker]` after successful `AnalysisResult` parse; `StoredReport` wrapper type; `~/.cipher/reports/` directory |
| HIST-02 | Home page displays past reports by ticker with date and sentiment verdict; each is openable | `GET /api/history` route + `<ReportHistory />` component in `page.tsx`; `[OPEN]` navigates to `/research/[ticker]?report=[filename]`; research page loads saved JSON without re-running pipeline |
| HIST-03 | User can regenerate any past report to refresh with current data — produces a new timestamped report for the same ticker | `[REGENERATE]` button navigates to `/research/[ticker]` (no `?report` param) — existing pipeline runs fresh; new file written to `~/.cipher/reports/` with new timestamp |
</phase_requirements>

---

## Summary

Phase 5 adds two capabilities to the existing Next.js app: surfacing the connected Google identity in the nav bar, and persisting completed research reports locally so they can be browsed and reopened. Both capabilities are purely additive — they extend three existing API routes and add two new components, leaving all prior architecture intact.

The most technically nuanced piece is email extraction. The `storage_state.json` file in `~/.notebooklm/` contains Playwright session cookies but **does not store the email address** in any decoded field. The only reliable extraction method is to use Playwright (which `notebooklm-py` already installs) with the stored auth context to make an authenticated navigation to `https://myaccount.google.com/` and parse the email from the page. This was confirmed working in a live test: the approach returned the correct email (`tj.walsh_28@sfuhs.org`) using the existing stored session. However, this adds Playwright startup overhead (~1-2s) to the `/api/setup/status` route. A practical alternative is to spawn `python3` with a short inline script — consistent with how the analysis route already spawns Python.

Report persistence is straightforward: Node.js `fs/promises` to `~/.cipher/reports/` using the established pattern from `src/lib/temp-file.ts`. The `GET /api/history` route reads all `.json` files from that directory, sorts by `analyzed_at` descending, and returns a typed array. The research page needs a new `?report=[filename]` query parameter branch to load and display saved reports without triggering the analysis pipeline.

**Primary recommendation:** Extract email via a short Python/Playwright script spawned from `GET /api/setup/status` with a 5-second timeout and a graceful fallback to `null` (shows `NOT CONNECTED`). Cache the result in-process for the lifetime of the Next.js server process to avoid repeated overhead.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `fs/promises` | built-in | Read/write report JSON files; create `~/.cipher/reports/` | Already used via `src/lib/temp-file.ts` pattern; no additional dependency |
| Node.js `os` | built-in | `homedir()` to resolve `~/.cipher/reports/` cross-platform | Already imported in `setup/status/route.ts` |
| Node.js `path` | built-in | Safe path joins | Already used throughout |
| `child_process.execSync` | built-in | Spawn Python for email extraction (consistent with existing setup/status approach) | Already used in `setup/status/route.ts` |
| React `useEffect` + `fetch` | built-in | Client-side history fetch on home page | Already the established pattern in `page.tsx` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Playwright (already installed) | `^1.58.2` | Authenticated Google session navigation for email extraction | Only during email extraction via Python subprocess |
| `notebooklm-py` (already installed) | `0.3.4` | Provides `NotebookLMClient.from_storage()` which loads `storage_state.json` | Could be used instead of raw Playwright for email extraction |
| Next.js `useSearchParams` | already used | Read `?report=` param on research page | For the OPEN report branch on `/research/[ticker]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Playwright email extraction | Google People API via OAuth | Google People API requires separate OAuth app registration — not viable for a local tool with no OAuth flow |
| Playwright email extraction | Parse raw cookies for email encoding | Google cookies (`SAPISID`, `ACCOUNT_CHOOSER`, `__Host-GAPS`) do not encode email in a decodable form — verified by inspection |
| Separate `GET /api/email` endpoint | Extending `GET /api/setup/status` | One fewer API call on page load; CONTEXT.md locked this decision |
| SQLite for report storage | Filesystem JSON | No new dependency; each report is independently readable; fits the "local tool" philosophy |

**Installation:** No new packages required. All dependencies are already present.

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   ├── api/
│   │   ├── setup/
│   │   │   └── status/
│   │   │       └── route.ts        # EXTEND: add userEmail field
│   │   ├── analysis/
│   │   │   └── [ticker]/
│   │   │       └── route.ts        # EXTEND: write report JSON after RESULT line
│   │   └── history/                # NEW: GET /api/history
│   │       └── route.ts
│   ├── research/
│   │   └── [ticker]/
│   │       └── page.tsx            # EXTEND: add ?report= branch (load saved report)
│   └── page.tsx                    # EXTEND: add <ReportHistory /> below search
├── components/
│   ├── ReportHistory.tsx           # NEW: history list component
│   └── NavIdentity.tsx             # NEW (or inline): email display in nav
└── lib/
    ├── types.ts                    # EXTEND: add StoredReport interface
    └── reports.ts                  # NEW: report read/write helpers (mirrors temp-file.ts)
```

### Pattern 1: Report File Write (in analysis route)

**What:** After the Python script emits `RESULT: {...}`, parse the JSON, write a timestamped file to `~/.cipher/reports/`, then stream the result event to the client. Write happens before the SSE event so history is never missing a completed report.

**When to use:** On every successful analysis completion.

```typescript
// Source: established pattern from src/lib/temp-file.ts
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { AnalysisResult } from '@/lib/types';

export interface StoredReport {
  // Metadata fields (duplicated from AnalysisResult for fast list reads)
  ticker: string;
  company_name: string;
  analyzed_at: string;        // ISO 8601
  market_sentiment: 'bullish' | 'neutral' | 'bearish';
  confidence_level: 'Low' | 'Medium' | 'High';
  // Full result embedded
  analysis: AnalysisResult;
}

export async function writeReport(result: AnalysisResult): Promise<string> {
  const dir = path.join(os.homedir(), '.cipher', 'reports');
  await fs.mkdir(dir, { recursive: true });
  // ISO timestamp → safe filename: replace colons with hyphens
  const ts = result.analyzed_at.replace(/:/g, '-').replace(/\.\d+Z$/, 'Z');
  const filename = `${result.ticker}-${ts}.json`;
  const filePath = path.join(dir, filename);
  const stored: StoredReport = {
    ticker: result.ticker,
    company_name: result.company_name,
    analyzed_at: result.analyzed_at,
    market_sentiment: result.market_sentiment,
    confidence_level: result.confidence_level,
    analysis: result,
  };
  await fs.writeFile(filePath, JSON.stringify(stored, null, 2), 'utf8');
  return filename;
}
```

### Pattern 2: History List Read (GET /api/history)

**What:** Read all `.json` files from `~/.cipher/reports/`, parse each, sort newest first by `analyzed_at`, return typed array. Graceful error handling — missing directory returns empty array, not 500.

**When to use:** On home page load, after setup status resolves.

```typescript
// Source: Node.js fs/promises pattern
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { NextResponse } from 'next/server';
import type { StoredReport } from '@/lib/reports';

export async function GET() {
  const dir = path.join(os.homedir(), '.cipher', 'reports');
  try {
    const files = await fs.readdir(dir);
    const reports: StoredReport[] = [];
    for (const file of files.filter(f => f.endsWith('.json'))) {
      try {
        const content = await fs.readFile(path.join(dir, file), 'utf8');
        reports.push(JSON.parse(content) as StoredReport);
      } catch {
        // Skip corrupt files — never abort the whole list
      }
    }
    reports.sort((a, b) =>
      new Date(b.analyzed_at).getTime() - new Date(a.analyzed_at).getTime()
    );
    return NextResponse.json({ reports });
  } catch {
    // Directory doesn't exist yet — return empty list
    return NextResponse.json({ reports: [] });
  }
}
```

### Pattern 3: Email Extraction (Python subprocess from setup/status)

**What:** Spawn a short Python script that loads `storage_state.json` via Playwright and navigates to `https://myaccount.google.com/` to extract the email from the authenticated page. Verified working in live test.

**When to use:** On `GET /api/setup/status` when `authOk` is true. Cache result in a module-level variable.

```typescript
// Source: established pattern from setup/status/route.ts (execSync approach)
import { execSync } from 'child_process';

function extractEmail(notebooklmHome: string): string | null {
  const script = `
import asyncio, json, re
from playwright.async_api import async_playwright

async def get_email():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(storage_state='${notebooklmHome}/storage_state.json')
        page = await ctx.new_page()
        await page.goto('https://myaccount.google.com/', timeout=8000)
        await page.wait_for_timeout(1500)
        content = await page.content()
        emails = re.findall(r'[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}', content)
        filtered = [e for e in emails if not any(x in e.lower() for x in ['example', 'prober', 'w3.org', 'schema'])]
        print(filtered[0] if filtered else '')
        await browser.close()

asyncio.run(get_email())
`.trim();
  try {
    const result = execSync(`python3 -c "${script.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8',
      timeout: 10000,
    }).trim();
    return result || null;
  } catch {
    return null;
  }
}
```

**Important:** The inline Python string approach has quoting complexity. Prefer writing the script to a temp file or using a dedicated `scripts/get_email.py` script and spawning it with `execSync('python3 scripts/get_email.py', ...)`.

### Pattern 4: Saved Report Loading (research page)

**What:** When `/research/[ticker]?report=AAPL-2026-03-18T14-32-00Z.json` is detected, skip chart confirmation and analysis pipeline — directly load the saved file via a new `GET /api/history/[filename]` route and render the `<ResearchReport />` component.

**When to use:** When `[OPEN]` is clicked in the history list.

```typescript
// In /research/[ticker]/page.tsx — detect report param
const reportFile = searchParams.get('report');

// If reportFile present, fetch saved report and render directly
useEffect(() => {
  if (!reportFile) return;
  fetch(`/api/history/${encodeURIComponent(reportFile)}`)
    .then(r => r.json())
    .then((stored: StoredReport) => {
      setAnalysisResult(stored.analysis);
      setPageState('complete');
    })
    .catch(() => setPageState('error'));
}, [reportFile]);
```

### Anti-Patterns to Avoid

- **Writing reports to `/tmp`:** The project already uses `/tmp` for source packages (ephemeral). Reports must go to `~/.cipher/reports/` so they survive server restarts.
- **Blocking the SSE stream on report write:** `writeReport()` must complete before the `result` SSE event is enqueued — but must not block on I/O failure (wrap in try/catch, log, continue).
- **Storing email in a Next.js cookie or localStorage:** The source of truth is `storage_state.json`. No additional auth state should be introduced.
- **Parsing cookies manually for email:** Verified that Google auth cookies (`SAPISID`, `ACCOUNT_CHOOSER`, `__Host-GAPS`) do not contain a decodable email. Only the Playwright-authenticated page access works.
- **Making email extraction synchronous-blocking on every status check:** Cache the result at module scope after first successful extraction. Re-fetch only when `authOk` transitions from false to true.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sorted file listing | Custom sort algorithm | Native `Array.sort()` on `analyzed_at` ISO strings | ISO 8601 strings sort lexicographically by date — no parsing needed for sort |
| Report ID generation | UUID library | `{TICKER}-{analyzed_at_iso}` filename convention | Already unique (ISO timestamp + ticker); sortable; human-readable |
| Google identity lookup | OAuth2 flow or Google API registration | Playwright with existing `storage_state.json` | Already authenticated; no new credentials; verified working |
| File watching for history refresh | WebSocket or polling | Simple `useEffect` fetch on page load | Local tool; new reports only appear after returning to home page — no real-time push needed |

**Key insight:** For a local tool with a single user, filesystem JSON is always preferable to a database. No schema migrations, no startup overhead, no binary dependencies — just files the user can inspect and copy.

---

## Common Pitfalls

### Pitfall 1: analyzed_at Contains Colons — Invalid Filename on Some Filesystems
**What goes wrong:** `AAPL-2026-03-18T14:32:00.000Z.json` contains colons, which are forbidden on Windows NTFS and cause issues on some Linux filesystems.
**Why it happens:** ISO 8601 format uses colons in the time component.
**How to avoid:** Replace colons with hyphens and strip milliseconds before building the filename: `analyzed_at.replace(/:/g, '-').replace(/\.\d+Z$/, 'Z')` → `AAPL-2026-03-18T14-32-00Z.json`.
**Warning signs:** File write fails silently or with ENOENT on non-macOS systems.

### Pitfall 2: `~/.cipher/reports/` Directory Doesn't Exist on First Write
**What goes wrong:** `fs.writeFile()` throws `ENOENT` because the directory doesn't exist yet.
**Why it happens:** First report write attempt — directory has never been created.
**How to avoid:** Always call `fs.mkdir(dir, { recursive: true })` before writing. This is idempotent — no error if directory already exists.
**Warning signs:** Analysis succeeds but no file appears in `~/.cipher/reports/`.

### Pitfall 3: Email Extraction Timing — Playwright Startup Adds Latency
**What goes wrong:** `GET /api/setup/status` takes 3-5 seconds instead of ~200ms, making the home page feel slow.
**Why it happens:** Playwright launches Chromium, loads the stored auth state, navigates to Google, and parses the page — all synchronously blocking the API response.
**How to avoid:** Cache the email at module scope after first successful fetch. For the first call: either accept the latency (it's one-time on load) or move email extraction to a lazy background call that doesn't block the initial status response. The `userEmail` field can return `null` on the first response and populate on a follow-up fetch.
**Warning signs:** The home page spinner takes 4+ seconds to resolve.

### Pitfall 4: `[OPEN]` Route Conflict with Analysis Route
**What goes wrong:** `/research/[ticker]?report=...` hits the research page which detects `filePath` param first and tries to run analysis, ignoring the `report` param.
**Why it happens:** The existing research page reads `searchParams.get('file')` to detect the analysis trigger. The new `?report=` param uses a different name but the order of `useEffect` hooks may cause both to fire.
**How to avoid:** Check `report` param first in the research page. If `report` is present, skip ALL other state machines (chart loading, analysis triggering). Make the `report` branch mutually exclusive with the `file` (analysis) branch.
**Warning signs:** Clicking `[OPEN]` triggers a chart load or analysis run instead of rendering the saved report.

### Pitfall 5: Corrupt JSON Files in Reports Directory
**What goes wrong:** `GET /api/history` crashes or returns 500 if a report file has invalid JSON (truncated write, manual edit, etc.).
**Why it happens:** File writes are non-atomic — a crash mid-write leaves a corrupt file.
**How to avoid:** Wrap each file parse in a `try/catch` and skip corrupt files (log a warning, continue). Return the valid reports. Never `await Promise.all` across all files without individual error isolation.
**Warning signs:** History list is empty or endpoint returns 500 even though files exist.

---

## Code Examples

Verified patterns from existing codebase:

### Filesystem Write (mirrors temp-file.ts)
```typescript
// Source: src/lib/temp-file.ts — established filesystem pattern
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const dir = path.join(os.homedir(), '.cipher', 'reports');
await fs.mkdir(dir, { recursive: true });
await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
```

### Extending SetupStatus Response (mirrors existing route.ts structure)
```typescript
// Source: src/app/api/setup/status/route.ts — add userEmail field
interface SetupStatus {
  pythonOk: boolean;
  pythonVersion?: string;
  pythonPath?: string;
  notebooklmOk: boolean;
  authOk: boolean;
  allOk: boolean;
  userEmail: string | null;   // NEW
}
```

### Reading Report in Analysis Route (inject before SSE result event)
```typescript
// Source: src/app/api/analysis/[ticker]/route.ts — existing RESULT handling
} else if (line.startsWith('RESULT: ')) {
  const json = line.slice('RESULT: '.length);
  try {
    const data = JSON.parse(json) as AnalysisResult;
    // NEW: persist before streaming
    try {
      await writeReport(data);
    } catch (writeErr) {
      console.error('[history] Failed to write report:', writeErr);
      // Non-fatal — continue streaming result
    }
    enqueue(JSON.stringify({ type: 'result', data }));
  } catch {
    enqueue(JSON.stringify({ type: 'error', message: 'Failed to parse analysis result.' }));
  }
```

### History Client Component Pattern (mirrors page.tsx useEffect)
```typescript
// Source: src/app/page.tsx — useEffect fetch pattern
const [reports, setReports] = useState<StoredReport[]>([]);
const [historyLoading, setHistoryLoading] = useState(true);

useEffect(() => {
  if (!setupStatus?.allOk) return;
  fetch('/api/history')
    .then(r => r.json())
    .then((d: { reports: StoredReport[] }) => setReports(d.reports))
    .catch(() => setReports([]))
    .finally(() => setHistoryLoading(false));
}, [setupStatus?.allOk]);
```

### Nav Email Truncation
```typescript
// Claude's discretion: truncate at 21 chars + ellipsis if > 24
function truncateEmail(email: string, maxLen = 24): string {
  if (email.length <= maxLen) return email;
  return email.slice(0, 21) + '…';
}
```

### Date Formatting for History Rows
```typescript
// Format analyzed_at ISO string as "Mar 18 2026" (matches UI-SPEC)
function formatReportDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    timeZone: 'UTC',
  });
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `auth.json` (expected) | `storage_state.json` (actual) | Phase 2 discovery | All auth file reads must use `storage_state.json` — confirmed in `checkAuth()` in setup/status/route.ts |
| `process.env.HOME` for homedir | `os.homedir()` | Standard practice | Cross-platform; handles edge cases where HOME is unset |

**Deprecated/outdated:**
- `auth.json` path: The CONTEXT.md canonical refs note that Phase 2 confirmed the actual auth file is `storage_state.json`, not `auth.json`. All code must use `storage_state.json`.

---

## Open Questions

1. **Email extraction caching strategy**
   - What we know: First extraction takes 3-5 seconds (Playwright startup); subsequent calls should be instant if cached
   - What's unclear: Next.js API route modules are re-initialized on cold start — module-level cache is lost. Server restarts are common during local development.
   - Recommendation: Accept one-time latency on first page load. Do NOT block the initial status response — return `userEmail: null` on first call, then trigger a background fetch and respond to a follow-up poll. Alternatively, make the frontend show `NOT CONNECTED` optimistically and update when email resolves. Planner should decide: blocking (simple) vs. async (fast perceived load).

2. **`scripts/get_email.py` vs inline Python string**
   - What we know: Inline Python in `execSync` has quoting escaping complexity; a dedicated script file is cleaner
   - What's unclear: Whether the planner wants to add a new script file or keep everything in TypeScript
   - Recommendation: Add `scripts/get_email.py` — consistent with the existing `scripts/notebooklm_research.py` pattern. Short script (~20 lines), easy to test independently.

3. **`GET /api/history/[filename]` — separate route vs query param on `/api/history`**
   - What we know: The `[OPEN]` button navigates to `/research/[ticker]?report=[filename]`; the research page needs to fetch the saved report
   - What's unclear: Whether to use `/api/history/[filename]` (dynamic route) or `/api/history?file=[filename]` (query param on existing route)
   - Recommendation: Use `/api/history/[filename]` as a dynamic route — cleaner separation; the list route (`GET /api/history`) and the single-file route serve different purposes. Planner should decide if this adds unwanted complexity.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright `^1.58.2` (e2e) + Vitest `^3.0.9` (unit) |
| Config file | `playwright.config.ts` (e2e), `vitest.config.ts` (unit) |
| Quick run command | `npx playwright test tests/e2e/phase5-history.spec.ts --headed=false` |
| Full suite command | `npx playwright test tests/e2e/ --headed=false` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Nav shows email when auth connected | e2e Playwright | `npx playwright test tests/e2e/phase5-history.spec.ts -g "nav shows email"` | ❌ Wave 0 |
| AUTH-01 | Nav shows NOT CONNECTED when no auth | e2e Playwright | `npx playwright test tests/e2e/phase5-history.spec.ts -g "nav shows NOT CONNECTED"` | ❌ Wave 0 |
| HIST-01 | Completed analysis writes file to ~/.cipher/reports/ | e2e Playwright | `npx playwright test tests/e2e/phase5-history.spec.ts -g "report file written"` | ❌ Wave 0 |
| HIST-01 | Written file contains valid StoredReport JSON | unit Vitest | `npx vitest run src/lib/reports.test.ts` | ❌ Wave 0 |
| HIST-02 | Home page shows RESEARCH HISTORY section | e2e Playwright | `npx playwright test tests/e2e/phase5-history.spec.ts -g "history section visible"` | ❌ Wave 0 |
| HIST-02 | OPEN button navigates to research page with ?report= param | e2e Playwright | `npx playwright test tests/e2e/phase5-history.spec.ts -g "OPEN loads saved report"` | ❌ Wave 0 |
| HIST-02 | Empty state shown when no reports | e2e Playwright | `npx playwright test tests/e2e/phase5-history.spec.ts -g "empty state"` | ❌ Wave 0 |
| HIST-03 | REGENERATE navigates to /research/[ticker] without ?report= | e2e Playwright | `npx playwright test tests/e2e/phase5-history.spec.ts -g "REGENERATE navigates"` | ❌ Wave 0 |
| HIST-03 | New timestamped report written after regeneration | e2e Playwright | `npx playwright test tests/e2e/phase5-history.spec.ts -g "regenerate creates new entry"` | ❌ Wave 0 (slow — requires full pipeline run) |

### Sampling Rate
- **Per task commit:** `npx playwright test tests/e2e/phase5-history.spec.ts --headed=false` (all Phase 5 tests, no pipeline run)
- **Per wave merge:** `npx playwright test tests/e2e/ --headed=false`
- **Phase gate:** Full suite green (excluding pipeline tests that require live NotebookLM) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/e2e/phase5-history.spec.ts` — covers AUTH-01, HIST-01, HIST-02, HIST-03 (all Phase 5 e2e tests)
- [ ] `src/lib/reports.ts` — report read/write helpers (needed before unit tests can import)
- [ ] `src/lib/reports.test.ts` — unit test for `writeReport()`, `StoredReport` type shape, filename sanitization
- [ ] `scripts/get_email.py` — email extraction script (needed by `setup/status/route.ts` before auth email tests pass)

Note: The REGENERATE + new entry test (`HIST-03 creates new entry`) is inherently slow (requires a full NotebookLM pipeline run). Mark it with `test.setTimeout(8 * 60 * 1000)` consistent with `full-flow.spec.ts`.

---

## Sources

### Primary (HIGH confidence)
- Live code inspection — `src/app/api/setup/status/route.ts`: Confirmed `checkAuth()` uses `notebooklm auth check --json` with fallback to `storage_state.json` file existence check
- Live code inspection — `src/lib/temp-file.ts`: Confirmed filesystem write pattern with `fs/promises`, `os.homedir()`, `path.join()`
- Live code inspection — `src/app/api/analysis/[ticker]/route.ts`: Confirmed RESULT line handling; write hook insertion point identified
- Live code inspection — `src/app/page.tsx`: Confirmed `useEffect` + `fetch` pattern for status; history section insertion point confirmed
- Live code inspection — `src/lib/types.ts`: Confirmed `AnalysisResult` type shape for storage; `StoredReport` wrapper design validated
- Live test — email extraction via Playwright: Python script using `async_playwright()` + `storage_state.json` auth context successfully returned correct email from `https://myaccount.google.com/`
- Live inspection — `~/.notebooklm/storage_state.json`: Confirmed email is NOT stored in any decodable cookie field; only Playwright-authenticated page access works
- Live command — `notebooklm auth check --json`: Confirmed output schema; confirmed no `email` field in auth check response
- Live inspection — `notebooklm-py` `paths.py`, `auth.py`, `rpc.py`: Confirmed `storage_state.json` canonical path; confirmed no native email extraction method in library

### Secondary (MEDIUM confidence)
- `05-CONTEXT.md` canonical refs section: Phase 2 confirmed `storage_state.json` as auth file (not `auth.json`)
- `05-UI-SPEC.md`: Design contracts for `<NavIdentity />` and `<ReportHistory />` components — visual/interaction contracts verified against existing component patterns in `ResearchReport.tsx` and `globals.css`

### Tertiary (LOW confidence)
- None — all critical claims verified against live code or live tests.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies already installed; no new packages
- Architecture: HIGH — verified against actual code; insertion points confirmed
- Pitfalls: HIGH — filename sanitization and email extraction verified via live tests
- Email extraction: HIGH — live test confirmed Playwright approach works; confirmed cookies do not encode email

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable — no fast-moving dependencies; notebooklm-py API is stable)
