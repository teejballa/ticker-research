---
phase: 19
plan: 19-C-02
wave: C
type: execute
depends_on: [19-Z-01, 19-Z-02, 19-Z-03, 19-Z-04, 19-C-01]
files_modified:
  - src/lib/sentiment/ensemble.ts
  - src/lib/data/source-package.ts
  - tests/lib/sentiment/ensemble.test.ts
  - tests/integration/finsentllm-ensemble.shadow.live.test.ts
autonomous: true
requirements: []
shadow_required: true
hard_cleanup_gate: true
must_haves:
  truths:
    - "ensembleSentiment(text) returns {score, confidence, model_agreement, per_model: SentimentScore[]}"
    - "Strategy: weighted average of non-null scores; weight = confidence; agreement = 1 - std(scores)"
    - "Falls back to single model when 2+ models return null"
    - "Returns null overall when all models null"
    - "≥95% of community chatter rows scored when running (Wave C success metric)"
    - "Pearson correlation ≥0.85 with single-model baseline in shadow (RESEARCH Pitfall 5 metric)"
    - "SentimentSnapshot.finsentllm_score + model_agreement populated"
  artifacts:
    - path: "src/lib/sentiment/ensemble.ts"
      provides: "ensembleSentiment + EnsembleResult"
      exports: ["ensembleSentiment", "EnsembleResult"]
    - path: "src/lib/data/source-package.ts"
      provides: "Wires ensembleSentiment into community/news/StockTwits text scoring (behind FEATURE_FINSENTLLM_ENSEMBLE)"
      contains: "ensembleSentiment"
  key_links:
    - from: "src/lib/sentiment/ensemble.ts"
      to: "src/lib/sentiment/finsentllm.ts"
      via: "Promise.allSettled([classifyFinGPT, classifyMistralFin, classifyFinBERT])"
      pattern: "classifyFinGPT|classifyMistralFin|classifyFinBERT"
---

# Plan 19-C-02: Ensemble meta-classifier (FinGPT + Mistral + FinBERT)

<universal_preamble>

## Autonomous Execution Clause (D-04..D-07)

Land ensemble + wire into source-package SentimentSnapshot pipeline behind FEATURE_FINSENTLLM_ENSEMBLE shadow → drive workload → verdict ≥0.85 Pearson correlation with single-model + ≥95% chatter coverage → cutover → 7d hatch → flag removal.

## Hard Cleanup Gate (Definition of Done)

1. shadow-reports/19-C-02.json PASS — Pearson ≥0.85, ≥95% chatter scored, no field nulls
2. Cutover PR merged — single-model fallback path retained but flag-gated
3. 7d clean RollbackLog
4. FEATURE_FINSENTLLM_ENSEMBLE removed
5. Full test suite green; finsentllm check on model-card-status reports ok=true

</universal_preamble>

<objective>
Per D-34, deliver weighted-average ensemble of FinGPT v3 + Mistral 7B fin-tuned + FinBERT scores. Falls back to single available model when 2+ null. Computes model_agreement metric. Wires into SentimentSnapshot population path.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md
@.planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md
@.planning/phases/19-cipher-v2-0-excellence/19-C-01-SUMMARY.md
@src/lib/sentiment/finsentllm.ts
@src/lib/data/source-package.ts

<interfaces>
```typescript
import type { SentimentScore } from '@/lib/sentiment/finsentllm';

export interface EnsembleResult {
  score: number | null;            // weighted-average score
  confidence: number | null;       // mean of contributing confidences
  model_agreement: number | null;  // 1 - std of non-null scores
  per_model: SentimentScore[];     // individual outputs (for telemetry)
}

export async function ensembleSentiment(text: string): Promise<EnsembleResult>;
```
</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-C-02-01 | DoS | one slow model blocks ensemble | mitigate | Promise.allSettled (not Promise.all) — never throws; ensemble returns when all settled OR within timeout |
| T-19-C-02-02 | Tampering | wrong weighting (e.g., weight=score not confidence) | mitigate | Unit test pins exact formula: weighted_avg = Σ(score_i × conf_i) / Σ(conf_i) over non-null; agreement = 1 - std(scores_non_null) |
| T-19-C-02-03 | Business Logic | cold-start latency ≥2× old single-model | mitigate | Per RESEARCH Pitfall 4: shadow window extended to 7d for C-02; verdict uses latency_p50 (not p95) since cold-start outliers expected |

</threat_model>

<tasks>

