---
phase: 19
plan: 19-C-04
wave: C
type: execute
depends_on: [19-Z-01, 19-Z-02, 19-Z-03, 19-Z-04]
files_modified:
  - src/lib/data/options-sentiment.ts
  - tests/lib/data/options-sentiment.term-structure.test.ts
  - tests/integration/options-term-structure.shadow.live.test.ts
autonomous: true
requirements: []
shadow_required: true
hard_cleanup_gate: true
must_haves:
  truths:
    - "Options chains fetched at 30/60/90d expiries (not just nearest)"
    - "Per-expiry put/call ratio weighted by Open Interest"
    - "IV regime classifier: high-IV state (realized < implied by ≥30%) flips put/call interpretation per D-36"
    - "Old nearest-only path preserved when FEATURE_OPTIONS_TERM_STRUCTURE=off"
    - "Shadow A/B verdict: term-structure put/call vs nearest-only Brier non-regression on resolved tickers"
    - "Term-structure becomes canonical put/call source (Wave C success criterion 3)"
  artifacts:
    - path: "src/lib/data/options-sentiment.ts"
      provides: "term-structure mode + IV regime classifier"
      contains: "term_structure_30_60_90"
  key_links:
    - from: "src/lib/data/options-sentiment.ts"
      to: "yahoo-finance2 options chains @ 30/60/90d expiries"
      via: "Promise.allSettled([fetch30d, fetch60d, fetch90d])"
      pattern: "30.*60.*90"
---

# Plan 19-C-04: Options term-structure 30/60/90d + IV regime gate

<universal_preamble>

## Autonomous Execution Clause + Hard Cleanup Gate
Standard shadow lifecycle. Per D-36.

</universal_preamble>

<objective>
Per D-36, replace nearest-expiry-only put/call with term-structure-aware computation. Fetch chains at 30/60/90d, OI-weight per expiry. Add IV regime classifier (high-IV regime flips put/call interpretation: in high-IV regime, elevated put activity = hedging not bearish thesis).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md
@.planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md
@src/lib/data/options-sentiment.ts

<interfaces>
```typescript
export interface TermStructure {
  put_call_30d: number;
  put_call_60d: number;
  put_call_90d: number;
  oi_weighted_avg: number;
  iv_regime: 'low' | 'normal' | 'high';
  iv_realized_ratio: number;  // implied / realized vol
}

export async function fetchOptionsTermStructure(ticker: string): Promise<TermStructure | null>;
```
</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-C-04-01 | Tampering | wrong OI-weighting (e.g., volume not OI) | mitigate | Unit test pins formula: `oi_weighted = Σ(p/c_i × oi_i) / Σ(oi_i)` over the 3 expiries |
| T-19-C-04-02 | Business Logic | IV regime classifier flips at wrong threshold | mitigate | Test at 30%, 50%, 100% implied/realized ratios with pinned regime labels |

</threat_model>

<tasks>

<task type="auto" tdd="true" id="19-C-04-01">
  <name>Task 1: Write tests/lib/data/options-sentiment.term-structure.test.ts</name>
  <read_first>
    - src/lib/data/options-sentiment.ts (existing nearest-only impl)
  </read_first>
  <behavior>
    - Test 1: `fetchOptionsTermStructure returns 30/60/90d put/call ratios`
    - Test 2: `oi_weighted_avg = Σ(p/c_i × oi_i) / Σ(oi_i)` — pin exact formula
    - Test 3: `IV regime classification: ratio ≥ 1.3 → 'high', 0.8-1.3 → 'normal', <0.8 → 'low'`
    - Test 4: `null sentinel on yahoo-finance2 error`
    - Test 5: `null when ticker has no options chain`
    - Test 6: `Promise.allSettled used (1 expiry failing doesn't block other 2)`
  </behavior>
  <action>
    Create `tests/lib/data/options-sentiment.term-structure.test.ts`. Mock yahoo-finance2 options responses with synthetic chains.
  </action>
  <acceptance_criteria>
    - File exists; ≥6 tests; FAILS RED
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/data/options-sentiment.term-structure.test.ts 2>&1 | grep -qE "Cannot find|FAIL"</automated>
  <done>6 failing tests written</done>
</task>

<task type="auto" tdd="true" id="19-C-04-02">
  <name>Task 2: Implement term-structure mode in src/lib/data/options-sentiment.ts</name>
  <read_first>
    - src/lib/data/options-sentiment.ts (existing nearest-only)
    - tests/lib/data/options-sentiment.term-structure.test.ts
  </read_first>
  <action>
    Edit `src/lib/data/options-sentiment.ts`:
    - Add `fetchOptionsTermStructure` exporter that uses yahoo-finance2 options API at 30/60/90d
    - Use `Promise.allSettled` to handle one-expiry failures gracefully
    - Compute OI-weighted average per formula
    - Classify IV regime via implied/realized vol ratio
    - Existing nearest-only path stays unchanged behind FEATURE_OPTIONS_TERM_STRUCTURE=off
    - In hot path consumer (likely sentiment-scan or source-package), wrap with runWithShadow
  </action>
  <acceptance_criteria>
    - All 6 tests pass
    - `grep -q "fetchOptionsTermStructure" src/lib/data/options-sentiment.ts`
    - `grep -q "iv_regime\|iv_realized_ratio" src/lib/data/options-sentiment.ts`
    - `grep -q "30.*60.*90\|expiry" src/lib/data/options-sentiment.ts`
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/data/options-sentiment.term-structure.test.ts</automated>
  <done>Term-structure mode implemented</done>
</task>

<task type="auto" id="19-C-04-03">
  <name>Task 3: Wire shadow → verdict → cutover → 7d → flag removal</name>
  <action>
    Standard lifecycle:
    a) Initial commit (flag off)
    b) Flip FEATURE_OPTIONS_TERM_STRUCTURE to shadow
    c) Drive workload (every research request triggers options-sentiment)
    d) `npm run shadow-verdict 19-C-04` — verdict requires Brier(term-structure) non-regression vs Brier(nearest-only) on resolved tickers
    e) PASS → cutover; remove nearest-only branch
    f) 7d hatch
    g) Flag removal
  </action>
  <acceptance_criteria>
    - shadow-reports/19-C-04.json PASS
    - FEATURE_OPTIONS_TERM_STRUCTURE removed
  </acceptance_criteria>
  <automated>git log --oneline | grep -q "19-c-04"</automated>
  <done>Term-structure canonical</done>
</task>

</tasks>

<verification>
- [ ] 6 unit tests pass
- [ ] OI-weighted formula correct
- [ ] IV regime classifier correct at 0.8/1.3 boundaries
- [ ] Shadow PASS; flag removed
</verification>

<success_criteria>
Term-structure 30/60/90d + IV regime is canonical put/call source per Wave C success criterion 3.
</success_criteria>

<output>
Create `.planning/phases/19-cipher-v2-0-excellence/19-C-04-SUMMARY.md`.
</output>
