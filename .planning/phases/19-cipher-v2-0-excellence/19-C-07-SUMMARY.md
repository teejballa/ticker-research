---
phase: 19-cipher-v2-0-excellence
plan: 19-C-07
subsystem: sentiment-reasoning
tags: [citations, zod, structured-output, shadow-ab, gemini, llm, source-attribution, d-39]

# Dependency graph
requires:
  - phase: 19-cipher-v2-0-excellence/19-Z-01
    provides: FeatureMode three-mode flag (off | shadow | on)
  - phase: 19-cipher-v2-0-excellence/19-Z-02
    provides: SentimentSnapshot.citations_v2 JSONB column (additive nullable)
  - phase: 19-cipher-v2-0-excellence/19-Z-03
    provides: runWithShadow<T>() generic shadow A/B harness + verdict() pure fn
  - phase: 19-cipher-v2-0-excellence/19-Z-04
    provides: model-card-status check that gates on ≥90% URL coverage on
              last-30d analyst/news claims
provides:
  - CitationSchema (Zod) — { source, url, confidence, date_retrieved } with
    URL-mandatory invariant for source ∈ {analyst, news} per D-39
  - CitationsArraySchema, Citation type, sanitizeUrl helper
  - assembleCitationsFromPackage(pkg) — walks SourcePackage and emits Citation[]
    from news.items / SEC summaries / analyst recent_changes / StockTwits
    aggregate / market data; dedupes URLs
  - renderCitationsSection(citations) — JSON-payload prompt section with
    "DO NOT invent URLs that are not in this list" instruction
  - AnalysisResultSchema.citations_v2 (optional) + AnalysisResult.citations_v2
  - runGeminiAnalysis() now wraps generateAnalysis() in
    runWithShadow('citations-v2', oldGen, newGen, mode, { ticker })
  - getCitationsV2Mode() — local FEATURE_CITATIONS_V2 env reader
    (off | shadow | on, default off)
affects: [shadow-verdict CLI 'citations-v2' strategy, model-card-status
          citations check, /research/[ticker] downstream UI consumers]

# Tech tracking
tech-stack:
  added: []   # no new runtime deps — Zod 3.24 already in tree
  patterns:
    - "Local three-mode env flag (FEATURE_CITATIONS_V2) intentionally NOT in
      central features.ts matrix — per plan, this flag is removed entirely
      after 7d hatch closes; no need to widen the canonical 15-flag set"
    - "Defense-in-depth URL fabrication mitigation: CITATIONS section in
      prompt + Zod schema URL-mandatory rule + post-process Set<allowedUrls>
      filter dropping LLM-emitted URLs not in SourcePackage"
    - "Inner generator extracted from runGeminiAnalysis (generateAnalysis)
      so old/new shadow paths share one body parameterized on a boolean —
      keeps the diff small and the contract identical"

key-files:
  created:
    - tests/lib/sentiment/citation-schema.test.ts
    - src/lib/sentiment/citation-schema.ts
    - tests/integration/citations-v2.shadow.live.test.ts
    - .planning/phases/19-cipher-v2-0-excellence/19-C-07-SUMMARY.md
  modified:
    - src/lib/research-brief.ts        # +159 lines: assembleCitationsFromPackage + renderCitationsSection + helpers
    - src/lib/gemini-analysis.ts       # +108 lines: AnalysisResultSchema.citations_v2 + runWithShadow wrap + generateAnalysis split + post-process filter
    - src/lib/types.ts                 # +9 lines: AnalysisResult.citations_v2 optional field
    - .planning/ROADMAP.md             # tick 19-C-07
    - .planning/phases/19-cipher-v2-0-excellence/deferred-items.md  # log pre-existing worktree garbage

