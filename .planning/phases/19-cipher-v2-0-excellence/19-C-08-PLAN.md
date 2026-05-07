---
phase: 19
plan: 19-C-08
wave: C
type: execute
depends_on: [19-Z-01, 19-Z-02, 19-Z-03, 19-Z-04, 19-C-01, 19-C-07]
files_modified:
  - src/lib/reasoning/cove.ts
  - src/lib/gemini-analysis.ts
  - tests/lib/reasoning/cove.test.ts
  - tests/integration/cove.shadow.live.test.ts
autonomous: true
requirements: []
shadow_required: true
hard_cleanup_gate: true
must_haves:
  truths:
    - "CoVe two-pass: Pass 1 Gemini emits AnalysisResult + 3 verification claims (D-40)"
    - "Pass 2: NLI check (FinBERT or distilbert-mnli) on each claim vs SourcePackage"
    - "Contradictions flagged in source_warnings field (existing field, additive use)"
    - "Active for high-stakes tickers (>20% of reports per Wave C success criterion 5)"
    - "NLI model choice tested at impl time on 100 known reports + manual labels (RESEARCH Open Question 4)"
    - "Shadow A/B: hallucination rate < pre-CoVe baseline on manual sample (RESEARCH Pitfall 5 CoVe metric)"
  artifacts:
    - path: "src/lib/reasoning/cove.ts"
      provides: "runCoVe(pass1Result, sourcePackage) — verifies claims, returns warnings"
      exports: ["runCoVe"]
    - path: "src/lib/gemini-analysis.ts"
      provides: "Wires CoVe pass 2 behind FEATURE_COVE_TWO_PASS"
      contains: "runCoVe"
  key_links:
    - from: "src/lib/reasoning/cove.ts"
      to: "src/lib/sentiment/finsentllm.ts (FinBERT)"
      via: "NLI verification"
      pattern: "classifyFinBERT|distilbert"
---

# Plan 19-C-08: CoVe two-pass wrapper (Gemini draft → NLI verification)

<universal_preamble>

## Autonomous Execution Clause + Hard Cleanup Gate

Standard shadow lifecycle. Per D-40.

</universal_preamble>

<objective>
Per D-40, deliver Chain-of-Verification (CoVe) two-pass wrapper. Pass 1: Gemini emits AnalysisResult + 3 verification claims. Pass 2: NLI check on each claim vs SourcePackage. Contradictions flagged in source_warnings. Reduces factual hallucinations 50-70% per Dhuliawala et al. 2024.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md
@.planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md
@docs/plans/2026-05-07-cipher-v2-excellence-design.md
@.planning/phases/19-cipher-v2-0-excellence/19-C-01-SUMMARY.md
@.planning/phases/19-cipher-v2-0-excellence/19-C-07-SUMMARY.md
@src/lib/gemini-analysis.ts

<interfaces>
```typescript
export interface CoVeResult {
  verified: boolean[];          // per-claim pass/fail
  contradictions: string[];     // human-readable warnings
  nli_model: 'finbert' | 'distilbert-mnli';
}

export async function runCoVe(args: {
  analysisResult: AnalysisResult;
  verificationClaims: string[];   // 3 claims emitted by Pass 1
  sourcePackage: SourcePackage;
}): Promise<CoVeResult>;
```
</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-C-08-01 | Tampering | NLI verifier model choice (FinBERT vs distilbert-mnli) | mitigate | Per RESEARCH Open Question 4: run BOTH on 100 known reports + manual ground-truth labels at impl time; pick higher-accuracy variant; record in code comment |
| T-19-C-08-02 | Business Logic | CoVe doubles Gemini cost | mitigate | Router gates CoVe to high-stakes tickers only (Plan 19-C-09 routes ic_decay_flag=true OR controversy>threshold to CoVe path); budget cap in env |

</threat_model>

<tasks>

