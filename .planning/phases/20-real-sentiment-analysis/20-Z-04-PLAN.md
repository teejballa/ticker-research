---
phase: 20
plan: 20-Z-04
wave: Z
type: execute
depends_on: []
files_modified:
  - src/lib/prompts/registry.ts
  - src/lib/prompts/render.ts
  - src/lib/prompts/_v1/gemini-research-brief-system.md
  - src/lib/prompts/_v1/gemini-research-brief-user.md
  - src/lib/prompts/_v1/gemini-engine-context-block.md
  - src/lib/prompts/_v1/gemini-technical-context-block.md
  - src/lib/prompts/_v1/gemini-smart-money-context-block.md
  - src/lib/prompts/_v1/gemini-cove-pass1-instruction.md
  - src/lib/prompts/_v1/gemini-citations-section.md
  - src/lib/prompts/_v1/gemini-cycle-summary.md
  - src/lib/prompts/_v2/gemini-cove-pass1-instruction.md
  - src/lib/gemini-analysis.ts
  - src/lib/research-brief.ts
  - src/app/api/cron/learn/route.ts
  - tests/prompts/registry.unit.test.ts
  - tests/prompts/render.unit.test.ts
  - tests/prompts/registry.golden.test.ts
  - tests/prompts/__snapshots__/registry.golden.test.ts.snap
  - tests/prompts/version-bump.fixture.test.ts
  - scripts/check-prompt-versions.ts
  - .github/workflows/prompts.yml
  - package.json
  - .planning/phases/20-real-sentiment-analysis/MODEL-CARD-prompt-registry.md
autonomous: true
requirements: []
shadow_required: false
shadow_skip_reason: "Registry is a refactor with bit-identical output. Every call site swaps a string literal for renderPrompt('id', vars) where the rendered string is byte-equal to today's literal under v1. No behavior change → no shadow lifecycle to gate. The version-bump exercise (Task 5) creates v2 of one prompt; it is opt-in via getPrompt('id', 'v2') and never wired into the live call sites in this plan."
hard_cleanup_gate: true
must_haves:
  truths:
    - "src/lib/prompts/registry.ts exports a closed PromptId union covering every Gemini prompt currently inlined in the codebase (≥8 entries: research-brief-system, research-brief-user, engine-context-block, technical-context-block, smart-money-context-block, cove-pass1-instruction, citations-section, cycle-summary)"
    - "renderPrompt(id, vars, version?) substitutes {{var}} placeholders, defaults to latest non-deprecated version, throws PromptVarMissingError on missing required vars, throws PromptUnknownIdError on unknown id, throws PromptVersionUnknownError on unknown version"
    - "Every Gemini call site (generateText|generateObject|streamText|streamObject) reaches its prompt strings through renderPrompt() — zero remaining inline prompt string literals in src/lib/gemini-analysis.ts, src/lib/research-brief.ts, src/app/api/cron/learn/route.ts that feed a Gemini call"
    - "src/lib/prompts/_v1/ contains one .md file per registered PromptId, each with frontmatter (id, version, created_at, deprecated_at: null, variables: string[], description: string) and a body containing the template (with {{var}} placeholders)"
    - "tests/prompts/registry.golden.test.ts snapshots the body of every (id, version) tuple — modifying a v1 body without bumping to v2 fails the build"
    - "scripts/check-prompt-versions.ts compares HEAD vs main for changes under src/lib/prompts/_v*/; non-whitespace changes inside an existing _vN/ directory exit non-zero unless a corresponding _vN+1/ directory also exists in the diff"
    - "npm run check-prompts wraps the script; CI workflow .github/workflows/prompts.yml runs check-prompts + the golden snapshot test on every PR touching src/lib/prompts/**"
    - "End-to-end version bump exercised: gemini-cove-pass1-instruction has both v1 (current behavior) and v2 (Task 5 improved wording) committed; v2 is loadable via getPrompt('gemini-cove-pass1-instruction','v2') and the version-bump.fixture.test.ts proves the snapshot diff fails when v2 body diverges from v1 without the _v2/ directory"
    - "Migration leaves zero stale Gemini prompt string literals: grep for the SYSTEM_PROMPT constant body shows it ONLY in src/lib/prompts/_v1/gemini-research-brief-system.md (the original const becomes a thin re-export from registry for backward compat with the existing test fixtures or is removed entirely if no tests depend on it)"
    - "Renderer is pure (no Prisma, no fs at request-time after module load — prompts are bundled at import); registry tests run with no env vars"
    - "MODEL-CARD-prompt-registry.md exists per S4 and references this plan + 20-Z-02 template"
  artifacts:
    - path: "src/lib/prompts/registry.ts"
      provides: "Closed PromptId union + RegisteredPrompt registry + getPrompt(id, version?) loader"
      contains: "export type PromptId"
    - path: "src/lib/prompts/render.ts"
      provides: "renderPrompt(id, vars, version?) — pure {{var}} substitution + missing-var guard"
      contains: "export function renderPrompt"
    - path: "src/lib/prompts/_v1/gemini-research-brief-system.md"
      provides: "v1 of the Wall Street analyst system prompt (verbatim copy of current SYSTEM_PROMPT)"
      contains: "REQUIRED OUTPUT SECTIONS"
    - path: "src/lib/prompts/_v1/gemini-research-brief-user.md"
      provides: "v1 user prompt template with placeholders for brief, news, community, sentiment-intelligence sections"
      contains: "{{brief}}"
    - path: "src/lib/prompts/_v1/gemini-engine-context-block.md"
      provides: "v1 engine calibration block (extracted from buildEngineContextBlock)"
      contains: "ENGINE CALIBRATION CONTEXT"
    - path: "src/lib/prompts/_v1/gemini-technical-context-block.md"
      provides: "v1 technical calibration block (extracted from buildTechnicalContextBlock)"
      contains: "TECHNICAL CALIBRATION CONTEXT"
    - path: "src/lib/prompts/_v1/gemini-smart-money-context-block.md"
      provides: "v1 smart-money block (extracted from buildSmartMoneyContextBlock)"
      contains: "SMART MONEY CALIBRATION CONTEXT"
    - path: "src/lib/prompts/_v1/gemini-cove-pass1-instruction.md"
      provides: "v1 CoVe Pass-1 instruction (extracted from gemini-analysis.ts inline string)"
      contains: "CHAIN-OF-VERIFICATION"
    - path: "src/lib/prompts/_v1/gemini-citations-section.md"
      provides: "v1 citations section (extracted from renderCitationsSection)"
      contains: "CITATIONS"
    - path: "src/lib/prompts/_v1/gemini-cycle-summary.md"
      provides: "v1 of the diffusion-engine cycle summary haiku prompt (extracted from cron/learn/route.ts)"
      contains: "diffusion engine cycle"
    - path: "src/lib/prompts/_v2/gemini-cove-pass1-instruction.md"
      provides: "v2 of the CoVe Pass-1 instruction — exists to prove the version-bump path works end-to-end (CONTEXT.md acceptance: ≥1 version bump exercised)"
      contains: "version: v2"
    - path: "tests/prompts/registry.golden.test.ts"
      provides: "Snapshot test — every (id, version) body is snapshotted; a body change without a version bump fails the build"
      contains: "toMatchSnapshot"
    - path: "tests/prompts/version-bump.fixture.test.ts"
      provides: "Synthetic test that programmatically edits a v1 body in a temp tree and asserts the golden snapshot diff would fire"
      contains: "version-bump fixture"
    - path: "scripts/check-prompt-versions.ts"
      provides: "Git-diff-aware script: any non-whitespace change to src/lib/prompts/_vN/*.md without a sibling _vN+1/ entry exits non-zero"
      contains: "git diff"
    - path: ".github/workflows/prompts.yml"
      provides: "CI gate — runs npm run check-prompts + tests/prompts/registry.golden.test.ts on every PR that modifies src/lib/prompts/** or src/lib/gemini-analysis.ts"
      contains: "check-prompts"
    - path: ".planning/phases/20-real-sentiment-analysis/MODEL-CARD-prompt-registry.md"
      provides: "Model card per S4 — prompt registry as a versioned reasoning artifact"
      contains: "Prompt Registry"
  key_links:
    - from: "src/lib/gemini-analysis.ts SYSTEM_PROMPT call site"
      to: "renderPrompt('gemini-research-brief-system', {})"
      via: "string literal → registry lookup at module load"
      pattern: "renderPrompt\\('gemini-research-brief-system'"
    - from: "src/lib/gemini-analysis.ts buildUserPrompt"
      to: "renderPrompt('gemini-research-brief-user', { brief, news_sources, sentiment_intelligence, community_intelligence })"
      via: "buildUserPrompt() now composes via the registry instead of string concatenation"
      pattern: "renderPrompt\\('gemini-research-brief-user'"
    - from: "src/app/api/cron/learn/route.ts maybeWriteCycleSummary"
      to: "renderPrompt('gemini-cycle-summary', { stats })"
      via: "inline prompt string → registry lookup"
      pattern: "renderPrompt\\('gemini-cycle-summary'"
    - from: ".github/workflows/prompts.yml"
      to: "scripts/check-prompt-versions.ts + tests/prompts/registry.golden.test.ts"
      via: "npm run check-prompts && npx vitest run tests/prompts/registry.golden.test.ts"
      pattern: "check-prompts"
    - from: "src/lib/prompts/registry.ts PromptId union"
      to: "20-Z-05 (eval harness) — consumes the version-pinning surface this plan provides"
      via: "scripts/eval-report.ts will accept (id, version_a, version_b) and route through getPrompt() to render baseline-vs-candidate"
      pattern: "20-Z-05"
