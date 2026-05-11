---
phase: 20
plan: 20-Z-05
wave: Z
type: execute
depends_on: [20-Z-04]
files_modified:
  - src/lib/eval/judge.ts
  - src/lib/eval/types.ts
  - src/lib/prompts/registry.ts
  - scripts/eval-report.ts
  - tests/golden-tickers/_human_labels/example-aapl-bullish.json
  - tests/golden-tickers/_human_labels/example-aapl-bearish.json
  - tests/golden-tickers/_human_labels/example-gme-crowded.json
  - tests/golden-tickers/_human_labels/example-spy-neutral.json
  - tests/golden-tickers/_human_labels/example-pltr-mixed.json
  - tests/eval/judge.unit.test.ts
  - tests/eval/judge.integration.test.ts
  - tests/eval/fixtures/baseline.txt
  - tests/eval/fixtures/candidate.txt
  - package.json
autonomous: true
requirements: [20-Z-05]
shadow_required: false
hard_cleanup_gate: true
must_haves:
  truths:
    - "judge() returns a JudgeResult with all 5 dimensions scored 0..5 by Claude Opus 4.7"
    - "scripts/eval-report.ts CLI runs an N-pair eval and emits both JSON + markdown summary"
    - "Per-dimension Pearson correlation vs human labels is computed and surfaced in the report"
    - "Judge prompt is registered in the prompt registry (id='eval-judge-v1', version='v1') so 20-Z-04 golden-file regression catches rubric drift"
    - "Starter human-labeled set has ≥5 exemplars under tests/golden-tickers/_human_labels/ — documented as upgrade-to-30 dependency on 20-D-04"
    - "Live judge calls are gated behind RUN_LIVE_JUDGE=true env var so CI does not burn Claude tokens"
    - "Judge calls are deterministic (temperature: 0) and not cached at the gateway (cache: false)"
    - "Wall-clock for npm run eval on the 5-exemplar starter set < 60s"
  artifacts:
    - path: "src/lib/eval/judge.ts"
      provides: "judge(baseline, candidate, opts) → JudgeResult; calls Claude Opus 4.7 via @anthropic-ai/sdk"
      contains: "claude-opus-4-7"
    - path: "src/lib/eval/types.ts"
      provides: "JudgeDimension, JudgeScore, JudgeResult, HumanExemplar types"
      contains: "numeric_grounding"
    - path: "src/lib/prompts/registry.ts"
      provides: "registered prompt id='eval-judge-v1', version='v1' with full rubric body"
      contains: "eval-judge-v1"
    - path: "scripts/eval-report.ts"
      provides: "CLI: --baseline --candidate --human-labels --out; iterates pairs, emits JSON + markdown"
      contains: "pearson"
    - path: "tests/golden-tickers/_human_labels"
      provides: "≥5 starter human-labeled exemplars (20-D-04 expands to 30)"
      min_lines: 5
    - path: "tests/eval/judge.unit.test.ts"
      provides: "≥6 unit tests with mocked Anthropic client — score parsing, rubric coverage, malformed-response handling"
    - path: "tests/eval/judge.integration.test.ts"
      provides: "live judge integration test gated behind RUN_LIVE_JUDGE=true"
      contains: "RUN_LIVE_JUDGE"
  key_links:
    - from: "src/lib/eval/judge.ts"
      to: "src/lib/prompts/registry.ts"
      via: "loads judge prompt by id='eval-judge-v1' (judgePromptVersion stamped on every JudgeResult)"
      pattern: "eval-judge-v1"
    - from: "scripts/eval-report.ts"
      to: "src/lib/eval/judge.ts"
      via: "imports judge() and iterates over human-labels directory"
      pattern: "import.*judge.*from.*eval/judge"
    - from: "package.json scripts.eval"
      to: "scripts/eval-report.ts"
      via: "npx tsx scripts/eval-report.ts"
      pattern: "eval.*tsx scripts/eval-report"
---

# Plan 20-Z-05: LLM-as-judge eval harness (Claude Opus 4.7)

<universal_preamble>

## Autonomous Execution Clause

Offline tooling — no shadow lifecycle. Land judge.ts → registered prompt → CLI script → starter labels → unit tests → integration test (gated) → npm script → commit. Behavior change is purely additive (new directory, new script, new package.json key).

