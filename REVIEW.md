# Cipher — Comprehensive Code Review

**Reviewed:** 2026-04-25
**Depth:** deep (full codebase — all API routes, lib, components, scripts)
**Files Reviewed:** 40+ source files across `src/`, `scripts/`, config

---

## Summary

Cipher is a well-structured Next.js 15 financial research application. The architecture is clean with good separation of concerns between data collection, analysis, and presentation layers. Error handling in the data pipeline is generally solid (Promise.allSettled throughout). The most serious findings are a **hardcoded production secret file committed to the repository** and a **path-traversal bypass** in the analysis route's tmpdir guard. Several high-severity issues exist around ticker/query input validation, module-level singleton state, and the test cleanup route being reachable in non-production environments. The frontend has minor type-safety gaps and a duplicated sign-out button.

---

## CRITICAL Issues

### CR-01: Production secrets committed to `.env.local`

**File:** `.env.local` (lines 4–27)
**Issue:** The file `.env.local` is tracked in the repository (confirmed present at the project root, not just in worktrees). It contains live production credentials:
- `ANTHROPIC_API_KEY=sk-ant-api03-rjcRVwKc...` — active Anthropic API key
- `DATABASE_URL` with credentials for the production Neon database
- `GOOGLE_CLIENT_SECRET=GOCSPX-ERw6vJ...` — active Google OAuth secret
- `NEXTAUTH_SECRET` — active JWT signing secret
- `CREDENTIAL_ENCRYPTION_KEY` — AES-256-GCM key for stored user credentials
- `FINNHUB_API_KEY`, `POLYGON_API_KEY`, `FIRECRAWL_API_KEY` — all live

Anyone with read access to this repository has full access to the production database, can impersonate users via forged JWTs, and can use all paid API keys. The `CONTAINER_SECRET` and `VERCEL_OIDC_TOKEN` are also exposed.

**Fix:**
1. Immediately rotate all secrets listed in `.env.local`.
2. Add `.env.local` to `.gitignore` if not already present.
3. Remove the file from git history: `git filter-branch` or `git-filter-repo`.
4. Store secrets only in Vercel environment variables (dashboard) or a secrets manager.

---

### CR-02: Path-traversal bypass in `/api/analysis/[ticker]` tmpdir guard

**File:** `src/app/api/analysis/[ticker]/route.ts` (lines 34–53, 83)
**Issue:** The route validates that `filePath` resolves within `os.tmpdir()` using `realpathSync`. However, when the target file does not yet exist (which is the normal case — the file was written by the research route earlier), the fallback at line 42–46 calls `realpathSync(dirname(resolvedPath))` but the join uses a hardcoded `'/'` separator (line 43) rather than `path.join()`, breaking on Windows and producing incorrect paths on any platform where the canonical tmpdir path ends differently. More critically, the **file is then read at `resolvedPath` (line 83), not at `canonicalPath`**. An attacker who can construct a path where the parent directory is inside tmpdir but the filename component contains `../` sequences that resolve to a location outside tmpdir could bypass the guard.

```typescript
// Line 83 reads resolvedPath (user-controlled), NOT canonicalPath (validated)
const pkg: SourcePackage = JSON.parse(await readFile(resolvedPath, 'utf-8'));
```

**Fix:** Read `canonicalPath`, not `resolvedPath`, and use `path.join()` instead of string concatenation with `'/'`:
```typescript
// Line 43: use path.join instead of string concatenation
canonicalPath = path.join(realpathSync(dirname(resolvedPath)), basename(resolvedPath));

// Line 83: read canonicalPath, not resolvedPath
const pkg: SourcePackage = JSON.parse(await readFile(canonicalPath, 'utf-8'));
```

---

### CR-03: `/api/test/cleanup` route is accessible in any non-production environment, including staging

