---
phase: 19
plan: 19-C-10
wave: C
type: execute
depends_on: [19-Z-01, 19-Z-02, 19-Z-03, 19-Z-04, 19-C-01]
files_modified:
  - src/lib/sentiment/contradiction-detector.ts
  - src/lib/engine-context.ts
  - src/components/EngineCalibrationPanel.tsx
  - tests/lib/sentiment/contradiction-detector.test.ts
  - tests/integration/contradiction-detector.live.test.ts
autonomous: true
requirements: []
shadow_required: true
hard_cleanup_gate: true
must_haves:
  truths:
    - "detectContradictions(classPosteriors) runs NLI on pairs of class posteriors per D-42"
    - "Severity threshold flagged in EngineCalibrationPanel"
    - "DETECTION-ONLY mode per D-42: detector logs warnings only, NEVER gates output. This is the PERMANENT operating mode for Phase 19 (NOT just first cycle); upgrade to gating mode requires a separate follow-up plan + decision"
    - "Detector flags ≥1 historical case in backfill (Wave C success criterion 7) — validates detector"
    - "Shadow A/B verdict measures false-positive rate / detector validity, NOT a behavioral output gate (since detection-only means new path output ≡ old path output for the gemini-analysis call). The shadow comparison's purpose is detector validation: PASS verdict means detector is reliable enough to leave permanently enabled"
    - "Lifecycle: shadow → PASS verdict → cutover (flag set to 'on' permanently — detector unconditionally enabled in code) → 7d hatch → flag removal (detector becomes unconditional code path, still detection-only). Flag removal does NOT change detector behavior — it just makes 'detection-only enabled' the permanent code state"
  artifacts:
    - path: "src/lib/sentiment/contradiction-detector.ts"
      provides: "detectContradictions + ContradictionResult"
      exports: ["detectContradictions", "ContradictionResult"]
    - path: "src/lib/engine-context.ts"
      provides: "Surfaces contradiction_warnings field (additive)"
      contains: "contradiction"
    - path: "src/components/EngineCalibrationPanel.tsx"
      provides: "Renders contradiction warning when present (no UI regression)"
      contains: "contradiction"
  key_links:
    - from: "src/lib/sentiment/contradiction-detector.ts"
      to: "NLI verifier (FinBERT or distilbert-mnli — same as 19-C-08 choice)"
      via: "pairwise NLI checks across class posteriors"
      pattern: "classifyFinBERT|distilbert"
---

# Plan 19-C-10: Cross-class contradiction detector (DETECTION-ONLY, permanent mode)

<universal_preamble>

## Autonomous Execution Clause + Hard Cleanup Gate

Per D-42, the detector operates in DETECTION-ONLY mode for Phase 19 — and stays in detection-only mode permanently after cutover. Upgrading to gating mode (where contradictions block or modify report output) is OUT OF SCOPE for this plan and requires a separate follow-up plan + new decision.

### What "DETECTION-ONLY" means for the lifecycle

A "normal" Phase 19 shadow plan has this lifecycle:
- shadow mode runs old + new path side-by-side
- verdict PASS means new path is BETTER than old (quality_delta ≥ 0)
- cutover replaces old with new (behavior change for users)

For 19-C-10, the new path's report output is IDENTICAL to the old path's report output (same Gemini analysis, same recommendations). The new path adds a `contradiction_warnings` array surfaced in EngineCalibrationPanel — additive UI, not output replacement.

Therefore:
- shadow verdict measures DETECTOR VALIDITY, not output quality:
  - false_positive_rate: of warnings the detector raised, how many were actually invalid contradictions (manual labeling of 20 sampled cases)
  - true_positive_rate / coverage: detector flags ≥1 historical real contradiction (Wave C criterion 7)
  - latency overhead: detector adds ≤ 200ms per request (per-request shadow rows)
- output_disagreement_rate is necessarily 0 by construction (same gemini output) and is documented in the strategy
- quality_delta is null for the verdict (no quality regression possible since output is unchanged)

PASS criteria (encoded in 19-Z-03 STRATEGIES['contradiction-detector']):
- false_positive_rate < 0.30
- ≥1 historical contradiction flagged correctly
- latency overhead < 200ms median per request

### Cutover semantics (different from typical plans)

For typical shadow plans, cutover = "delete old path, new path becomes primary."

For 19-C-10, cutover = "make detection-only permanent."
- Flag flips from `shadow` → `on` in production
- Detector runs on every request, surfaces warnings in EngineCalibrationPanel
- Report output (Gemini analysis text + recommendations) is UNCHANGED

### 7-day hatch

Same as other plans — monitor RollbackLog for FEATURE_CONTRADICTION_DETECTOR. Hatch protects against silent failure modes (detector OOM, NLI verifier down, latency regression in production).

