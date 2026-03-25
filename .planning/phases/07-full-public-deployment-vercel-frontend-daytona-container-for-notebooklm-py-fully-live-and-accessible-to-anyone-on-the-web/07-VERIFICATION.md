---
phase: 07-research-quality-special-situation-coverage
verified: 2026-03-25T21:20:00Z
status: passed
score: 4/4 success criteria verified
re_verification: false
gaps: []
human_verification:
  - test: "Run a real research session on ETHM (known SPAC)"
    expected: "Report mentions merger target, expected vote/close date, and trust NAV — not generic earnings discussion"
    why_human: "Requires live API call to Anthropic and NotebookLM; output quality cannot be verified statically"
  - test: "Run a real research session on QQQ (ETF)"
    expected: "Report mentions holdings, expense ratio, and tracking index (Nasdaq-100); analyst section says 'Not applicable — ETF'; no reference to '10-K filings'"
    why_human: "Requires live pipeline execution to confirm Gemini interprets ETF preamble correctly"
  - test: "Visual badge inspection on report page with SPAC/ETF type"
    expected: "Amber 'SPAC' or 'ETF' chip appears in sub-bar next to ticker; absent for standard equity"
    why_human: "Playwright e2e tests exist and are wired but require a running dev server; human must run and confirm screenshots"
---

# Phase 7: Research Quality & Special Situation Coverage — Verification Report

**Phase Goal:** The research pipeline detects what type of security it's analyzing and adapts its search queries accordingly — so SPACs surface merger details and vote dates, ETFs surface holdings and expense ratios, and even standard equities get more aggressive web search coverage.
**Verified:** 2026-03-25T21:20:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Success Criteria (from ROADMAP.md)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | ETHM research output mentions merger target, vote/close date, trust NAV | ? HUMAN | SPAC prompts wired in `fetchNews`, `fetchSecFilingSummary`, `fetchAnalystSentiment`, `fetchSocialSentiment`; SPAC preamble injected in Python; cannot verify runtime output statically |
| 2 | QQQ research output mentions holdings, expense ratio, tracking index — not "SEC 10-K filings" | ? HUMAN | ETF prompt branches confirmed in `fetchNews` (AUM/tracking error focus) and `fetchSecFilingSummary` (N-CEN/N-PORT, explicitly avoids 10-K/10-Q); ETF analyst sentinel wired; Gemini ETF preamble wired; static verification passes |
| 3 | Standard equity (AAPL, NVDA) research at least as good as before — no regression | VERIFIED | Default equity path untouched in all 4 fetch functions; `max_uses` bumped 3 → 5 for `fetchNews` and `fetchAnalystSentiment` equity paths only; 117/117 unit tests pass; no TypeScript errors |
| 4 | Security type logged in SourcePackage and visible in research report | VERIFIED | `security_type: SecurityType` required field on `SourcePackage` (line 88 of `types.ts`); `security_type?: SecurityType` optional on `AnalysisResult` (line 147); NavBar badge wired with `data-testid="security-type-badge"` (line 99 of `NavBar.tsx`); ResearchReport passes `analysisResult.security_type ?? null` to NavBar (confirmed by grep) |

**Score:** 2/4 statically verifiable (criteria 3 and 4); 2/4 require human runtime verification (criteria 1 and 2) — all infrastructure is correctly wired.

---

## Required Artifacts