<task type="auto" id="19-C-08-01">
  <name>Task 1: NLI model selection — empirical comparison on labeled reports</name>
  <read_first>
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (Open Question 4)
    - src/lib/sentiment/finsentllm.ts (classifyFinBERT)
  </read_first>
  <action>
    Per RESEARCH Open Question 4, the choice between FinBERT and distilbert-mnli for NLI verification needs empirical validation:

    1. Pull 100 historical Cipher reports from `prisma.report.findMany({ take: 100, orderBy: { analyzed_at: 'desc' }})`
    2. Manually label 30 sampled claims as "supported" / "contradicted" / "neutral" by their SourcePackages (this is human/operator work — produce a TSV file `tests/fixtures/nli-eval-labels.tsv`)
    3. Run BOTH NLI variants on each claim+evidence pair; compute accuracy
    4. Record winner + accuracy in `src/lib/reasoning/cove.ts` code comment
    5. If labels are too costly to produce manually, use a stratified sample of 10 reports + 30 claims

    Output: `tests/fixtures/nli-eval-labels.tsv` + decision recorded in cove.ts header comment.
  </action>
  <acceptance_criteria>
    - `tests/fixtures/nli-eval-labels.tsv` exists with at least 30 labeled claims
    - Decision documented in cove.ts header
  </acceptance_criteria>
  <automated>test -f tests/fixtures/nli-eval-labels.tsv</automated>
  <done>NLI model selected empirically (Open Question 4 resolved)</done>
</task>

<task type="auto" tdd="true" id="19-C-08-02">
  <name>Task 2: Write tests/lib/reasoning/cove.test.ts</name>
  <read_first>
    - .planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md (D-40)
  </read_first>
  <behavior>
    - Test 1: `runCoVe with 3 claims all supported by SourcePackage → verified=[true,true,true], contradictions=[]`
    - Test 2: `runCoVe with 1 contradicted claim → verified=[true,false,true], contradictions=['claim X contradicted by source Y']`
    - Test 3: `runCoVe handles empty SourcePackage → all claims unverifiable, contradictions=['no source available']`
    - Test 4: `runCoVe handles NLI model error → returns null verified entries (graceful degrade)`
    - Test 5: `selected NLI model recorded in result.nli_model field`
    - Test 6: `claims slice/sliceAndDice protected against very long claim strings (truncate at 500 chars)`
  </behavior>
  <action>
    Create `tests/lib/reasoning/cove.test.ts`. Mock the chosen NLI client (FinBERT classifier or distilbert via HF Inference). Pin synthetic claim/source pairs.
  </action>
  <acceptance_criteria>
    - File exists; ≥6 tests; FAILS RED
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/reasoning/cove.test.ts 2>&1 | grep -qE "Cannot find|FAIL"</automated>
  <done>6 failing tests written</done>
</task>

<task type="auto" tdd="true" id="19-C-08-03">
  <name>Task 3: Implement src/lib/reasoning/cove.ts</name>
  <read_first>
    - tests/lib/reasoning/cove.test.ts
    - tests/fixtures/nli-eval-labels.tsv (decision)
    - src/lib/sentiment/finsentllm.ts (if FinBERT chosen)
  </read_first>
  <action>
    Create `src/lib/reasoning/cove.ts`:
    ```typescript
    /**
     * Chain-of-Verification (CoVe) per Dhuliawala et al. 2024 (arxiv.org/abs/2309.11495).
     *
     * NLI MODEL CHOICE: <FinBERT|distilbert-mnli> selected based on empirical evaluation
     * on tests/fixtures/nli-eval-labels.tsv. Accuracy: <X>% (winner) vs <Y>% (loser).
     * Decision date: 2026-05-XX.
     */
    import type { AnalysisResult, SourcePackage } from '@/lib/types';

    export interface CoVeResult {
      verified: (boolean | null)[];
      contradictions: string[];
      nli_model: 'finbert' | 'distilbert-mnli';
    }

    async function nliVerify(claim: string, evidence: string): Promise<'entail' | 'contradict' | 'neutral' | null> {
      // Use chosen NLI model (FinBERT or distilbert-mnli)
      // ... HF Inference call
      // Parse label → return 'entail', 'contradict', 'neutral', OR null on error
    }

    export async function runCoVe(args: {
      analysisResult: AnalysisResult;
      verificationClaims: string[];
      sourcePackage: SourcePackage;
    }): Promise<CoVeResult> {
      const evidence = JSON.stringify(args.sourcePackage).slice(0, 5000); // truncate
      const verified: (boolean | null)[] = [];
      const contradictions: string[] = [];

      for (const claim of args.verificationClaims) {
        const nliLabel = await nliVerify(claim.slice(0, 500), evidence);
        if (nliLabel === null) verified.push(null);
        else if (nliLabel === 'entail') verified.push(true);
        else if (nliLabel === 'contradict') {
          verified.push(false);
          contradictions.push(`Claim "${claim.slice(0, 100)}..." contradicted by SourcePackage`);
        } else {
          verified.push(null); // neutral = unverifiable
        }
      }

      return { verified, contradictions, nli_model: 'finbert' /* or 'distilbert-mnli' per decision */ };
    }
    ```
  </action>
  <acceptance_criteria>
    - All 6 tests pass
    - `grep -q "NLI MODEL CHOICE" src/lib/reasoning/cove.ts` (decision documented)
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/reasoning/cove.test.ts</automated>
  <done>CoVe wrapper live with empirically-chosen NLI model</done>