**File:** `src/app/api/test/cleanup/route.ts` (lines 12–13)
**Issue:** The route is gated on `NODE_ENV !== 'production'`. On Vercel, preview/staging deployments also set `NODE_ENV=production`, so this is actually safe on Vercel. However, `DEPLOYMENT_MODE=web` staging environments running elsewhere (e.g., a developer's local box with `DEPLOYMENT_MODE=web`) will serve this route with only the `TEST_CLEANUP_SECRET` header as protection. The `TEST_CLEANUP_SECRET` value is committed in `.env.local` (see CR-01), so an attacker who reads that file can delete all e2e test data from the Neon database. Additionally, the POST handler (line 33) accepts an `AnalysisResult` payload without any validation and writes it directly to the database as any user — the `e2e-test@cipher.test` user is hardcoded but there is no schema validation on `analysis`.

**Fix:**
1. After fixing CR-01 (rotating secrets), rotate `TEST_CLEANUP_SECRET` as well.
2. Add Zod validation on the POST body before writing to the database.
3. Consider gating on an additional environment variable flag (e.g. `E2E_ENABLED=true`) that is never set in staging, rather than relying solely on `NODE_ENV`.

---

## HIGH Issues

### HI-01: Ticker parameter not validated in multiple API routes — allows arbitrary strings to reach external APIs

**Files:**
- `src/app/api/research/[ticker]/route.ts` (line 34 — validation check occurs AFTER the yahoo quote call at line 47)
- `src/app/api/ticker/chart/route.ts` (no ticker format validation — the symbol from the query parameter is passed directly to `yahooFinance.chart()`)
- `src/app/api/market-snapshot/route.ts` (hardcoded tickers — safe)

**Issue:** The `ticker` parameter from URL path segments (e.g. `POST /api/research/SOME<ARBITRARY>STRING`) is not validated for format before being passed to `yf.quote()`, `yahooFinance.chart()`, and `encodeURIComponent()` calls to Finnhub/Polygon/StockTwits. While `encodeURIComponent` prevents HTTP injection, very long inputs or inputs with special characters could cause unexpected behavior or log noise. The check `if (!ticker || typeof ticker !== 'string')` in the research route occurs on line 34, *after* the `await params` destructuring at line 23 and *after* the `yf.quote()` call at line 47.

**Fix:** Validate ticker format early, before any external API calls:
```typescript
const upperTicker = ticker.toUpperCase();
if (!/^[A-Z0-9.\-^=]{1,20}$/.test(upperTicker)) {
  return NextResponse.json({ error: 'Invalid ticker format' }, { status: 400 });
}
```

---

### HI-02: Module-level mutable singleton `_lastCommunityScrapePageCount` creates race condition under concurrent requests

**File:** `src/lib/gemini-analysis.ts` (lines 18, 273, 367, 527)
**Issue:** `_lastCommunityScrapePageCount` is a module-level `let` variable mutated by `scrapeCommunitySentiment()` and read by `runGeminiAnalysis()`. In a serverless (Vercel Function) environment, multiple concurrent requests share the same module instance within the same warm container. If two analysis requests are in flight simultaneously:
1. Request A calls `scrapeCommunitySentiment()`, sets `_lastCommunityScrapePageCount = 5`
2. Request B calls `scrapeCommunitySentiment()`, sets `_lastCommunityScrapePageCount = 3`
3. Request A's `runGeminiAnalysis()` reads `3` (B's value) — wrong

**Fix:** Return the page count from `scrapeCommunitySentiment()` as part of its return value, eliminate the module-level variable:
```typescript
// Change return type of scrapeCommunitySentiment
return {
  pinnedContent: allPinnedPages.join('\n\n---\n\n'),
  nicheContent: nichePages.join('\n\n---\n\n'),
  nicheUrls: uniqueNiche,
  pageCount: allPinnedPages.length + nichePages.length,  // add this
};
// Then pass pageCount into runGeminiAnalysis() rather than reading _lastCommunityScrapePageCount
```

---

### HI-03: `filePath` from client is passed to filesystem read — no authentication check on analysis route

**File:** `src/app/api/analysis/[ticker]/route.ts` (lines 29, 83)
**Issue:** The `filePath` value arrives from the client request body (`await request.json()`). While the tmpdir guard (partially) mitigates path traversal, there is no authentication check on this route in web mode. Any unauthenticated caller can POST to `/api/analysis/AAPL` with an arbitrary `filePath` value pointing to any file in `/tmp`. The middleware excludes `api/auth` and `api/test` from auth enforcement (line 30 of `middleware.ts`) but does NOT exclude `api/analysis` — however, the middleware only runs in `NEXT_PUBLIC_DEPLOYMENT_MODE=web`. In web mode the middleware protects the route. In local mode there is no auth, but the tmpdir guard should still prevent reading arbitrary files.