---

# Plan 20-Z-04: Prompt registry + golden-file regression

<universal_preamble>

## Autonomous Execution Clause

This plan is fully autonomous. No live-Neon push, no operator confirmation needed — the registry is a TS-only refactor + new CI gate. No external services touched.

## Hard Cleanup Gate (Definition of Done)

A plan is **NOT complete** until:

1. **No shadow lifecycle to graduate** (S3 N/A — bit-identical refactor; documented in `shadow_skip_reason`)
2. **All inline Gemini prompt literals deleted** from `src/lib/gemini-analysis.ts`, `src/lib/research-brief.ts`, `src/app/api/cron/learn/route.ts`. The original `SYSTEM_PROMPT` const may remain as `export const SYSTEM_PROMPT = renderPrompt('gemini-research-brief-system', {})` for backward-compat with existing tests, but its body MUST live in `src/lib/prompts/_v1/gemini-research-brief-system.md` only.
3. **No feature flag introduced** (refactor; the version-pin surface IS the feature)
4. `npm test`, `npm run test:integration`, `npm run test:e2e` all green on `main` post-commit. Existing Gemini integration tests (`src/lib/gemini-analysis.test.ts`, `src/lib/__tests__/gemini-analysis.test.ts`, `src/app/api/analysis/__tests__/route.test.ts`, `tests/integration/citations-v2.shadow.live.test.ts`, `tests/integration/cove.shadow.live.test.ts`) MUST stay green — proving bit-identical output.
5. **Registry coverage gate**: `grep -rE "(generateText|generateObject|streamText|streamObject)" src/ --include='*.ts' | grep -v '/prompts/' | grep -v '\.test\.' | grep -v '__tests__'` — every match must, in the same file, also contain a `renderPrompt(` or `getPrompt(` call OR be a comment / type import. CI script enforces.
6. **Migration completeness gate**: `grep -c 'You are a senior equity research analyst' src/` returns exactly 1 (only the `_v1/gemini-research-brief-system.md` file).
7. **Version-bump gate**: `getPrompt('gemini-cove-pass1-instruction', 'v2')` resolves; `getPrompt('gemini-cove-pass1-instruction')` (no version arg) returns v2 (latest non-deprecated); `getPrompt('gemini-cove-pass1-instruction', 'v1')` still resolves (no breakage of historical pin).
8. **Golden snapshot gate**: `npx vitest run tests/prompts/registry.golden.test.ts` exits 0 on a clean tree. Synthetic test `tests/prompts/version-bump.fixture.test.ts` proves the snapshot mechanism would fire on an unauthorized body change.
9. **CI gate live**: `.github/workflows/prompts.yml` exists and triggers `paths: ['src/lib/prompts/**', 'src/lib/gemini-analysis.ts', 'src/lib/research-brief.ts', 'src/app/api/cron/learn/route.ts']`.

## Cross-cutting standards adherence (CONTEXT.md §S1-S10)

- **S1 (no hand-picked parameters)** — N/A: this plan ships no thresholds, weights, or hyperparameters. The closest thing to a parameter is the `MAX_VERSION_NUMBER` cap on the `PromptVersion` template literal type, which is purely a TS soundness affordance.
- **S5 (pinned model + prompt versions)** — CORE INVARIANT of this plan. Every Gemini prompt becomes a `(id, version)` tuple. The version-bump gate (Task 5) exercises the bump end-to-end so the convention is proven, not just declared.
- **S7 (threat model)** — four plan-level threats `T-20-Z-04-{01..04}` covering silent prompt drift, vanity bumps, prompt injection via unfilled vars, and stale literal leftovers.
- **S8 (numerical acceptance)** — every DONE criterion is grep-count, snapshot-equality, or test-exit-code. Zero adjectives.
- **S6 (telemetry)** — N/A directly; the existing `withTelemetry()` from 20-Z-03 wraps the Gemini call site, NOT the prompt construction. Versioned prompts will appear in telemetry as a `prompt_id|version` tag in a follow-up wiring (out of scope for this plan).

## Forward references

- **20-Z-05 (LLM-as-judge eval harness)** consumes this plan's `(id, version)` surface. Its `scripts/eval-report.ts` will accept `--baseline-version v1 --candidate-version v2` for any registered prompt and produce BLEU + numeric-grounding + citation-coverage delta. THIS plan provides ONLY the version-pinning + golden-diff regression. Side-by-side eval is OUT OF SCOPE.
- **20-D-01 (numeric grounding test)** is a separate downstream consumer of the registry. Out of scope here.
- **20-Z-06 (composite phase done gate)** will treat the existence + green-ness of `npm run check-prompts` as one of its 4 branches.

</universal_preamble>

<objective>
Create a versioned prompt registry that turns every inlined Gemini prompt string into a `(PromptId, PromptVersion)` artifact with a golden-file regression that fails the build when a prompt body changes without a version bump. Migrate every existing Gemini prompt in the codebase to the registry. Exercise the version-bump path end-to-end on one prompt (`gemini-cove-pass1-instruction`). Add a CI gate (`npm run check-prompts`) that diff-checks `src/lib/prompts/_v*/` against `main` and fails on unauthorized body changes.

The registry is the version-pinning surface area that 20-Z-05 (eval harness) consumes. It is also the precondition for any future A/B prompt experiment, since today's codebase has no way to render "yesterday's prompt" against "today's prompt."
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/20-real-sentiment-analysis/CONTEXT.md
@CLAUDE.md
@src/lib/gemini-analysis.ts
@src/lib/research-brief.ts
@src/app/api/cron/learn/route.ts
@src/lib/reasoning/cove.ts
@.planning/phases/19-cipher-v2-0-excellence/19-A-01-PLAN.md