## Hard Cleanup Gate (Definition of Done)

1. (N/A — no shadow)
2. (N/A — no old code deleted)
3. (N/A)
4. (N/A — no flag introduced)
5. `npm test`, `npm run test:integration`, `npm run test:e2e` all green on `main` post-commit
6. `npm run eval -- --baseline tests/eval/fixtures/baseline.txt --candidate tests/eval/fixtures/candidate.txt --human-labels tests/golden-tickers/_human_labels --out /tmp/eval-test.json` exits 0 in < 60s (mock mode, no live calls — see Task 4 for the dry-run flag)
7. Forward-reference to 20-D-04 (30-exemplar set) is documented in the script README and in the harness output: "Pearson sample size insufficient for ship gate when n < 30 — see 20-D-04."

</universal_preamble>

<objective>
Build the LLM-as-judge eval harness that scores baseline-vs-candidate report pairs across 5 dimensions (numeric-grounding, citation-coverage, narrative coherence, hedging quality, contradiction-handling) using Claude Opus 4.7 as a separate-provider judge of Gemini outputs. Calibrate against a starter set of ≥5 human-labeled exemplars; document the 20-D-04 dependency that grows the set to 30 and unlocks the ship-gate (Pearson ≥ 0.7).

Why separate provider for the judge: candidate outputs come from Gemini; judging them with Gemini is biased. Cipher already has @anthropic-ai/sdk wired (anthropic-search.ts), so we reuse the client and pin Claude Opus 4.7.

Output: `src/lib/eval/judge.ts` + `scripts/eval-report.ts` + 5-exemplar starter set + unit + (gated) integration tests + `npm run eval`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/20-real-sentiment-analysis/CONTEXT.md
@src/lib/data/anthropic-search.ts
@src/lib/gemini-analysis.ts
@src/lib/research-brief.ts

<interfaces>

```typescript
// src/lib/eval/types.ts
export type JudgeDimension =
  | 'numeric_grounding'
  | 'citation_coverage'
  | 'narrative_coherence'
  | 'hedging_quality'
  | 'contradiction_handling';

export interface JudgeScore {
  dimension: JudgeDimension;
  score: 0 | 1 | 2 | 3 | 4 | 5;
  rationale: string;
}

export interface JudgeResult {
  run_id: string;                  // uuid v4
  baseline_id: string;             // exemplar_id or fixture path
  candidate_id: string;
  scores: JudgeScore[];            // length === 5; one per JudgeDimension
  overall: number;                 // mean of scores, in [0,5]
  pearson_vs_human?: number;       // computed by eval-report.ts at aggregate level (per-dimension), not per-call
  judge_prompt_version: string;    // 'v1' (from registry)
  judge_model: 'claude-opus-4-7';  // pinned literal
  ran_at: string;                  // ISO 8601 timestamp
}

export interface HumanExemplar {
  exemplar_id: string;
  ticker: string;
  notes: string;
  baseline_text: string;
  candidate_text: string;
  human_scores: Record<JudgeDimension, 0 | 1 | 2 | 3 | 4 | 5>;
  labeler: string;       // who labeled it
  labeled_at: string;    // ISO 8601
}

// src/lib/eval/judge.ts
export async function judge(
  baseline: string,
  candidate: string,
  opts?: {
    baselineId?: string;
    candidateId?: string;
    temperature?: 0;            // pinned to 0 for determinism; type narrows callers
    maxTokens?: number;         // default 2000
    promptVersion?: string;     // default 'v1' (latest registered)
    cache?: false;              // pinned false — never cache eval calls at gateway
  },
): Promise<JudgeResult>;

// src/lib/prompts/registry.ts (additive — 20-Z-04 owns the registry; this plan REGISTERS 'eval-judge-v1')
export interface RegisteredPrompt {
  id: string;
  version: string;
  body: string;
  registered_at: string;
}
export function registerPrompt(p: RegisteredPrompt): void;
export function getPrompt(id: string, version?: string): RegisteredPrompt;
```

JUDGE PROMPT BODY (id='eval-judge-v1', version='v1') — this is the literal content registered:

```
You are an expert financial-research-quality judge. You evaluate pairs of equity-research
report excerpts (baseline vs candidate) and assign scores from 0 to 5 on each of FIVE
dimensions. Be strict, terse, and consistent.

Return STRICT JSON matching:
{
  "scores": [
    {"dimension": "numeric_grounding",     "score": 0|1|2|3|4|5, "rationale": "<= 200 chars"},
    {"dimension": "citation_coverage",     "score": 0|1|2|3|4|5, "rationale": "..."},
    {"dimension": "narrative_coherence",   "score": 0|1|2|3|4|5, "rationale": "..."},
    {"dimension": "hedging_quality",       "score": 0|1|2|3|4|5, "rationale": "..."},
    {"dimension": "contradiction_handling","score": 0|1|2|3|4|5, "rationale": "..."}
  ]
}

RUBRIC — anchored examples per dimension:

1) numeric_grounding — does every numeric claim trace to a source-tagged datum?
   0 = report invents numbers (e.g., "P/E 32.4" with no source)
   2 = ~half of numbers are tagged; rest are unsourced
   4 = nearly all numeric claims are sourced; one or two minor gaps
   5 = every numeric claim references SourcePackage origin (yahoo/finnhub/polygon/etc.)

2) citation_coverage — does every qualitative claim cite ≥1 source?
   0 = no citations anywhere
   2 = key claims cited but most filler claims unsourced
   4 = most claims cited; minor gaps
   5 = every qualitative claim links to ≥1 source URL or vendor tag

3) narrative_coherence — does the report read as a coherent thesis?
   0 = disconnected bullet salad, contradictions ignored
   2 = sections coherent in isolation but don't compose into a thesis
   4 = clear thesis with minor seam issues
   5 = thesis is explicit, supported, and the bullet/bear sections support it directly

4) hedging_quality — is uncertainty calibrated and surfaced (not buried)?
   0 = false certainty (e.g., "will rise" with no qualifier on a 50/50 setup)
   2 = some hedging but inconsistent
   4 = hedging present and approximately matches evidence strength
   5 = uncertainty is quantified (confidence intervals, "based on N sources, agreement Y%") and visible

5) contradiction_handling — does the report acknowledge contradictory signals?
   0 = ignores opposing signals; cherry-picks
   2 = acknowledges contradictions but doesn't reconcile them
   4 = surfaces contradictions and attempts reconciliation
   5 = explicitly reconciles or quantifies dispersion (e.g., "bull/bear split 60/40, dispersion high")

INPUT FORMAT:
=== BASELINE ===
<baseline_text>
=== CANDIDATE ===
<candidate_text>

OUTPUT: JSON only. No prose before or after.
```