This is lower-risk than CR-02 but the combination of unauthenticated tmpdir-scoped reads + the bypass in CR-02 makes this a high priority after CR-02 is fixed.

**Fix:** In web mode, verify the session before reading the file, consistent with how other routes handle it:
```typescript
if (process.env.DEPLOYMENT_MODE === 'web') {
  const { getServerSession } = await import('next-auth/next');
  const { authOptions } = await import('@/lib/auth');
  const sess = await getServerSession(authOptions);
  if (!sess?.user?.email) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
}
```

---

### HI-04: `reports.ts` reads arbitrary filenames from the filesystem without path canonicalization in local mode

**File:** `src/app/api/history/[filename]/route.ts` (lines 57–65) and `src/lib/reports.ts` (line 36)
**Issue:** In local mode, the filename regex on line 57 allows alphanumeric, hyphens, underscores, dots, and `+`. The regex is `^[A-Z0-9.+\-_]+\.json$` (case-insensitive). The `.` character in a character class is literal, not a wildcard — that part is correct. However, the path is constructed as `path.join(REPORTS_DIR, filename)` in `readReport()` with no further canonicalization. `REPORTS_DIR` is `~/.cipher/reports/`. A filename like `../../.ssh/authorized_keys.json` would be rejected by the regex (the `/` is not allowed), so the immediate threat is blocked. However, filenames containing `..` without slashes (e.g. `..json`) pass the regex and would simply fail to find a file — not exploitable. This is lower risk but the defense should be explicit.

**Fix:** After joining, verify the resolved path starts with `REPORTS_DIR`:
```typescript
const filePath = path.join(REPORTS_DIR, filename);
if (!filePath.startsWith(path.resolve(REPORTS_DIR) + path.sep)) {
  return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
}
```

---

### HI-05: `accessToken` exposed on session object via `as any` cast — Google OAuth token leaked to all server-side session reads

**File:** `src/lib/auth.ts` (lines 27–29)
**Issue:** The session callback casts the session to `any` and writes `accessToken` onto it. This Google OAuth access token is then available to every `getServerSession()` call throughout the application. Comments say it is "for Daytona proxy requests" but the Daytona integration is Phase 4 / future work. The token is persisted in the JWT, which means it is included in the session cookie sent to the client on every request. If any future code renders `session.accessToken` into a page or if the JWT is decoded client-side, the raw Google access token is exposed.

**Fix:** Remove the `accessToken` from the session until it is actually needed. If Daytona proxy needs it, scope the token read to that specific route rather than embedding it globally in the session type.

---

## MEDIUM Issues

### ME-01: Ticker search performs N+1 serial-equivalent Yahoo Finance `quote()` calls with no timeout

**File:** `src/app/api/ticker/search/route.ts` (lines 26–47)
**Issue:** Up to 8 `yf.quote(symbol)` calls are fired via `Promise.all()` for each search request. While `Promise.all` runs them concurrently, each call has no explicit timeout. A slow or unresponsive Yahoo Finance response will block all 8 calls with no timeout, potentially hanging the API response for the browser's full 2-minute serverless function timeout. This is especially problematic for the landing page search experience.

**Fix:** Add `AbortSignal.timeout()` to each quote call or implement a per-request timeout wrapper. Alternatively, cap at 4 results instead of 8 for the search use case.

---

### ME-02: `getMarketStatus()` duplicated identically in two page files

**Files:** `src/app/page.tsx` (lines 17–27) and `src/app/dashboard/page.tsx` (lines 32–42)
**Issue:** The `getMarketStatus()` function is copied verbatim across both files. Any fix (e.g., handling market holidays) must be applied in two places. This is a maintainability issue.

**Fix:** Extract to `src/lib/market-status.ts` and import in both pages.

---

### ME-03: `ResearchProgress` renders an IIFE inside JSX for error state — confusing pattern