</task>

<task type="auto" id="19-C-08-04">
  <name>Task 4: Wire CoVe pass 2 into src/lib/gemini-analysis.ts behind shadow</name>
  <read_first>
    - src/lib/gemini-analysis.ts (existing single-pass flow)
    - src/lib/features.ts (FEATURE_COVE_TWO_PASS)
  </read_first>
  <action>
    Edit `src/lib/gemini-analysis.ts`:
    - Add Pass 1 prompt extension: ask Gemini to ALSO emit `verification_claims: string[]` (3 claims)
    - Wrap full analysis in runWithShadow:
      ```typescript
      const result = await runWithShadow(
        'cove-two-pass',
        () => runGeminiSinglePass(pkg),
        async () => {
          const pass1 = await runGeminiSinglePass(pkg, { askForClaims: true });
          const cove = await runCoVe({ analysisResult: pass1, verificationClaims: pass1.verification_claims, sourcePackage: pkg });
          return {
            ...pass1,
            source_warnings: [...(pass1.source_warnings ?? []), ...cove.contradictions],
            cove_verified: cove.verified,
          };
        },
        FEATURES.cove_two_pass_mode,
        { ticker: pkg.ticker },
      );
      ```
    - Output schema gains optional `cove_verified: (boolean|null)[]` field; source_warnings populated additively
  </action>
  <acceptance_criteria>
    - `grep -q "runCoVe\|runWithShadow.*'cove-two-pass'" src/lib/gemini-analysis.ts`
    - `grep -q "verification_claims" src/lib/gemini-analysis.ts`
  </acceptance_criteria>
  <automated>grep -q "runCoVe" src/lib/gemini-analysis.ts</automated>
  <done>CoVe wired behind shadow</done>
</task>

<task type="auto" id="19-C-08-05">
  <name>Task 5: Initial commit + shadow lifecycle</name>
  <action>
    Commit then run shadow:
    a) Initial commit (flag off)
    b) Flip FEATURE_COVE_TWO_PASS to shadow
    c) Drive workload (every research request runs CoVe in background)
    d) `npm run shadow-verdict 19-C-08`:
       - Numeric fields exact equality (engine-context overwrites)
       - Free-text fields embedding cosine ≥0.80 (RESEARCH Pitfall 5 CoVe metric)
       - source_warnings expanded with contradiction reasons
       - hallucination rate (manually labeled sample) < baseline
       - cost increase ≤ 50% (Gemini Pass 1 + NLI Pass 2)
    e) PASS → cutover; remove single-pass branch from primary
    f) 7d hatch
    g) Flag removal
  </action>
  <acceptance_criteria>
    - shadow-reports/19-C-08.json PASS
    - FEATURE_COVE_TWO_PASS removed
  </acceptance_criteria>
  <automated>git log -1 --pretty=%s | grep -q "19-c-08"</automated>
  <done>CoVe canonical for high-stakes tickers</done>
</task>

</tasks>

<verification>
- [ ] NLI model selection backed by labeled fixture
- [ ] 6 unit tests pass
- [ ] Shadow PASS: hallucination rate down + cost ≤ +50% + numeric exact match
- [ ] cove_verified field populated when active
</verification>

<success_criteria>
1. CoVe active for ≥20% of reports (Wave C criterion 5)
2. Hallucination rate measurably lower vs single-pass baseline
3. source_warnings populated with contradiction reasons
</success_criteria>

<output>
Create `.planning/phases/19-cipher-v2-0-excellence/19-C-08-SUMMARY.md`.
</output>