<gemini_call_sites_audit>
<!-- Pre-computed audit of every Gemini-prompt-bearing call site that must be migrated.
     Sourced from: grep -nE "(generateText|generateObject)" src/ on 2026-05-10. -->

| Call site | File:line | Current prompt source | Migrates to PromptId |
|-----------|-----------|----------------------|----------------------|
| Main analysis | src/lib/gemini-analysis.ts:1140 (generateText) | systemPrompt = SYSTEM_PROMPT + buildEngineContextBlock + buildTechnicalContextBlock + buildSmartMoneyContextBlock | `gemini-research-brief-system` + 3 context-block prompts composed via renderPrompt |
| Main analysis | src/lib/gemini-analysis.ts:1140 (user message) | buildUserPrompt(brief, newsUrls, communityContent, sentimentIntelligence, communityHighlights, newsItems) | `gemini-research-brief-user` |
| Main analysis | src/lib/gemini-analysis.ts:1094-1105 (CoVe Pass-1) | inline string `'\n=== CHAIN-OF-VERIFICATION (Pass 1) ===\n' + ...` | `gemini-cove-pass1-instruction` |
| Main analysis | src/lib/research-brief.ts:349-368 (renderCitationsSection) | inline `=== CITATIONS === ...` builder | `gemini-citations-section` |
| Cycle summary | src/app/api/cron/learn/route.ts:864-867 (generateText) | inline `'Write a single-sentence research-log entry summarizing today's diffusion engine cycle. ...'` | `gemini-cycle-summary` |

OUT OF SCOPE (Anthropic SDK direct, not generateText/Gateway — tracked for a follow-up):
- src/lib/gemini-analysis.ts:387, 405 — Haiku community-discovery prompts (anthropicClient.messages.create)
- src/lib/gemini-analysis.ts:503 — Haiku community-extraction prompt
- src/lib/data/anthropic-search.ts:60, 118, 179, 235 — Anthropic web-search prompts
- src/lib/data/security-type.ts:60 — security-type classifier prompt

These use the Anthropic SDK directly (web_search_20250305 tool), not the Vercel AI Gateway. Per CONTEXT.md S5 the registry's MVP scope is "every Gemini prompt." The follow-up plan (call it 20-Z-04b in a future revision) will extend the registry to cover Anthropic SDK call sites — same `getPrompt`/`renderPrompt` API, additional PromptIds.
</gemini_call_sites_audit>

<interfaces>
<!-- These interfaces are AUTHORITATIVE — copy verbatim into src/lib/prompts/registry.ts.
     Do not improvise the shape; the snapshot tests in Task 4 lock against these names. -->

```typescript
// src/lib/prompts/registry.ts

/** Closed union — adding a new Gemini prompt MUST extend this union. */
export type PromptId =
  | 'gemini-research-brief-system'
  | 'gemini-research-brief-user'
  | 'gemini-engine-context-block'
  | 'gemini-technical-context-block'
  | 'gemini-smart-money-context-block'
  | 'gemini-cove-pass1-instruction'
  | 'gemini-citations-section'
  | 'gemini-cycle-summary';

/** Template literal type — vN where N is a positive integer.
 *  Capped at v99 to keep the union finite for IDE autocomplete. */
export type PromptVersion =
  | `v${1|2|3|4|5|6|7|8|9}`
  | `v${1|2|3|4|5|6|7|8|9}${0|1|2|3|4|5|6|7|8|9}`;

export interface RegisteredPrompt {
  id: PromptId;
  version: PromptVersion;
  template: string;            // body with {{var}} placeholders
  variables: readonly string[]; // declared required vars (unfilled-var guard)
  description: string;
  created_at: string;          // ISO 8601 datetime
  deprecated_at: string | null; // ISO 8601 datetime or null if active
}

export class PromptUnknownIdError extends Error {}
export class PromptVersionUnknownError extends Error {}
export class PromptVarMissingError extends Error {}

/** Returns the registered prompt; defaults to the latest non-deprecated version
 *  when version is omitted. Throws PromptUnknownIdError on unknown id and
 *  PromptVersionUnknownError on unknown (id, version) pair. */
export function getPrompt(id: PromptId, version?: PromptVersion): RegisteredPrompt;

/** Lists every (id, version) tuple in the registry, sorted by id then version
 *  ascending. Used by the golden snapshot test to iterate. */
export function listPrompts(): ReadonlyArray<{ id: PromptId; version: PromptVersion }>;
```

```typescript
// src/lib/prompts/render.ts

import { type PromptId, type PromptVersion } from './registry';

/** Substitutes {{varname}} placeholders in the registered template body.
 *  Throws PromptVarMissingError if any declared `variables` entry is absent
 *  from `vars`. Defense-in-depth: also throws if any unfilled {{...}}
 *  placeholder remains in the rendered output. */
export function renderPrompt(
  id: PromptId,
  vars: Readonly<Record<string, string>>,
  version?: PromptVersion,
): string;
```
</interfaces>

