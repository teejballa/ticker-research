---
phase: 20
plan: 20-D-05
subsystem: regulatory-hygiene / disclaimer-audit
tags:
  - regulatory
  - disclaimer
  - audit
  - ci-gate
  - prompt-registry
requirements:
  - S10
  - S7
  - S8
requires:
  - 20-Z-04 (prompt registry)
provides:
  - disclaimer-footer@v1 (prompt registry entry)
  - price-target-hedge@v1 (prompt registry entry)
  - auditDisclaimers() (regulatory-hygiene audit)
  - npm run check-disclaimers (CI gate)
  - .github/workflows/disclaimers.yml (PR gate)
  - MODEL-CARD-disclaimer-audit.md (S4 model card)
affects:
  - src/components/ResearchReport.tsx (4 RequiredElements rendered)
tech-stack:
  added:
    - jsdom (already-installed; used by integration test harness)
  patterns:
    - "2-gate redundancy against regulatory regression (golden snapshot + auditor regex)"
    - "Strict-additive UI changes — no feature flag, no shadow lifecycle"
    - "Versioned regulatory artifact via 20-Z-04 prompt registry"
key-files:
  created:
    - src/lib/prompts/_v1/disclaimer-footer.md
    - src/lib/prompts/_v1/price-target-hedge.md
    - src/lib/eval/disclaimer-audit.ts
    - tests/eval/disclaimer-audit.unit.test.ts
    - tests/eval/disclaimer-audit.integration.test.tsx
    - scripts/audit-disclaimers.ts
    - .github/workflows/disclaimers.yml
    - .planning/phases/20-real-sentiment-analysis/MODEL-CARD-disclaimer-audit.md
  modified:
    - src/lib/prompts/registry.ts (PromptId union + 2 new entries)
    - src/components/ResearchReport.tsx (4 RequiredElements rendered)
    - tests/prompts/registry.unit.test.ts (6 new test cases)
    - tests/prompts/__snapshots__/registry.golden.test.ts.snap (2 additive entries)
    - package.json (check-disclaimers script)
decisions:
  - "Filename convention: used _v1/disclaimer-footer.md (no -v1 suffix) to match the existing 20-Z-04 convention (`_v1/<id>.md`) — the operator-spec frontmatter listing `_v1/disclaimer-footer-v1.md` was reconciled in favor of the on-disk convention."
  - "Audit script delegates rendering to vitest's jsdom integration test rather than spinning up a standalone JSDOM harness — avoids duplicating the next/navigation + NavBar shimming and reuses the same render path the integration test exercises."
  - "Per-source date prefers citations_v2[i].date_retrieved; falls back to analyzed_at.slice(0,10). Audit accepts both — documented in MODEL-CARD."
  - "Price-target hedge auto-passes when analysisResult.price_target == null (nothing to hedge)."
metrics:
  duration_minutes: 12
  completed_date: "2026-05-11"
  tasks_committed: 7
---

# Phase 20 Plan D-05: Disclaimer / appropriate-use audit (regulatory hygiene) Summary

Every Cipher research report now carries the 4 regulatory-hygiene RequiredElements
that CONTEXT.md §S10 makes non-negotiable: a versioned disclaimer footer, per-source
data-as-of timestamps, a hedging qualifier on any price_target, and a compact
sources-footer list — all wired through the 20-Z-04 prompt registry and gated by
a build-blocking CI audit.

## Tasks completed (1–7)

| Task | Name | Commit | Key files |
|------|------|--------|-----------|
| 1 | Register disclaimer-footer + price-target-hedge prompts | 7c8df70 | src/lib/prompts/_v1/disclaimer-footer.md, src/lib/prompts/_v1/price-target-hedge.md, src/lib/prompts/registry.ts, tests/prompts/registry.unit.test.ts, registry.golden snapshot |
| 2 | Failing unit tests for auditDisclaimers (RED) | f737351 | tests/eval/disclaimer-audit.unit.test.ts |
| 3 | Implement auditDisclaimers (GREEN) | 8d09cd8 | src/lib/eval/disclaimer-audit.ts |
| 4 | Render 4 RequiredElements in ResearchReport.tsx | 43252fc | src/components/ResearchReport.tsx |
| 5 | Integration test — render → audit, clean + 4 negative cases | 24cafc4 | tests/eval/disclaimer-audit.integration.test.tsx |
| 6 | scripts/audit-disclaimers.ts + npm run check-disclaimers | 2c95a2f | scripts/audit-disclaimers.ts, package.json |
| 7 | Disclaimer Audit Gate workflow + model card | 2ed7663 | .github/workflows/disclaimers.yml, MODEL-CARD-disclaimer-audit.md |

