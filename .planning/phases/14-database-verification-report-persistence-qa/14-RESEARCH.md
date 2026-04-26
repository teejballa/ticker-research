# Phase 14: Database Verification & Report Persistence QA — Research

**Researched:** 2026-04-23
**Domain:** Prisma 7 + Neon PostgreSQL JSON round-trip, Next.js 15 route testing, Playwright e2e with mocked NextAuth
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**A. StoredReport ID gap — fix the broken web-mode navigation**
- Add `id?: string` to the `StoredReport` interface in `src/lib/types.ts`
- `listReportsFromDb` must include `id: r.id` in the returned object; `readReportFromDb` must also include `id: row.id`
- `ReportHistory.tsx` — `toFilename()` is only valid in local mode; in web mode use `report.id` as the `?report=` query param value
- Local mode is unchanged — `id` is optional, local reports have no UUID

**B. Test database strategy**
- Unit tests (`reports-db.test.ts`, route tests): mock `@/lib/db` with vitest
- Playwright e2e: run against the real production Neon DB (DEPLOYMENT_MODE=web)
- Tests must clean up any rows they insert (delete by the test user_id after the test completes)
- No separate Neon test branch required

**C. Backward compatibility — old reports (pre-Phase 12)**
- Silently hide sections whose data is missing — no "Not available" placeholders
- `ResearchReport.tsx` already has conditional rendering for most optional fields; audit and ensure all Phase 12/13 additions are guarded with `?.` or `?? null` checks
- A pre-Phase 12 report must not throw or crash — only render what exists

**D. Per-user isolation test**
- Unit test with mocked Prisma — `readReportFromDb(id, wrongUserId)` throws when `prisma.report.findFirst` returns `null`
- No second real Google account or Playwright multi-context needed

**E. Playwright e2e scope**
- Mock NextAuth session + mock the Gemini analysis response (return a fixture `AnalysisResult`)
- Run against `DEPLOYMENT_MODE=web` on local Next.js dev server connected to production Neon DB
- Clean up: delete inserted test row from Neon after the Playwright run

### Claude's Discretion

None specified — all key decisions are locked.

### Deferred Ideas (OUT OF SCOPE)

- New report sections
- New data sources
- UI redesign
- Any new functionality beyond fixing the id field, adding tests, backward-compat guards, migration validation, and Playwright e2e
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DB-QA-01 | `writeReportToDb` → `readReportFromDb` round-trip returns all Phase 12/13 fields intact (`sentiment_intelligence`, `future_projection`, `price_target`, `signals`) | Confirmed: `analysis JSONB` column stores the full object; Prisma returns it as parsed JS object — no schema migration needed for new fields |
| DB-QA-02 | Returning user sees full report history (not empty list) after signing in again | Root cause identified: `listReportsFromDb` omits `id` field → `ReportHistory` constructs a filename that is not a UUID → `/api/history/[filename]` returns 404 on every open |
| DB-QA-03 | Same ticker run multiple times creates multiple distinct timestamped records | Confirmed: `prisma.report.create` always inserts; no unique constraint on `(user_id, ticker)` in migration SQL |
| DB-QA-04 | `GET /api/history` in web mode returns all reports for the authenticated user, newest first | Confirmed: `findMany({ orderBy: { analyzed_at: 'desc' } })` is already in place; issue is downstream id mapping |
| DB-QA-05 | Pre-Phase 12 report (missing new fields) loads without crash | Confirmed: all Phase 12/13 fields in `AnalysisResult` are optional (`?`); `ResearchReport.tsx` has conditional rendering for most — audit needed for any gaps |
| DB-QA-06 | `readReportFromDb` returns 404 for valid report ID requested by different user | Confirmed: existing unit test covers this; `findFirst` returns null on mismatch and function throws |
| DB-QA-07 | `prisma migrate deploy` runs against production Neon with no errors and no pending migrations | Two migrations exist (init + add_user_credentials); `analysis JSONB` column was created in init — no new migration needed for Phase 12/13 schema evolution |
| DB-QA-08 | Playwright e2e: sign in → run research → sign out → sign in → history shows report → open it → report renders correctly | Requires mocking NextAuth session (cookie injection) + mocking Gemini response; `writeReportToDb` must write a real row to Neon; cleanup via `prisma.report.deleteMany({ where: { user_id: TEST_USER_ID } })` |
</phase_requirements>