### Flag removal

Remove `'contradiction_detector'` from `FLAG_NAMES` in src/lib/features.ts.

CRITICAL: Flag removal does NOT change detector behavior. It just removes the on/off/shadow toggle — the detector becomes unconditionally enabled in code, still in detection-only mode. The code path goes from:
```typescript
if (FEATURES.contradiction_detector_enabled) {
  warnings = await detectContradictions(...);
}
```
to:
```typescript
warnings = await detectContradictions(...);  // always runs, detection-only
```

This is the canonical "make it permanent" pattern for detection-only features.

## Hard Cleanup Gate (Definition of Done)

1. `shadow-reports/19-C-10.json` verdict=PASS — false_positive_rate < 0.30, ≥1 historical contradiction flagged, latency overhead acceptable
2. Cutover PR merged — FEATURE_CONTRADICTION_DETECTOR flipped to default 'on' in .env.example and production
3. 7d post-cutover with zero RollbackLog rows for FEATURE_CONTRADICTION_DETECTOR
4. Flag-removal PR merged — FEATURE_CONTRADICTION_DETECTOR removed from features.ts; detector becomes unconditional code (still detection-only)
5. `npm test`, `npm run test:integration`, `npm run test:e2e` all green; `npm run model-card-status` reports `flag-removed-contradiction_detector: ok=true`

</universal_preamble>

<objective>
Per D-42, deliver cross-class contradiction detector. NLI on pairs of class posteriors (e.g., technical=bullish AND insider=heavy-selling). Severity threshold flagged in EngineCalibrationPanel. **DETECTION-ONLY MODE — permanently for Phase 19.** Detector logs warnings only; does NOT gate report output. Lifecycle goes shadow → PASS verdict (detector valid) → cutover (flag=on permanent) → 7d hatch → flag removed (detector unconditionally enabled, still detection-only).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md
@.planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md
@.planning/phases/19-cipher-v2-0-excellence/19-C-08-SUMMARY.md
@.planning/phases/19-cipher-v2-0-excellence/19-Z-03-SUMMARY.md
@src/lib/engine-context.ts
@src/components/EngineCalibrationPanel.tsx

<interfaces>
```typescript
export interface ContradictionResult {
  detected: boolean;
  pairs: Array<{
    class_a: string;       // e.g., 'technical'
    class_b: string;       // e.g., 'insider'
    posterior_a: number;
    posterior_b: number;
    nli_label: 'contradiction' | 'neutral' | 'entailment';
    severity: number;      // 0-1
  }>;
  warnings: string[];
}

export async function detectContradictions(args: {
  ticker: string;
  classPosteriors: Record<'diffusion' | 'technical' | 'insider' | 'institutional', number>;
}): Promise<ContradictionResult>;
```
</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-C-10-01 | Business Logic | false-positive contradiction warnings spam UI | mitigate | Detection-only mode permanent for Phase 19 (no gating); shadow verdict measures false-positive rate before considering severity threshold; threshold tuned post-shadow |
| T-19-C-10-02 | Tampering | NLI model returns wrong label | mitigate | Reuse same NLI choice as 19-C-08 (validated empirically on labeled fixture) |
| T-19-C-10-03 | DoS | NLI verifier latency regression | mitigate | Shadow A/B captures latency_old/new per request; verdict requires latency overhead < 200ms median |

</threat_model>

<tasks>

<task type="auto" tdd="true" id="19-C-10-01">
  <name>Task 1: Write tests/lib/sentiment/contradiction-detector.test.ts</name>
  <read_first>
    - src/lib/reasoning/cove.ts (NLI helper, just-built — reuse choice)
  </read_first>
  <behavior>
    - Test 1: `all 4 classes bullish → no contradictions`
    - Test 2: `technical bullish + insider bearish → contradiction detected with severity > 0.5`
    - Test 3: `mild divergence (0.55 vs 0.45) → severity below threshold, no warning`
    - Test 4: `NLI error on one pair → other pairs still evaluated; that pair marked unverified`
    - Test 5: `warnings array empty when detected=false`
    - Test 6: `pairs array contains all 6 unique class pairs (4 choose 2)`
  </behavior>
  <action>
    Create `tests/lib/sentiment/contradiction-detector.test.ts`. Mock the NLI verifier from 19-C-08.
  </action>
  <acceptance_criteria>
    - File exists; ≥6 tests; FAILS RED
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/sentiment/contradiction-detector.test.ts 2>&1 | grep -qE "Cannot find|FAIL"</automated>
  <done>Tests written</done>
</task>