## Verification command outputs (V1–V13)

| ID | Threshold | Result |
|----|-----------|--------|
| V1 | `npm run check-disclaimers` exit 0 | **PASS** — `[audit-disclaimers] PASS — render + audit clean` |
| V2 | All 4 RequiredElements detected per fixture | **PASS** — `missing: []` on canonical fixture |
| V3 | Synthetic injection trips audit | **PASS** — see "Synthetic-injection self-test" below |
| V4 | Prompt registry entries exist (2) | **PASS** — `grep -c "disclaimer-footer" src/lib/prompts/registry.ts` ≥1; same for `price-target-hedge` |
| V5 | Unit tests green (≥8) | **PASS** — 10/10 unit tests GREEN |
| V6 | Integration tests green (≥5: clean + 4 negatives) | **PASS** — 5/5 integration tests GREEN |
| V7 | Registry unit tests green | **PASS** — 20/20 (including 6 new D-05 cases) |
| V8 | Golden snapshot diff is additive-only | **PASS** — `git diff` shows 27 inserted lines, 0 modifications; 2 new entries (`disclaimer-footer@v1`, `price-target-hedge@v1`) |
| V9 | Old disclaimer prose removed | **PASS** — `grep -c "informational purposes only" src/components/ResearchReport.tsx` returns 0 |
| V10 | "educational purposes only" appears once in src/ | **PASS** — exactly 1 (only in `src/lib/prompts/_v1/disclaimer-footer.md`) |
| V11 | Phase 29 forward-reference in PLAN + MODEL-CARD | **PASS** — multiple references in both |
| V12 | Existing ResearchReport.test.tsx stays green | **PASS** — 7/7 GREEN |
| V13 | TypeScript clean | **PASS** — `npx tsc --noEmit` exits 0 with no output |

## Synthetic-injection self-test (Task 6 Step D)

Procedure: backed up `src/lib/prompts/_v1/disclaimer-footer.md`, ran
`sed -i 's/educational purposes only/informational use/g'` on it, executed
`npm run check-disclaimers`, then restored the original file.

Result: **as expected** — the audit script's vitest run reported 1 failed test
(the integration test's `clean fixture passes audit` case detected the missing
`disclaimer_footer` element), and the script exited non-zero with
`[audit-disclaimers] FAILED — see vitest output above`. After restoring the
file, `npm run check-disclaimers` exited 0 again with all 15 tests green.

This proves the audit catches a real disclaimer-text mutation end-to-end and
that the local tree was returned to its clean state.

## Deviations from plan

| # | Type | Description | Impact |
|---|------|-------------|--------|
| 1 | Filename convention | Plan frontmatter listed `_v1/disclaimer-footer-v1.md` and `_v1/price-target-hedge-v1.md`; the existing 20-Z-04 convention uses `_v1/<id>.md` (no `-v1` suffix). Reconciled in favor of the on-disk convention. | Files created as `_v1/disclaimer-footer.md` and `_v1/price-target-hedge.md`. The action block in Task 1 acknowledged this trade-off and chose the registry convention. |
| 2 | Integration test file extension | Plan said `tests/eval/disclaimer-audit.integration.test.ts`; JSX content requires `.tsx` so esbuild can parse the `<Component />` syntax. | Renamed to `disclaimer-audit.integration.test.tsx`. Workflow `paths:` updated to include `*.test.tsx`. |
| 3 | Audit script rendering strategy | Plan suggested `react-dom/server`'s `renderToString` with a custom JSDOM shim and a next/navigation require-cache stub. The standalone shim hit `Cannot set property navigator of #<Object> which has only a getter` and `React is not defined` due to `tsx`'s `jsx: preserve` config. Pivoted to delegating render+audit to the vitest jsdom harness via `spawnSync('npx', ['vitest', 'run', ...])`. | Cleaner, no duplicate shim code, uses the same harness as the integration test, fully decoupled from Next.js runtime semantics. The script still discovers `tests/golden-tickers/` fixtures and logs them; per-fixture parameterized rendering is deferred to a follow-up when 20-D-04 formalizes its fixture schema. |