key-decisions:
  - "Local FEATURE_CITATIONS_V2 env flag rather than adding to features.ts.
    Plan explicitly says citations_v2 is the canonical post-cutover and
    flag-removal is N/A; central matrix stays at 15 flags. Helper
    getCitationsV2Mode() will be deleted in the cutover commit alongside
    the runWithShadow wrap."
  - "Analyst recent_changes emitted under source: 'other' (not 'analyst')
    because the current AnalystChange type has no per-row URL — emitting
    them as 'analyst' would falsify the schema's analyst-mandatory-URL
    invariant for unsourced rows. Switch to 'analyst' once a future
    fetcher adds URLs to recent_changes."
  - "Post-process filter Set<allowedUrls> drops any LLM-emitted URL not
    present in SourcePackage. T-19-C-07-01 (LLM fabrication) defense-in-
    depth even though the prompt explicitly forbids it. Falls back to the
    raw assembled list when the LLM returns nothing or everything is
    fabricated — users always see citation provenance."
  - "URL sanitization runs at TWO layers: research-brief safeUrl + Zod
    transform on CitationSchema.url. Both strip user:pass@ → ***@. Same
    regex shape as src/lib/shadow/shadow-runner.ts so the behavior is
    consistent across shadow persistence and citation parsing."
  - "shadow-reports/19-C-07.json is a runtime artifact (gitignored).
    Seeded locally with a HOLD placeholder for operator visibility; the
    shadow-verdict CLI overwrites it with PASS/FAIL/HOLD on each
    invocation against the live ShadowComparison aggregate."

patterns-established:
  - "Structured-citation contract: build evidence list from canonical
    server-side data → render as a CITATIONS prompt section → require LLM
    to RETURN a subset → filter LLM output against Set<allowed>. Reusable
    for any future source-grounded reasoning task that needs to prevent
    URL fabrication."
  - "FEATURE_<NAME>=shadow|on|off env-only flag for plans that don't
    warrant a slot in the central features.ts matrix. Useful when the flag
    will be deleted at cutover rather than graduated to 'on' permanently."

requirements-completed: []   # plan declares requirements: [] in frontmatter

# Metrics
duration: 8min
completed: 2026-05-08
---

# Phase 19 Plan 19-C-07: Structured Citation Schema Summary

**Per D-39, replaces free-text `source_citation: string` in `AnalysisResultSchema` with structured `citations_v2: Citation[]` (`{source, url, confidence, date_retrieved}`). Mandatory URL for analyst/news at Zod validation time; behind `runWithShadow('citations-v2', ...)` with a three-mode `FEATURE_CITATIONS_V2` env flag.**

## Performance

- **Duration:** ~8 minutes
- **Tasks:** 5
- **Files modified:** 8 (4 created, 4 modified)
- **Vitest:** 540 passed | 3 todo (543) — same green-state delta as pre-plan

## Accomplishments

- **CitationSchema (Zod)** in `src/lib/sentiment/citation-schema.ts` with the eight-source enum (`analyst | news | sec_filing | social | options | community | price_data | other`), `superRefine` enforcing `URL is mandatory when source is '<x>' (per D-39)` for analyst/news, `confidence ∈ [0,1]`, and a URL transform that strips `user:pass@` → `***@` (T-19-C-07-03 mitigation matched to `shadow-runner.ts`).
- **assembleCitationsFromPackage(pkg)** in `src/lib/research-brief.ts` walks the SourcePackage and emits a deduplicated `Citation[]` from news items (URL-bearing → `news`), SEC summaries (`sec_filing`), analyst recent_changes (`other` until per-row URL ladders mature), StockTwits aggregate (`social`), and the price/market row (`price_data`). Confidences assigned per source class. URLs round-tripped through `URL` and sanitized before reaching Zod.
- **renderCitationsSection(citations)** writes a JSON payload + the explicit `DO NOT invent URLs that are not in this list` instruction. Returns `''` when empty so callers can drop the section.
- **AnalysisResultSchema** in `src/lib/gemini-analysis.ts` now carries `citations_v2: CitationsArraySchema.optional()`. The legacy free-text `source_citation` on each bullish/bearish signal is **kept** during shadow — the cutover PR removes it after PASS verdict.
- **`runGeminiAnalysis` wrapped in `runWithShadow('citations-v2', oldGen, newGen, mode, { ticker })`**. Inner body refactored into `generateAnalysis(useCitationsV2: boolean)` so old/new paths share one implementation; the new path prepends the CITATIONS section and post-process filters the LLM-emitted `citations_v2` against `Set<allowedUrls>` built from the assembled list — any URL not in that set is dropped (T-19-C-07-01 defense-in-depth).
- **Three-mode flag** `FEATURE_CITATIONS_V2 ∈ {off, shadow, on}`, default `off`, read once per call by `getCitationsV2Mode()`. The flag is intentionally local (not in `features.ts`) because the plan slates it for full removal post-7d-hatch rather than graduation to permanent `on`.
- **Path-name `'citations-v2'` already registered** in `scripts/shadow-verdict.ts` (`PLAN_TO_PATH['19-C-07']`) with the `computeUrlCoverageDisagreement` strategy that asserts old URLs ⊆ new URLs (RESEARCH Pitfall 5). The verdict gate `≥90% URL coverage on analyst/news` is consumed by `npm run model-card-status` via the existing `citations` check.
- **8/8 unit tests GREEN** on `tests/lib/sentiment/citation-schema.test.ts`. Full vitest suite **540 passed | 3 todo (543)** with no test regressions vs pre-plan baseline.

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): 8 failing tests for CitationSchema** — `8512d3b` (test)
2. **Task 2 (GREEN): implement CitationSchema** — `102c081` (feat)
3. **Task 3: assembleCitationsFromPackage + CITATIONS prompt section** — `a052394` (feat)
4. **Task 4: AnalysisResultSchema.citations_v2 + runWithShadow A/B** — `3802cdb` (feat)
5. **Task 5: shadow lifecycle integration test stub** — `f435d95` (chore)
6. **(this) Docs: SUMMARY + ROADMAP tick** — see final commit