<task type="auto" tdd="true" id="19-C-02-01">
  <name>Task 1: Write tests/lib/sentiment/ensemble.test.ts</name>
  <read_first>
    - src/lib/sentiment/finsentllm.ts (SentimentScore shape)
  </read_first>
  <behavior>
    - Test 1: `all 3 models return scores → weighted average computed correctly` — pin: scores=[0.5,0.3,0.7], conf=[0.8,0.9,0.7] → ensemble.score = (0.5×0.8 + 0.3×0.9 + 0.7×0.7)/(0.8+0.9+0.7)
    - Test 2: `2 of 3 null → falls back to non-null average`
    - Test 3: `all null → returns null score`
    - Test 4: `model_agreement = 1 - std(non-null scores)` — pin formula
    - Test 5: `model_agreement = null when only 1 model returned`
    - Test 6: `per_model array always has 3 entries (even with errors)` — caller can inspect telemetry
    - Test 7: `Promise.allSettled used (not Promise.all)` — verified by ensuring one model throwing doesn't crash ensemble
    - Test 8: `confidence = mean of contributing confidences`
  </behavior>
  <action>
    Create `tests/lib/sentiment/ensemble.test.ts`. Mock the 3 classify functions individually with vi.mock. Pin exact mathematical expected values for tests 1, 4, 8.
  </action>
  <acceptance_criteria>
    - File exists; ≥8 tests; FAILS RED
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/sentiment/ensemble.test.ts 2>&1 | grep -qE "Cannot find|FAIL"</automated>
  <done>8 failing tests written</done>
</task>

<task type="auto" tdd="true" id="19-C-02-02">
  <name>Task 2: Implement src/lib/sentiment/ensemble.ts</name>
  <read_first>
    - tests/lib/sentiment/ensemble.test.ts
    - .planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md (D-34)
  </read_first>
  <action>
    Create `src/lib/sentiment/ensemble.ts`:
    ```typescript
    import { classifyFinGPT, classifyMistralFin, classifyFinBERT, type SentimentScore } from '@/lib/sentiment/finsentllm';

    export interface EnsembleResult {
      score: number | null;
      confidence: number | null;
      model_agreement: number | null;
      per_model: SentimentScore[];
    }

    export async function ensembleSentiment(text: string): Promise<EnsembleResult> {
      const settled = await Promise.allSettled([
        classifyFinGPT(text),
        classifyMistralFin(text),
        classifyFinBERT(text),
      ]);
      const per_model: SentimentScore[] = settled.map((r, i) => {
        const model = (['fingpt-v3', 'mistral-fin-7b', 'finbert'] as const)[i];
        return r.status === 'fulfilled'
          ? r.value
          : { score: null, confidence: null, model, error: 'rejected' };
      });

      const valid = per_model.filter(s => s.score !== null && s.confidence !== null);
      if (valid.length === 0) {
        return { score: null, confidence: null, model_agreement: null, per_model };
      }

      const weightedSum = valid.reduce((acc, s) => acc + (s.score! * s.confidence!), 0);
      const totalWeight = valid.reduce((acc, s) => acc + s.confidence!, 0);
      const score = totalWeight > 0 ? weightedSum / totalWeight : null;
      const confidence = valid.reduce((acc, s) => acc + s.confidence!, 0) / valid.length;

      // model_agreement = 1 - std(non-null scores), null when only 1 model
      let model_agreement: number | null = null;
      if (valid.length >= 2) {
        const scores = valid.map(s => s.score!);
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        const variance = scores.reduce((acc, x) => acc + (x - mean) ** 2, 0) / scores.length;
        model_agreement = 1 - Math.sqrt(variance);
      }

      return { score, confidence, model_agreement, per_model };
    }
    ```
  </action>
  <acceptance_criteria>
    - All 8 tests pass
    - `grep -q "Promise.allSettled" src/lib/sentiment/ensemble.ts`
    - `grep -q "model_agreement" src/lib/sentiment/ensemble.ts`
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/sentiment/ensemble.test.ts</automated>
  <done>Ensemble meta-classifier 8/8 GREEN</done>
</task>

<task type="auto" id="19-C-02-03">
  <name>Task 3: Wire ensembleSentiment into SentimentSnapshot path behind shadow flag</name>
  <read_first>
    - src/lib/data/source-package.ts (where SentimentSnapshot rows are created — search for existing sentiment scoring)
    - prisma/schema.prisma (SentimentSnapshot.finsentllm_score, model_agreement columns from 19-Z-02)
    - src/lib/shadow/shadow-runner.ts
  </read_first>
  <action>
    Find where SentimentSnapshot rows are populated in source-package or sentiment-scan cron. Wrap the sentiment scoring step in shadow:
    ```typescript
    import { ensembleSentiment } from '@/lib/sentiment/ensemble';
    import { runWithShadow } from '@/lib/shadow/shadow-runner';
    import { FEATURES } from '@/lib/features';

    // existing single-model path:
    async function scoreSingleModel(text: string) { /* current StockTwits/Firecrawl-derived sentiment */ }

    // new ensemble path:
    async function scoreEnsemble(text: string) {
      const r = await ensembleSentiment(text);
      // map to SentimentSnapshot.finsentllm_score + model_agreement
      return { finsentllm_score: r.score, model_agreement: r.model_agreement, per_model: r.per_model };
    }

    const sentiment = await runWithShadow(
      'finsentllm-ensemble',
      () => scoreSingleModel(text),
      () => scoreEnsemble(text),
      FEATURES.finsentllm_ensemble_mode,
      { ticker },
    );
    ```

    When writing SentimentSnapshot to DB, populate finsentllm_score + model_agreement fields. When the new path runs (even in shadow), persist these fields so the verdict can compare populated vs null over the shadow window.
  </action>
  <acceptance_criteria>
    - `grep -q "ensembleSentiment\|scoreEnsemble" src/lib/data/source-package.ts`
    - `grep -q "runWithShadow.*finsentllm-ensemble" src/lib/data/source-package.ts`
    - `grep -q "finsentllm_score\|model_agreement" src/lib/data/source-package.ts`
  </acceptance_criteria>
  <automated>grep -q "runWithShadow.*finsentllm-ensemble" src/lib/data/source-package.ts</automated>
  <done>Ensemble wired behind shadow gate</done>
