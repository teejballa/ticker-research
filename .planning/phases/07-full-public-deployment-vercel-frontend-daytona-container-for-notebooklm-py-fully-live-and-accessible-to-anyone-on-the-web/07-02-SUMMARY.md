---
phase: 07
plan: 02
subsystem: data-collection
tags: [security-type, prompt-branching, anthropic-search, spac, etf, source-package, route]
dependency_graph:
  requires: [07-01]
  provides: [security-type-branched-search-prompts, securityType-threaded-pipeline]
  affects: [anthropic-search, source-package, research-route]
tech_stack:
  added: []
  patterns: [securityType-parameter-threading, sentinel-value-early-return, ternary-max_uses-branching]
key_files:
  modified:
    - src/lib/data/anthropic-search.ts
    - src/lib/data/source-package.ts
    - src/app/api/research/[ticker]/route.ts
decisions:
  - fetchAnalystSentiment returns ETF sentinel without API call — ETFs have no Wall Street buy/sell ratings, avoiding a wasted search
  - Equity news and analyst searches use max_uses 5 (up from 3) for broader coverage on the most common instrument type
  - SPAC SEC filing prompt explicitly targets S-4 and DEF 14A — pre-merger SPACs do not file 10-K or 10-Q
  - ETF SEC filing prompt targets N-CEN and N-PORT — fund-specific required filings with holdings/compliance data
  - securityType defaults to 'equity' everywhere — all signatures backward-compatible, existing callers unaffected
metrics:
  duration_seconds: 307
  completed_date: "2026-03-25"
  tasks_completed: 2
  files_modified: 3
---

# Phase 7 Plan 02: Prompt Branching & securityType Threading Summary

One-liner: Instrument-aware Anthropic web search — SPAC prompts target merger/NAV details and ETF prompts target fund flows/N-PORT filings, wired end-to-end from route.ts through the full pipeline.

## What Was Built

### Task 1: securityType branching in all 4 anthropic-search functions (commit: 66d10bb)

Added `securityType: SecurityType = 'equity'` as the second parameter to all four exported functions. Each function now branches prompt text and (where applicable) `max_uses` based on the security type:

**fetchNews:**
- SPAC: merger target details, PIPE investors, shareholder vote date, trust NAV, deal timeline
- ETF: fund flows, AUM changes, index rebalancing, expense ratio, tracking error/NAV premium
- Equity (+ ADR/preferred/crypto/unknown): existing prompt verbatim
- max_uses: equity → 5, all others → 3

**fetchAnalystSentiment:**
- ETF: returns sentinel `{ error: 'Not applicable — ETF' }` immediately, zero API calls
- SPAC: merger arbitrage commentary, deal probability, price vs. trust NAV baseline
- Equity (default): existing prompt verbatim
- max_uses: equity → 5, all others → 3

**fetchSecFilingSummary:**
- SPAC: targets S-4 merger registration + DEF 14A proxy (explicitly avoids 10-K/10-Q)
- ETF: targets N-CEN annual report + N-PORT quarterly holdings
- Equity (default): existing 10-K/10-Q prompt verbatim
- max_uses: 3 for all types

**fetchSocialSentiment:**
- SPAC: targets r/SPACs, merger speculation, redemption arbitrage discussion
- ETF and equity (+ all others): existing prompt verbatim
- max_uses: 3 for all types

### Task 2: securityType threading and detectSecurityType wiring (commit: 0c90424)

**source-package.ts:**
- `collectAllData` signature extended with `securityType: SecurityType = 'equity'` as 4th parameter
- All 4 anthropic-search calls now pass `securityType` explicitly
- Return object uses `security_type: securityType` — previously hardcoded to `'equity'` with a TODO comment

**route.ts:**
- Imports `detectSecurityType` from `@/lib/data/security-type` and `SecurityType` from `@/lib/types`
- yf.quote block extended to capture `_quoteType` and `_longName` from the quote object
- `detectSecurityType(upperTicker, _quoteType, _longName)` called after the quote block with `.catch(() => 'equity')` guard (non-fatal)
- `collectAllData` call updated to pass `securityType`

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

- `npx tsc --noEmit` exits 0
- `npm test`: 117 tests across 18 test files — all pass
- All 4 functions have `securityType: SecurityType = 'equity'` parameter
- ETF sentinel in fetchAnalystSentiment confirmed
- max_uses: 5 documented in equity paths for fetchNews and fetchAnalystSentiment
- S-4 SPAC SEC prompt confirmed
- N-CEN ETF SEC prompt confirmed
- securityType flows: route.ts → source-package.ts → anthropic-search.ts
- security_type field set from securityType parameter in SourcePackage return

## Self-Check: PASSED

- `src/lib/data/anthropic-search.ts` — modified, exists
- `src/lib/data/source-package.ts` — modified, exists
- `src/app/api/research/[ticker]/route.ts` — modified, exists
- Commit 66d10bb exists in git log
- Commit 0c90424 exists in git log