_Note: Task 1 was TDD RED, Task 2 was TDD GREEN — no refactor commit needed._

## Files Created/Modified

- `tests/lib/sentiment/citation-schema.test.ts` (created) — 8 tests using `safeParse`: valid analyst with URL parses; analyst-without-URL fails with `/mandatory/`; news-without-URL fails; social-without-URL succeeds; confidence outside `[0,1]` fails; invalid source enum fails; `CitationsArraySchema` accepts empty array; `user:pass@` URL sanitized to `***@`.
- `src/lib/sentiment/citation-schema.ts` (created) — Zod schema + `sanitizeUrl` + `Citation`/`CitationSource` types. ~80 lines.
- `tests/integration/citations-v2.shadow.live.test.ts` (created) — live-DB shadow lifecycle smoke. Excluded from fast unit run by `vitest.config.ts`. Asserts schema export + analyst-mandatory-URL; defers the ≥90% URL coverage PASS gate to `npm run shadow-verdict 19-C-07`.
- `src/lib/research-brief.ts` (modified, +159 lines) — `assembleCitationsFromPackage`, `renderCitationsSection`, plus `safeUrl` and `safeIso` helpers that normalize edge inputs before Zod sees them. Existing `formatResearchBrief` and `extractNewsUrls` unchanged.
- `src/lib/gemini-analysis.ts` (modified, +108 lines) — imports of `CitationsArraySchema`, `runWithShadow`, `FeatureMode`, `assembleCitationsFromPackage`, `renderCitationsSection`. New `getCitationsV2Mode()` helper. `runGeminiAnalysis` thin wrapper around `runWithShadow`. `generateAnalysis(useCitationsV2)` is the body — adds CITATIONS section, builds `Set<allowedUrls>`, filters LLM-emitted `citations_v2`, falls back to assembled list when LLM returns nothing.
- `src/lib/types.ts` (modified, +9 lines) — `AnalysisResult.citations_v2?` optional structured-array field for downstream consumers (UI, persistence, shadow-verdict).
- `.planning/ROADMAP.md` (modified) — tick `[x] 19-C-07`.
- `.planning/phases/19-cipher-v2-0-excellence/deferred-items.md` (modified) — log pre-existing worktree merge-conflict markers and sibling-plan RED tests as out-of-scope (entries 5, 6, 7).

## Decisions Made

1. **`FEATURE_CITATIONS_V2` is a local env flag, not in `features.ts`.** The plan says "this plan uses runWithShadow with no specific feature flag — citations_v2 is the canonical post-cutover; flag-removal step is N/A". Adding the flag to the central matrix would imply we're permanently keeping it. Local helper `getCitationsV2Mode()` is straightforward to delete in the cutover PR alongside the `runWithShadow` wrap.

2. **Analyst recent_changes emitted under `source: 'other'` (not `'analyst'`).** The current `AnalystChange` type carries no per-row URL. Emitting them as `'analyst'` would force the URL-mandatory invariant to fail every time, defeating the entire point of D-39. Logged as a note in `assembleCitationsFromPackage` to switch to `'analyst'` once a future fetcher adds URLs.

3. **Post-process filter `Set<allowedUrls>` is defense-in-depth.** T-19-C-07-01 mitigation lives at three layers: (a) the CITATIONS prompt section explicitly forbids fabrication; (b) Zod's URL-mandatory rule rejects analyst/news without URL; (c) the post-process filter drops any URL not in the SourcePackage list. Without (c), a determined Gemini that ignores the instruction and produces a plausible-looking URL would pass Zod (URL is just `z.string().url()`) but still fabricate evidence.

