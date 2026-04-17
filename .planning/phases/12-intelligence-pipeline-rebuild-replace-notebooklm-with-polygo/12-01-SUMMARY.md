---
phase: 12-intelligence-pipeline-rebuild-replace-notebooklm-with-polygo
plan: "01"
subsystem: infra
tags: [ai-sdk, firecrawl, typescript, schema, vitest]

# Dependency graph
requires: []
provides:
  - "ai@6.0.168 installed — Vercel AI SDK with generateText, Output.object(), NoObjectGeneratedError"
  - "@mendable/firecrawl-js@4.18.3 installed — community sentiment scraping SDK"
  - "AnalysisResult.price_target?: string | null — analyst price target field (D-10)"
  - "AnalysisResult.community_sentiment_available?: boolean — Firecrawl presence flag (D-11)"
  - "AnalysisSource.url?: string — optional source URL for attribution (D-11)"
  - "Signal arrays updated to 1-5 signals (D-09)"
  - "6 vitest schema contract tests locking the evolved interface"
affects:
  - "12-02: Gemini analysis route — imports AnalysisResult, uses ai SDK"
  - "12-03: Firecrawl integration — uses @mendable/firecrawl-js and community_sentiment_available"
  - "src/app/api/analysis/[ticker]/route.ts — primary consumer of AnalysisResult"
  - "src/app/research/[ticker]/page.tsx — renders AnalysisResult (backward-compat preserved)"

# Tech tracking
tech-stack:
  added:
    - "ai@6.0.168 (Vercel AI SDK v6 — pinned exact version)"
    - "@mendable/firecrawl-js@4.18.3 (pinned exact version)"
  patterns:
    - "Exact version pinning for security-sensitive packages (no ^ or ~ prefix)"
    - "Optional fields for backward-compatible schema evolution"

key-files:
  created:
    - "tests/unit/analysis-schema.test.ts — 6 contract tests for schema evolution"
  modified:
    - "package.json — added ai, @mendable/firecrawl-js; removed prestart hook"
    - "package-lock.json — updated lockfile"
    - "src/lib/types.ts — evolved AnalysisResult and AnalysisSource interfaces"

key-decisions:
  - "Exact version pinning (no ^ prefix) for ai and @mendable/firecrawl-js per threat model T-12-01-01 and T-12-01-02"
  - "All new AnalysisResult fields are optional for backward compatibility with existing StoredReport persisted files (D-12)"
  - "price_target typed as string | null (not number) to support ranges like $185-$200"
  - "community_sentiment_available as boolean flag for runtime debugging and future display"

patterns-established:
  - "Schema evolution pattern: add optional fields, never remove or change existing required fields"
  - "Supply chain security: pin third-party packages to exact versions in package.json"

requirements-completed:
  - INTEL-01
  - INTEL-02
  - INTEL-03

# Metrics
duration: 5min
completed: 2026-04-17
---

# Phase 12 Plan 01: Install AI/Firecrawl Deps and Evolve AnalysisResult Schema Summary

**ai@6.0.168 and @mendable/firecrawl-js@4.18.3 installed with exact version pins; AnalysisResult extended with price_target, community_sentiment_available, and AnalysisSource.url; 6 passing vitest schema contract tests lock the evolved interface**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-17T21:11:48Z
- **Completed:** 2026-04-17T21:15:59Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Installed Vercel AI SDK v6 (`ai@6.0.168`) and Firecrawl SDK (`@mendable/firecrawl-js@4.18.3`) with exact version pinning per threat model
- Removed `prestart` hook referencing deleted `scripts/setup.sh`
- Extended `AnalysisResult` with `price_target?: string | null`, `community_sentiment_available?: boolean` and updated signal array comments to 1-5 signals
- Extended `AnalysisSource` with `url?: string` for richer attribution
- Updated section comment from Phase 2/NotebookLM to Phase 12/Gemini
- Created 6 vitest schema contract tests covering all new fields and round-trip JSON serialization (all pass)
- Build passes with zero type errors (`npm run build` exits 0)

## Task Commits

Each task was committed atomically:

1. **Task 1+2: Install deps, evolve schema, write tests** - `abfe5f8` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified
- `package.json` - Added ai@6.0.168, @mendable/firecrawl-js@4.18.3 (exact pins); removed prestart hook
- `package-lock.json` - Updated lockfile for new packages
- `src/lib/types.ts` - Added price_target, community_sentiment_available to AnalysisResult; url to AnalysisSource; updated signal comments and section header
- `tests/unit/analysis-schema.test.ts` - 6 vitest contract tests for schema evolution (new file)

## Decisions Made
- Exact version pinning (`"ai": "6.0.168"` not `"^6.0.168"`) applied per threat model T-12-01-01 and T-12-01-02 — supply chain tamper mitigation
- `price_target` typed as `string | null` not `number` because analyst targets are often ranges like "$185-$200" not single numbers
- `community_sentiment_available` placed after `source_warnings` for logical grouping with other warning/metadata fields
- `StoredReport` interface left completely unchanged — backward compatibility preserved per D-12

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed esbuild platform binary mismatch blocking vitest**
- **Found during:** Task 2 (running vitest for schema tests)
- **Issue:** `node_modules/esbuild` contained a binary for a different platform, causing vitest to fail to load the config
- **Fix:** Ran `npm rebuild esbuild` to rebuild the native binary for the current platform (darwin-arm64)
- **Files modified:** none (binary rebuild only)
- **Verification:** `npx vitest run tests/unit/analysis-schema.test.ts` passed all 6 tests after rebuild
- **Committed in:** abfe5f8 (resolved before task commit)

**2. [Rule 1 - Bug / Threat Model] Pinned exact versions after npm auto-added ^ prefix**
- **Found during:** Task 1 (post-install verification)
- **Issue:** `npm install ai@6.0.168` added `"ai": "^6.0.168"` with a caret, violating the threat model (T-12-01-01, T-12-01-02) which requires exact version pins
- **Fix:** Edited `package.json` to remove `^` from both new packages
- **Files modified:** package.json
- **Verification:** Final package.json shows `"ai": "6.0.168"` and `"@mendable/firecrawl-js": "4.18.3"`
- **Committed in:** abfe5f8 (part of task commit)

---

**Total deviations:** 2 auto-fixed (1 environment bug, 1 threat model compliance)
**Impact on plan:** Both fixes necessary for correctness and security compliance. No scope creep.

## Issues Encountered
- esbuild platform mismatch: pre-existing state in node_modules — `npm rebuild esbuild` resolved immediately

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `ai` and `@mendable/firecrawl-js` are installed and ready for use in 12-02 (Gemini analysis route)
- `AnalysisResult` schema is locked by 6 passing tests — safe to implement against
- `src/app/api/analysis/[ticker]/route.ts` is the target for 12-02 rewrite
- No blockers

---
*Phase: 12-intelligence-pipeline-rebuild-replace-notebooklm-with-polygo*
*Completed: 2026-04-17*

## Self-Check: PASSED

- FOUND: package.json
- FOUND: src/lib/types.ts
- FOUND: tests/unit/analysis-schema.test.ts
- FOUND: 12-01-SUMMARY.md
- FOUND commit: abfe5f8
- npm ls ai: ai@6.0.168
- npm ls @mendable/firecrawl-js: @mendable/firecrawl-js@4.18.3
- grep price_target: found in src/lib/types.ts
- prestart: NOT FOUND in package.json (correct)