---

## Summary

Phase 14 is a QA and bug-fix phase with four distinct work streams: (1) fixing a blocking navigation bug in `ReportHistory`, (2) extending unit test coverage for the `id` field and Phase 12/13 field round-tripping, (3) auditing `ResearchReport.tsx` for missing backward-compat guards, and (4) writing a Playwright e2e test for the full persistence+history flow.

The core technical finding is that **no database schema migration is needed**. The `analysis` column is `JSONB` (PostgreSQL's native binary JSON), which stores and returns the full JavaScript object verbatim. Any new fields added to `AnalysisResult` in Phase 12/13 automatically round-trip correctly through the column — Prisma passes the object through `as object` on write and `as unknown as AnalysisResult` on read, which is correct. The only work needed in `reports-db.ts` is adding `id: r.id` to the two list/read mapping functions.

The biggest real bugs found via code inspection are: (a) `listReportsFromDb` does not include `id` in the returned `StoredReport` — `ReportHistory` then constructs a fake filename and passes it as the `?report=` query param, which the web-mode API handler treats as a UUID lookup, causing 404 on every history open click; (b) three unit tests in `analysis-web-mode.test.ts` and one in `gemini-analysis.test.ts` are currently failing due to an incomplete mock of `extractCommunityHighlights` — these must be fixed as part of the test suite green gate, not deferred. The existing `reports-db.test.ts` and `history-route.test.ts` unit tests all pass (9/9).

**Primary recommendation:** Fix the `id` field bug first (types.ts + reports-db.ts + ReportHistory.tsx), then extend the existing unit tests to cover the new `id` field and Phase 12/13 round-trip, then audit `ResearchReport.tsx` backward-compat guards, then write the Playwright e2e with mocked NextAuth and mocked Gemini.

---

## Standard Stack

### Core (already installed — no new dependencies needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| prisma | ^7.5.0 | ORM + migration runner | Already in use; `prisma migrate deploy` is the migration command for production |
| @prisma/adapter-neon | ^7.5.0 | Neon serverless adapter | Required for `@neondatabase/serverless` connection pooling in Vercel |
| @neondatabase/serverless | ^1.0.2 | Neon WebSocket driver | Used in `src/lib/db.ts` |
| vitest | ^3.0.9 | Unit test runner | Already configured; `vi.mock('@/lib/db')` pattern is established |
| @playwright/test | ^1.58.2 | e2e test runner | Already configured in `playwright.config.ts` |
| next-auth | ^4.24.13 | Session management | Already in use; `getServerSession(authOptions)` is the session pattern |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| next-auth cookies | (built-in) | NextAuth session injection in Playwright | Inject `next-auth.session-token` cookie to mock auth in e2e tests |

**Installation:** No new packages required for this phase.

---

## Architecture Patterns

### Recommended Project Structure (Phase 14 additions)

```
tests/
├── unit/
│   ├── reports-db.test.ts         # EXTEND: add id-field tests + Phase 12/13 round-trip
│   └── history-route.test.ts      # EXTEND: add web-mode id navigation test
└── e2e/
    └── db-persistence.spec.ts     # NEW: Playwright e2e for full persistence+history flow
src/
├── lib/
│   ├── types.ts                   # ADD: id?: string to StoredReport
│   └── reports-db.ts              # FIX: include id in listReportsFromDb + readReportFromDb
└── components/
    ├── ReportHistory.tsx           # FIX: use report.id in web mode navigation
    └── ResearchReport.tsx          # AUDIT: backward-compat guards for Phase 12/13 fields
```

### Pattern 1: Prisma Vitest Mock (established pattern — use exactly this)

The project already uses this pattern in `tests/unit/reports-db.test.ts`. Extend it for new tests.

```typescript
// Source: existing tests/unit/reports-db.test.ts
const mockCreate = vi.fn();
const mockFindMany = vi.fn();
const mockFindFirst = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    report: {
      create: mockCreate,
      findMany: mockFindMany,
      findFirst: mockFindFirst,
    },
  },
}));

// MUST be imported AFTER mock setup
const { writeReportToDb, listReportsFromDb, readReportFromDb } = await import('@/lib/reports-db');
```

[VERIFIED: codebase inspection — tests/unit/reports-db.test.ts lines 1-20]

### Pattern 2: NextAuth Session Mock in Playwright

The locked decision is to mock NextAuth in the e2e test. The established technique for NextAuth v4 + Next.js App Router is to inject a signed session cookie directly. This avoids the real Google OAuth flow.

```typescript
// Source: NextAuth v4 test session injection pattern [CITED: next-auth.js.org/configuration/options#debug]
// The session cookie value must be a valid JWT signed with NEXTAUTH_SECRET.
// Use next-auth's encode() helper to create the token, then set the cookie.
import { encode } from 'next-auth/jwt';

const token = await encode({
  token: { email: 'e2e-test@cipher.test', name: 'E2E Test User', sub: 'e2e-test' },
  secret: process.env.NEXTAUTH_SECRET!,
});

await context.addCookies([{
  name: 'next-auth.session-token',
  value: token,
  domain: 'localhost',
  path: '/',
  httpOnly: true,
  sameSite: 'Lax',
}]);
```

[VERIFIED: codebase uses next-auth@4.24.13 which exports `encode` from `next-auth/jwt`]

### Pattern 3: Neon DB Cleanup in Playwright

After the e2e test writes a real row, clean up by importing Prisma directly in the test. Because the e2e spec runs in Node.js (not a browser), it can import server-side code directly.

```typescript
// Source: established Prisma test cleanup pattern [ASSUMED — verify Playwright Node.js context allows direct Prisma import]
import { prisma } from '@/lib/db';
// or dynamically: const { prisma } = await import('@/src/lib/db');

// In afterAll or test cleanup:
await prisma.report.deleteMany({ where: { user_id: 'e2e-test@cipher.test' } });
```

**Important caveat:** Playwright e2e tests run in a Node.js worker context. Direct Prisma import requires `DATABASE_URL` to be set in the environment when running `npm run test:e2e`. This is already true locally (`DEPLOYMENT_MODE=web` and `DATABASE_URL` are in `.env.local`). The Playwright `webServer` config auto-starts `next dev` which loads `.env.local`. The test runner itself (Playwright CLI) does NOT automatically load `.env.local` — the cleanup code must either (a) use `dotenv` to load `.env.local` before importing Prisma, or (b) call a dedicated API endpoint that performs the cleanup (safer — avoids needing DATABASE_URL in the Playwright process directly).

**Recommended approach:** Use a dedicated cleanup API route (`DELETE /api/test/cleanup` gated behind `NODE_ENV === 'test'` or a secret) called from the Playwright `afterAll`. This keeps the DB connection in the Next.js server process where `.env.local` is already loaded.

[VERIFIED: existing playwright.config.ts uses `npm run dev -- --port 3000` which loads .env.local for the server]

### Pattern 4: Mocking Gemini Analysis in Playwright

The locked decision is to mock the Gemini response so the e2e test does not trigger a real 60s research run. In the Playwright context, the most reliable approach is to intercept the API request at the route level using `page.route()`.

```typescript
// Source: Playwright route interception [CITED: playwright.dev/docs/mock]
await page.route('/api/analysis/*', async route => {
  // Return a minimal valid SSE stream with a fixture AnalysisResult
  const fixture = { /* minimal AnalysisResult */ };
  await route.fulfill({
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
    body: `data: ${JSON.stringify({ type: 'progress', message: 'Analyzing...' })}\n\n` +
          `data: ${JSON.stringify({ type: 'result', data: fixture })}\n\n`,
  });
});
```

[VERIFIED: @playwright/test@1.58.2 supports `page.route()` with `route.fulfill()` for streaming responses]

**Alternative:** Also intercept `POST /api/research/*` to skip real data collection if the Playwright test needs to navigate through the chart confirmation step. Or: navigate directly to `/research/AAPL?report=<uuid>` to bypass the analysis pipeline entirely for the "open a saved report" part of the test.

### Anti-Patterns to Avoid

- **Don't use `prisma.report.deleteMany` from the Playwright process directly** without first loading env vars — the DATABASE_URL will be undefined in the Playwright CLI process.
- **Don't construct a filename from metadata in web mode** — `toFilename()` produces `AAPL-2026-03-20T10-00-00Z.json`, not a UUID. The `[filename]/route.ts` handler uses the param as a UUID for `readReportFromDb`. Always pass `report.id` in web mode.
- **Don't add `NOT NULL` constraints or new columns** to the `analysis` JSONB column — the Phase 12/13 fields are stored inside the JSON blob, not as separate columns. No migration is needed.
- **Don't statically import Prisma** in the history route or any route that must work in local mode — dynamic import is the established pattern.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| NextAuth session mock in Playwright | Custom cookie serialization | `encode()` from `next-auth/jwt` | Handles JWT signing with NEXTAUTH_SECRET correctly |
| DB cleanup after e2e test | Manual SQL DELETE | `prisma.report.deleteMany()` via cleanup API route | Type-safe, uses existing Prisma client |
| JSONB field round-trip validation | Custom serialization | Trust Prisma's `Json` field handling | PostgreSQL JSONB preserves all JSON types; Prisma returns parsed object |
| Backward compat for missing fields | Runtime type guards | Optional chaining `?.` in JSX | Already the established pattern in ResearchReport.tsx |

---

## Bugs Found via Code Inspection

### Bug 1 (BLOCKING): `listReportsFromDb` omits `id` field
**File:** `src/lib/reports-db.ts`, lines 38-45
**What's wrong:** The `.map()` callback does not include `id: r.id`. `ReportHistory.tsx` then calls `toFilename(report)` which produces `AAPL-2026-03-20T10-00-00Z.json`. In web mode, `GET /api/history/[filename]` passes this as a UUID to `readReportFromDb(filename, userId)`. Prisma `findFirst({ where: { id: "AAPL-2026-03-20T...", user_id: "..." } })` returns null → function throws → route returns 404.
**Fix:** Add `id: r.id` to both `listReportsFromDb` map and `readReportFromDb` return value.

### Bug 2 (BLOCKING): `ReportHistory.tsx` uses filename-based navigation unconditionally
**File:** `src/components/ReportHistory.tsx`, line 91-114
**What's wrong:** `const filename = toFilename(report)` is called for every row. In web mode, the "OPEN" button passes `filename` (a constructed string) as `?report=`. The web-mode API handler expects a UUID.
**Fix:** In the onClick handler, check if `report.id` is present (web mode) and use it; otherwise fall back to `toFilename(report)` (local mode).

### Bug 3 (TEST SUITE): `extractCommunityHighlights` missing from `@/lib/gemini-analysis` mock
**Files:** `tests/unit/analysis-web-mode.test.ts` and `src/app/api/analysis/__tests__/route.test.ts`
**What's wrong:** The `vi.mock('@/lib/gemini-analysis', ...)` factory does not export `extractCommunityHighlights`. If the analysis route imports and calls this function, vitest warns and tests fail.
**Fix:** Add `extractCommunityHighlights: vi.fn().mockResolvedValue([])` to both mock factories.

### Bug 4 (RISK): `readReportFromDb` does not return `id`
**File:** `src/lib/reports-db.ts`, lines 62-69
**What's wrong:** Returns `StoredReport` without `id: row.id`. After the fix to `StoredReport` (add `id?: string`), this must also be patched to populate the field.

---

## Common Pitfalls

### Pitfall 1: Playwright session token cookie name in web mode
**What goes wrong:** NextAuth uses `next-auth.session-token` on HTTP (localhost) and `__Secure-next-auth.session-token` on HTTPS. On localhost the `__Secure-` prefix is not used.
**How to avoid:** Always inject `next-auth.session-token` (without `__Secure-` prefix) when testing against localhost.
**Warning signs:** Session returns null even though cookie was injected — check the cookie name in browser DevTools.

### Pitfall 2: `DIRECT_URL` vs `DATABASE_URL` for migrations
**What goes wrong:** `prisma.config.ts` uses `process.env.DIRECT_URL` (not `DATABASE_URL`) for migrations. If `DIRECT_URL` is not set, `prisma migrate deploy` silently uses an empty string and fails.
**How to avoid:** When running `prisma migrate status` or `prisma migrate deploy`, ensure `DIRECT_URL` is set. In `.env.local` this is present. On Vercel, both `DATABASE_URL` and `DIRECT_URL` must be configured.
**Warning signs:** `Error: Connection url is empty` from Prisma — this is exactly what was observed during research.

### Pitfall 3: Playwright `page.route()` with SSE responses
**What goes wrong:** `route.fulfill({ body: ... })` with a streaming SSE body may send the entire body at once rather than as a true stream. The frontend SSE parser must handle both chunked and complete responses.
**How to avoid:** The `ResearchProgress` component uses `substring` matching on `PROGRESS:` messages for loose coupling — a fixture that emits both `progress` and `result` events in one body string is sufficient.
**Warning signs:** Frontend shows blank/loading state indefinitely — the SSE parser received the events but the component state machine didn't transition.

### Pitfall 4: Vitest module isolation when mocking `@/lib/gemini-analysis`
**What goes wrong:** If a new export is added to `gemini-analysis.ts` (e.g., `extractCommunityHighlights` added in Phase 13) but not added to the `vi.mock` factory, vitest warns and the module mock is incomplete. Tests that rely on the mocked module may behave unexpectedly.
**How to avoid:** When mocking a module with `vi.mock(() => ({ ... }))`, explicitly mock every export the route imports. If uncertain, use `vi.mock('@/lib/gemini-analysis', async (importOriginal) => ({ ...await importOriginal(), runGeminiAnalysis: vi.fn(), scrapeCommunitySentiment: vi.fn() }))` to selectively override.

### Pitfall 5: `StoredReport` `id` field — local vs web mode divergence
**What goes wrong:** Adding `id` to `StoredReport` and making it required breaks local mode (where reports have no UUID). Making it optional (`id?: string`) means `ReportHistory` must check for its presence before using it.
**How to avoid:** Keep `id?: string` (optional). In `ReportHistory.tsx`, the navigation logic must be: `const navKey = report.id ?? toFilename(report)`. Local mode: `report.id` is undefined, falls back to filename. Web mode: `report.id` is populated.

---

## Code Examples

### Correct `listReportsFromDb` return mapping (after fix)

```typescript
// Source: src/lib/reports-db.ts — fix for DB-QA-02 (id field gap)
return rows.map((r) => ({
  id: r.id,                    // ADD THIS — UUID for web-mode navigation
  ticker: r.ticker,
  company_name: r.company_name,
  analyzed_at: r.analyzed_at.toISOString(),
  market_sentiment: r.market_sentiment as StoredReport['market_sentiment'],
  confidence_level: r.confidence_level as StoredReport['confidence_level'],
  analysis: r.analysis as unknown as AnalysisResult,
}));
```

### Correct `ReportHistory` web-mode navigation (after fix)

```typescript
// Source: src/components/ReportHistory.tsx — fix for DB-QA-02
// In web mode, report.id is the UUID from Neon; in local mode, construct filename.
const navKey = report.id ?? toFilename(report);

// In the onClick:
onClick={() => router.push(`/research/${report.ticker}?report=${encodeURIComponent(navKey)}`)}
```

### Backward-compat fixture for pre-Phase 12 report test

```typescript
// Source: pattern for DB-QA-05 unit test
const PRE_PHASE_12_RESULT = {
  ticker: 'AAPL',
  company_name: 'Apple Inc.',
  analyzed_at: '2026-03-15T10:00:00.000Z',
  market_sentiment: 'bullish' as const,
  sentiment_reasoning: 'Strong fundamentals.',
  bullish_signals: [{ signal: 'Revenue growth', source_citation: 'SEC' }],
  bearish_signals: [{ signal: 'High P/E', source_citation: 'Fundamentals' }],
  assessment: { buy_pct: 60, hold_pct: 30, sell_pct: 10,
    buy_rationale: 'Strong.', hold_rationale: 'Fair.', sell_rationale: 'Overvalued.' },
  confidence_level: 'High' as const,
  confidence_explanation: 'Multiple sources.',
  sources_used: [{ name: 'SEC', key_fact: 'Revenue' }],
  source_warnings: [],
  // NOTE: no sentiment_intelligence, future_projection, price_target, community_highlights
  //       These are all optional in AnalysisResult — must not crash ResearchReport
};
```

### Phase 12/13 round-trip test extension

```typescript
// Extend tests/unit/reports-db.test.ts — covers DB-QA-01
it('round-trips all Phase 12/13 fields through analysis JSON column', async () => {
  const phase13Result = {
    ...mockResult,
    price_target: '$195-$210',
    future_projection: 'Strong growth outlook for next 12 months.',
    sentiment_intelligence: {
      stocktwits_bull_pct: 72,
      stocktwits_bear_pct: 28,
      stocktwits_message_count: 1500,
      stocktwits_is_trending: true,
      put_call_ratio: 0.85,
      put_call_interpretation: 'bullish' as const,
    },
    community_highlights: [{ community_name: 'r/stocks', theme: 'earnings',
      sentiment: 'bullish' as const, community_type: 'mainstream' as const,
      audience: 'retail', standout_quote: 'AAPL is solid.', engagement_signal: 'high' as const }],
  };

  const dbRow = {
    id: 'uuid-phase13',
    user_id: 'user@example.com',
    ticker: 'AAPL',
    company_name: 'Apple Inc.',
    analyzed_at: new Date('2026-04-20T10:00:00.000Z'),
    market_sentiment: 'bullish',
    confidence_level: 'High',
    analysis: phase13Result,
  };

  mockFindFirst.mockResolvedValueOnce(dbRow);
  const report = await readReportFromDb('uuid-phase13', 'user@example.com');

  expect(report.id).toBe('uuid-phase13');
  expect(report.analysis.price_target).toBe('$195-$210');
  expect(report.analysis.future_projection).toBeDefined();
  expect(report.analysis.sentiment_intelligence?.stocktwits_bull_pct).toBe(72);
  expect(report.analysis.community_highlights).toHaveLength(1);
});
```

---

## Runtime State Inventory

This phase has no rename/refactor component. Skipped.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Neon DB (DATABASE_URL) | DB-QA-07, DB-QA-08 Playwright e2e | ✓ | configured in .env.local | — |
| DIRECT_URL | `prisma migrate deploy` | ✓ | configured in .env.local (confirmed DATABASE_URL key exists) | — |
| NEXTAUTH_SECRET | NextAuth session encode in Playwright | ✓ | configured in .env.local | — |
| DEPLOYMENT_MODE=web | Web-mode code path activation | ✓ | set in .env.local | — |
| Node.js | All | ✓ | 18+ (darwin) | — |
| Vitest 3.2.4 | Unit tests | ✓ | ^3.0.9 | — |
| Playwright 1.58.2 | e2e tests | ✓ | ^1.58.2 | — |

**Note on DIRECT_URL:** `prisma.config.ts` uses `process.env.DIRECT_URL` for migrations (not `DATABASE_URL`). The local `prisma migrate status` call failed with "Connection url is empty" because `DIRECT_URL` was not exported to the shell environment. This is expected — running with `npx dotenv-cli -e .env.local -- prisma migrate status` or exporting the vars first will work. This does NOT indicate a missing env var in production.

**Missing dependencies with no fallback:** None. All required dependencies are available.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Unit framework | Vitest 3.2.4 |
| Unit config | `vitest.config.ts` (root) |
| e2e framework | Playwright 1.58.2 |
| e2e config | `playwright.config.ts` (root) |
| Quick unit run | `npx vitest run tests/unit/reports-db.test.ts tests/unit/history-route.test.ts` |
| Full unit suite | `npm test` (`npx vitest run`) |
| e2e run | `npm run test:e2e` (requires `next dev` on port 3000) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DB-QA-01 | Phase 12/13 fields survive write/read cycle | unit | `npx vitest run tests/unit/reports-db.test.ts` | ✅ (extend) |
| DB-QA-02 | History shows full report list; OPEN navigates correctly | e2e | `npm run test:e2e -- --grep "db-persistence"` | ❌ Wave 0 |
| DB-QA-03 | Multiple runs = multiple distinct rows | unit | `npx vitest run tests/unit/reports-db.test.ts` | ✅ (extend) |
| DB-QA-04 | GET /api/history returns reports newest-first in web mode | unit | `npx vitest run tests/unit/history-route.test.ts` | ✅ (extend) |
| DB-QA-05 | Pre-Phase 12 report renders without crash | unit | `npx vitest run src/components/__tests__/ResearchReport.test.tsx` | ✅ (extend) |
| DB-QA-06 | readReportFromDb throws for wrong userId | unit | `npx vitest run tests/unit/reports-db.test.ts` | ✅ exists |
| DB-QA-07 | prisma migrate deploy — no pending migrations | manual smoke | `DIRECT_URL=... npx prisma migrate status` | ❌ manual only |
| DB-QA-08 | Playwright full sign-in → history → open flow | e2e | `npm run test:e2e -- --grep "db-persistence"` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/unit/reports-db.test.ts tests/unit/history-route.test.ts`
- **Per wave merge:** `npm test` (full unit suite must be green)
- **Phase gate:** Full unit suite green + Playwright e2e `db-persistence.spec.ts` green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/e2e/db-persistence.spec.ts` — covers DB-QA-02, DB-QA-08
- [ ] Extend `tests/unit/reports-db.test.ts` — covers DB-QA-01, DB-QA-03, DB-QA-06 (id field)
- [ ] Extend `src/components/__tests__/ResearchReport.test.tsx` — covers DB-QA-05 (backward compat)
- [ ] Fix `tests/unit/analysis-web-mode.test.ts` (3 failing) — add `extractCommunityHighlights` to mock
- [ ] Fix `src/app/api/analysis/__tests__/route.test.ts` (2 failing) — same mock gap
- [ ] Fix `src/lib/gemini-analysis.test.ts` (1 failing) — `extractCommunityHighlights` mock issue

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | yes | `readReportFromDb(id, userId)` — Prisma `findFirst({ where: { id, user_id } })` — user_id mismatch returns null → throws → 404 |
| V5 Input Validation | yes | History route filename param: `^[A-Z0-9.+\-_]+\.json$` regex (local mode); UUID format for web mode (implicitly validated by Prisma returning null for non-existent IDs) |
| V3 Session Management | yes | NextAuth `getServerSession(authOptions)` gates all web-mode DB operations |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Report enumeration by brute-forcing UUIDs | Information Disclosure | `readReportFromDb` requires `user_id` match — UUID alone is insufficient |
| Path traversal via `[filename]` param | Tampering | Local mode: regex gate `^[A-Z0-9.+\-_]+\.json$`; web mode: UUID treated as opaque string by Prisma |
| Cross-user report access in web mode | Information Disclosure | `findFirst({ where: { id, user_id } })` — user_id scoping is enforced at query level, not application level |

**Security note:** The per-user isolation is correctly implemented at the Prisma query level (not a post-query filter). This is the right approach — a wrong `user_id` returns `null` from the DB rather than filtering in application code.

---

## Open Questions

1. **`extractCommunityHighlights` in analysis route**
   - What we know: vitest warns that this export is missing from the `@/lib/gemini-analysis` mock in two test files, causing 3 tests to fail
   - What's unclear: whether `extractCommunityHighlights` is actually called by the analysis route or only by `gemini-analysis.ts` internally
   - Recommendation: Check `src/app/api/analysis/[ticker]/route.ts` imports. If it's not imported there, the mock warning is from a vitest ESM re-export artifact; fix by adding it to the mock factory regardless.

2. **DB-QA-07: `prisma migrate deploy` in production**
   - What we know: Two migrations exist (`20260323015956_init` + `20260327023737_add_user_credentials`). The analysis JSONB column was created in init — no migration needed for Phase 12/13 field additions.
   - What's unclear: Whether both migrations have been applied to the production Neon instance already (likely yes, since the app was working in Phases 12/13)
   - Recommendation: Run `npx dotenv -e .env.local prisma migrate status` as the first task in Wave 1 to confirm. If clean, DB-QA-07 is done. If pending, run `prisma migrate deploy`.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | JSONB column stores and returns all new AnalysisResult fields without any serialization loss | Standard Stack / Bug analysis | LOW — JSONB is PostgreSQL's native JSON binary format, verified by schema inspection |
| A2 | `encode()` from `next-auth/jwt` is the correct API for creating test session tokens in next-auth@4.24.13 | Architecture Patterns | MEDIUM — if API changed, Playwright session injection will fail; fallback is to use `jsonwebtoken` directly with NEXTAUTH_SECRET |
| A3 | The Playwright test process itself does NOT have DATABASE_URL available (only the Next.js dev server does via .env.local) | Architecture Patterns / Pitfalls | MEDIUM — if Playwright CLI also loads .env.local, direct Prisma import in tests would work; fallback cleanup via API route is safer regardless |

---

## Sources

### Primary (HIGH confidence)
- `src/lib/reports-db.ts` (full read) — confirmed id field gap in listReportsFromDb and readReportFromDb
- `src/components/ReportHistory.tsx` (full read) — confirmed toFilename() used unconditionally for navigation
- `prisma/schema.prisma` (full read) — confirmed `analysis Json` (JSONB) column, no pending schema changes needed
- `prisma/migrations/20260323015956_init/migration.sql` (full read) — confirmed JSONB type
- `src/lib/types.ts` (full read) — confirmed all Phase 12/13 fields are `?` optional in AnalysisResult
- `src/components/ResearchReport.tsx` (full read) — confirmed conditional rendering for most optional fields
- `tests/unit/reports-db.test.ts` (full read) — confirmed existing test coverage and passing state
- `vitest run tests/unit/reports-db.test.ts tests/unit/history-route.test.ts` — 9/9 passing [VERIFIED]
- `vitest run` (full suite) — 3 files failing, 6 tests failing due to missing extractCommunityHighlights mock [VERIFIED]

### Secondary (MEDIUM confidence)
- NextAuth v4 `encode()` from `next-auth/jwt` for test session injection — training knowledge, matches documented pattern [ASSUMED]
- Playwright `page.route().fulfill()` for SSE mock — consistent with @playwright/test@1.58.2 API [CITED: playwright.dev/docs/mock]

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all tooling verified by running test suite
- Architecture: HIGH — all patterns derived from existing codebase code inspection
- Pitfalls: HIGH — most pitfalls identified from actual failing tests and direct code reading
- Playwright e2e patterns: MEDIUM — NextAuth session injection and SSE mocking are training knowledge (A1, A2 in assumptions log)

**Research date:** 2026-04-23
**Valid until:** 2026-05-23 (stable stack — Prisma, NextAuth, Playwright versions are pinned)
