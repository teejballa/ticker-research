---
phase: 19
plan: 19-A-04
wave: A
type: execute
depends_on: [19-Z-01, 19-Z-02, 19-Z-03, 19-Z-04, 19-A-01]
files_modified:
  - src/lib/learning.ts
  - tests/learning.dsr-pbo.test.ts
  - tests/learning.cpcv.test.ts
  - tests/fixtures/dsr-bailey-lopez-de-prado-2014.json
  - tests/fixtures/pbo-pypbo-reference.json
  - scripts/dsr-pbo-audit.ts
  - scripts/verify-fixtures-no-null.ts
autonomous: true
requirements: []
shadow_required: false
hard_cleanup_gate: true
must_haves:
  truths:
    - "deflatedSharpeRatio matches Bailey-Lopez de Prado 2014 §4 worked example to 6 decimals"
    - "probBacktestOverfitting matches pypbo reference for pbo(rtns_df, S=16, metric_func=sharpe, threshold=1)"
    - "combinatorialPurgedKFold(N=6, k=2) produces 15 splits and 5 distinct backtest paths"
    - "All three primitives DB-free pure functions in learning.ts"
    - "Audit script writes calibration thresholds for DSR and PBO to a config file consumed by 19-Z-04"
    - "v2.0 P21 (Lift-Gated Cell Promotion) can import all three primitives"
    - "Fixtures committed with NO null expected values — all expected.dsr/pbo populated with real numbers from paper §4 OR pypbo cross-validation. Tests refuse to pass with null expected fields"
  artifacts:
    - path: "src/lib/learning.ts"
      provides: "deflatedSharpeRatio + probBacktestOverfitting + combinatorialPurgedKFold pure functions"
      exports: ["deflatedSharpeRatio", "probBacktestOverfitting", "combinatorialPurgedKFold"]
    - path: "tests/fixtures/dsr-bailey-lopez-de-prado-2014.json"
      provides: "Pinned golden values from paper §4 (NO null fields)"
    - path: "tests/fixtures/pbo-pypbo-reference.json"
      provides: "Cross-validated against pypbo (https://github.com/esvhd/pypbo) (NO null fields)"
    - path: "scripts/dsr-pbo-audit.ts"
      provides: "Audit script that calibrates DSR/PBO thresholds for model-card-status gate"
    - path: "scripts/verify-fixtures-no-null.ts"
      provides: "CI guard — fails if any fixture has expected.* = null at commit time"
  key_links:
    - from: "tests/learning.dsr-pbo.test.ts"
      to: "tests/fixtures/dsr-bailey-lopez-de-prado-2014.json"
      via: "fixture load + toBeCloseTo(6); throws if expected.* null"
      pattern: "toBeCloseTo.*6"
---

# Plan 19-A-04: DSR + PBO + CPCV primitives (golden-master)

<universal_preamble>

## Autonomous Execution Clause (D-04..D-07)

Land three primitives + audit script + golden-master fixtures (with REAL non-null expected values) → tests green at 1e-6 tolerance → commit. No shadow needed (additive primitives; existing CV path unchanged). v2.0 P21 imports these post-completion.

### Fixture non-null contract

The original fixture skeleton instructions had `expected.dsr: null` and `expected.pbo: null` placeholders, with `_note` instructing the executor to populate them at implementation time. The checker correctly identified this allows tests to pass trivially if the executor forgets to populate.

This plan now enforces:
- Fixtures committed at end of Task 1 MAY have null expected fields (skeleton state)
- BUT Task 4 implementation gate (acceptance) blocks the commit unless ALL fixture `expected.*` fields are non-null numbers
- A standalone CI guard script `scripts/verify-fixtures-no-null.ts` traverses the fixture tree and exits non-zero if any `expected.*` field is null
- The guard runs as part of Task 6's full-suite gate AND is wired into the npm test script

## Hard Cleanup Gate (Definition of Done)