**File:** `src/components/ResearchProgress.tsx` (lines 292–318)
**Issue:** The error state uses an immediately-invoked function expression (IIFE) inside JSX: `{errorMessage && (() => { ... })()}`. This is an unusual pattern that is hard to read, and the IIFE is re-evaluated on every render. It is functionally correct but represents a code quality issue that could confuse contributors.

**Fix:** Extract to a named helper component or a simple conditional block:
```tsx
{errorMessage && <ErrorPanel message={errorMessage} onRetry={onRetry} />}
```

---

### ME-04: `ReportHistory` uses `toFilename()` as navigation key for pre-Phase-14 local reports, but the server already returns an `id` field when available — the fallback reconstruction could produce a non-matching filename

**File:** `src/components/ReportHistory.tsx` (lines 13–16, 91)
**Issue:** `toFilename(report)` reconstructs the filename from `analyzed_at` using `replace(/:/g, '-')`. This is exactly how `writeReport()` in `reports.ts` generates the filename, so it should match. However, in web mode, `report.id` is a UUID and is correctly used as the nav key. The `toFilename()` fallback for pre-Phase-14 reports that lack an `id` reconstructs the filename, but if the original report was written on a system with a different timezone offset (e.g., `+00-00` vs `Z`), the reconstructed name could differ from the actual file on disk.

**Fix:** Have the API return a stable `filename` field alongside `id` for local-mode reports, removing the need for client-side reconstruction.

---

### ME-05: `TickerSearch` does not debounce the case-conversion in `handleInputChange` — `search()` is debounced but the uppercase transform fires on every keystroke

**File:** `src/components/TickerSearch.tsx` (lines 73–83)
**Issue:** `handleInputChange` immediately calls `setQuery(value.toUpperCase())` and then `search(value)`. The `search` function is debounced at 300ms, so the API call is correctly throttled. However, React re-renders the component on every character typed (due to `setQuery`). This is normal React behavior and is not a bug — but the keyboard-navigation hint in the dropdown footer ("↑↓ navigate · ↵ select") is displayed without any actual keyboard navigation implementation. Users who see the hint and try to use arrow keys will find it does nothing.

**Fix:** Either implement keyboard navigation (arrow key selection from dropdown), or remove the misleading hint text.

---

### ME-06: `formatResearchBrief` does not include news headlines in the brief — only URLs are sent to Gemini separately

**File:** `src/lib/research-brief.ts` (lines 79–162) and `src/lib/gemini-analysis.ts` (lines 479, 483)
**Issue:** `formatResearchBrief()` formats market data, fundamentals, analyst sentiment, SEC filings, and social sentiment — but does not include the news headlines or their publication dates. News headlines are extracted as bare URLs by `extractNewsUrls()` and appended to the Gemini prompt separately. Gemini receives URLs but not the headline text, source name, or publication date. This reduces the quality of the synthesis since Gemini can see the URL structure but not the article title unless it has web browsing capabilities.

**Fix:** Include news headlines in the research brief section alongside the URLs:
```typescript
lines.push('--- NEWS ---');
for (const item of pkg.news.items.slice(0, 15)) {
  lines.push(`[${item.published_date}] ${item.headline} (${item.source})`);
  lines.push(`  URL: ${item.url}`);
}
```

---

### ME-07: `analysis` field stored as `result as object` in Prisma — bypasses type safety at the database boundary

**File:** `src/lib/reports-db.ts` (line 23)
**Issue:** `analysis: result as object` casts the full `AnalysisResult` to `object` for Prisma storage. On retrieval (lines 45, 65), it is cast back with `r.analysis as unknown as AnalysisResult`. There is no runtime validation that the retrieved JSON conforms to the `AnalysisResult` schema. If the schema evolves (new required fields added), old stored reports missing those fields will pass the TypeScript type checker but fail at runtime when components try to access the new fields.

**Fix:** Add Zod validation on retrieval using `AnalysisResultSchema.parse()` or a safe-parse with a fallback:
```typescript
// In mapRow(), after deserializing:
const parsed = AnalysisResultSchema.safeParse(r.analysis);
if (!parsed.success) {
  // log warning, return partial data
}
```