<task type="auto" tdd="true" id="19-C-10-02">
  <name>Task 2: Implement src/lib/sentiment/contradiction-detector.ts</name>
  <read_first>
    - tests/lib/sentiment/contradiction-detector.test.ts
    - src/lib/reasoning/cove.ts (NLI verifier helper)
  </read_first>
  <action>
    Create `src/lib/sentiment/contradiction-detector.ts`:
    ```typescript
    // Reuse NLI verifier from 19-C-08
    // ...
    export async function detectContradictions(args: {
      ticker: string;
      classPosteriors: Record<string, number>;
    }): Promise<ContradictionResult> {
      const classes = Object.keys(args.classPosteriors) as Array<keyof typeof args.classPosteriors>;
      const pairs: ContradictionResult['pairs'] = [];

      for (let i = 0; i < classes.length; i++) {
        for (let j = i + 1; j < classes.length; j++) {
          const a = classes[i], b = classes[j];
          const pa = args.classPosteriors[a], pb = args.classPosteriors[b];
          // Verbalize each posterior, run NLI
          const stmtA = pa > 0.5 ? `${a} signals bullish (${pa.toFixed(2)})` : `${a} signals bearish (${pa.toFixed(2)})`;
          const stmtB = pb > 0.5 ? `${b} signals bullish (${pb.toFixed(2)})` : `${b} signals bearish (${pb.toFixed(2)})`;
          const nliLabel = await nliVerify(stmtA, stmtB); // import from cove.ts
          const divergence = Math.abs(pa - pb);
          const severity = nliLabel === 'contradict' ? divergence : 0;
          pairs.push({ class_a: a, class_b: b, posterior_a: pa, posterior_b: pb, nli_label: nliLabel ?? 'neutral', severity });
        }
      }

      const warnings = pairs.filter(p => p.severity > 0.3).map(p =>
        `Cross-class contradiction: ${p.class_a}=${p.posterior_a.toFixed(2)} vs ${p.class_b}=${p.posterior_b.toFixed(2)} (severity ${p.severity.toFixed(2)})`
      );

      return { detected: warnings.length > 0, pairs, warnings };
    }
    ```
  </action>
  <acceptance_criteria>
    - All 6 tests pass
    - `grep -q "detectContradictions" src/lib/sentiment/contradiction-detector.ts`
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/sentiment/contradiction-detector.test.ts</automated>
  <done>6/6 GREEN</done>
</task>

<task type="auto" id="19-C-10-03">
  <name>Task 3: Surface contradiction warnings in engine-context + EngineCalibrationPanel (additive, never gating)</name>
  <read_first>
    - src/lib/engine-context.ts
    - src/components/EngineCalibrationPanel.tsx
  </read_first>
  <action>
    Edit `src/lib/engine-context.ts`:
    - When `FEATURES.contradiction_detector_enabled === true OR contradiction_detector_mode === 'shadow'`, call detectContradictions with the 4 class posteriors
    - Add `contradiction_warnings: string[]` to engine context return type (additive — never alters posterior_mean / recommendation / any output that drives report content)

    Edit `src/components/EngineCalibrationPanel.tsx`:
    - When contradiction_warnings.length > 0, render an additional warning row below existing CI display:
      "⚠ Cross-class warnings: {warnings.join('; ')}"
    - DETECTION-ONLY mode: this is informational only, NEVER gating. Comment in the code documenting this:
      ```typescript
      // DETECTION-ONLY mode per D-42 — warnings are informational; report output is NOT gated by them.
      // Upgrading to gating mode requires a separate plan and explicit decision.
      ```
  </action>
  <acceptance_criteria>
    - `grep -q "contradiction_warnings\|contradiction" src/lib/engine-context.ts`
    - `grep -q "contradiction" src/components/EngineCalibrationPanel.tsx`
    - `grep -q "Cross-class\|⚠" src/components/EngineCalibrationPanel.tsx`
    - `grep -q "DETECTION-ONLY\|detection-only" src/components/EngineCalibrationPanel.tsx` (lifecycle documented in code)
  </acceptance_criteria>
  <automated>grep -q "contradiction" src/lib/engine-context.ts && grep -q "contradiction" src/components/EngineCalibrationPanel.tsx && grep -qi "detection-only" src/components/EngineCalibrationPanel.tsx</automated>
  <done>Warnings surfaced in UI (DETECTION-ONLY mode, lifecycle commented in code)</done>
</task>

<task type="auto" id="19-C-10-04">
  <name>Task 4: Live-DB integration test — flag ≥1 historical case</name>
  <read_first>
    - prisma/schema.prisma
  </read_first>
  <action>
    Create `tests/integration/contradiction-detector.live.test.ts`:
    - Pull 100 historical reports from Neon
    - For each, compute the 4 class posteriors via existing engine-context lookup
    - Run detectContradictions
    - Assert: ≥1 historical report flags as contradiction (Wave C criterion 7)
    - This validates the detector — if zero historical cases trip, the detector is too permissive (too high threshold) or there are no actual contradictions in our data
  </action>
  <acceptance_criteria>
    - File exists; test passes (assuming Neon has ≥100 historical reports)
    - At least 1 historical case flagged
  </acceptance_criteria>
  <automated>test -f tests/integration/contradiction-detector.live.test.ts</automated>
  <done>Detector validated on real data</done>