<prompt_file_format>
<!-- Authoritative format for every src/lib/prompts/_vN/*.md file.
     Tasks 2-5 must follow this format exactly so the loader is trivial. -->

```markdown
---
id: gemini-research-brief-system
version: v1
description: |
  Wall Street analyst system prompt — defines the AnalysisResult schema sections
  and citation rules. Concatenated with the engine/technical/smart-money context
  blocks at runtime.
created_at: "2026-05-10T17:30:00Z"
deprecated_at: null
variables: []
---
You are a senior equity research analyst at a bulge-bracket investment bank...
[full template body, identical to current SYSTEM_PROMPT]
```

The loader (Task 1) parses the YAML frontmatter and treats everything after the
second `---` as the template body. Bodies may contain `{{varname}}` placeholders
which renderPrompt substitutes from the `vars` argument.
</prompt_file_format>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-Z-04-01 | Tampering | Silent prompt drift — body of `_v1/*.md` edited without bumping to v2, breaks 20-Z-05 baseline-vs-candidate eval | mitigate | Golden snapshot test `tests/prompts/registry.golden.test.ts` snapshots every (id, version) body; CI script `scripts/check-prompt-versions.ts` git-diffs `src/lib/prompts/_v*/` vs main and exits non-zero on non-whitespace body changes that lack a sibling `_vN+1/` directory in the same diff. Both wired into `.github/workflows/prompts.yml`. |
| T-20-Z-04-02 | Configuration | Vanity bump — engineer creates `_v2/` for a whitespace-only or no-op change, polluting the version history and confusing the eval harness | accept (informational) | `scripts/check-prompt-versions.ts` flags whitespace-only diffs with a warning but does not block; convention enforced via PR review. Rationale: blocking would create false positives on legitimate template-body cleanup; the eval harness in 20-Z-05 surfaces no-op changes (zero metric delta) as the natural deterrent. |
| T-20-Z-04-03 | Information disclosure / Injection | Prompt injection via unfilled `{{var}}` — if `renderPrompt` silently leaves `{{user_input}}` in the rendered string, downstream Gemini sees a literal placeholder and may interpret it as instruction syntax | mitigate | (a) `RegisteredPrompt.variables` declares required vars; renderPrompt throws `PromptVarMissingError` if any declared var is absent. (b) Defense-in-depth: renderPrompt scans the rendered output for any remaining `{{...}}` pattern and throws if found. (c) Unit test `tests/prompts/render.unit.test.ts` exercises both guards. |
| T-20-Z-04-04 | Tampering | Migration leaves stale Gemini prompt string literals in source — call sites bypass the registry and the version pin is silently meaningless | mitigate | Hard cleanup gate #6: `grep -c 'You are a senior equity research analyst' src/` returns 1 (only `_v1/gemini-research-brief-system.md`). Generalized: CI script asserts that for every file in `src/lib/gemini-analysis.ts`, `src/lib/research-brief.ts`, `src/app/api/cron/learn/route.ts`, the file contains EITHER zero `generateText`/`generateObject` calls OR at least one `renderPrompt(`/`getPrompt(` call. Wired into `.github/workflows/prompts.yml`. |

</threat_model>

<tasks>

<task type="auto" tdd="true" id="20-Z-04-01">
  <name>Task 1: Write failing tests for registry + renderer + error classes</name>
  <read_first>
    - src/lib/gemini-analysis.ts:160-215 (current SYSTEM_PROMPT body — Task 2 will copy verbatim)
    - src/lib/gemini-analysis.ts:1094-1105 (CoVe Pass-1 inline string)
    - src/lib/research-brief.ts:349-368 (renderCitationsSection inline string)
    - src/app/api/cron/learn/route.ts:860-870 (cycle-summary inline string)
    - .planning/phases/20-real-sentiment-analysis/20-Z-04-PLAN.md (THIS file — interfaces block + prompt_file_format are authoritative)
  </read_first>
  <behavior>
    `tests/prompts/registry.unit.test.ts` (≥10 tests):
    - getPrompt('gemini-research-brief-system') returns RegisteredPrompt with version 'v1', non-empty template, deprecated_at: null
    - getPrompt('gemini-research-brief-system', 'v1') returns same as above
    - getPrompt('gemini-cove-pass1-instruction') returns v2 (latest non-deprecated; v2 lands in Task 5)
    - getPrompt('gemini-cove-pass1-instruction', 'v1') returns v1 explicitly (still loadable; deprecated_at may be null or set)
    - getPrompt('gemini-cove-pass1-instruction', 'v2') returns v2 explicitly
    - getPrompt('this-id-does-not-exist' as PromptId) throws PromptUnknownIdError
    - getPrompt('gemini-research-brief-system', 'v999' as PromptVersion) throws PromptVersionUnknownError
    - listPrompts() returns ≥9 entries (8 PromptIds × 1 version + 1 extra for cove-pass1 v2)
    - listPrompts() entries are sorted by id then version ascending
    - Every PromptId in the union appears at least once in listPrompts() (closure guard)

    `tests/prompts/render.unit.test.ts` (≥6 tests):
    - renderPrompt('gemini-research-brief-system', {}) returns the SYSTEM_PROMPT body byte-for-byte (variables: [])
    - renderPrompt('gemini-research-brief-user', { brief: 'X', news_sources: 'Y', sentiment_intelligence: '', community_intelligence: '' }) substitutes all four placeholders
    - renderPrompt('gemini-research-brief-user', { brief: 'X' }) throws PromptVarMissingError mentioning the missing var name
    - renderPrompt with a malformed registered template containing an extra {{rogue}} placeholder throws (defense-in-depth — use a test-local fixture registered via a local test-only override OR assert via a synthetic registered prompt mock)
    - renderPrompt('gemini-cycle-summary', { stats_json: '{"x":1}' }) substitutes the stats_json placeholder
    - renderPrompt is pure: calling it twice with the same args returns string-equal results
  </behavior>
  <action>
    Create the two test files. The first MUST import `getPrompt`, `listPrompts`, `PromptUnknownIdError`, `PromptVersionUnknownError` from `@/lib/prompts/registry` — these don't exist yet, so all tests fail at import time. The second MUST import `renderPrompt`, `PromptVarMissingError` from `@/lib/prompts/render` — same expected failure.

    Use vitest. Place under `tests/prompts/` (new directory). Wire into vitest config if necessary (default include should already cover `tests/**/*.test.ts`).
  </action>
  <acceptance_criteria>
    - Files exist: `tests/prompts/registry.unit.test.ts`, `tests/prompts/render.unit.test.ts`
    - `grep -c "it(" tests/prompts/registry.unit.test.ts` returns ≥10
    - `grep -c "it(" tests/prompts/render.unit.test.ts` returns ≥6
    - `npx vitest run tests/prompts/` exits non-zero (RED — modules don't exist yet)
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run tests/prompts/registry.unit.test.ts tests/prompts/render.unit.test.ts 2>&1 | grep -qE "FAIL|Cannot find module|registry"</automated>
  </verify>
  <done>16+ failing tests written; verified RED (modules not yet implemented)</done>
</task>

<task type="auto" tdd="true" id="20-Z-04-02">
  <name>Task 2: Implement registry + render + create v1 prompt files (migration; bit-identical bodies)</name>
  <read_first>
    - src/lib/gemini-analysis.ts (full file — every Gemini prompt body extracted verbatim)
    - src/lib/research-brief.ts:349-368
    - src/app/api/cron/learn/route.ts:860-870
    - tests/prompts/registry.unit.test.ts (Task 1 — drives required getPrompt behavior)
    - tests/prompts/render.unit.test.ts (Task 1 — drives required renderPrompt behavior)
  </read_first>
  <action>
    **Step A: Create `src/lib/prompts/registry.ts`**

    Implement the interfaces block from `<context>` verbatim. The registry is a `Map<string, RegisteredPrompt>` keyed by `${id}@${version}`. Loading strategy: at module load, statically import every `_v*/` markdown file via a generated import manifest (write `src/lib/prompts/_manifest.ts` that re-exports the parsed prompts — the manifest can be hand-written for this plan since the file count is bounded; future plans can codegen it). Use a tiny inline frontmatter parser (split on the second `---`, parse YAML lines manually since we already control the format — DO NOT add a yaml dependency for this). The `template` field is the body string AFTER the second `---`.

    `getPrompt(id, version?)`:
    - if version specified → exact key lookup → throw PromptVersionUnknownError if absent
    - if version omitted → filter `listPrompts()` for matching id + deprecated_at === null, return highest version number (parse `vN` → `parseInt(N)`, sort desc, pick first); throw PromptUnknownIdError if id has zero entries

    `listPrompts()`: returns the keys of the map as `{ id, version }` objects, sorted by `(id ASC, parseInt(version) ASC)`.

    Error classes: tag with `error.name` so vitest's `toThrowError(PromptUnknownIdError)` works.

    **Step B: Create `src/lib/prompts/render.ts`**

    `renderPrompt(id, vars, version?)`:
    1. Call `getPrompt(id, version)` → RegisteredPrompt
    2. For every name in `prompt.variables`, assert `name in vars` — else throw `PromptVarMissingError(\`Required variable '${name}' missing for prompt '${id}@${prompt.version}'\`)`
    3. Substitute `{{varname}}` → `vars[varname]` for every `varname` in `vars`. Use a single regex pass: `template.replace(/\{\{(\w+)\}\}/g, (m, name) => name in vars ? vars[name] : m)`.
    4. After substitution, scan rendered string for any remaining `\{\{(\w+)\}\}` — if found, throw `PromptVarMissingError(\`Unfilled placeholder '{{${name}}}' in rendered prompt '${id}@${prompt.version}' — did you forget to declare it in the registry's variables array?\`)`.
    5. Return the rendered string.

    **Step C: Create `src/lib/prompts/_v1/*.md` for each PromptId**

    For each of the 8 PromptIds, create a markdown file with the format from `<context>.<prompt_file_format>`. Bodies MUST be byte-identical to the current inlined source:

    1. `gemini-research-brief-system.md` — `variables: []`. Body = current `SYSTEM_PROMPT` string from gemini-analysis.ts:160-215 (verbatim, including all `\n` and section headers).
    2. `gemini-research-brief-user.md` — `variables: ["brief", "news_sources", "sentiment_intelligence", "community_intelligence", "trailing_instruction"]`. Body composes the structure that `buildUserPrompt` currently builds. Use placeholders for the 4 dynamic sections; the trailing `'Analyze the ticker based on all research data above. Return the structured analysis.'` instruction can be a 5th placeholder OR baked in (recommend baked in to minimize variable count — declare only the 4 dynamic sections).
    3. `gemini-engine-context-block.md` — `variables: ["status_branch_text"]`. The current `buildEngineContextBlock` has a NO_DATA branch returning a different string. Strategy: register two prompts (`gemini-engine-context-block-no-data` v1 and `gemini-engine-context-block-active` v1) — adjust the PromptId union to include both. Update Task 1 tests + the union accordingly. **Decision rule**: if the branch logic is non-trivial enough to make a single template ugly, split into two PromptIds. Make this judgment call during implementation; if you split, document the additional PromptIds in the SUMMARY.
    4. `gemini-technical-context-block.md` — `variables: ["technical_pattern", "cap_class", "technical_posterior_pct", "technical_ci", "technical_sample_size", "technical_status", "horizon_rows"]`.
    5. `gemini-smart-money-context-block.md` — `variables: ["institutional_pattern", "cap_class", "institutional_posterior_pct", "institutional_ci", "institutional_sample_size", "institutional_status", "institutional_age_text", "insider_pattern", "insider_posterior_pct", "insider_ci", "insider_sample_size", "insider_status", "insider_age_text", "row30_diffusion_pct", "row30_diffusion_ci", "row30_technical_pct", "row30_technical_ci", "row30_institutional_pct", "row30_institutional_ci", "row30_insider_pct", "row30_insider_ci", "agreement"]`. (Yes, this is a long var list — that's correct; the block has many slots.)
    6. `gemini-cove-pass1-instruction.md` — `variables: []`. Body = the current inline string from gemini-analysis.ts:1094-1105.
    7. `gemini-citations-section.md` — `variables: ["citation_count", "citations_json"]`. Body = the format currently produced by `renderCitationsSection`.
    8. `gemini-cycle-summary.md` — `variables: ["outcomes_processed", "hits", "drift_alerts", "cells_active"]`. Body = current cycle-summary prompt from cron/learn/route.ts:866.

    **Step D: Wire `_manifest.ts`**

    Hand-write `src/lib/prompts/_manifest.ts` that imports each `_v*/*.md` as a raw string (use `import x from './path?raw'` if Vite/Next supports it; if not, use Node `fs.readFileSync` at module load time with `__dirname` — the file is in `src/lib/prompts/`, so paths are stable). The manifest exports an array of parsed `RegisteredPrompt` objects which `registry.ts` consumes.

    For Next.js + Vercel: prefer `import promptText from './_v1/gemini-research-brief-system.md?raw'` (Next supports `?raw` via Webpack 5 raw loader; if it doesn't compile, fall back to a top-level `fs.readFileSync` block — registry initialization is one-time at module load, no per-request cost).
  </action>
  <acceptance_criteria>
    - Files exist: `src/lib/prompts/registry.ts`, `src/lib/prompts/render.ts`, `src/lib/prompts/_manifest.ts`, and ≥8 files under `src/lib/prompts/_v1/*.md`
    - `npx vitest run tests/prompts/registry.unit.test.ts tests/prompts/render.unit.test.ts` exits 0 (all 16+ tests GREEN)
    - `grep -c "export function getPrompt" src/lib/prompts/registry.ts` returns 1
    - `grep -c "export function renderPrompt" src/lib/prompts/render.ts` returns 1
    - Body of `_v1/gemini-research-brief-system.md` after the second `---` line matches the current `SYSTEM_PROMPT` byte-for-byte (verify via `diff <(awk '/^---$/{c++; next} c>=2' src/lib/prompts/_v1/gemini-research-brief-system.md) <(grep -oP "(?<=SYSTEM_PROMPT = \`).*(?=\`;)" src/lib/gemini-analysis.ts)` — or simpler: a unit test that imports both and asserts equality)
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run tests/prompts/registry.unit.test.ts tests/prompts/render.unit.test.ts</automated>
  </verify>
  <done>Registry + render live; 8 PromptIds × v1 committed with byte-identical bodies; 16+ unit tests GREEN</done>
</task>

<task type="auto" tdd="true" id="20-Z-04-03">
  <name>Task 3: Migrate every Gemini call site to renderPrompt + delete inline literals</name>
  <read_first>
    - src/lib/gemini-analysis.ts (entire file)
    - src/lib/research-brief.ts:349-368
    - src/app/api/cron/learn/route.ts:860-870
    - src/lib/prompts/registry.ts (Task 2)
    - src/lib/prompts/render.ts (Task 2)
    - src/lib/__tests__/gemini-analysis.test.ts + src/lib/gemini-analysis.test.ts (regression baseline — must stay green)
    - src/app/api/analysis/__tests__/route.test.ts
    - tests/integration/citations-v2.shadow.live.test.ts
    - tests/integration/cove.shadow.live.test.ts
  </read_first>
  <action>
    **Strategy**: bit-identical refactor. Every renderPrompt() call MUST produce a string equal to what the original inline code produced for the same inputs.

    **Step A — `src/lib/gemini-analysis.ts`**

    1. Add `import { renderPrompt } from '@/lib/prompts/render';` at top.
    2. Replace `export const SYSTEM_PROMPT = \`...\`;` (lines 160-215) with:
       ```typescript
       export const SYSTEM_PROMPT = renderPrompt('gemini-research-brief-system', {});
       ```
       (Backward-compat — existing tests import `SYSTEM_PROMPT` directly. Computing it once at module load is fine since the registry loads at module load too.)
    3. Refactor `buildUserPrompt(...)` (lines 224-294) to compose its 4 dynamic sections (news_sources, community, sentiment_intelligence, community_intelligence) as strings and call `renderPrompt('gemini-research-brief-user', { brief, news_sources, sentiment_intelligence, community_intelligence })`. The internal section-builder logic (loops over newsItems, sentiment intelligence formatting, community-highlights formatting) stays — it produces the strings the placeholders consume. Goal: zero behavior change in the rendered output.
    4. Refactor `buildEngineContextBlock(ctx)` (lines 700-758) — render via the registered prompt(s) per the Task 2 decision (single or split). Same NO_DATA branch behavior preserved.
    5. Refactor `buildTechnicalContextBlock(ctx)` (lines 575-618) and `buildSmartMoneyContextBlock(ctx)` (lines 636-676) — render via registered prompts.
    6. Replace the inline CoVe Pass-1 string (lines 1094-1105) with `renderPrompt('gemini-cove-pass1-instruction', {})` (no vars).
    7. The `coveSection = coveModeInner !== 'off' ? '\n=== ...' : ''` ternary stays — the rendered string is now `renderPrompt(...)` instead of the literal.

    **Step B — `src/lib/research-brief.ts`**

    1. Add `import { renderPrompt } from '@/lib/prompts/render';`
    2. Replace `renderCitationsSection(citations)` body (lines 349-368) with:
       ```typescript
       export function renderCitationsSection(citations: Citation[]): string {
         if (citations.length === 0) return '';
         const payload = citations.map((c) => ({
           source: c.source,
           url: c.url,
           confidence: c.confidence,
           date_retrieved: c.date_retrieved,
         }));
         return renderPrompt('gemini-citations-section', {
           citation_count: String(citations.length),
           citations_json: JSON.stringify(payload, null, 2),
         });
       }
       ```

    **Step C — `src/app/api/cron/learn/route.ts`**

    1. Add `import { renderPrompt } from '@/lib/prompts/render';`
    2. Replace the inline cycle-summary prompt (line 866) with:
       ```typescript
       const { text } = await generateText({
         model: 'anthropic/claude-haiku-4.5',
         prompt: renderPrompt('gemini-cycle-summary', {
           outcomes_processed: String(stats.outcomes_processed),
           hits: String(stats.hits),
           drift_alerts: String(stats.drift_alerts),
           cells_active: String(stats.cells_active),
         }),
       });
       ```

    **Step D — Regression validation**

    1. Run `npm test` — every existing Gemini test MUST stay green. Any failure is either (a) a non-bit-identical migration (FIX the template body) or (b) a test that asserted on a brittle internal — surface to operator before changing the test.
    2. Run `npm run test:integration` if DATABASE_URL set; if not set, document explicitly in the SUMMARY.
    3. Existing tests to verify green: `src/lib/__tests__/gemini-analysis.test.ts`, `src/lib/gemini-analysis.test.ts`, `src/app/api/analysis/__tests__/route.test.ts`, `tests/integration/citations-v2.shadow.live.test.ts`, `tests/integration/cove.shadow.live.test.ts`.

    **Step E — Cleanup gate**

    Run `grep -nE "(generateText|generateObject|streamText|streamObject)\\(" src/ --include='*.ts' | grep -v '/prompts/' | grep -v '\\.test\\.' | grep -v '__tests__'`. Every match line must, in the same file, also contain `renderPrompt(` (defense — caller IS using the registry). Run `grep -c "You are a senior equity research analyst" src/` — must be exactly 1.
  </action>
  <acceptance_criteria>
    - `grep -c "You are a senior equity research analyst" src/` returns exactly 1 (only the v1 markdown file)
    - `grep -c "renderPrompt(" src/lib/gemini-analysis.ts` returns ≥5 (system, user, engine, technical, smart-money, cove — at least 5)
    - `grep -c "renderPrompt(" src/lib/research-brief.ts` returns ≥1
    - `grep -c "renderPrompt(" src/app/api/cron/learn/route.ts` returns ≥1
    - `grep -nE 'CHAIN-OF-VERIFICATION \\(Pass 1\\)' src/lib/gemini-analysis.ts` returns 0 (inline string deleted; only the v1 markdown file holds it)
    - `npm test` exits 0
  </acceptance_criteria>
  <verify>
    <automated>npm test 2>&1 | tail -20 && grep -c "You are a senior equity research analyst" src/</automated>
  </verify>
  <done>All 5 Gemini call sites migrated; zero stale prompt literals; existing test suite GREEN proving bit-identical refactor</done>
</task>

<task type="auto" tdd="true" id="20-Z-04-04">
  <name>Task 4: Golden snapshot test + version-bump fixture</name>
  <read_first>
    - src/lib/prompts/registry.ts (Task 2)
    - tests/prompts/registry.unit.test.ts (Task 1)
    - https://vitest.dev/guide/snapshot.html (vitest snapshot API)
  </read_first>
  <behavior>
    `tests/prompts/registry.golden.test.ts`:
    - Iterates every entry in `listPrompts()`
    - For each `(id, version)`: calls `getPrompt(id, version)` → snapshots `{ id, version, template, variables, description }` via `toMatchSnapshot()`. Snapshot file lives at `tests/prompts/__snapshots__/registry.golden.test.ts.snap`.
    - Failure mode: any change to a template body, variables array, or description for an existing (id, version) WITHOUT updating the snapshot → test fails the build.
    - Passing path: snapshot file is committed to git; CI runs the test and snapshot must match exactly. Updating snapshot requires explicit `npx vitest -u` (operator action, not silent).

    `tests/prompts/version-bump.fixture.test.ts`:
    - Synthetic test that proves the snapshot mechanism would catch unauthorized body edits. Exercises a programmatic prompt body mutation in-memory and asserts the snapshot would diverge.
    - Approach: import the registered v1 body for `gemini-cycle-summary` (a small prompt — minimal blast radius). Mutate one character of the body in-memory. Compute a hash of the original vs mutated body. Assert the hashes differ. This proves the snapshot test would have caught a real edit (since vitest's snapshot is essentially a stringified hash check).
    - This test does NOT modify the on-disk snapshot or the prompt files. It is a "smoke test for the smoke test."
  </behavior>
  <action>
    Create both test files. Run `npx vitest run tests/prompts/registry.golden.test.ts -u` ONCE to write the initial snapshot file, then commit the snapshot file. Subsequent runs verify the snapshot matches.

    Add a comment to the top of `registry.golden.test.ts` explaining: "If this test fails, you changed a prompt body without bumping its version. Either (a) revert the change, or (b) create `_vN+1/<id>.md` and accept the snapshot bump via `npx vitest -u` — the latter requires reviewer sign-off per scripts/check-prompt-versions.ts."
  </action>
  <acceptance_criteria>
    - File exists: `tests/prompts/registry.golden.test.ts`
    - File exists: `tests/prompts/__snapshots__/registry.golden.test.ts.snap` (committed to git)
    - File exists: `tests/prompts/version-bump.fixture.test.ts`
    - `npx vitest run tests/prompts/registry.golden.test.ts` exits 0 on a clean tree
    - Snapshot file contains ≥9 entries (8 PromptIds × v1, plus cove-pass1 v2 lands in Task 5 — Task 4 alone has 8; the +1 lands in Task 5 with `npx vitest -u`)
    - Comment block at top of registry.golden.test.ts explains the failure mode
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run tests/prompts/registry.golden.test.ts tests/prompts/version-bump.fixture.test.ts</automated>
  </verify>
  <done>Golden snapshot test + version-bump fixture committed; snapshot file locked; failure mode documented</done>
</task>

<task type="auto" tdd="true" id="20-Z-04-05">
  <name>Task 5: Exercise version bump end-to-end (gemini-cove-pass1-instruction v2)</name>
  <read_first>
    - src/lib/prompts/_v1/gemini-cove-pass1-instruction.md (Task 2)
    - src/lib/prompts/registry.ts (Task 2)
    - tests/prompts/registry.golden.test.ts (Task 4)
  </read_first>
  <behavior>
    Per CONTEXT.md acceptance criterion: "≥1 version bump exercised end-to-end through eval." 20-Z-05 is the eval harness; 20-Z-04 provides the version-pinning surface and proves the bump-and-load path works.

    Goal: create v2 of `gemini-cove-pass1-instruction` with a substantive body change (not whitespace), update the manifest, update the snapshot, and verify both versions are loadable.

    Material change for v2: tighten the instruction to ask Gemini to emit claims that are SPECIFICALLY drawn from numeric fields in the SourcePackage (e.g. revenue, EPS, P/E) — improves the downstream NLI verification hit-rate per the runCoVe contract in src/lib/reasoning/cove.ts. This is a real prompt-engineering improvement, not a vanity bump.
  </behavior>
  <action>
    1. Create `src/lib/prompts/_v2/gemini-cove-pass1-instruction.md` with:
       - `version: v2`
       - `created_at: <ISO-8601 now>`
       - `deprecated_at: null`
       - `variables: []`
       - Body = a tightened version of v1 that explicitly directs Gemini to draw the 3 verification claims from numeric SourcePackage fields. Keep the structure (still 3 claims, still ≤30 words each, still factual/checkable) but add: "PREFER claims that cite specific numeric values from the research brief (revenue figures, EPS, P/E ratio, analyst price target, %YoY growth) over qualitative claims, since the NLI verifier in Pass 2 has higher precision on numeric entailment."

    2. Update `src/lib/prompts/_manifest.ts` to import the new v2 file and register it.

    3. Run `npx vitest run tests/prompts/registry.golden.test.ts -u` to update the snapshot — this should ADD the new (cove-pass1, v2) entry without modifying any existing entry.

    4. Add a unit test in `tests/prompts/registry.unit.test.ts` (extend, not replace):
       - getPrompt('gemini-cove-pass1-instruction') returns v2 (latest non-deprecated)
       - getPrompt('gemini-cove-pass1-instruction', 'v1') still works (historical pin)
       - getPrompt('gemini-cove-pass1-instruction', 'v2') returns v2 explicitly

    5. **DO NOT wire v2 into the live call site.** The live call site stays on v1 via `renderPrompt('gemini-cove-pass1-instruction', {})` (which returns latest non-deprecated = v2 by default IF we want to ship v2 immediately, OR v1 if we want to pin). Decision rule: pin v1 in the live call site for this plan — the wiring change to v2 is the responsibility of 20-Z-05 (eval harness verifies v2 outperforms v1, then a separate plan switches the pin). Update the call site to `renderPrompt('gemini-cove-pass1-instruction', {}, 'v1')` (explicit version pin) and add a comment: "TODO(20-Z-05): switch to default (v2) once eval shows non-regression."

    6. Verify the snapshot diff for this commit shows ONLY (a) new file `_v2/gemini-cove-pass1-instruction.md`, (b) new entry in `_manifest.ts`, (c) added snapshot entry, (d) v1 explicit pin in gemini-analysis.ts. NO existing v1 body modifications.
  </action>
  <acceptance_criteria>
    - File exists: `src/lib/prompts/_v2/gemini-cove-pass1-instruction.md`
    - `getPrompt('gemini-cove-pass1-instruction', 'v2')` returns RegisteredPrompt — verified by extended unit test
    - `getPrompt('gemini-cove-pass1-instruction')` returns the v2 entry (latest non-deprecated)
    - `getPrompt('gemini-cove-pass1-instruction', 'v1')` still returns v1 (historical pin works)
    - Live call site in gemini-analysis.ts uses explicit `'v1'` version arg with TODO(20-Z-05) comment
    - Snapshot file gained exactly one new entry (cove-pass1 v2); no existing entries changed (`git diff tests/prompts/__snapshots__/` shows only additions)
    - Body diff between v1 and v2 is non-trivial: `wc -l` of the diff is ≥4 (real wording change, not whitespace)
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run tests/prompts/ && grep -q "TODO(20-Z-05)" src/lib/gemini-analysis.ts</automated>
  </verify>
  <done>v2 of cove-pass1-instruction created, loadable, distinct from v1, snapshot updated cleanly; live wiring stays on v1 with explicit pin awaiting 20-Z-05 eval</done>
</task>

<task type="auto" id="20-Z-04-06">
  <name>Task 6: CI gate — scripts/check-prompt-versions.ts + GitHub Actions workflow</name>
  <read_first>
    - scripts/model-card-status.ts (existing — pattern reference for npx tsx scripts)
    - .github/workflows/ (existing — pattern reference for new workflow)
    - package.json (scripts section — pattern for npm run wrappers)
  </read_first>
  <action>
    **Step A — `scripts/check-prompt-versions.ts`**

    Implement a Node script (npx tsx) that:

    1. Resolves the merge base with `main`: `git merge-base HEAD origin/main` (or `main` if no origin). Falls back to `main` if that fails.
    2. Runs `git diff --name-only <base>..HEAD -- src/lib/prompts/_v*/` to get changed prompt files.
    3. For each changed file at path `src/lib/prompts/_vN/<id>.md`:
       a. Run `git diff --shortstat <base>..HEAD -- <path>` to detect actual content changes (not just metadata).
       b. Run `git diff <base>..HEAD -- <path> | grep -vE '^[+-]\\s*$' | wc -l` — if zero non-whitespace +/- lines, treat as whitespace-only and emit a WARNING (informational, exit 0 for that file).
       c. If non-whitespace changes exist for a file under `_vN/`: check whether `src/lib/prompts/_v(N+1)/<id>.md` ALSO appears in the diff. If yes → pass. If no → exit code 1 with error: `Prompt body changed at <path> without bumping to _v(N+1)/<id>.md. Either revert the body change or create the new version directory.`
    4. Also detects: a new file at `_vN/<id>.md` where `_v(N-1)/<id>.md` does not exist for the same id AND N > 1. (Catches accidental version-skip — e.g. creating `_v3/foo.md` when only `_v1/foo.md` exists, no `_v2/`.)
    5. Exits 0 on clean trees (no changes).

    Code style: pattern after `scripts/model-card-status.ts` and `scripts/check-active-cell-coverage.ts`. Use `child_process.execSync` for git calls. Print the violations as a markdown table to stdout for PR comment readability.

    **Step B — package.json wiring**

    Add to `scripts`:
    ```json
    "check-prompts": "npx tsx scripts/check-prompt-versions.ts"
    ```

    **Step C — `.github/workflows/prompts.yml`**

    Create the workflow:
    ```yaml
    name: Prompt Registry Gate
    on:
      pull_request:
        paths:
          - 'src/lib/prompts/**'
          - 'src/lib/gemini-analysis.ts'
          - 'src/lib/research-brief.ts'
          - 'src/app/api/cron/learn/route.ts'
          - 'tests/prompts/**'
          - 'scripts/check-prompt-versions.ts'

    jobs:
      check:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
            with:
              fetch-depth: 0  # full history needed for git diff against main
          - uses: actions/setup-node@v4
            with:
              node-version: '20'
          - run: npm ci
          - run: npm run check-prompts
          - run: npx vitest run tests/prompts/registry.golden.test.ts tests/prompts/registry.unit.test.ts tests/prompts/render.unit.test.ts tests/prompts/version-bump.fixture.test.ts
    ```

    **Step D — Self-test the script**

    1. On the current branch (Task 5 already added the v2 file): `npm run check-prompts` should exit 0 (the v1 body wasn't modified; v2 was added).
    2. Synthetic negative test: create a temporary local commit that modifies `_v1/gemini-cycle-summary.md` body (1 char change), run `npm run check-prompts`, assert it exits non-zero with the expected error message. Then revert the local commit. (Don't push the synthetic commit; verify locally only.)
  </action>
  <acceptance_criteria>
    - File exists: `scripts/check-prompt-versions.ts`
    - File exists: `.github/workflows/prompts.yml`
    - `package.json` `scripts.check-prompts` entry present
    - `npm run check-prompts` exits 0 on the committed tree (clean state — only Task 5's v2 add, no v1 mutations)
    - The workflow's `paths:` filter includes the 6 directories/files listed above (verify with grep)
    - Self-test passed: synthetic v1 mutation trips the script; revert cleans state — documented in the task SUMMARY
  </acceptance_criteria>
  <verify>
    <automated>npm run check-prompts && grep -q "check-prompts" package.json && test -f .github/workflows/prompts.yml</automated>
  </verify>
  <done>CI gate live; clean tree exits 0; synthetic mutation provably trips the gate; workflow filters scoped to the right paths</done>
</task>

<task type="auto" id="20-Z-04-07">
  <name>Task 7: Model card + integration smoke test + commit</name>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (S4 — model card requirement)
    - .planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md (DATASET-CARD pattern reference)
    - All test files from Tasks 1, 4, 5 (must stay green)
  </read_first>
  <action>
    **Step A — `MODEL-CARD-prompt-registry.md`**

    Create `.planning/phases/20-real-sentiment-analysis/MODEL-CARD-prompt-registry.md` per S4 / Mitchell-2019. Sections:

    - **Component**: Prompt registry (src/lib/prompts/)
    - **Versions tracked**: list every (id, version) tuple from `listPrompts()` at commit time
    - **Intended use**: deterministic, version-pinned prompt rendering for every Gemini call site in Cipher; surface for 20-Z-05 baseline-vs-candidate eval
    - **Out-of-distribution behavior**: throws PromptUnknownIdError / PromptVersionUnknownError / PromptVarMissingError on misuse
    - **Known failure modes**:
      - Vanity bumps (T-20-Z-04-02) — accepted; eval-harness in 20-Z-05 surfaces no-op deltas
      - Prompt injection via unfilled vars (T-20-Z-04-03) — defense in depth via variables declaration + post-render placeholder scan
      - Anthropic SDK call sites (gemini-analysis.ts:387, 405, 503; data/anthropic-search.ts; data/security-type.ts) — NOT yet covered by registry; tracked for follow-up plan
    - **Retrain cadence**: N/A — this is a versioned artifact registry, not a trained model. Version cadence is per-prompt and operator-driven.
    - **Linked plan**: 20-Z-04
    - **Linked downstream consumers**: 20-Z-05 (eval), 20-Z-06 (done gate), 20-D-01 (numeric grounding test)

    **Step B — Integration smoke test**

    Create `tests/prompts/integration.smoke.test.ts`:
    - Iterates `listPrompts()`
    - For each (id, version): builds a vars dict with placeholder values for every declared variable (e.g. `'TEST_VALUE'` for each), calls `renderPrompt(id, vars, version)`, asserts:
      - Returned string is non-empty
      - No `\{\{...\}\}` placeholder remains in the rendered output
      - String length is ≥50 chars (sanity check — caught the empty-template-file class of bug)

    This is the "render every registered prompt with mock vars" check from `<must_include_in_plan>` §4.

    **Step C — Final regression run + commit**

    1. Run `npm test` — must exit 0
    2. Run `npm run check-prompts` — must exit 0
    3. Run `npm run test:integration` if DATABASE_URL set
    4. Stage all files (registry, render, _v1/*, _v2/*, _manifest, tests/prompts/*, scripts/check-prompt-versions.ts, .github/workflows/prompts.yml, MODEL-CARD, package.json, gemini-analysis.ts, research-brief.ts, cron/learn/route.ts)
    5. Commit:
       ```
       feat(20-z-04): prompt registry + golden-file regression + version-bump exercise
       
       Versions every Gemini prompt in the codebase as (id, version) artifacts under
       src/lib/prompts/_vN/<id>.md. renderPrompt(id, vars, version?) substitutes
       {{var}} placeholders, throws on unknown id / unknown version / missing var.
       
       Migrated 5 Gemini call sites: gemini-analysis.ts (system + user + 3 context
       blocks + CoVe Pass-1), research-brief.ts (citations section), cron/learn/
       route.ts (cycle summary). Bit-identical refactor — every existing Gemini
       test stays green, proving the registry produces the same strings as before.
       
       Golden snapshot test (tests/prompts/registry.golden.test.ts) snapshots every
       (id, version) body. CI gate (scripts/check-prompt-versions.ts +
       .github/workflows/prompts.yml) git-diffs prompt files against main and fails
       on body changes that lack a sibling _vN+1/ directory.
       
       Version bump exercised end-to-end: gemini-cove-pass1-instruction v2 created
       (numeric-grounded claim guidance). Live call site pinned to v1 with
       TODO(20-Z-05) for the eval-driven cutover.
       
       Forward refs: 20-Z-05 (eval harness consumes (id, version) surface);
       20-Z-06 (done gate consumes npm run check-prompts).
       
       Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
       ```
  </action>
  <acceptance_criteria>
    - File exists: `.planning/phases/20-real-sentiment-analysis/MODEL-CARD-prompt-registry.md`
    - File exists: `tests/prompts/integration.smoke.test.ts`
    - `npx vitest run tests/prompts/integration.smoke.test.ts` exits 0; iterates ≥9 prompts (8 v1 + 1 v2)
    - `npm test` exits 0
    - `npm run check-prompts` exits 0
    - `git log -1 --pretty=%s` matches `20-z-04` (case-insensitive)
  </acceptance_criteria>
  <verify>
    <automated>npm test && npm run check-prompts && git log -1 --pretty=%s | grep -qi "20-z-04"</automated>
  </verify>
  <done>Model card + integration smoke test committed; full regression suite green; CI gate green; commit landed</done>
</task>

</tasks>

<verification>
- [ ] `grep -rE "(generateText|generateObject|streamText|streamObject)\\(" src/ --include='*.ts' | grep -v '/prompts/' | grep -v '\\.test\\.' | grep -v '__tests__' | wc -l` — every match line is also a `renderPrompt(` site (manual review of grep output OR scripted)
- [ ] `ls src/lib/prompts/_v1/*.md | wc -l` returns ≥8 (one per registered PromptId — could be 9 if engine-context-block is split into NO_DATA + ACTIVE per Task 2 Step C item 3)
- [ ] `ls src/lib/prompts/_v2/*.md | wc -l` returns ≥1 (cove-pass1 v2 from Task 5)
- [ ] `npm run check-prompts` exits 0 on clean tree
- [ ] `npx vitest run tests/prompts/` — all tests green (registry + render + golden + version-bump fixture + integration smoke)
- [ ] `npm test` — full suite green (proves the bit-identical refactor preserved every existing Gemini test)
- [ ] Synthetic body-mutation test proven (Task 6 Step D) — script trips on v1 mutation
- [ ] `getPrompt('gemini-cove-pass1-instruction')` returns v2; `getPrompt(..., 'v1')` returns v1 (both loadable; default = latest non-deprecated)
- [ ] Live cove call site pins v1 explicitly with TODO(20-Z-05) comment
- [ ] `grep -c "You are a senior equity research analyst" src/` returns exactly 1
- [ ] `grep -c 'CHAIN-OF-VERIFICATION (Pass 1)' src/lib/gemini-analysis.ts` returns 0 (literal deleted)
- [ ] CI workflow `.github/workflows/prompts.yml` paths filter scoped to prompts + 3 migrated source files + tests + script
- [ ] MODEL-CARD-prompt-registry.md committed per S4
</verification>

<success_criteria>
1. Every Gemini prompt in the Cipher codebase is a versioned `(id, version)` artifact under `src/lib/prompts/_vN/<id>.md` — never an inline string literal in source code that feeds a `generateText`/`generateObject` call.
2. The registry's `renderPrompt(id, vars, version?)` is the ONLY way Gemini call sites obtain prompt strings; any future call site that bypasses the registry is caught by the CI grep gate at PR time.
3. Modifying an existing `_vN/<id>.md` body without creating a sibling `_v(N+1)/<id>.md` directory fails CI in two independent ways: (a) the golden snapshot test diverges, (b) `scripts/check-prompt-versions.ts` exits non-zero. Both are wired into `.github/workflows/prompts.yml`.
4. The version-pinning surface area (Task 5 — cove-pass1 v1 + v2 both loadable, live call site pinned to v1) is the precondition 20-Z-05's eval harness needs to compare baseline-vs-candidate prompts. THIS plan does NOT ship the eval harness — it ships the API surface the harness consumes.
5. The migration is bit-identical: every existing Gemini integration test (`citations-v2.shadow.live.test.ts`, `cove.shadow.live.test.ts`, `analysis/__tests__/route.test.ts`, `gemini-analysis.test.ts`) stays green, proving the rendered strings match the pre-refactor literals byte-for-byte.
</success_criteria>

<output>
Create `.planning/phases/20-real-sentiment-analysis/20-Z-04-SUMMARY.md` documenting:
- Final list of registered PromptIds (with versions)
- Audit trail for each migrated call site (file:line, before/after grep counts)
- Snapshot file size + entry count
- CI gate self-test result (synthetic v1 mutation provably trips the script — paste exit code + first error line)
- Decision: did engine-context-block stay as 1 PromptId or split into NO_DATA + ACTIVE? (per Task 2 Step C item 3)
- Forward references confirmed for 20-Z-05 (eval consumes registry) and 20-Z-06 (done gate consumes check-prompts)
- Out-of-scope follow-up: extend registry to Anthropic SDK call sites (5 sites enumerated in `<gemini_call_sites_audit>` OUT OF SCOPE block)
</output>