</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-Z-05-01 | Tampering | Judge model bias (one model judging another's domain) | mitigate | Use a SEPARATE provider — Claude Opus 4.7 judges Gemini outputs. Rubric is pinned in 20-Z-04 prompt registry (golden-file regression catches drift). Calibration step measures Pearson agreement vs human labels — surfaces bias if present. |
| T-20-Z-05-02 | Cost runaway | Judge token spend explodes during dev iteration | mitigate | Exactly ONE judge call per pair (no chain-of-thought self-consistency, no n-shot). `temperature: 0` for determinism. Cost telemetry flows through 20-Z-03 ProviderCallLog wrapper (deferred — this plan emits cost-per-call to stdout for now and adds a TODO referencing 20-Z-03). Integration test gated behind `RUN_LIVE_JUDGE=true`. |
| T-20-Z-05-03 | Configuration | Stale rubric — prompt registry drift between releases | mitigate | Rubric body lives in 20-Z-04 registry (id='eval-judge-v1', version='v1'). 20-Z-04's golden-file regression test catches any unintentional rubric change without a version bump. JudgeResult stamps `judge_prompt_version` so historical eval runs are reproducible. |
| T-20-Z-05-04 | Acceptance gate | Pearson agreement < 0.7 ship gate not met (depends on 20-D-04 30-exemplar set) | accept | Harness EXISTS regardless of dataset size; ship-gate is per-version, not per-harness. Plan documents 20-D-04 dependency explicitly. CLI emits warning "Pearson sample size n=<N>, insufficient for ship gate (need ≥30)" when n<30. |
| T-20-Z-05-05 | Tampering | Judge cache poisoning — repeated identical inputs cached at AI Gateway return stale verdicts | mitigate | Anthropic SDK call passes no caching headers. Code-level constant `cache: false` documented in opts type so callers cannot accidentally enable it. `temperature: 0` ensures determinism without needing cache. |

</threat_model>

<tasks>

<task type="auto" tdd="true" id="20-Z-05-01">
  <name>Task 1: Types + judge.ts (mock-tested) + registered prompt</name>
  <read_first>
    - src/lib/data/anthropic-search.ts (lines 1-25 — the existing Anthropic client pattern; reuse `import Anthropic from '@anthropic-ai/sdk'; const client = new Anthropic();`)
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (line 92 — 20-Z-04 prompt registry contract; line 93 — 20-Z-05 acceptance)
    - tests/learning.unit.bugs.test.ts (vitest mock pattern reference)
    - package.json (verify @anthropic-ai/sdk ^0.78.0 present)
  </read_first>
  <behavior>
    Unit tests (≥6) covering judge():
    1. judge() returns a JudgeResult with exactly 5 scores (one per JudgeDimension)
    2. judge() pins `judge_model: 'claude-opus-4-7'` regardless of opts
    3. judge() pins `temperature: 0` in the underlying Anthropic call (verify via mock spy)
    4. judge() stamps `judge_prompt_version` from the registry (default 'v1')
    5. judge() throws a descriptive error when Anthropic returns malformed JSON (e.g., text without the `scores` array)
    6. judge() throws when a returned score is out of range [0,5] or missing a dimension
    7. judge() computes `overall` as the arithmetic mean of the 5 scores, in [0,5]
    8. judge() does NOT pass any cache header / cache field to the SDK call (mock spy asserts absence)
  </behavior>
  <action>
    A. Create `src/lib/eval/types.ts` with EXACTLY the types declared in `<interfaces>` above (JudgeDimension, JudgeScore, JudgeResult, HumanExemplar, RegisteredPrompt).

    B. Create `src/lib/prompts/registry.ts` (additive — 20-Z-04 will own the full registry; this plan ships the minimal scaffold + registers 'eval-judge-v1'):

    ```typescript
    // src/lib/prompts/registry.ts
    // Minimal registry scaffold — 20-Z-04 expands this into the full versioned-prompt subsystem
    // with golden-file regression. This plan (20-Z-05) seeds the eval-judge-v1 prompt so the
    // judge harness has a stable, version-stamped rubric from day one.
    import type { RegisteredPrompt } from '@/lib/eval/types';

    const _registry = new Map<string, RegisteredPrompt>();

    export function registerPrompt(p: RegisteredPrompt): void {
      const key = `${p.id}@${p.version}`;
      if (_registry.has(key)) return; // idempotent — module re-imports must not throw
      _registry.set(key, p);
    }

    export function getPrompt(id: string, version: string = 'v1'): RegisteredPrompt {
      const p = _registry.get(`${id}@${version}`);
      if (!p) throw new Error(`Prompt registry: ${id}@${version} not found`);
      return p;
    }

    // Register the eval-judge-v1 rubric (body is the JUDGE PROMPT BODY from PLAN <interfaces>).
    registerPrompt({
      id: 'eval-judge-v1',
      version: 'v1',
      registered_at: '2026-05-10T00:00:00Z',
      body: `You are an expert financial-research-quality judge. You evaluate pairs of equity-research
report excerpts (baseline vs candidate) and assign scores from 0 to 5 on each of FIVE
dimensions. Be strict, terse, and consistent.

Return STRICT JSON matching:
{
  "scores": [
    {"dimension": "numeric_grounding",     "score": 0|1|2|3|4|5, "rationale": "<= 200 chars"},
    {"dimension": "citation_coverage",     "score": 0|1|2|3|4|5, "rationale": "..."},
    {"dimension": "narrative_coherence",   "score": 0|1|2|3|4|5, "rationale": "..."},
    {"dimension": "hedging_quality",       "score": 0|1|2|3|4|5, "rationale": "..."},
    {"dimension": "contradiction_handling","score": 0|1|2|3|4|5, "rationale": "..."}
  ]
}

RUBRIC — anchored examples per dimension:

1) numeric_grounding — does every numeric claim trace to a source-tagged datum?
   0 = report invents numbers (e.g., "P/E 32.4" with no source)
   2 = ~half of numbers are tagged; rest are unsourced
   4 = nearly all numeric claims are sourced; one or two minor gaps
   5 = every numeric claim references SourcePackage origin (yahoo/finnhub/polygon/etc.)