---

### ME-08: `percent_change_today` has an inconsistent unit convention — divided by 100 in `yahoo.ts` but ChartConfirmation multiplies by 100 for display

**Files:** `src/lib/data/yahoo.ts` (line 66) and `src/components/ChartConfirmation.tsx` (line 65)
**Issue:** `fetchMarketData()` divides `regularMarketChangePercent` by 100 to store it as a decimal fraction (comment on line 65 confirms this). But `ChartConfirmation.tsx` correctly multiplies `percentChange` by 100 for display (line 65). However, `market-snapshot/route.ts` (line 38) reads `regularMarketChangePercent` directly from `yf.quote()` (not from `fetchMarketData()`), does NOT divide by 100, and formats it directly with `.toFixed(2)%`. This means the landing page market snapshot and dashboard show the change correctly, while `ResearchReport.tsx` calls `formatPercent(s?.percent_change_today)` which multiplies by 100 again — applied to a value already divided by 100. The result would be correct (divide by 100, then multiply by 100 in formatPercent = original value). So no user-visible bug exists today, but the inconsistent convention is a maintainability hazard.

**Fix:** Add an explicit code comment at the `AnalysisResult.market_snapshot.percent_change_today` field documenting the unit as "decimal fraction (0.01 = 1%)" and verify all consumption sites use `formatPercent()` consistently.

---

## LOW Issues

### LO-01: Duplicate "Sign Out" button on dashboard — two buttons trigger identical `signOut()` action

**File:** `src/app/dashboard/page.tsx` (lines 149–153, 174–182)
**Issue:** The dashboard renders two sign-out triggers: a text button in the Account card (line 150) and a grid tile button (line 175). Both call `signOut({ callbackUrl: '/auth/signin' })`. This creates redundancy and makes the UI feel inconsistent.

**Fix:** Remove the grid tile sign-out button and keep only the account card button.

---

### LO-02: `auth.ts` uses `as any` cast to add `accessToken` to session — type-unsafe

**File:** `src/lib/auth.ts` (line 28)
**Issue:** `(session as any).accessToken = token.accessToken` bypasses TypeScript's type system. Combined with HI-05, this is both a type-safety and a security concern.

**Fix:** Extend the NextAuth session type declarations:
```typescript
declare module 'next-auth' {
  interface Session { accessToken?: string }
}
declare module 'next-auth/jwt' {
  interface JWT { accessToken?: string }
}
```

---

### LO-03: `db.ts` uses non-null assertion on `DATABASE_URL` — crashes on module load if env var is missing

**File:** `src/lib/db.ts` (line 12)
**Issue:** `process.env.DATABASE_URL!` will throw a runtime error at module initialization time if the variable is not set. In local mode without a `DATABASE_URL`, any code path that triggers a dynamic import of `@/lib/db` will crash the process rather than returning a graceful error.

**Fix:** Add an explicit guard:
```typescript
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required in web mode. Not set in current environment.');
}
const adapter = new PrismaNeon({ connectionString });
```

Note: The dynamic imports in other routes (`await import('@/lib/reports-db')`) mean `db.ts` is only loaded when those code paths execute, so this is not a startup crash — it is a runtime crash in web-mode code paths when `DATABASE_URL` is missing. Still, the error message from the non-null assertion is less helpful than an explicit check.

---

### LO-04: `Md` component in `ResearchReport.tsx` uses array index as React key — can cause reconciliation bugs with re-ordered content

**File:** `src/components/ResearchReport.tsx` (lines 20–33)
**Issue:** The `Md` component maps over `parts` with `key={i}` and nested `key={\`${i}-${j}\`}`. Since the parts array is derived from splitting a string, indices are stable for any given string — this is not a bug in practice. However, if `text` changes (e.g., streaming updates), React may reuse DOM nodes incorrectly. For a static rendered report this is fine.

**Fix:** No immediate action needed for static report renders. If SSE streaming of partial text is ever added, use content-based keys.

---

### LO-05: `extractCommunityHighlights` regex uses greedy `[\s\S]*` — could match across multiple JSON arrays in a response