4. **Old/new shadow paths share one body, parameterized on `useCitationsV2: boolean`.** Forking the function would have doubled maintenance and introduced drift. The boolean toggles only what's actually different: prompt augmentation + the citations_v2 post-process. Everything else (engine_calibration overwrite, return shape) is identical.

5. **`shadow-reports/19-C-07.json` is gitignored runtime artifact, seeded with HOLD locally.** Matches the pattern of `noop-plan.json` already in the directory. The verdict CLI overwrites this file on every invocation; no need to track it in git.

6. **Skipped editing `features.ts` to add `structured_citations`.** Same rationale as decision 1 — keeps the central matrix at the documented 15 flags (D-09/D-10).

## Deviations from Plan

**None for the schema/code work.** Tasks 1–4 executed exactly as specified by the plan. Task 5 was the lifecycle stub; the actual shadow verdict gate (`shadow-reports/19-C-07.json verdict=PASS`) requires ≥200 reports through production with `FEATURE_CITATIONS_V2=shadow` — that's an operator action, not an in-plan code change. Documented in the SUMMARY's "Lifecycle Status" section below and in `shadow-reports/19-C-07.json`.

## Lifecycle Status

This plan delivers the **schema + writer**. The full shadow-cutover lifecycle (D-05/D-06) requires runtime data:

| Gate | Status | Action |
|------|--------|--------|
| Code lands behind flag (off) | DONE | All 5 tasks committed; `FEATURE_CITATIONS_V2` defaults to off |
| Flip to shadow | PENDING (operator) | Set `FEATURE_CITATIONS_V2=shadow` in production env |
| Drive workload | PENDING (calendar) | ≥200 reports OR 3-7 days post-flip |
| Run shadow-verdict | PENDING | `npm run shadow-verdict 19-C-07` → expect PASS via URL-coverage strategy |
| Cutover PR | PENDING | Remove free-text `source_citation` fallback + delete `getCitationsV2Mode` helper |
| 7d hatch | PENDING | Watch RollbackLog; rollback = `FEATURE_CITATIONS_V2=off` env flip |
| Flag-removal PR | PENDING | Delete `FEATURE_CITATIONS_V2` references entirely |
| `model-card-status citations` ok=true | PENDING | Asserts ≥90% URL coverage on last-30d analyst/news (gated by 19-Z-04) |

The 19-Z-04 model-card-status check (`citations: ok=true`) is the final gate that closes Phase 19's Hard Cleanup Gate (D-06) for this plan.

## Threat Surface Scan

The plan's `<threat_model>` listed three threats:

| Threat ID | Mitigation |
|-----------|------------|
| T-19-C-07-01 (LLM emits fabricated URL) | mitigated three ways — (a) `renderCitationsSection` prompt explicitly forbids fabrication; (b) `CitationSchema.superRefine` requires URL for analyst/news; (c) post-process `Set<allowedUrls>` filter drops any URL not in the assembled SourcePackage list. Verified by tests/lib/sentiment/citation-schema.test.ts (analyst-without-URL fails) and the filter logic at gemini-analysis.ts:954-967 |
| T-19-C-07-02 (URL coverage drops below 90% on niche tickers) | mitigated — shadow-verdict 'citations-v2' strategy uses `computeUrlCoverageDisagreement`; 19-Z-04 model-card-status ≥90% gate; if coverage <90%, FAIL → adjust prompt aggressiveness in cutover PR |
| T-19-C-07-03 (URL with embedded auth leaks via persist) | mitigated TWO layers — `safeUrl` in `research-brief.ts` strips user:pass@ before Zod parses; `CitationSchema.url.transform(sanitizeUrl)` strips it again. Same regex shape as `src/lib/shadow/shadow-runner.ts` so behavior is consistent across persistence and citation parsing. Verified by test 8 ("sanitizes URLs that embed user:pass@ auth into ***@") |

No new threat surface introduced. No `threat_flag:` entries needed.

## Issues Encountered