2) citation_coverage — does every qualitative claim cite >= 1 source?
   0 = no citations anywhere
   2 = key claims cited but most filler claims unsourced
   4 = most claims cited; minor gaps
   5 = every qualitative claim links to >= 1 source URL or vendor tag

3) narrative_coherence — does the report read as a coherent thesis?
   0 = disconnected bullet salad, contradictions ignored
   2 = sections coherent in isolation but don't compose into a thesis
   4 = clear thesis with minor seam issues
   5 = thesis is explicit, supported, and the bullet/bear sections support it directly

4) hedging_quality — is uncertainty calibrated and surfaced (not buried)?
   0 = false certainty (e.g., "will rise" with no qualifier on a 50/50 setup)
   2 = some hedging but inconsistent
   4 = hedging present and approximately matches evidence strength
   5 = uncertainty is quantified (confidence intervals, "based on N sources, agreement Y%") and visible

5) contradiction_handling — does the report acknowledge contradictory signals?
   0 = ignores opposing signals; cherry-picks
   2 = acknowledges contradictions but doesn't reconcile them
   4 = surfaces contradictions and attempts reconciliation
   5 = explicitly reconciles or quantifies dispersion (e.g., "bull/bear split 60/40, dispersion high")

INPUT FORMAT:
=== BASELINE ===
<baseline_text>
=== CANDIDATE ===
<candidate_text>