**File:** `src/lib/gemini-analysis.ts` (line 419)
**Issue:** `const arrayMatch = cleaned.match(/\[[\s\S]*\]/);` uses a greedy match. If Haiku's response contains multiple JSON arrays (e.g., an explanation followed by the actual data array), this will match from the first `[` to the last `]`, potentially including content between the arrays and producing a parse error or invalid result. The same pattern appears in `scrapeCommunitySentiment()` (line 338), where `[\s\S]*?` is correctly non-greedy.

**Fix:** Use the non-greedy `[\s\S]*?` pattern consistently:
```typescript
const arrayMatch = cleaned.match(/\[[\s\S]*?\]/);
```

---

### LO-06: `cleanupSourcePackage` in `temp-file.ts` is exported but never called — temp files accumulate in `/tmp`

**File:** `src/lib/temp-file.ts` (lines 23–30)
**Issue:** `cleanupSourcePackage()` exists but is never imported or called by the analysis route or any other code. Each research run writes a new temp directory and JSON file to `os.tmpdir()` that is never explicitly cleaned up. On long-running servers this will accumulate. On Vercel Functions the ephemeral filesystem is discarded between invocations, so this is only a real issue in local mode.

**Fix:** Call `cleanupSourcePackage(filePath)` at the end of the analysis pipeline in `src/app/api/analysis/[ticker]/route.ts` after the result is streamed.

---

### LO-07: `src/app/research/[ticker]/page.tsx` — `isAuthExpired` condition has operator precedence bug

**File:** `src/app/research/[ticker]/page.tsx` (lines 154–157)
**Issue:**
```typescript
const isAuthExpired =
  errorMessage?.toLowerCase().includes('authentication expired') ||
  errorMessage?.toLowerCase().includes('auth') && (errorMessage?.toLowerCase().includes('expired') || errorMessage?.toLowerCase().includes('invalid')) ||
  ...
```
The `&&` operator on line 155 binds more tightly than `||`, so the expression is correctly parsed as intended by the developer. However, the lack of explicit parentheses around the `&&` clause makes it ambiguous to readers and increases bug risk if the condition is later modified. This is also duplicated from the same logic in `ResearchProgress.tsx`'s `classifyError()` function (line 23), creating two divergent error classification implementations.

**Fix:** Add explicit parentheses and consolidate into the shared `classifyError()` utility in `ResearchProgress.tsx` (or move it to `src/lib/error-utils.ts`).

---

### LO-08: `DIRECT_URL` environment variable set to `"\n"` in `.env.local` — likely a misconfiguration

**File:** `.env.local` (line 11)
**Issue:** `DIRECT_URL="\n"` appears to be a placeholder or accidental value. The `.env.example` file shows `DIRECT_URL` as a proper direct (non-pooled) Neon connection string. Prisma uses `DIRECT_URL` for migrations. If migrations are run with this value, they will fail with a confusing error.

**Fix:** Set `DIRECT_URL` to the correct non-pooled Neon connection string, or remove it if not needed.

---

### LO-09: `src/app/page.tsx` — landing page shows "Sign In to Get Started" CTA unconditionally in web mode, even for already-signed-in users

**File:** `src/app/page.tsx` (lines 198–208)
**Issue:** In web mode, the search bar that appears after the scroll animation always renders a "Sign In" link, regardless of whether the user is already authenticated. An authenticated user scrolling the landing page will see "Sign In" and be redirected to `/auth/signin` which then redirects them back.

**Fix:** In web mode, check session status and render the `TickerSearch` component for authenticated users, or redirect them directly to `/dashboard`.

---

### LO-10: `StockTwits` API has no rate-limit handling — silent 429 masquerading as empty data

**File:** `src/lib/data/stocktwits.ts` (lines 52–53)
**Issue:** `if (!res.ok) return empty(...)` returns an empty result for any non-200 response including 429 (rate limited). A rate-limited response will cause the sentiment intelligence section to show nulls with no indication to the user or developer that rate limiting is occurring.

**Fix:** Log the status code in the error return:
```typescript
if (!res.ok) return empty(`StockTwits API error: ${res.status} ${res.statusText}`);
```

---

_Reviewed: 2026-04-25_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