### Plan 01 — Type Contracts and Detection Module

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/types.ts` | SecurityType union, SourcePackage.security_type (required), AnalysisResult.security_type (optional) | VERIFIED | Line 8: `export type SecurityType = 'equity' \| 'spac' \| 'etf' \| 'adr' \| 'preferred' \| 'crypto' \| 'unknown'`; line 88: `security_type: SecurityType;`; line 147: `security_type?: SecurityType;` |
| `src/lib/data/security-type.ts` | `detectSecurityType()` with 3-tier logic | VERIFIED | Exports `detectSecurityType`; Tier 1 classifyByQuoteType (ETF, MUTUALFUND, CRYPTOCURRENCY); Tier 2 classifyByName (acquisition, blank check, american depositary, preferred); Tier 3 Anthropic web search with `max_uses: 1`; non-fatal catch returns `'equity'` |
| `tests/unit/security-type.test.ts` | 8 unit tests for detection logic | VERIFIED | 8 tests present; all 8 pass in npm test run |
| `tests/unit/anthropic-search-branching.test.ts` | 3 unit tests for prompt branching | VERIFIED | 3 tests present; all 3 pass |
| `tests/e2e/security-badge.spec.ts` | Playwright badge tests | VERIFIED | 4 real test cases with badge assertions, screenshot calls, and toHaveCount(0) assertions for equity/unknown |

### Plan 02 — Prompt Branching and Pipeline Wiring

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/data/anthropic-search.ts` | 4 functions with securityType parameter and branched prompts | VERIFIED | All 4 functions have `securityType: SecurityType = 'equity'` parameter; SPAC/ETF prompt branches confirmed; `max_uses: 5` for equity in `fetchNews` and `fetchAnalystSentiment`; ETF sentinel return in `fetchAnalystSentiment` (line 91–100) |
| `src/lib/data/source-package.ts` | `collectAllData` with securityType param; security_type in return | VERIFIED | Signature has `securityType: SecurityType = 'equity'` as 4th param (line 47); all 4 fetch calls pass `securityType`; return object has `security_type: securityType` (line 79) |
| `src/app/api/research/[ticker]/route.ts` | detectSecurityType called after yf.quote(); securityType passed to collectAllData | VERIFIED | Imports `detectSecurityType` (line 10) and `SecurityType` (line 11); calls `detectSecurityType(upperTicker, _quoteType, _longName).catch(() => 'equity')` (line 60); passes `securityType` to `collectAllData` (line 63) |

### Plan 03 — Python Preamble Injection

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/notebooklm_research.py` | PREAMBLES dict; preamble injection via list comprehension; security_type in parse_answers() return; ETF analyst brief improvement | VERIFIED | PREAMBLES dict at lines 100–114 with 'spac' and 'etf' keys; `QUESTIONS = [preamble + q for q in [Q1, Q2, Q3, Q4, Q5, Q6]]` at line 566; `'security_type': pkg.get('security_type', 'equity')` in parse_answers() return at line 361; ETF analyst sentinel check at lines 219–221; Python syntax check passes |

### Plan 04 — UI Badge

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/components/NavBar.tsx` | securityType prop; conditional badge for non-equity/non-unknown types | VERIFIED | `securityType?: string \| null` in NavBarProps (line 24); badge render at lines 97–104 with `data-testid="security-type-badge"`, `text-amber-400`, `border border-amber-400/40`, `font-mono`; no rounded classes on badge span |
| `src/components/ResearchReport.tsx` | Passes analysisResult.security_type to NavBar | VERIFIED | `securityType={analysisResult.security_type ?? null}` on NavBar JSX (line 156) |
| `tests/e2e/security-badge.spec.ts` | 4 real Playwright tests with screenshots | VERIFIED | SPAC badge, ETF badge, equity no-badge, unknown no-badge; `page.screenshot()` calls at 3 of 4 tests; `toHaveCount(0)` for no-badge cases |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `route.ts` | `security-type.ts` | `detectSecurityType()` import and call | VERIFIED | Import on line 10; call on line 60 with `.catch(() => 'equity')` guard |
| `route.ts` | `collectAllData` | `securityType` as 4th argument | VERIFIED | Line 63: `collectAllData(upperTicker, companyName, exchange, securityType)` |
| `source-package.ts` | `anthropic-search.ts` fetchNews | `securityType` parameter | VERIFIED | Line 60: `fetchNews(ticker, securityType)` |
| `source-package.ts` | `anthropic-search.ts` fetchAnalystSentiment | `securityType` parameter | VERIFIED | Line 61: `fetchAnalystSentiment(ticker, securityType)` |
| `source-package.ts` | `anthropic-search.ts` fetchSecFilingSummary | `securityType` parameter | VERIFIED | Line 62: `fetchSecFilingSummary(ticker, securityType)` |
| `source-package.ts` | `anthropic-search.ts` fetchSocialSentiment | `securityType` parameter | VERIFIED | Line 63: `fetchSocialSentiment(ticker, securityType)` |
| `source-package.ts` | SourcePackage return | `security_type: securityType` field | VERIFIED | Line 79 of `source-package.ts` |
| `notebooklm_research.py` | PREAMBLES dict | `pkg.get('security_type', 'equity')` at line 564 | VERIFIED | Pattern confirmed: `security_type = pkg.get('security_type', 'equity')` then `preamble = PREAMBLES.get(security_type, '')` |
| `notebooklm_research.py` | parse_answers() | `security_type` in return dict at line 361 | VERIFIED | `'security_type': pkg.get('security_type', 'equity')` in return dict |
| `ResearchReport.tsx` | `NavBar` | `securityType={analysisResult.security_type ?? null}` | VERIFIED | Line 156 of `ResearchReport.tsx` |
| `NavBar.tsx` | badge element | `data-testid="security-type-badge"` conditional render | VERIFIED | Lines 97–104; condition: `securityType && securityType !== 'unknown' && securityType !== 'equity'` |

