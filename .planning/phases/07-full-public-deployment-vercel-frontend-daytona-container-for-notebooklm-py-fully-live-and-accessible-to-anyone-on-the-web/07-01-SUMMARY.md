---
phase: 07
plan: 01
subsystem: security-type-contracts
tags: [types, detection, tdd, wave-0, security-classification]
dependency_graph:
  requires: []
  provides: [SecurityType-union, detectSecurityType, wave-0-test-stubs]
  affects: [src/lib/types.ts, src/lib/data/security-type.ts, src/lib/data/source-package.ts]
tech_stack:
  added: []
  patterns: [3-tier-detection, wave-0-tdd-stubs, dynamic-import-stubs]
key_files:
  created:
    - src/lib/data/security-type.ts
    - tests/unit/security-type.test.ts
    - tests/unit/anthropic-search-branching.test.ts
    - tests/e2e/security-badge.spec.ts
  modified:
    - src/lib/types.ts
    - src/lib/data/source-package.ts
    - src/lib/__tests__/research-brief.test.ts
decisions:
  - "SecurityType union has 7 values: equity/spac/etf/adr/preferred/crypto/unknown — covers all Yahoo Finance quoteTypes plus name-derived subtypes"
  - "SourcePackage.security_type is required (not optional) — all callers must classify before assembling a package"
  - "AnalysisResult.security_type is optional — backward compat with persisted reports that predate Phase 7"
  - "detectSecurityType() 3-tier: quoteType (free) → name heuristics (free) → Anthropic web search (max_uses:1, only for EQUITY with no name match)"
  - "source-package.ts collectAllData() defaults security_type to 'equity' until Phase 7 Plan 02 wires the real detection call"
  - "Wave 0 stubs use dynamic await import() inside it() blocks — vitest collects 8 tests; 1 expected runtime failure (branching stub)"
metrics:
  duration: "~8 minutes"
  completed: "2026-03-25T20:43:04Z"
  tasks_completed: 3
  files_changed: 7
---

# Phase 7 Plan 01: SecurityType Contracts and Detection Module Summary

**One-liner:** SecurityType union type with 7 values, 3-tier detectSecurityType() function, and Wave 0 TDD stubs establishing the classification contract for downstream prompt branching.

## What Was Built

### SecurityType Union Type (src/lib/types.ts)
Added `export type SecurityType = 'equity' | 'spac' | 'etf' | 'adr' | 'preferred' | 'crypto' | 'unknown';` as the single source of truth for security classification. Extended `SourcePackage` with a required `security_type: SecurityType` field and `AnalysisResult` with an optional `security_type?: SecurityType` field for backward compatibility.

### detectSecurityType() (src/lib/data/security-type.ts)
3-tier detection logic:
- **Tier 1 (free):** Yahoo Finance `quoteType` — ETF/MUTUALFUND → `etf`; CRYPTOCURRENCY → `crypto`
- **Tier 2 (free):** Company name heuristics — `acquisition`/`blank check` → `spac`; `american depositary`/` adr` → `adr`; `preferred` → `preferred`
- **Tier 3 (1 API call):** Anthropic web search with `max_uses: 1` for SPAC confirmation of plain EQUITY tickers
- Non-fatal: any exception falls through to `'equity'` default

### Wave 0 Test Stubs (tests/)
Three stub files created per Wave 0 TDD discipline:
- `tests/unit/security-type.test.ts` — 8 tests, all pass (Tiers 1 and 2 don't need API mocking for quoteType/name cases)
- `tests/unit/anthropic-search-branching.test.ts` — 3 tests, 1 fails at runtime (expected — branching not yet implemented)
- `tests/e2e/security-badge.spec.ts` — 2 tests, placeholders for Plan 04 badge rendering

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed SourcePackage construction in source-package.ts and test fixture**
- **Found during:** Task 1 — TypeScript compiler caught after adding required `security_type` field
- **Issue:** `collectAllData()` in source-package.ts and `basePackage` fixture in research-brief.test.ts both constructed `SourcePackage` objects missing the new required field
- **Fix:** Added `security_type: 'equity'` default to `collectAllData()` return value; added `security_type: 'equity'` to test fixture
- **Files modified:** `src/lib/data/source-package.ts`, `src/lib/__tests__/research-brief.test.ts`
- **Commit:** e862d81

## Self-Check: PASSED

All files confirmed present:
- FOUND: src/lib/types.ts (SecurityType type + security_type fields)
- FOUND: src/lib/data/security-type.ts (detectSecurityType exported)
- FOUND: tests/unit/security-type.test.ts
- FOUND: tests/unit/anthropic-search-branching.test.ts
- FOUND: tests/e2e/security-badge.spec.ts

All commits confirmed:
- e862d81: feat(07-01): add SecurityType union type and extend SourcePackage/AnalysisResult
- ef13c55: feat(07-01): create detectSecurityType() with 3-tier classification logic
- 41862cc: test(07-01): add Wave 0 stubs for security type, prompt branching, and badge e2e