OUTPUT: JSON only. No prose before or after.`,
    });
    ```

    C. Create `src/lib/eval/judge.ts`:

    ```typescript
    // src/lib/eval/judge.ts
    // LLM-as-judge harness — uses Claude Opus 4.7 (separate provider from candidate Gemini).
    // Pin: claude-opus-4-7. Temperature: 0. No caching. One call per pair.
    import Anthropic from '@anthropic-ai/sdk';
    import { randomUUID } from 'node:crypto';
    import { getPrompt } from '@/lib/prompts/registry';
    import type {
      JudgeDimension, JudgeResult, JudgeScore,
    } from './types';

    const ALL_DIMENSIONS: readonly JudgeDimension[] = [
      'numeric_grounding',
      'citation_coverage',
      'narrative_coherence',
      'hedging_quality',
      'contradiction_handling',
    ] as const;

    const JUDGE_MODEL = 'claude-opus-4-7' as const;

    // Lazy client — same pattern as anthropic-search.ts. Allows tests to mock @anthropic-ai/sdk.
    let _client: Anthropic | null = null;
    function getClient(): Anthropic {
      if (!_client) _client = new Anthropic();
      return _client;
    }

    export function _resetClientForTests(): void {
      _client = null;
    }

    function isValidScore(n: unknown): n is 0 | 1 | 2 | 3 | 4 | 5 {
      return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 5;
    }

    function parseJudgeResponse(text: string): JudgeScore[] {
      let parsed: unknown;
      try {
        // Allow the model to wrap JSON in code fences — strip them defensively
        const cleaned = text
          .trim()
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/```\s*$/i, '')
          .trim();
        parsed = JSON.parse(cleaned);
      } catch (e) {
        throw new Error(`Judge response not valid JSON: ${(e as Error).message}; got: ${text.slice(0, 200)}`);
      }
      if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as { scores?: unknown }).scores)) {
        throw new Error(`Judge response missing scores array; got keys: ${Object.keys(parsed as object).join(',')}`);
      }
      const raw = (parsed as { scores: unknown[] }).scores;
      const out: JudgeScore[] = [];
      const seen = new Set<JudgeDimension>();
      for (const r of raw) {
        if (typeof r !== 'object' || r === null) {
          throw new Error(`Judge response score entry not an object: ${JSON.stringify(r)}`);
        }
        const { dimension, score, rationale } = r as Record<string, unknown>;
        if (!ALL_DIMENSIONS.includes(dimension as JudgeDimension)) {
          throw new Error(`Judge response unknown dimension: ${String(dimension)}`);
        }
        if (!isValidScore(score)) {
          throw new Error(`Judge response score out of range for ${dimension}: ${String(score)}`);
        }
        if (typeof rationale !== 'string') {
          throw new Error(`Judge response missing rationale for ${dimension}`);
        }
        seen.add(dimension as JudgeDimension);
        out.push({ dimension: dimension as JudgeDimension, score, rationale });
      }
      for (const d of ALL_DIMENSIONS) {
        if (!seen.has(d)) throw new Error(`Judge response missing dimension: ${d}`);
      }
      // Sort to canonical order so downstream Pearson computation lines up
      out.sort((a, b) => ALL_DIMENSIONS.indexOf(a.dimension) - ALL_DIMENSIONS.indexOf(b.dimension));
      return out;
    }

    export async function judge(
      baseline: string,
      candidate: string,
      opts?: {
        baselineId?: string;
        candidateId?: string;
        temperature?: 0;
        maxTokens?: number;
        promptVersion?: string;
        cache?: false;
      },
    ): Promise<JudgeResult> {
      const promptVersion = opts?.promptVersion ?? 'v1';
      const reg = getPrompt('eval-judge-v1', promptVersion);
      const userBlock = `=== BASELINE ===\n${baseline}\n\n=== CANDIDATE ===\n${candidate}`;

      const client = getClient();
      const response = await client.messages.create({
        model: JUDGE_MODEL,
        max_tokens: opts?.maxTokens ?? 2000,
        temperature: 0,                     // pinned — opts.temperature must be 0 by type
        system: reg.body,
        messages: [{ role: 'user', content: userBlock }],
        // No cache_control on any block — eval calls must never be cached at the gateway (T-20-Z-05-05)
      });

      const textBlock = response.content.find(b => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error(`Judge response had no text content; stop_reason=${response.stop_reason}`);
      }
      const scores = parseJudgeResponse(textBlock.text);
      const overall = scores.reduce((s, x) => s + x.score, 0) / scores.length;

      return {
        run_id: randomUUID(),
        baseline_id: opts?.baselineId ?? 'baseline',
        candidate_id: opts?.candidateId ?? 'candidate',
        scores,
        overall,
        judge_prompt_version: reg.version,
        judge_model: JUDGE_MODEL,
        ran_at: new Date().toISOString(),
      };
    }
    ```

    D. Create `tests/eval/judge.unit.test.ts` — vitest, mocking '@anthropic-ai/sdk'. Cover the 8 behaviors above. Mock pattern:

    ```typescript
    import { describe, it, expect, vi, beforeEach } from 'vitest';

    const messagesCreate = vi.fn();
    vi.mock('@anthropic-ai/sdk', () => ({
      default: vi.fn().mockImplementation(() => ({
        messages: { create: messagesCreate },
      })),
    }));

    import { judge, _resetClientForTests } from '@/lib/eval/judge';

    beforeEach(() => {
      messagesCreate.mockReset();
      _resetClientForTests();
    });

    function mockOk(scores: Array<{ dimension: string; score: number; rationale: string }>) {
      messagesCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify({ scores }) }],
        stop_reason: 'end_turn',
      });
    }

    // ... tests follow the 8 behaviors
    ```

    Make sure every assertion is concrete (e.g., `expect(messagesCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-opus-4-7', temperature: 0 }))`). Asserting absence of cache: assert the call argument has no `cache_control` anywhere using `JSON.stringify(messagesCreate.mock.calls[0][0]).includes('cache')` should be false.
  </action>
  <acceptance_criteria>
    - File `src/lib/eval/types.ts` exists and exports JudgeDimension, JudgeScore, JudgeResult, HumanExemplar, RegisteredPrompt
    - File `src/lib/prompts/registry.ts` exists, registers 'eval-judge-v1' v1
    - File `src/lib/eval/judge.ts` exists, references string literal `'claude-opus-4-7'`
    - `grep -q "claude-opus-4-7" src/lib/eval/judge.ts`
    - `grep -q "temperature: 0" src/lib/eval/judge.ts`
    - `grep -q "eval-judge-v1" src/lib/prompts/registry.ts`
    - `npx vitest run tests/eval/judge.unit.test.ts` exits 0 with ≥6 passing tests (target 8)
  </acceptance_criteria>
  <automated>npx vitest run tests/eval/judge.unit.test.ts</automated>
  <done>Types + judge() + registered prompt landed; ≥6 unit tests GREEN with mocked Anthropic client</done>
</task>

<task type="auto" id="20-Z-05-02">
  <name>Task 2: Starter human-labeled set (5 exemplars) + fixtures</name>
  <read_first>
    - src/lib/eval/types.ts (HumanExemplar shape — written in Task 1)
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (line 93 — note "calibrated against ≥30 human-labeled exemplars (20-D-04 golden set)")
  </read_first>
  <action>
    A. Create directory `tests/golden-tickers/_human_labels/` and add 5 starter JSON exemplars. Each file MUST conform to `HumanExemplar`:

    ```json
    {
      "exemplar_id": "aapl-bullish-2026-01",
      "ticker": "AAPL",
      "notes": "Clean bullish report with full citations — should score high on numeric_grounding and citation_coverage",
      "baseline_text": "AAPL trades at $185.42 (yahoo). P/E of 28.3 (yahoo). Bullish momentum on iPhone cycle...",
      "candidate_text": "AAPL trades at $185.42 (yahoo). P/E 28.3 (yahoo). Strong iPhone cycle per analyst commentary (anthropic-search). Bull/bear split 70/30 on StockTwits (stocktwits). Forward outlook: $200 PT consensus (anthropic-search).",
      "human_scores": {
        "numeric_grounding": 5,
        "citation_coverage": 5,
        "narrative_coherence": 4,
        "hedging_quality": 3,
        "contradiction_handling": 2
      },
      "labeler": "tj",
      "labeled_at": "2026-05-10T17:00:00Z"
    }
    ```

    Write 5 distinct exemplars covering a range of quality so per-dimension Pearson is non-degenerate (need variance in each dimension):
    - `example-aapl-bullish.json` — high numeric_grounding (5), low contradiction_handling (1)
    - `example-aapl-bearish.json` — high citation_coverage (5), low hedging_quality (1)
    - `example-gme-crowded.json` — low narrative_coherence (1), high contradiction_handling (5) — the "right answer" case
    - `example-spy-neutral.json` — mid all-around (3, 3, 3, 3, 3)
    - `example-pltr-mixed.json` — high hedging_quality (5), low numeric_grounding (1) — invented numbers

    Keep each baseline_text and candidate_text short (≤ 800 chars each) so the harness runs fast on the starter set.

    B. Create `tests/eval/fixtures/baseline.txt` and `tests/eval/fixtures/candidate.txt` — small (~200 chars each) standalone files used for the dry-run flow in Task 4.

    Example baseline.txt: a single short paragraph extracted from `src/lib/research-brief.ts` style output (no real numbers).
    Example candidate.txt: same content but with one extra source citation added.
  </action>
  <acceptance_criteria>
    - Directory `tests/golden-tickers/_human_labels/` exists
    - `ls tests/golden-tickers/_human_labels/*.json | wc -l` returns ≥5
    - Each file parses as JSON containing keys: exemplar_id, ticker, baseline_text, candidate_text, human_scores, labeler, labeled_at
    - `human_scores` keys cover all 5 dimensions in every exemplar
    - Variance is non-zero across exemplars in each dimension (so Pearson is well-defined)
    - `tests/eval/fixtures/baseline.txt` and `tests/eval/fixtures/candidate.txt` both exist and are non-empty
  </acceptance_criteria>
  <automated>node -e "const fs=require('fs'); const files=fs.readdirSync('tests/golden-tickers/_human_labels').filter(f=>f.endsWith('.json')); if(files.length<5)process.exit(1); for(const f of files){const j=JSON.parse(fs.readFileSync('tests/golden-tickers/_human_labels/'+f,'utf8')); for(const d of ['numeric_grounding','citation_coverage','narrative_coherence','hedging_quality','contradiction_handling']){if(typeof j.human_scores[d]!=='number')process.exit(2);}}"