</task>

<task type="auto" tdd="true" id="19-C-02-04">
  <name>Task 4: Live-DB integration test</name>
  <read_first>
    - tests/integration/source-package.merge.shadow.live.test.ts (pattern reference from 19-B-06)
  </read_first>
  <behavior>
    - Test 1: shadow mode populates SentimentSnapshot.finsentllm_score for new rows
    - Test 2: shadow mode persists model_agreement
    - Test 3: shadow mode creates ShadowComparison row for path_name='finsentllm-ensemble'
    - Test 4: cleanup removes seeded test rows
  </behavior>
  <action>
    Create `tests/integration/finsentllm-ensemble.shadow.live.test.ts`. Use mocked HF clients (real ensemble call would burn HF credits).
  </action>
  <acceptance_criteria>
    - File exists; tests pass against live Neon (with mocked HF)
  </acceptance_criteria>
  <automated>test -f tests/integration/finsentllm-ensemble.shadow.live.test.ts</automated>
  <done>Integration test covers shadow path</done>
</task>

<task type="auto" id="19-C-02-05">
  <name>Task 5: Initial commit + shadow lifecycle</name>
  <action>
    Initial commit:
    ```
    feat(19-c-02): FinSentLLM ensemble meta-classifier behind shadow flag

    ensembleSentiment(text) — Promise.allSettled over FinGPT v3 + Mistral-Fin
    + FinBERT; weighted average by confidence; model_agreement = 1 - std.
    Falls back to single model when 2+ null.

    Wired into SentimentSnapshot path via runWithShadow('finsentllm-ensemble').
    FEATURE_FINSENTLLM_ENSEMBLE default off.

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```

    Then shadow lifecycle (per universal preamble):
    a) `vercel env add FEATURE_FINSENTLLM_ENSEMBLE shadow production`
    b) Drive workload — community/news scoring runs on every sentiment-scan cron tick + every research request; 7d window for C-02 due to HF cold-start (per RESEARCH Pitfall 4)
    c) `npm run shadow-verdict 19-C-02`:
       - Compute Pearson correlation between ensemble.score and single-model.score over ShadowComparison rows
       - Verdict PASS: Pearson ≥ 0.85 (per RESEARCH Pitfall 5 SentimentSnapshot metric)
       - Coverage check: ≥95% of last-7d community rows have non-null finsentllm_score
       - Latency check: use p50 (not p95) per Pitfall 4 cold-start handling
    d) PASS → cutover: flag default `on`, retain single-model path as fallback when ensemble returns null score
    e) 7d hatch
    f) Flag-removal PR
  </action>
  <acceptance_criteria>
    - `git log -1 --pretty=%s` matches "feat(19-c-02)" (initial)
    - `shadow-reports/19-C-02.json` PASS (post-shadow)
    - FEATURE_FINSENTLLM_ENSEMBLE removed from features.ts (post-7d-hatch)
  </acceptance_criteria>
  <automated>git log -1 --pretty=%s | grep -q "19-c-02"</automated>
  <done>Ensemble lifecycle complete; ≥95% chatter coverage achieved</done>
</task>

</tasks>

<verification>
- [ ] 8 unit tests pass; ensemble math correct
- [ ] Promise.allSettled used (not allTrue)
- [ ] Shadow PASS: Pearson ≥0.85, ≥95% coverage, latency p50 ≤ old
- [ ] FEATURE_FINSENTLLM_ENSEMBLE removed post-cutover
</verification>

<success_criteria>
1. ≥95% of last-30d SentimentSnapshot rows have finsentllm_score (model-card-status check 6)
2. Ensemble Pearson ≥0.85 with single-model baseline
3. Hard Cleanup Gate satisfied
</success_criteria>

<output>
Create `.planning/phases/19-cipher-v2-0-excellence/19-C-02-SUMMARY.md`.
</output>