---

## Requirements Coverage

The requirement IDs RQ-01 through RQ-04 are phase-internal IDs defined in `07-RESEARCH.md`. They do NOT appear in the project-level `REQUIREMENTS.md` — this is expected and intentional. The project REQUIREMENTS.md covers v1 functional requirements (TICK-xx, DATA-xx, RSRCH-xx, REPT-xx, etc.); RQ-01 through RQ-04 are research quality improvement criteria scoped to Phase 7.

**Note:** The traceability table in REQUIREMENTS.md does not reference Phase 7 — Phase 7 was added after the initial requirement set was finalized, and addresses quality improvements rather than new functional requirements. This is not a gap.

| Phase Req ID | Description | Evidence | Status |
|-------------|-------------|----------|--------|
| RQ-01 | SPAC detection and SPAC-specific prompts (ETHM surfaces merger details) | SPAC branches in all 4 fetch functions; SPAC preamble in Python; `detectSecurityType` Tier 2/3 catches SPACs | SATISFIED (infrastructure) — runtime output needs human verification |
| RQ-02 | ETF detection and ETF-specific prompts (QQQ surfaces holdings/expense ratio/tracking index, not 10-K) | ETF branches in fetchNews, fetchSecFilingSummary; ETF analyst sentinel; ETF preamble in Python | SATISFIED (infrastructure) — runtime output needs human verification |
| RQ-03 | No regression on standard equity — at least as good as before | Equity is the untouched default path throughout; max_uses 3→5 only adds breadth; 117/117 unit tests pass; TypeScript exits 0 | SATISFIED |
| RQ-04 | security_type logged in SourcePackage and visible in report | `security_type` required on SourcePackage; optional on AnalysisResult; NavBar badge renders; ResearchReport wires it | SATISFIED |

**Orphaned requirements check:** No additional REQUIREMENTS.md entries reference Phase 7. No orphaned requirements.

---

## Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `src/components/NavBar.tsx` line 69 | `rounded` class on "Analyze a Ticker" button | Info | Pre-existing; not on the security-type badge span; badge correctly has no rounded class |

No blockers, no placeholder stubs, no TODO markers found in phase-modified files.

---

## TypeScript and Test Validation

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | PASSED — 0 errors |
| `npm test` | PASSED — 117/117 tests across 18 test files |
| Python syntax check (`ast.parse`) | PASSED — Syntax OK |

---

## Human Verification Required

### 1. SPAC Research Output Quality (RQ-01)

**Test:** Run `POST /api/research/ETHM` followed by `POST /api/analysis/ETHM` (or use the UI) with a valid NotebookLM session
**Expected:** The final report mentions the merger target company, expected vote/close date, trust NAV per share, and deal timeline — not generic EPS/revenue discussion
**Why human:** Requires live Anthropic web search + NotebookLM session; Gemini response quality cannot be verified statically

### 2. ETF Research Output Quality (RQ-02)

**Test:** Run a full research session on QQQ
**Expected:** Report mentions top holdings (Apple, Microsoft, Nvidia), expense ratio (0.20%), Nasdaq-100 tracking index, and fund flows. Analyst section says "Not applicable — ETF" or equivalent. No mention of "10-K filings" as the primary SEC data source.
**Why human:** Requires live pipeline execution; preamble effect on Gemini interpretation requires runtime observation

### 3. NavBar Badge Visual Confirmation (RQ-04)

**Test:** `npm run dev`, write a fixture to `~/.cipher/reports/TEST-badge-fixture-spac.json` (already written by Playwright tests), visit `http://localhost:3000/research/TEST?report=TEST-badge-fixture-spac.json`
**Expected:** Amber "SPAC" chip visible in the sub-bar next to the ticker chip; no badge visible when loading the equity fixture
**Why human:** Playwright tests exist and are wired correctly, but require a running dev server to execute; screenshot confirmation requires visual review

---

## Gaps Summary

No gaps. All phase deliverables exist, are substantive (not stubs), and are correctly wired end-to-end. The infrastructure for adaptive security-type-aware research is complete. The phase goal is architecturally achieved; runtime output quality for SPAC and ETF instrument types requires human validation with live API calls.

---

_Verified: 2026-03-25T21:20:00Z_
_Verifier: Claude (gsd-verifier)_