1. (N/A — no shadow)
2. (N/A — no old code deleted)
3. (N/A)
4. (N/A — no flag introduced)
5. `npm test` green; golden-master fixtures pinned with REAL non-null expected values; audit script produces threshold config file; verify-fixtures-no-null guard passes

</universal_preamble>

<objective>
Implement Lopez de Prado's anti-backtest-overfitting trifecta as additive pure functions per D-20: Deflated Sharpe Ratio (Bailey-Lopez de Prado 2014), Probability of Backtest Overfitting (Bailey-Borwein-Lopez de Prado-Zhu 2014), and Combinatorial Purged K-Fold CV (Lopez de Prado 2018 ch.7). All golden-master tested to 1e-6 tolerance against published references. Unblocks v2.0 P21.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md
@.planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md
@docs/plans/2026-05-07-cipher-v2-excellence-implementation-plan.md
@src/lib/learning.ts
@src/lib/cv.ts

<interfaces>
```typescript
// New exports in learning.ts (all DB-free pure functions per CLAUDE.md invariant):

export function deflatedSharpeRatio(args: {
  estimatedSR: number;       // SR_hat (annualized or per-period — caller specifies)
  numTrials: number;         // N
  backtestHorizonT: number;  // T (number of returns)
  variance: number;          // Var(SR estimates across trials)
  skewness: number;          // γ̂_3
  kurtosis: number;          // γ̂_4
}): number;  // DSR ∈ [0, 1] — probability that true SR > 0 given multi-testing

export function probBacktestOverfitting(args: {
  inSampleStrategies: number[][];   // shape [n_strategies][n_periods] returns
  outOfSampleStrategies: number[][];
  S: number;                         // partition count (default 16)
  metricFunc?: (returns: number[]) => number;  // default Sharpe
}): number;  // PBO ∈ [0, 1]

export interface CPCVSplit {
  train_indices: number[];
  test_indices: number[];
  embargo_indices: number[];
}

export function combinatorialPurgedKFold(args: {
  n: number;             // total folds N
  k: number;             // test folds k per split
  embargo: number;       // embargo period in indices
  totalSamples: number;  // length of full timeseries
}): { splits: CPCVSplit[]; nPaths: number };
// For (N=6, k=2): splits.length = C(6,2) = 15, nPaths = 5
```
</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-A-04-01 | Tampering | off-by-one in DSR formula or CPCV combinatorics | mitigate | 1e-6 tolerance golden-master against published paper values; CPCV asserts both `splits.length === binomial(N,k)` AND `nPaths === C(N,k) × k / N` |
| T-19-A-04-02 | Business Logic | thresholds for DSR/PBO in model-card-status gate too lax | mitigate | Audit script (scripts/dsr-pbo-audit.ts) runs against current LearnedPattern data, sets threshold at 75th percentile (per RESEARCH Q2 recommendation); thresholds written to config file consumed by 19-Z-04 |
| T-19-A-04-03 | Business Logic | fixtures committed with null expected values → tests trivially pass | mitigate | scripts/verify-fixtures-no-null.ts CI guard fails non-zero if any expected.* field in tests/fixtures/*.json is null; wired into Task 6 npm-test gate |

</threat_model>

<tasks>

<task type="auto" id="19-A-04-01">
  <name>Task 1: Pin golden-master fixtures from published references (skeleton state OK; populated by Task 4)</name>
  <read_first>
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (lines 661-683 — exact golden values + cited papers)
    - https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf §4 worked example (planner instructed implementer to verify during execution)
    - https://github.com/esvhd/pypbo README (PBO reference)
  </read_first>
  <action>
    Create `tests/fixtures/dsr-bailey-lopez-de-prado-2014.json`:
    ```json
    {
      "_source": "Bailey & Lopez de Prado 2014 — The Deflated Sharpe Ratio §4 worked example",
      "_url": "https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf",
      "input": {
        "estimatedSR": 0.15748,
        "numTrials": 100,
        "backtestHorizonT": 1250,
        "variance": 0.001984,
        "skewness": -3,
        "kurtosis": 10
      },
      "expected": {
        "dsr": null,
        "_note": "EXECUTOR MUST POPULATE in Task 4 before commit. Open paper §4 Table 1, compute DSR by hand, paste 6-decimal value here. Falls back to SSRN paper https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2460551 OR pypbo cross-validation if paper unrecoverable. Task 4 acceptance gate FAILS if expected.dsr remains null."
      }
    }
    ```

    Create `tests/fixtures/pbo-pypbo-reference.json`:
    ```json
    {
      "_source": "pypbo reference — github.com/esvhd/pypbo",
      "_test_invocation": "pypbo.pbo(rtns_df, S=16, metric_func=sharpe, threshold=1)",
      "input": {
        "inSampleStrategies": null,
        "outOfSampleStrategies": null,
        "S": 16,
        "_note": "EXECUTOR MUST POPULATE in Task 4 before commit. `git clone https://github.com/esvhd/pypbo` and run their test fixture; copy returns matrix + expected PBO into this file. Task 4 acceptance gate FAILS if expected.pbo remains null."
      },
      "expected": {
        "pbo": null,
        "_tolerance": "1e-6"
      }
    }
    ```

    These fixtures EXPLICITLY instruct the executor to populate the actual numerical values during Task 4 (Assumption A1 from RESEARCH — values must be verified against paper PDFs at implementation time). The verification gate in Task 6 will block the commit if values remain null.
  </action>
  <acceptance_criteria>
    - File `tests/fixtures/dsr-bailey-lopez-de-prado-2014.json` exists with all input fields populated
    - File `tests/fixtures/pbo-pypbo-reference.json` exists
    - Both files have `_source` field documenting reference
    - `_note` field instructs executor to verify expected values during implementation AND warns about Task 4 acceptance gate
  </acceptance_criteria>
  <automated>node -e "const a = JSON.parse(require('fs').readFileSync('tests/fixtures/dsr-bailey-lopez-de-prado-2014.json')); const b = JSON.parse(require('fs').readFileSync('tests/fixtures/pbo-pypbo-reference.json')); if (!a._source || !b._source) process.exit(1)"</automated>
  <done>Fixture skeletons pinned; executor instructed to populate exact values in Task 4</done>
</task>

<task type="auto" tdd="true" id="19-A-04-02">
  <name>Task 2: Write tests/learning.dsr-pbo.test.ts (golden-master 1e-6)</name>
  <read_first>
    - tests/fixtures/dsr-bailey-lopez-de-prado-2014.json
    - tests/fixtures/pbo-pypbo-reference.json
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (lines 661-683)
  </read_first>
  <behavior>
    - Test 1: `deflatedSharpeRatio matches paper §4 to 6 decimals` — load fixture, call function, `expect(dsr).toBeCloseTo(EXPECTED, 6)`
    - Test 2: `DSR formula: σ_SR0 = sqrt((1 - skew·SR0 + (kurt-1)/4·SR0²) / (T-1))` — verify intermediate quantity matches paper
    - Test 3: `DSR = Φ((SR_hat - SR0) / σ_SR0)` — verify full pipeline
    - Test 4: `DSR clamps to [0, 1]`
    - Test 5: `probBacktestOverfitting matches pypbo S=16 sharpe at threshold=1 to 1e-6`
    - Test 6: `PBO ∈ [0, 1]`
    - Test 7: `PBO returns 1 when all OOS strategies underperform median IS`
    - Test 8: `PBO returns 0 when all OOS strategies outperform median IS`
    - Test 9 (NEW): `fixtures must have non-null expected values — load fixture, throw if expected.dsr === null OR expected.pbo === null`
      - This test is NOT a "trivially passes" test — it's a guard against the executor forgetting to populate the fixture during Task 4. Test fails loudly with a clear error message.

    Plan executor instruction: if exact paper values not recoverable, use `pypbo` library (clone, install Python venv if needed, OR translate Python test fixtures into TypeScript test data) per RESEARCH §"19-A-04 golden-master" lines 675-680.
  </behavior>
  <action>
    Create `tests/learning.dsr-pbo.test.ts`. Load fixtures via `import fixture from '../tests/fixtures/dsr-...'` (or readFileSync). Each test asserts `toBeCloseTo(expected, 6)`.

    Add test 9 explicitly:
    ```typescript
    it('fixtures have non-null expected values (Task 4 acceptance gate)', () => {
      expect(dsrFixture.expected.dsr).not.toBeNull();
      expect(typeof dsrFixture.expected.dsr).toBe('number');
      expect(pboFixture.expected.pbo).not.toBeNull();
      expect(typeof pboFixture.expected.pbo).toBe('number');
    });
    ```

    If executor finds fixture `expected.dsr === null` they MUST FIRST verify the paper value before proceeding (this is the explicit instruction in fixture `_note`). Test 9 fails loudly to make this impossible to skip.
  </action>
  <acceptance_criteria>
    - File `tests/learning.dsr-pbo.test.ts` exists
    - `grep -c "it(" tests/learning.dsr-pbo.test.ts` returns ≥9
    - `grep -c "toBeCloseTo.*6\|toBeCloseTo.*1e-6" tests/learning.dsr-pbo.test.ts` returns ≥2
    - `grep -q "not.toBeNull\|not\\.toBeNull" tests/learning.dsr-pbo.test.ts` (test 9 enforces fixture has real values)
    - Test FAILS — primitives not yet exported (RED) AND fixture-null test fails (RED)
  </acceptance_criteria>
  <automated>npx vitest run tests/learning.dsr-pbo.test.ts 2>&1 | grep -qE "Cannot find|deflatedSharpeRatio"</automated>
  <done>9+ failing golden-master tests written (incl. fixture-null guard)</done>
</task>

<task type="auto" tdd="true" id="19-A-04-03">
  <name>Task 3: Write tests/learning.cpcv.test.ts (combinatorial assertions)</name>
  <read_first>
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (lines 682-684 — N=6,k=2 → 15 splits, 5 paths)
    - src/lib/cv.ts (existing Phase 18-02 purgedKFold reference impl)
  </read_first>
  <behavior>
    - Test 1: `(N=6, k=2) produces C(6,2) = 15 splits` — `splits.length === 15`
    - Test 2: `(N=6, k=2) produces 5 distinct backtest paths` — `nPaths === 5`
    - Test 3: `(N=8, k=2) produces C(8,2) = 28 splits, ⌊(28×2)/8⌋ = 7 paths`
    - Test 4: `each split has disjoint train + test indices`
    - Test 5: `embargo period excluded from train AND test (purged)`
    - Test 6: `every test_indices is contiguous block(s) within timeseries`
    - Test 7: `union of test_indices across all splits covers ⌊nPaths × totalSamples / N⌋ unique indices`
    - Test 8: `n=k throws error (no train fold)`
    - Test 9: `k=0 throws error`
  </behavior>
  <action>
    Create `tests/learning.cpcv.test.ts`. Use deterministic n=600 totalSamples (10 per fold for N=6) and embargo=10. Verify combinatoric counts via `binomial(n, k)` helper (write inline or use an existing function).
  </action>
  <acceptance_criteria>
    - File `tests/learning.cpcv.test.ts` exists
    - `grep -c "it(" tests/learning.cpcv.test.ts` returns ≥9
    - Test FAILS RED
  </acceptance_criteria>
  <automated>npx vitest run tests/learning.cpcv.test.ts 2>&1 | grep -qE "Cannot find|combinatorialPurgedKFold"</automated>
  <done>9 failing CPCV tests</done>
</task>

<task type="auto" tdd="true" id="19-A-04-04">
  <name>Task 4: POPULATE FIXTURES + Implement DSR + PBO + CPCV in src/lib/learning.ts</name>
  <read_first>
    - src/lib/learning.ts (existing exports — add new section "Quant-grade validation primitives (Plan 19-A-04)")
    - tests/learning.dsr-pbo.test.ts and tests/learning.cpcv.test.ts (just written)
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (lines 671-684 — formulas)
    - tests/fixtures/dsr-bailey-lopez-de-prado-2014.json (still has expected.dsr=null — must populate first)
    - tests/fixtures/pbo-pypbo-reference.json (still has expected.pbo=null — must populate first)
  </read_first>
  <action>
    **STEP 1 — Populate fixtures (BLOCKING; no implementation work until done):**

    a) DSR fixture: Open Bailey-Lopez de Prado 2014 §4 worked example. Manually compute DSR for the input parameters (or use a verified Python reference implementation). Paste the 6-decimal value into `tests/fixtures/dsr-bailey-lopez-de-prado-2014.json` `expected.dsr`. Remove the `_note` field once populated. Acceptance: `expected.dsr` is a number, NOT null.

    b) PBO fixture: Clone https://github.com/esvhd/pypbo. Use their test data + run `pypbo.pbo(rtns_df, S=16, metric_func=sharpe, threshold=1)` to get a known reference PBO. Translate the returns matrices into the fixture's `inSampleStrategies` and `outOfSampleStrategies` arrays. Paste the resulting PBO value into `expected.pbo`. Remove `_note`. Acceptance: `expected.pbo` is a number, NOT null.

    If neither path works (paper unrecoverable, pypbo clone fails), DO NOT proceed by leaving null. Instead: substitute pypbo's `pypbo.psr` (Probabilistic Sharpe Ratio) cross-validation values OR file an escalation note in CONTEXT.md and STOP this plan until values are pinned. Do NOT silently leave nulls.

    **STEP 2 — Implement primitives:**

    Add to `src/lib/learning.ts`:

    1. **deflatedSharpeRatio**:
       ```typescript
       export function deflatedSharpeRatio(args: {
         estimatedSR: number;
         numTrials: number;
         backtestHorizonT: number;
         variance: number;
         skewness: number;
         kurtosis: number;
       }): number {
         const { estimatedSR: SR, numTrials: N, backtestHorizonT: T, variance: V, skewness: g3, kurtosis: g4 } = args;
         const gammaE = 0.5772156649; // Euler-Mascheroni
         const sqrtV = Math.sqrt(V);
         const SR0 = sqrtV * ((1 - gammaE) * normInverseCDF(1 - 1 / N) + gammaE * normInverseCDF(1 - 1 / (N * Math.E)));
         const sigmaSR0 = Math.sqrt((1 - g3 * SR + ((g4 - 1) / 4) * SR * SR) / (T - 1));
         return clamp01(normCDF((SR - SR0) / sigmaSR0));
       }
       ```
       Implement helpers `normCDF`, `normInverseCDF`. If `jstat` already in tree (per STATE.md), use `jstat.chisquare.cdf(chi2, df)`.

    2. **probBacktestOverfitting** (CSCV per BBLPZ 2014 paper sec 3): full algorithm; lookup table verification against pypbo.

    3. **combinatorialPurgedKFold** (Lopez de Prado 2018 ch.7): generate all C(n,k) test-fold combinations; train = remaining folds purged of embargo around test; nPaths = C(n,k)×k/n.
  </action>
  <acceptance_criteria>
    - `tests/fixtures/dsr-bailey-lopez-de-prado-2014.json` `expected.dsr` is a NUMBER (not null, not string)
    - `tests/fixtures/pbo-pypbo-reference.json` `expected.pbo` is a NUMBER (not null)
    - `tests/fixtures/pbo-pypbo-reference.json` `input.inSampleStrategies` and `input.outOfSampleStrategies` are arrays of arrays (not null)
    - All 8+ DSR/PBO tests pass (including the test-9 fixture-null guard)
    - All 9 CPCV tests pass
    - `grep -c "export function deflatedSharpeRatio\|export function probBacktestOverfitting\|export function combinatorialPurgedKFold" src/lib/learning.ts` returns 3
    - No DB calls in any of the three functions (CLAUDE.md invariant — verify with `grep -L "prisma\|@/lib/db" src/lib/learning.ts`)
  </acceptance_criteria>
  <automated>node -e "const a = require('./tests/fixtures/dsr-bailey-lopez-de-prado-2014.json'); const b = require('./tests/fixtures/pbo-pypbo-reference.json'); if (a.expected.dsr === null || typeof a.expected.dsr !== 'number') { console.error('DSR fixture has null expected'); process.exit(1); } if (b.expected.pbo === null || typeof b.expected.pbo !== 'number') { console.error('PBO fixture has null expected'); process.exit(1); }" && npx vitest run tests/learning.dsr-pbo.test.ts tests/learning.cpcv.test.ts</automated>
  <done>Fixtures populated with REAL non-null values; 3 quant primitives implemented; golden-master GREEN at 1e-6</done>
</task>

<task type="auto" id="19-A-04-05">
  <name>Task 5: Implement scripts/dsr-pbo-audit.ts threshold calibration + scripts/verify-fixtures-no-null.ts CI guard</name>
  <read_first>
    - scripts/ (existing pattern — tune-lambda.ts, tune-page-hinkley.ts)
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (Q2 — threshold calibration recommendation: 75th percentile)
  </read_first>
  <action>
    **A) Create `scripts/dsr-pbo-audit.ts`:**
    1. Read all `LearnedPattern` rows where `status='ACTIVE' AND alpha+beta >= 30`
    2. For each, compute DSR/PBO from observation history (requires fetching DiffusionTrace rows, which is what cron/learn already does — reuse helpers)
    3. Output distribution stats (min/25/50/75/max)
    4. Write `config/quant-gate-thresholds.json`:
       ```json
       {
         "dsr_threshold": <p75>,
         "pbo_threshold": <p25>,
         "audited_at": "<iso>",
         "n_cells": <n>
       }
       ```
    5. 19-Z-04 model-card-status reads this file (or hardcodes the constants from it via a TODO update task)

    **B) Create `scripts/verify-fixtures-no-null.ts`:**

    Standalone CI guard that recursively scans `tests/fixtures/*.json` and fails (exit 1) if any field nested under `expected.*` is null:
    ```typescript
    #!/usr/bin/env tsx
    import { readdirSync, readFileSync, statSync } from 'node:fs';
    import path from 'node:path';

    function* walk(dir: string): Generator<string> {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) yield* walk(full);
        else if (full.endsWith('.json')) yield full;
      }
    }

    function findNullsUnderExpected(obj: any, p: string[] = []): string[] {
      const issues: string[] = [];
      if (obj === null || obj === undefined) return issues;
      if (typeof obj !== 'object') return issues;
      for (const [k, v] of Object.entries(obj)) {
        const newPath = [...p, k];
        // We only care about nulls UNDER the 'expected' key
        const insideExpected = newPath.some(seg => seg === 'expected');
        if (insideExpected && v === null) {
          issues.push(newPath.join('.'));
        }
        if (typeof v === 'object') {
          issues.push(...findNullsUnderExpected(v, newPath));
        }
      }
      return issues;
    }

    let failed = 0;
    for (const file of walk('tests/fixtures')) {
      const content = JSON.parse(readFileSync(file, 'utf-8'));
      const nulls = findNullsUnderExpected(content);
      if (nulls.length > 0) {
        console.error(`FAIL: ${file} has null values at expected paths: ${nulls.join(', ')}`);
        failed++;
      }
    }
    if (failed > 0) {
      console.error(`\n${failed} fixture file(s) have null expected values. Populate them per fixture _note instructions before commit.`);
      process.exit(1);
    }
    console.log('OK: all fixture expected.* fields are non-null');
    ```

    Add to `package.json` scripts:
    - `"dsr-pbo-audit": "tsx scripts/dsr-pbo-audit.ts"`
    - `"verify-fixtures-no-null": "tsx scripts/verify-fixtures-no-null.ts"`
    - Wire into existing `"test"` script: `"test": "npm run verify-fixtures-no-null && vitest run"` (so `npm test` fails if any fixture has null expected)
  </action>
  <acceptance_criteria>
    - File `scripts/dsr-pbo-audit.ts` exists
    - File `scripts/verify-fixtures-no-null.ts` exists
    - Has `config/quant-gate-thresholds.json` write logic (in dsr-pbo-audit)
    - `grep -q '"dsr-pbo-audit"' package.json`
    - `grep -q '"verify-fixtures-no-null"' package.json`
    - `npm run verify-fixtures-no-null` exits 0 (after Task 4 populated fixtures)
    - `npm run test` script invokes `verify-fixtures-no-null` first
  </acceptance_criteria>
  <automated>test -f scripts/dsr-pbo-audit.ts && test -f scripts/verify-fixtures-no-null.ts && grep -q "dsr-pbo-audit" package.json && grep -q "verify-fixtures-no-null" package.json && npm run verify-fixtures-no-null</automated>
  <done>Audit script provides threshold calibration data; CI guard prevents null-fixture regression</done>
</task>

<task type="auto" id="19-A-04-06">
  <name>Task 6: Full suite green + fixture-null guard + commit</name>
  <action>
    Run `npm run verify-fixtures-no-null && npx vitest run`. Both must pass. Commit:
    ```
    feat(19-a-04): DSR + PBO + CPCV primitives (Lopez de Prado trifecta)

    Three pure-function additions to learning.ts (DB-free per CLAUDE.md invariant):
    - deflatedSharpeRatio (Bailey-Lopez de Prado 2014) — selection-bias-corrected SR
    - probBacktestOverfitting (Bailey-Borwein-Lopez de Prado-Zhu 2014) — CSCV over S=16 partitions
    - combinatorialPurgedKFold (Lopez de Prado 2018 ch.7) — (N=6, k=2) yields 15 splits / 5 paths

    Golden-master verified to 1e-6 against pinned fixtures (paper §4 + pypbo).
    Fixtures committed with REAL non-null expected values; CI guard
    scripts/verify-fixtures-no-null.ts blocks any future commit that
    introduces null expected fields.

    Audit script (scripts/dsr-pbo-audit.ts) calibrates thresholds for
    19-Z-04 model-card-status gate (writes config/quant-gate-thresholds.json).

    Unblocks v2.0 P21 (Lift-Gated Cell Promotion).

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```
  </action>
  <acceptance_criteria>
    - `npm run verify-fixtures-no-null` exits 0
    - `npx vitest run` exits 0
    - `git log -1 --pretty=%s` matches "feat(19-a-04)"
    - No JSON fixture has expected.* = null in committed state
  </acceptance_criteria>
  <automated>npm run verify-fixtures-no-null && git log -1 --pretty=%s | grep -q "19-a-04"</automated>
  <done>Quant trifecta committed with real non-null fixtures + CI guard</done>
</task>

</tasks>

<verification>
- [ ] All 17+ tests across DSR/PBO/CPCV pass at 1e-6 tolerance
- [ ] Golden-master fixtures pinned with paper citations AND non-null expected values
- [ ] verify-fixtures-no-null guard exits 0 (and is wired into npm test)
- [ ] All three primitives DB-free
- [ ] Audit script writes threshold config
- [ ] v2.0 P21 dependency satisfied
</verification>

<success_criteria>
1. DSR formula matches Bailey-Lopez de Prado 2014 §4 to 6 decimals
2. PBO matches pypbo reference at S=16
3. CPCV (N=6, k=2) → 15 splits, 5 paths exact
4. Threshold config available for 19-Z-04 gate
5. Fixtures contain real non-null expected values; CI guard prevents regression
</success_criteria>

<output>
Create `.planning/phases/19-cipher-v2-0-excellence/19-A-04-SUMMARY.md` documenting:
- Final populated values for expected.dsr and expected.pbo (with source attribution)
- Sample threshold config output
- Confirmation that verify-fixtures-no-null guard is in npm test pipeline
</output>
</content>
</invoke>