1. **Worktree pre-existing garbage.** The worktree `agent-ab1bb1fa` carried unresolved `<<<<<<<` merge-conflict markers in `src/app/api/cron/learn/route.ts`, `src/lib/data/merge.ts`, and `src/lib/engine-context.ts` from sibling parallel agents at session start (after `git stash pop`). These caused the project-wide `npx tsc --noEmit` and full `npx vitest run` to fail on files unrelated to 19-C-07's deliverables. Per scope-boundary rule, NOT fixed here — logged to `deferred-items.md` (entries 5, 6, 7). My own files (`src/lib/sentiment/citation-schema.ts`, `src/lib/research-brief.ts`, `src/lib/gemini-analysis.ts`, `src/lib/types.ts`) compile clean under tsc; full vitest suite is GREEN (540 passed | 3 todo) by the time Task 4 lands because sibling agents (19-C-09) completed their GREEN paths during execution.

2. **`shadow-reports/` is gitignored.** Initial Task 5 commit attempted to track `shadow-reports/19-C-07.json`; rebased the commit to commit only the integration test stub (the JSON is a runtime artifact, matching the existing `noop-plan.json` pattern).

## Self-Check

- [x] `tests/lib/sentiment/citation-schema.test.ts` exists; 8/8 GREEN (`✓ tests/lib/sentiment/citation-schema.test.ts (8 tests)`).
- [x] `src/lib/sentiment/citation-schema.ts` exists; exports `CitationSchema`, `CitationsArraySchema`, `Citation`, `CitationSource`, `sanitizeUrl`.
- [x] `src/lib/sentiment/citation-schema.ts` contains "URL is mandatory" (acceptance grep PASS).
- [x] `src/lib/sentiment/citation-schema.ts` contains "sanitizeUrl" (acceptance grep PASS).
- [x] `src/lib/research-brief.ts` contains "citations_v2" / "CITATIONS" (acceptance grep PASS for Task 3).
- [x] `src/lib/gemini-analysis.ts` contains "citations_v2" (acceptance grep PASS for Task 4).
- [x] `src/lib/gemini-analysis.ts` contains "runWithShadow" (acceptance grep PASS for Task 4).
- [x] Each commit subject contains "19-c-07" (acceptance grep PASS for Task 5: `git log -1 --pretty=%s | grep -q "19-c-07"`).
- [x] All 5 task commits present: `8512d3b`, `102c081`, `a052394`, `3802cdb`, `f435d95`.
- [x] Full vitest suite green: **Tests 540 passed | 3 todo (543)**.
- [x] `npx tsc --noEmit -p tsconfig.json` is clean for 19-C-07's files (the pre-existing worktree merge-conflict markers in unrelated files are out of scope per deferred-items.md entry 5).
- [x] `tests/integration/citations-v2.shadow.live.test.ts` created with shadow lifecycle smoke + `it.todo` for ≥200-row PASS gate.
- [x] `.planning/ROADMAP.md` ticked `[x] 19-C-07` at line 132.
- [x] `shadow-reports/19-C-07.json` exists locally (gitignored) with HOLD placeholder; path-name `'citations-v2'` registered in `scripts/shadow-verdict.ts`.

## Self-Check: PASSED

## User Setup Required

For the shadow window to actually open in production, an operator must:

1. Add `FEATURE_CITATIONS_V2=shadow` to Vercel environment variables (Production scope).
2. Wait for ≥200 `runGeminiAnalysis` calls OR 3-7 days, whichever comes first.
3. Run `npm run shadow-verdict 19-C-07` locally with `DATABASE_URL` pointed at production Neon. Expect verdict=PASS via URL-coverage strategy.
4. Open the cutover PR (deletes free-text `source_citation` from bullish/bearish signal sub-schemas + the `runWithShadow` wrap + `getCitationsV2Mode` helper).
5. Wait 7 days; if no `RollbackLog` entries, open the flag-removal PR (removes the env var + any remaining references).

## Next Phase Readiness

- **Ready for the shadow window** — code is fully landed; flipping `FEATURE_CITATIONS_V2=shadow` in production begins driving `ShadowComparison` rows for `path_name='citations-v2'`.
- **Ready for 19-C-08 (CoVe two-pass)** — citations_v2 is now part of `AnalysisResult` and downstream NLI verification can attach to specific citation entries instead of free-text strings.
- **Ready for 19-Z-04 model-card-status `citations` check** — the schema, writer, and shadow strategy are all in place; the check just needs the live shadow window to populate >0 rows.
- **Operational signal:** there is no live signal yet; the shadow window has not been opened.

---
*Phase: 19-cipher-v2-0-excellence*
*Plan: 19-C-07*
*Completed: 2026-05-08*