</task>

<task type="auto" id="19-C-10-05">
  <name>Task 5: Initial commit + shadow lifecycle (DETECTION-ONLY, permanent)</name>
  <action>
    Commit:
    ```
    feat(19-c-10): cross-class contradiction detector (DETECTION-ONLY, permanent mode)

    detectContradictions runs NLI on all 6 pairs of class posteriors per D-42.
    Severity threshold 0.3; warnings surfaced in EngineCalibrationPanel.

    DETECTION-ONLY mode is PERMANENT for Phase 19 — does NOT gate output.
    Report output (Gemini analysis text + recommendations) is unchanged with
    or without the detector. Detector adds an additive `contradiction_warnings`
    array consumed by EngineCalibrationPanel.

    Shadow verdict measures detector validity (false-positive rate, historical
    case coverage, latency overhead) — NOT output quality (output is identical
    by construction). Bridges via 19-Z-03 STRATEGIES['contradiction-detector'].

    Cutover semantic: flag → 'on' permanently. Flag removal: detector becomes
    unconditional code path, still detection-only. Upgrading to gating mode
    requires separate follow-up plan.

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```

    Lifecycle:
    a) Flip FEATURE_CONTRADICTION_DETECTOR shadow
    b) Drive workload — production research traffic generates ShadowComparison rows for path_name='contradiction-detector' (latencies + per-request equality of report output)
    c) Manual labeling sample: pick 20 random ShadowComparison rows where new path produced warnings; manually classify as TP (real contradiction) or FP (spurious)
    d) `npm run shadow-verdict 19-C-10`:
       - 19-Z-03 STRATEGIES['contradiction-detector'] reads ShadowComparison rows for latency, reads manual label sample for false_positive_rate
       - PASS if false_positive_rate < 0.30 AND ≥1 historical contradiction flagged correctly AND latency overhead < 200ms median
       - output_disagreement_rate=0 by construction (same gemini output); documented in strategy
       - quality_delta=null (no quality metric — detection-only)
    e) PASS → cutover (flag=on permanently; keep detection-only mode; no model router gating in this plan)
    f) 7d hatch
    g) Flag removal — detector becomes unconditional code path (still detection-only)
  </action>
  <acceptance_criteria>
    - shadow-reports/19-C-10.json PASS with false_positive_rate < 0.30
    - FEATURE_CONTRADICTION_DETECTOR removed from features.ts post-7d
    - Detector code becomes unconditional after flag removal: `! grep -q "FEATURES.contradiction_detector" src/lib/engine-context.ts` AND `grep -q "detectContradictions" src/lib/engine-context.ts`
    - Report output (gemini-analysis result fields) verified UNCHANGED pre/post cutover via integration test diff
  </acceptance_criteria>
  <automated>git log -1 --pretty=%s | grep -q "19-c-10"</automated>
  <done>Detector live in DETECTION-ONLY mode permanently; flag removed; lifecycle complete</done>
</task>

</tasks>

<verification>
- [ ] 6 unit tests pass
- [ ] Detector flags ≥1 historical case (criterion 7)
- [ ] EngineCalibrationPanel renders warnings additively (lifecycle commented in code)
- [ ] Shadow PASS: false-positive rate < 30%, latency overhead < 200ms median
- [ ] Cutover semantic = "make detection-only permanent" (NOT "replace old behavior with new")
- [ ] Flag removal makes detector unconditional code path, still detection-only
- [ ] Report output unchanged pre/post cutover
</verification>

<success_criteria>
1. Cross-class contradictions surfaced in /research/[ticker] (additive UI)
2. Detector validated on backfill data (≥1 historical contradiction flagged)
3. DETECTION-ONLY mode permanent — no gating; gating is OUT OF SCOPE for Phase 19
4. Hard Cleanup Gate satisfied (PASS + cutover-as-permanent + 7d clean + flag removed → unconditional detection-only code)
</success_criteria>

<output>
Create `.planning/phases/19-cipher-v2-0-excellence/19-C-10-SUMMARY.md` documenting:
- DETECTION-ONLY lifecycle clarification (cutover/flag-removal semantics differ from typical shadow plans)
- false_positive_rate from manual label sample
- Historical case coverage evidence
- Confirmation that report output identical pre/post detector enable
</output>
</content>
</invoke>