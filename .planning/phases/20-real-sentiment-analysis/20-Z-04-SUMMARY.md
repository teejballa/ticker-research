---
phase: 20
plan: 20-Z-04
subsystem: prompts
tags:
  - prompt-registry
  - versioned-prompts
  - golden-snapshot
  - ci-gate
  - bit-identical-refactor
  - mitchell-2019-card
  - threat-model

# Dependency graph
requires:
  - phase: 20-Z-02
    provides: model-card template + check-model-cards CI guard (the pattern this plan's S4 card follows)
provides:
  - versioned (PromptId, PromptVersion) prompt registry — 9 PromptIds × 10 (id,version) tuples (8 v1 + 1 v2 cove-pass1)
  - renderPrompt() pure substitution + missing-var guard + post-render placeholder leak scan
  - golden-snapshot regression test — body / variables / description drift fails CI
  - check-prompts CI gate — git-diff-aware version-bump enforcement
  - .github/workflows/prompts.yml — runs the gate + 5 vitest suites on every PR
  - MODEL-CARD-prompt-registry.md — S4 documentation
  - byte-identical migration of every Gemini prompt call site
affects:
  - 20-Z-05  # consumes (id, version) surface for baseline-vs-candidate eval harness
  - 20-Z-06  # consumes `npm run check-prompts` as one of its 4 done-gate branches
  - 20-D-01  # numeric-grounding regression test pins prompt versions
  - 20-B-01  # Gemini per-document classification will register its own PromptId

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Closed PromptId union — adding a new Gemini prompt MUST extend the union (TypeScript closure guard)"
    - "Template literal PromptVersion type capped at v99 — finite for IDE autocomplete"
    - "_vN/<id>.md authoritative source — YAML frontmatter + body separated by `---` line"
    - "Hand-rolled YAML frontmatter parser (no yaml dep) — line-oriented + variables-as-sequence"
    - "fs.readFileSync at module load (one-time) — outputFileTracingRoot already pins via next.config.ts"
    - "Bit-identical migration with verbatim legacy reference implementation in tests/prompts/byte-equality.unit.test.ts"
    - "Golden snapshot via vitest toMatchSnapshot — every (id, version) body locked"
    - "git-diff-aware CI gate diffing against merge-base HEAD origin/main with fallbacks"

key-files:
  created:
    - src/lib/prompts/registry.ts                                       # closed PromptId union + getPrompt + listPrompts + error classes
    - src/lib/prompts/render.ts                                         # pure {{var}} renderer + missing-var guard + post-render scan
    - src/lib/prompts/_manifest.ts                                      # fs-based loader + YAML frontmatter parser
    - src/lib/prompts/_v1/gemini-research-brief-system.md               # SYSTEM_PROMPT body verbatim
    - src/lib/prompts/_v1/gemini-research-brief-user.md                 # buildUserPrompt template
    - src/lib/prompts/_v1/gemini-engine-context-block-no-data.md        # NO_DATA branch
    - src/lib/prompts/_v1/gemini-engine-context-block-active.md         # ACTIVE branch
    - src/lib/prompts/_v1/gemini-technical-context-block.md             # Phase 16 technical block
    - src/lib/prompts/_v1/gemini-smart-money-context-block.md           # Phase 17-04 smart-money block
    - src/lib/prompts/_v1/gemini-cove-pass1-instruction.md              # CoVe Pass-1 (legacy wording)
    - src/lib/prompts/_v1/gemini-citations-section.md                   # Phase 19-C-07 citations
    - src/lib/prompts/_v1/gemini-cycle-summary.md                       # diffusion cron summary
    - src/lib/prompts/_v2/gemini-cove-pass1-instruction.md              # v2 numeric-grounded — version-bump exercise
    - tests/prompts/registry.unit.test.ts                               # 12 tests — registry contract
    - tests/prompts/render.unit.test.ts                                 # 7 tests — render guards
    - tests/prompts/byte-equality.unit.test.ts                          # 26 tests — verbatim-legacy bit-identical proof
    - tests/prompts/registry.golden.test.ts                             # 10 snapshots
    - tests/prompts/__snapshots__/registry.golden.test.ts.snap          # 10 snapshots committed
    - tests/prompts/version-bump.fixture.test.ts                        # 4 tests — fixture that snapshot mechanism fires
    - tests/prompts/integration.smoke.test.ts                           # 12 tests — render every prompt with mock vars
    - tests/prompts/check-prompt-versions.unit.test.ts                  # 7 tests — script helpers
    - scripts/check-prompt-versions.ts                                  # git-diff-aware CI gate
    - .github/workflows/prompts.yml                                     # CI workflow filter scope + 2 gates
    - .planning/phases/20-real-sentiment-analysis/MODEL-CARD-prompt-registry.md  # S4 card
  modified:
    - src/lib/gemini-analysis.ts                                        # 8 inline prompt literals → renderPrompt() calls
    - src/lib/research-brief.ts                                         # renderCitationsSection → renderPrompt()
    - src/app/api/cron/learn/route.ts                                   # cycle-summary inline → renderPrompt()
    - package.json                                                      # +"check-prompts" npm script

key-decisions:
  - "Split engine-context-block into two PromptIds (NO_DATA + ACTIVE) — the branches have substantially different bodies and very different variable lists (NO_DATA carries only cycle_count; ACTIVE carries 15 fields). Splitting kept each template clean and the variables array honest, at the cost of widening the PromptId union from 8 to 9 entries (still within the 99-entry template-literal-type cap)."
  - "Created _v2/gemini-cove-pass1-instruction.md in Task 2 instead of Task 5 because Task 1's tests assert that getPrompt('gemini-cove-pass1-instruction') returns v2 (the default-to-latest-non-deprecated behavior). Without v2 present, the Task-1 tests would have failed at Task 2's GREEN gate. Task 5's remaining work (call-site pin to 'v1' + TODO comment + body-diff verification + extended unit tests) all landed in Tasks 2/3."
  - "Hand-rolled YAML frontmatter parser instead of pulling in `yaml` dep. The format is fixed (id + version + description + created_at + deprecated_at + variables-as-sequence). ~30 lines of parser code beat a transitive dep — also keeps the registry's pure-stdlib boundary clean."
  - "Embedded the manifest loader via fs.readFileSync at module load (not Webpack `?raw` imports). Next.js + Vercel honor outputFileTracingRoot (already set in next.config.ts) so the .md files travel with the bundle. Avoids the brittleness of Webpack raw-loader configurations."
  - "Pinned the live CoVe call site to v1 explicitly (renderPrompt('gemini-cove-pass1-instruction', {}, 'v1')) rather than defaulting to v2. Per the plan's success criterion #4 + S5: version pins are operator decisions, not silent upgrades. 20-Z-05's eval harness will confirm v2 is a non-regression before the pin shifts."
  - "Golden snapshot deliberately excludes created_at + deprecated_at — those are operational metadata that can change over time (created_at is append-only but reformatting is allowed; deprecated_at is a real-time signal). Only template body + variables array + description are body-of-the-prompt and locked."
  - "check-prompt-versions.ts treats whitespace-only diffs as warnings, not errors. Per T-20-Z-04-02 (accepted threat) — blocking would generate false positives on legitimate template-body cleanup; the eval harness (20-Z-05) will surface no-op changes as zero metric delta, which is the natural deterrent. The golden snapshot test STILL catches whitespace-only edits (different bytes → different snapshot)."
  - "Bit-identical migration proven through 26 byte-equality assertions against a verbatim legacy reference implementation copied from git revision 6464235. Covers 7 buildUserPrompt scenarios + 10 context-block scenarios + cove + citations + cycle-summary. Every existing Gemini test stays GREEN, confirming the AnalysisResult shape is unchanged."

requirements-completed: []

# Metrics
duration: 23min
completed: 2026-05-11
---

# Phase 20 Plan 20-Z-04: Prompt Registry + Golden-File Regression Summary

## Self-Check: PASSED

All claims verified before completion:
- All 24 created files exist on disk (verified via filesystem checks + cat in commits)
- All 7 task commits present in git log: 131bde8 / 6464235 / ab5f39c / 32fc8c4 / 3f28e9b / 5e60377 (Task 5 bundled into 2 + 3 per the key-decisions rationale)
- `npx tsc --noEmit` exits 0
- `npm test` exits 0 — 864 passed / 1 skipped / 3 todo (93 test files)
- `npm run check-prompts` exits 0 on clean tree
- `grep -c "You are a senior equity research analyst" src/lib/gemini-analysis.ts` → 0 (literal deleted)
- `grep -rc "You are a senior equity research analyst" src/` → 1 location (only `_v1/gemini-research-brief-system.md`)
- `grep -c "CHAIN-OF-VERIFICATION (Pass 1)" src/lib/gemini-analysis.ts` → 0
- `grep -c "renderPrompt(" src/lib/gemini-analysis.ts` → 8 (≥5 required)
- `grep -c "renderPrompt(" src/lib/research-brief.ts` → 1 (≥1)
- `grep -c "renderPrompt(" src/app/api/cron/learn/route.ts` → 1 (≥1)
- `ls src/lib/prompts/_v1/*.md | wc -l` → 9 (≥8 required; one extra because engine-context-block was split into NO_DATA + ACTIVE per the documented key-decision)
- `ls src/lib/prompts/_v2/*.md | wc -l` → 1 (≥1)
- `grep -c "TODO(20-Z-05)" src/lib/gemini-analysis.ts` → 1 (live pin documented)
- Working tree clean (`git status --short` empty)

## One-liner

Every Gemini prompt in the Cipher codebase is now a versioned `(PromptId, PromptVersion)` artifact under `src/lib/prompts/_vN/<id>.md`. Bit-identical migration proven through 26 byte-equality assertions; CI gate (`scripts/check-prompt-versions.ts` + `tests/prompts/registry.golden.test.ts.snap` + `.github/workflows/prompts.yml`) blocks any prompt body change that lacks a sibling `_v(N+1)/` directory. End-to-end version bump exercised on `gemini-cove-pass1-instruction` (v1 + v2 both loadable; live call site pinned to v1 awaiting 20-Z-05 eval).

## Performance

- **Duration:** 23 minutes
- **Started:** 2026-05-12T04:43:11Z
- **Completed:** 2026-05-12T05:06:54Z
- **Tasks:** 6 atomic commits (Tasks 1–4, 6, 7 — Task 5 bundled into 2 + 3 per documented decision)

## Registered PromptIds (final list)

| PromptId | Versions | Latest non-deprecated | Live call site |
|----------|----------|-----------------------|----------------|
| gemini-research-brief-system | v1 | v1 | gemini-analysis.ts line 169 (`SYSTEM_PROMPT`) |
| gemini-research-brief-user | v1 | v1 | gemini-analysis.ts buildUserPrompt |
| gemini-engine-context-block-no-data | v1 | v1 | gemini-analysis.ts buildEngineContextBlock NO_DATA branch |
| gemini-engine-context-block-active | v1 | v1 | gemini-analysis.ts buildEngineContextBlock ACTIVE branch |
| gemini-technical-context-block | v1 | v1 | gemini-analysis.ts buildTechnicalContextBlock |
| gemini-smart-money-context-block | v1 | v1 | gemini-analysis.ts buildSmartMoneyContextBlock |
| gemini-cove-pass1-instruction | v1, v2 | v2 | gemini-analysis.ts coveSection — pinned to **'v1'** explicitly (TODO 20-Z-05) |
| gemini-citations-section | v1 | v1 | research-brief.ts renderCitationsSection |
| gemini-cycle-summary | v1 | v1 | cron/learn/route.ts maybeWriteCycleSummary |

**10 (id, version) tuples total — 9 v1 + 1 v2.**

## Migrated Call-Site Audit

Pre-migration grep counts (HEAD~5 baseline) vs post-migration:

| File | Inline prompt literals (before) | renderPrompt() calls (after) | Critical phrase grep |
|------|---------------------------------|------------------------------|----------------------|
| src/lib/gemini-analysis.ts | 6 inline literals (SYSTEM_PROMPT, 4 context-block templates, CoVe Pass-1, user-prompt concatenation) | 8 renderPrompt() calls | "You are a senior equity research analyst" → 0; "CHAIN-OF-VERIFICATION (Pass 1)" → 0 |
| src/lib/research-brief.ts | 1 inline literal (renderCitationsSection lines.join('\n')) | 1 renderPrompt() call | "Available citations" → 0 (now in v1 .md) |
| src/app/api/cron/learn/route.ts | 1 inline literal (cycle summary template literal at line 869) | 1 renderPrompt() call | "Write a single-sentence research-log entry" → 0 (now in v1 .md) |
| **Total** | **8 inline literals** | **10 renderPrompt() calls** | All 3 critical phrases at zero in source |

## Snapshot file

- Path: `tests/prompts/__snapshots__/registry.golden.test.ts.snap`
- Entries: **10** (9 v1 + 1 v2)
- Size: 22,493 bytes / 330 lines
- Committed to git in Task 4 commit `32fc8c4`

## CI gate self-test result

**Synthetic single-character mutation to `_v1/gemini-cycle-summary.md` without a sibling `_v2/`:**

```
$ git diff --name-only $base..HEAD -- src/lib/prompts/
src/lib/prompts/_v1/gemini-cycle-summary.md

$ # Manually exercised the gate logic against this diff
$ node -e '...inline reproduction...'
Issues: [
  {
    path: 'src/lib/prompts/_v1/gemini-cycle-summary.md',
    kind: 'body-change-without-bump'
  }
]
GATE WOULD FIRE — exit 1
Inline gate exit code: 1
```

The synthetic commit was reverted; the clean tree returns to `[check-prompts] all prompt diffs versioned correctly — green.` exit 0. This self-test result is documented in the Task 6 commit message (`3f28e9b`).

**The 7 unit tests in `tests/prompts/check-prompt-versions.unit.test.ts` ALSO assert the pure helpers (`parseVersionPath`, `siblingNextVersionAddedInDiff`) return the correct values for the trip / no-trip scenarios — these run in every PR via CI.**

## Decision: engine-context-block split

Per Task 2 Step C item 3, the plan permitted splitting `gemini-engine-context-block` into two PromptIds if the NO_DATA branch was non-trivially different from the ACTIVE branch.

**Decision: SPLIT.** The two branches have:

- Very different bodies (5-line NO_DATA paragraph vs 30-line ACTIVE table with 15 numeric slots)
- Very different `variables` declarations (NO_DATA: `[cycle_count]` only; ACTIVE: 15 fields)
- Different call-site routes (`if (ctx.status === 'NO_DATA') { renderPrompt(...no-data...) } else { renderPrompt(...active...) }` is cleaner than a single template trying to switch via a branch-text variable)

Net effect: PromptId union grew from the plan's nominal 8 to **9** entries. The added entry is captured in `listPrompts()`, the golden snapshot, the integration smoke test, the model card, and the registry's closure guard.

## Forward references confirmed

- **20-Z-05 (LLM-as-judge eval harness)** — will consume `getPrompt(id, version)` to compare baseline vs candidate prompts. The `cove-pass1-instruction` v1↔v2 pair is the first prompt pair the harness will measure (numeric-grounding delta, citation-coverage delta, narrative coherence). Once the harness confirms v2 is a non-regression, the live call-site pin in `gemini-analysis.ts` flips from `'v1'` to the default (which resolves to v2 = latest non-deprecated). That call-site change is 20-Z-05's responsibility, not this plan's.
- **20-Z-06 (composite Phase-20 done gate)** — `npm run phase-20-status` will compose `npm run check-prompts` as one of its 4 done-gate branches (alongside `check-model-cards` from 20-Z-02 + lookahead test from 20-Z-07 + golden-ticker regression from 20-D-04).
- **20-D-01 (numeric-grounding regression test)** — will pin prompt versions per golden ticker (e.g. "AAPL frozen on gemini-research-brief-system@v1") so the test can detect regressions caused by a future prompt-bump.
- **20-B-01 (Gemini per-document classification)** — will register a new `gemini-per-document-classification` PromptId for per-document sentiment scoring. Future plan responsibility.

## Out-of-scope follow-up

Per the `<gemini_call_sites_audit>` OUT-OF-SCOPE block in the plan, the following Anthropic SDK call sites use the `web_search_20250305` tool (which is Anthropic-native, not routed through the Vercel AI Gateway) and are NOT yet covered by the registry:

1. `src/lib/gemini-analysis.ts:387` — Haiku community-discovery (map prompt)
2. `src/lib/gemini-analysis.ts:405` — Haiku community-discovery (thread prompt)
3. `src/lib/gemini-analysis.ts:503` — Haiku community-extraction
4. `src/lib/data/anthropic-search.ts:60, 118, 179, 235` — 4 Anthropic web-search prompts
5. `src/lib/data/security-type.ts:60` — security-type classifier prompt

A follow-up plan (working name `20-Z-04b`) will extend the registry with the same `getPrompt`/`renderPrompt` API + additional PromptIds (e.g. `anthropic-community-discovery-niche-map`, `anthropic-community-discovery-niche-threads`, `anthropic-community-extraction`, `anthropic-web-search-news`, `anthropic-web-search-sec-filings`, `anthropic-security-type-classify`). Scoped this way because the Anthropic SDK call sites use a different SDK entrypoint (`anthropicClient.messages.create`) than the Gemini call sites (`generateText`), so the wrapping migration is a different shape than this plan's `generateText`/`generateObject` migration.

## Deviations from Plan

### [Rule 3 - Blocking issue] Task 5 v2 file ordering

- **Found during:** Task 1 → Task 2 boundary. Task 1 tests assert `getPrompt('gemini-cove-pass1-instruction')` returns v2 (latest-non-deprecated default). Task 2's acceptance criterion is "16+ unit tests GREEN" — but the plan's Task 5 description schedules the v2 file creation AFTER Task 2.
- **Fix:** Created `_v2/gemini-cove-pass1-instruction.md` in Task 2 alongside the v1 files, so Task 1's tests pass at Task 2's GREEN gate. Task 5's other deliverables (call-site `'v1'` explicit pin, TODO(20-Z-05) comment, snapshot containing the v2 entry, body-diff ≥4 lines proven) all landed in Tasks 2/3/4.
- **Files modified:** `src/lib/prompts/_v2/gemini-cove-pass1-instruction.md` created in Task 2 commit `6464235`.
- **Why this is Rule 3**: the test ordering created a strict dependency — Task 2 GREEN requires v2 present. Auto-resolved by relocating the file creation; the plan's substantive Task 5 outcomes (v2 loadable, v1 still loadable, live pin explicit, snapshot includes v2, diff non-trivial) are all preserved.

### [Rule 2 - Critical functionality] Added byte-equality test file (not in plan)

- **Found during:** Task 3 migration. The plan asserts "bit-identical refactor" but provided no programmatic proof beyond "existing Gemini integration tests stay green." Existing tests use `.toContain` semantic checks, which would not catch a subtle byte-level drift (e.g., missing leading newline, padding-vs-no-padding).
- **Fix:** Added `tests/prompts/byte-equality.unit.test.ts` (26 tests) with verbatim legacy reference implementations of `buildUserPrompt`, `buildEngineContextBlock`, `buildTechnicalContextBlock`, `buildSmartMoneyContextBlock`, and renderCitationsSection's `lines.join('\n')` shape. Each refactored function's output is asserted byte-equal to its legacy reference across multiple combinatoric fixtures.
- **Files modified:** `tests/prompts/byte-equality.unit.test.ts` created in Task 3 commit `ab5f39c`.
- **Why this is Rule 2**: the success-criterion's bit-identical claim deserved a programmatic guarantee, not just a regression-via-coverage argument. Existing tests + byte-equality together give 5× the assurance.

## Auth Gates Encountered

None — pure TS refactor + new CI script. No external services touched; no env-var changes; no DB push.

## Known Stubs

None. The CoVe v2 prompt is a real prompt-engineering improvement, not a stub. The live call site explicitly pins v1 with a TODO comment documenting the cutover-pending state — this is intentional version-pinning per S5, not a stub. The 5 Anthropic-SDK call sites enumerated in "Out-of-scope follow-up" are NOT stubs either — they currently work correctly with inline literals; the registry will extend to cover them in a separate plan.

## Issues Encountered

Pre-existing PostToolUse-validator errors on `src/lib/gemini-analysis.ts` (5 errors: lines 12, 34, 45, 48, 651 — direct Anthropic SDK import + model-slug hyphens + provider-key path). These pre-date this plan and are logged in `.planning/phases/20-real-sentiment-analysis/deferred-items.md` (carried forward from the 20-Z-03 SUMMARY which first surfaced them). The file's own comment block at lines 9–11 explains why the direct Anthropic SDK is used (Pool B niche-community discovery requires the `web_search_20250305` tool which is not yet AI-Gateway-routed). Migrating these is the scope of a future Wave-B plan, not 20-Z-04.

## Threat Model Coverage

All four plan-level threats mitigated and grep-checkable in the committed tree:

| Threat ID | Mitigation status |
|-----------|-------------------|
| T-20-Z-04-01 (silent prompt drift) | `tests/prompts/registry.golden.test.ts` + `tests/prompts/__snapshots__/registry.golden.test.ts.snap` snapshots every body. `scripts/check-prompt-versions.ts` git-diffs `src/lib/prompts/_v*/` and exits 1 on body-edit without sibling `_v(N+1)/`. Both wired into `.github/workflows/prompts.yml`. |
| T-20-Z-04-02 (vanity bumps) | check-prompt-versions.ts emits **warning** for whitespace-only diffs but does not block (accepted threat per plan rationale). Golden snapshot still catches them, so reviewers can challenge no-op bumps. |
| T-20-Z-04-03 (injection via unfilled vars) | render.ts step 1 asserts every declared `variables` entry is present in `vars`; step 3 scans rendered output for any `{{…}}` remnants and throws. Both guards exercised by `tests/prompts/render.unit.test.ts`. |
| T-20-Z-04-04 (stale literal leftovers) | Cleanup gates: `grep -c 'You are a senior equity research analyst' src/lib/gemini-analysis.ts` → 0; `grep -c 'CHAIN-OF-VERIFICATION (Pass 1)' src/lib/gemini-analysis.ts` → 0; per-file `renderPrompt(` counts above the minimum. Verified at every task commit. |

## Numerical Acceptance (CONTEXT §S8)

All gates checked at end of execution:

| Gate | Required | Actual | Pass |
|------|----------|--------|------|
| `npx tsc --noEmit` exit code | 0 | 0 | ✅ |
| `npm test` exit code | 0 | 0 (864 / 1 / 3) | ✅ |
| `npm run check-prompts` exit code | 0 | 0 | ✅ |
| `grep -c "renderPrompt(" src/lib/gemini-analysis.ts` | ≥ 5 | 8 | ✅ |
| `grep -c "renderPrompt(" src/lib/research-brief.ts` | ≥ 1 | 1 | ✅ |
| `grep -c "renderPrompt(" src/app/api/cron/learn/route.ts` | ≥ 1 | 1 | ✅ |
| `grep -c "You are a senior equity research analyst" src/lib/gemini-analysis.ts` | 0 | 0 | ✅ |
| `grep -c "CHAIN-OF-VERIFICATION (Pass 1)" src/lib/gemini-analysis.ts` | 0 | 0 | ✅ |
| `grep -rc "You are a senior equity research analyst" src/` non-zero locations | 1 | 1 | ✅ |
| `ls src/lib/prompts/_v1/*.md` count | ≥ 8 | 9 | ✅ |
| `ls src/lib/prompts/_v2/*.md` count | ≥ 1 | 1 | ✅ |
| `listPrompts()` entry count | ≥ 9 | 10 | ✅ |
| Snapshot file entry count | ≥ 9 | 10 | ✅ |
| Body diff between v1 & v2 of cove-pass1 (lines) | ≥ 4 | 12 | ✅ |
| TODO(20-Z-05) marker in live call site | 1 | 1 | ✅ |
| Test count in `tests/prompts/` | ≥ 30 | 78 | ✅ |

## User Setup Required

None — pure TS refactor + new CI script + new CI workflow file. No external service configuration. No env-var changes. No DB push. No flag changes.

**Operator follow-up (not this plan's responsibility):** when 20-Z-05 ships and confirms v2 of `gemini-cove-pass1-instruction` is a non-regression on numeric-grounding metrics, edit `src/lib/gemini-analysis.ts` to remove the `'v1'` explicit pin (let `renderPrompt('gemini-cove-pass1-instruction', {})` default to latest-non-deprecated = v2) and the TODO(20-Z-05) comment.

## Task Commits

Each task committed atomically:

1. **Task 1: Failing tests RED** — `131bde8` (test)
2. **Task 2: Registry + render + 9 v1 markdown bodies + v2 cove (early per Rule-3 deviation)** — `6464235` (feat)
3. **Task 3: Migrate 5 Gemini call sites + 26 byte-equality assertions** — `ab5f39c` (refactor)
4. **Task 4: Golden snapshot + version-bump fixture** — `32fc8c4` (test)
5. **Task 5: Bundled into 2 + 3 + 4 per Rule-3 deviation** — no separate commit
6. **Task 6: scripts/check-prompt-versions.ts + workflow + 7 helper tests** — `3f28e9b` (ci)
7. **Task 7: MODEL-CARD + integration smoke test** — `5e60377` (docs)

Plus this SUMMARY's metadata commit (final step).

---
*Phase: 20-real-sentiment-analysis*
*Completed: 2026-05-11*