All 3 deviations are Rule 3 (auto-fix blocking issues) — none of them weaken the
4-RequiredElement contract or the build-blocking guarantee.

## Golden snapshot diff summary

```diff
+exports[`registry — golden snapshot ... > disclaimer-footer@v1 1`] = ...
+exports[`registry — golden snapshot ... > price-target-hedge@v1 1`] = ...
```

`git diff --stat`: **1 file changed, 27 insertions(+)**. Zero modifications to
existing entries. The snapshot now locks both new bodies; any future edit
without a `_v2/` bump fails CI.

## Phase 29 forward-reference

Explicitly documented in:
- `20-D-05-PLAN.md` `<universal_preamble>` (3 occurrences)
- `MODEL-CARD-disclaimer-audit.md` "Known failure modes / limitations",
  "Linked downstream", and "Forward references" sections

Public-trail / public-per-user calibration-data publication outside the
auth-gated UI is **explicitly out of scope** here and requires legal-counsel
review at Phase 29's entry gate.

## 20-D-04 fixture availability at execution time

`tests/golden-tickers/` exists on disk but contains 20-D-04 / 20-D-02 staging
artifacts (e.g. `_aspect_labels.json`, `_bot_fixtures.json`, `_human_labels/`,
`_meta/`, `_reports/`, `_sources/`) — none match the
`{ ticker, analysisResult }` fixture schema this plan consumes. The audit
script logs this and falls back to the canonical inline fixture (used by
the integration test). When 20-D-04 lands fixtures matching the schema, the
script will discover them automatically.

## Gate matrix at completion

| Gate | Status |
|------|--------|
| `npx tsc --noEmit` | **GREEN** (exit 0, no output) |
| `npm run check-disclaimers` | **GREEN** (15 audit tests, fallback fixture clean) |
| `npm run check-prompts` | **GREEN** (no version-bump-required diffs) |
| `npm run check-model-cards` | **GREEN** (0 findings) |
| `npm run check-immutability` | **GREEN** (no SentObs UPDATE/UPSERT/DELETE in src/) |
| `npm run check-telemetry-coverage` | **GREEN** (11/11 external-call modules wrapped) |
| `npm run check-lookahead` | **GREEN** (0 violations across 198 files) |
| D-05-relevant test suites | **GREEN** (118/118 — unit + integration + prompts + ResearchReport) |
| `npm test` (full suite) | 4 PRE-EXISTING FAILURES — all `DATABASE_URL` integration tests in `tests/unit/anthropic-search-branching.test.ts` + `src/lib/data/source-package.test.ts`. Unrelated to D-05 surface. |

## Open follow-ups for parallel-wave siblings

- **20-D-01** (numeric grounding regression test) — independent
- **20-D-02** (citation coverage metric) — independent
- **20-D-03** (per-claim CoVe verification extension) — independent
- **20-D-04** (8 golden tickers) — once it formalizes the
  `{ ticker, analysisResult }` fixture schema, extend
  `scripts/audit-disclaimers.ts` to render+audit each fixture in the
  vitest harness via `it.each`. Currently the script logs available
  fixtures but uses the inline fallback.

## Self-Check: PASSED

- `src/lib/prompts/_v1/disclaimer-footer.md` — FOUND
- `src/lib/prompts/_v1/price-target-hedge.md` — FOUND
- `src/lib/eval/disclaimer-audit.ts` — FOUND
- `tests/eval/disclaimer-audit.unit.test.ts` — FOUND
- `tests/eval/disclaimer-audit.integration.test.tsx` — FOUND
- `scripts/audit-disclaimers.ts` — FOUND
- `.github/workflows/disclaimers.yml` — FOUND
- `.planning/phases/20-real-sentiment-analysis/MODEL-CARD-disclaimer-audit.md` — FOUND
- Commit 7c8df70 — FOUND
- Commit f737351 — FOUND
- Commit 8d09cd8 — FOUND
- Commit 43252fc — FOUND
- Commit 24cafc4 — FOUND
- Commit 2c95a2f — FOUND
- Commit 2ed7663 — FOUND
