---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
stopped_at: Phase 8 UI-SPEC approved
last_updated: "2026-03-26T04:28:31.462Z"
progress:
  total_phases: 10
  completed_phases: 7
  total_plans: 28
  completed_plans: 28
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-10)

**Core value:** Given a ticker, return a clear, evidence-backed research report with transparent reasoning and traceable sources — no hallucinated conclusions, only what the data supports.
**Current focus:** Phase 07 — Research Quality & Special Situation Coverage

## Current Position

Phase: 07 (Research Quality & Special Situation Coverage) — EXECUTING
Plan: 1 of 4

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01-data-pipeline P01 | 25 | 2 tasks | 8 files |
| Phase 01-data-pipeline P04 | 5 | 1 tasks | 2 files |
| Phase 01-data-pipeline P03 | 15 | 1 tasks | 2 files |
| Phase 01-data-pipeline P02 | 9 | 3 tasks | 9 files |
| Phase 01-data-pipeline P05 | 4 | 3 tasks | 6 files |
| Phase 02-research-integration P02 | 3 | 3 tasks | 2 files |
| Phase 02-research-integration P01 | 3 | 2 tasks | 7 files |
| Phase 02-research-integration P03 | 3 | 2 tasks | 1 files |
| Phase 02-research-integration P04 | 3 | 2 tasks | 7 files |
| Phase 02-research-integration P04 | 3 | 3 tasks | 7 files |
| Phase 03-report-output P01 | 161 | 2 tasks | 5 files |
| Phase 03-report-output P02 | 2 | 2 tasks | 3 files |
| Phase 03-report-output P03 | continuation | 3 tasks | 7 files |
| Phase 04-deployment P01 | 225 | 2 tasks | 4 files |
| Phase 04-deployment P02 | 3 | 2 tasks | 3 files |
| Phase 04-deployment P03 | 2 | 1 tasks | 3 files |
| Phase 05-user-identity-report-history P01 | 151 | 3 tasks | 5 files |
| Phase 05-user-identity-report-history P02 | 103 | 2 tasks | 4 files |
| Phase 05-user-identity-report-history P04 | 5 | 1 tasks | 1 files |
| Phase 05-user-identity-report-history P03 | 54 | 3 tasks | 3 files |
| Phase 05-user-identity-report-history P05 | 525892 | 1 tasks | 1 files |
| Phase 06-full-web-deployment-vercel-database-auth-report-account-persistence PP01 | 279 | 3 tasks | 10 files |
| Phase 06-full-web-deployment-vercel-database-auth-report-account-persistence P03 | 3 | 3 tasks | 6 files |
| Phase 06-full-web-deployment-vercel-database-auth-report-account-persistence P02 | 10 | 3 tasks | 5 files |
| Phase 06-full-web-deployment-vercel-database-auth-report-account-persistence P04 | 21 | 2 tasks | 7 files |
| Phase 07 P01 | 8 | 3 tasks | 7 files |
| Phase 07 P02 | 307 | 2 tasks | 3 files |
| Phase 07 P03 | 69 | 1 tasks | 1 files |
| Phase 07 P04 | 15 | 4 tasks | 3 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 4-phase structure derived from natural requirement clusters — data pipeline → research integration → report output → deployment
- [Roadmap]: REPT-04 (data timestamp) placed in Phase 1 scope, rendered in Phase 3 output
- [Roadmap]: Phase 2 requires NotebookLM API verification spike as first plan before any integration work
- [Phase 1 data sources]: yahoo-finance2 (free, no key) for structured market data; Anthropic web search for news, SEC summaries, analyst content, sentiment — Finnhub, SEC EDGAR direct, and Reddit/Stocktwits APIs removed from scope
- [Phase 01-data-pipeline]: Next.js 16.1.6-canary (npm latest) downgraded to 15.3.9 stable — v16 missing type declarations; always pin Next.js major version
- [Phase 01-data-pipeline]: Wave 0 TDD stubs use dynamic await import() inside it() blocks so vitest collects 13 tests before failing at runtime rather than crashing at parse time
- [Phase 01-data-pipeline]: claude-3-5-haiku-latest for Anthropic web search functions — cost efficiency for structured data extraction
- [Phase 01-data-pipeline]: max_uses: 3 per web_search tool call caps cost to ~/bin/zsh.04 per full research run (4 functions x 3 max searches)
- [Phase 01-data-pipeline]: yahoo-finance2 v3: typeDisp is lowercase 'equity'; DefaultKeyStatistics index signature requires type casts for trailingPE/trailingEps/debtToEquity
- [Phase 01-data-pipeline]: lightweight-charts v5 uses addSeries(LineSeries) not addLineSeries() — verified from typings before implementing
- [Phase 01-data-pipeline]: yahoo-finance2 v3 typeDisp is lowercase 'equity' not 'Equity' — fixed in search route
- [Phase 01-data-pipeline]: Confirm button routes to /research/ticker/pipeline — placeholder until plan 01-05 builds the route
- [Phase 01-data-pipeline]: Promise.allSettled with settle() helper for parallel data collection — single-source failures recorded in collection_errors[], pipeline never aborts
- [Phase 01-data-pipeline]: Source package temp file format: os.tmpdir()/ticker-research-XXXX/{TICKER}-{timestamp}.json — path returned via JSON response and displayed in ChartConfirmation success state for Phase 2 handoff
- [Phase 01-data-pipeline]: collectAllData() companyName and exchange optional with defaults — Wave 0 stubs calling with single arg remain valid
- [Phase 02-research-integration]: formatResearchBrief uses lines array joined with newline for multi-section plain-text output; fmtLargeNum uses Math.abs for threshold check; extractNewsUrls breaks at 15 during loop for single-pass efficiency
- [Phase 02-research-integration]: storage_state.json used as auth file path (not auth.json) per RESEARCH.md critical discovery
- [Phase 02-research-integration]: page.tsx converted to client component to support useEffect status fetch on mount
- [Phase 02-research-integration]: Install step auto-triggers when pythonOk but not notebooklmOk; auth step is the only manual user action
- [Phase 02-research-integration]: Graceful ImportError guard added to notebooklm_research.py so argv validation works even without notebooklm-py installed
- [Phase 02-research-integration]: Assessment percentage normalization: clamp 0-100 first, then proportional scale, final sell_pct avoids rounding drift
- [Phase 02-research-integration]: Research page converted from async server component to 'use client' component to support URL-driven analysis state machine
- [Phase 02-research-integration]: ResearchProgress step matching uses lowercase substring match on PROGRESS: messages for loose coupling to Python script output format
- [Phase 02-research-integration]: Human verification approved full Phase 2 end-to-end flow: ticker search → chart confirm → SourcePackage → SSE analysis stream → AnalysisResult rendered in research page
- [Phase 03-report-output]: formatTimestamp uses Intl.DateTimeFormat with timeZone UTC for consistent cross-environment output
- [Phase 03-report-output]: Wave 0 stubs use dynamic await import() inside it() blocks — ResearchReport.test.tsx fails at runtime not parse time until Plan 02 creates the component
- [Phase 03-report-output]: window.onafterprint used to restore document.title instead of setTimeout — avoids race condition with print dialog still open
- [Phase 03-report-output]: ResearchReport is a single self-contained component with local helpers — simpler than separate files at this scale
- [Phase 03-report-output]: Terminal color palette applied uniformly across all components — zinc-950 backgrounds, amber-400 accents, no per-component variations
- [Phase 03-report-output]: bg-zinc-950 on body in layout.tsx eliminates white flash between page navigations before component CSS loads
- [Phase 03-report-output]: All rounded-xl and shadow-sm removed globally — terminal aesthetic requires flat sharp-edged surfaces throughout
- [Phase 04-deployment]: prestart npm hook runs setup.sh before every npm start — validates Node 18+, Python 3.10+, ANTHROPIC_API_KEY
- [Phase 04-deployment]: start script changed to 'next build && next start' — prevents 'Could not find production build' error on fresh clone
- [Phase 04-deployment]: Use mcr.microsoft.com/devcontainers/python:3.12 (Ubuntu/glibc) not Alpine — Playwright requires glibc
- [Phase 04-deployment]: playwright install --with-deps chromium required — installs OS-level libs (libnss3, libgbm) needed for headless Chromium on Linux
- [Phase 04-deployment]: maxDuration=300 applied only to analysis and research routes — not globally — to preserve cold-start optimization on fast routes
- [Phase 04-deployment]: export const dynamic = 'force-dynamic' added to analysis and research routes — required for Vercel to evaluate DEPLOYMENT_MODE at request time not build time
- [Phase 04-deployment]: maxDuration reduced from 600 to 300 in analysis route — cloud path is a proxy only (Daytona container handles actual work), Vercel Hobby cap is 300s
- [Phase 05-user-identity-report-history]: StoredReport duplicates top-level metadata for fast list reads without loading full analysis
- [Phase 05-user-identity-report-history]: Filename format TICKER-YYYY-MM-DDTHH-MM-SSZ.json — colons sanitized to dashes, milliseconds stripped
- [Phase 05-user-identity-report-history]: get_email.py FILTER_WORDS includes google.com to exclude Google-internal addresses on myaccount.google.com
- [Phase 05-user-identity-report-history]: Module-level cachedEmail avoids repeated Playwright startup on consecutive setup/status checks
- [Phase 05-user-identity-report-history]: IIFE async pattern in sync stdout callback enables await writeReport without changing Node.js event emitter callback signature
- [Phase 05-user-identity-report-history]: writeReport failure is non-fatal — streaming result continues; error logged server-side only
- [Phase 05-user-identity-report-history]: reportFile useEffect placed first for unconditional priority over filePath and chart-fetch effects
- [Phase 05-user-identity-report-history]: Mutual exclusivity enforced with if (reportFile) return guards in all other useEffects on research page
- [Phase 05-user-identity-report-history]: NavBar on research page fetches /api/setup/status independently — no shared context needed at this scale
- [Phase 05]: waitForPageReady() uses waitForSelector(visible) + waitForSelector(hidden) pattern for INITIALIZING SYSTEM... — correctly sequences around async useEffect /api/setup/status fetch
- [Phase 06]: Option C dual-login: NextAuth Google OAuth for app auth + separate notebooklm login per user — notebooklm-py uses cookies not OAuth tokens
- [Phase 06]: Prisma 7 breaking change: url/directUrl moved from schema datasource block to prisma.config.ts
- [Phase 06]: PrismaNeon@7 constructor takes PoolConfig not Pool instance
- [Phase 06]: Dynamic import for @/lib/reports-db in history route ensures Prisma never loads in local mode — static import would crash local users with no DATABASE_URL
- [Phase 06]: readReportFromDb throws on null (not found or user_id mismatch) — caller returns 404, preventing report enumeration attacks
- [Phase 06]: Suspense wrapper required around useSearchParams in Next.js 15 App Router client components to avoid static prerendering error
- [Phase 06]: NEXT_PUBLIC_DEPLOYMENT_MODE used for client-side SetupWizard guard — DEPLOYMENT_MODE is server-only, both env vars must be set in Vercel config
- [Phase 06]: export const dynamic = 'force-dynamic' added to setup/status route so NextAuth session is evaluated at request time not build time
- [Phase 06]: Prisma 7 migrate dev requires explicit env export — env() reads process.env directly, not .env.local auto-loading
- [Phase 06]: Merged [filename]/[id] history routes into single [filename]/route.ts — Next.js 15 rejects two dynamic segments at same path level with different names
- [Phase 06]: vitest exclude: ['tests/e2e/**'] required to prevent Playwright spec files from being collected as unit tests
- [Phase 07]: SecurityType union has 7 values (equity/spac/etf/adr/preferred/crypto/unknown) — covers all Yahoo Finance quoteTypes plus name-derived subtypes
- [Phase 07]: detectSecurityType() 3-tier: quoteType (free) → name heuristics (free) → Anthropic web search max_uses:1 for EQUITY with no name match
- [Phase 07]: SourcePackage.security_type is required; AnalysisResult.security_type is optional for backward compat with persisted reports
- [Phase 07]: fetchAnalystSentiment returns ETF sentinel without API call — ETFs have no Wall Street buy/sell ratings
- [Phase 07]: Equity news and analyst searches use max_uses 5 (up from 3) for broader coverage on the most common instrument type
- [Phase 07]: SPAC SEC filing prompt targets S-4 and DEF 14A — pre-merger SPACs do not file 10-K or 10-Q
- [Phase 07]: PREAMBLES dict at module level after Q6 — reusable, extensible, zero runtime cost for equity type
- [Phase 07]: preamble + q list comprehension replaces static QUESTIONS list — backward compat via empty string default for equity/unknown types
- [Phase 07]: ETF analyst sentinel check uses 'not applicable' substring match — loosely coupled to TypeScript fetchAnalystSentiment sentinel wording
- [Phase 07]: Badge suppressed for equity and unknown security types — equity is default instrument (no label needed), unknown means detection failed (preserves pre-phase appearance)
- [Phase 07]: data-testid='security-type-badge' on badge span enables reliable Playwright targeting without fragile CSS selectors

### Roadmap Evolution

- Phase 6 added: Full Web Deployment — Vercel, Database, Auth, Report & Account Persistence
- Phase 7 added: Full public deployment — Vercel frontend + Daytona container for notebooklm-py, fully live and accessible to anyone on the web

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 2 pre-condition]: NotebookLM programmatic API availability is unconfirmed as of August 2025. Phase 2 plan 02-01 is a verification spike. If API is unavailable, the reasoning layer must fall back to Anthropic Messages API — this changes the architecture but preserves the two-layer separation.
- [Phase 1]: yahoo-finance2 is an unofficial API; verify npm activity and stability before committing to it for production use.

## Session Continuity

Last session: 2026-03-26T04:28:31.459Z
Stopped at: Phase 8 UI-SPEC approved
Resume file: .planning/phases/08-full-public-deployment-vercel-frontend-daytona-container-for-notebooklm-py-fully-live-and-accessible-to-anyone-on-the-web/08-UI-SPEC.md
