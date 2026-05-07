---
phase: 19
plan: 19-A-06
wave: A
type: execute
depends_on: [19-Z-01, 19-Z-02, 19-Z-03, 19-Z-04, 19-A-01]
files_modified:
  - scripts/calibration-report.ts
  - src/lib/learning.ts
  - tests/scripts/calibration-report.test.ts
  - package.json
  - .gitignore
autonomous: true
requirements: []
shadow_required: false
hard_cleanup_gate: true
must_haves:
  truths:
    - "reliabilityDiagram(predictions, outcomes, n_bins=10) returns 10 quantile bins with mean prediction + observed frequency"
    - "hosmerLemeshow(predictions, outcomes, n_bins=10) returns chi-square statistic + p-value + degrees of freedom"
    - "calibration-report script reads LearnedPattern + DiffusionTrace + PriceOutcome rows, writes /tmp/calibration-reports/<date>.md"
    - "Reports written to /tmp/ — NOT committed to repo (per CLAUDE.md 'Never store generated research artifacts')"
    - "Report contains per-signal-class reliability table + Hosmer-Lemeshow stats + ASCII bar chart"
    - "Synthetic test cases produce expected curves (calibrated → diagonal; over-confident → curve below diagonal)"
  artifacts:
    - path: "src/lib/learning.ts"
      provides: "reliabilityDiagram + hosmerLemeshow pure functions"
      exports: ["reliabilityDiagram", "hosmerLemeshow"]
    - path: "scripts/calibration-report.ts"
      provides: "Manual + cron-friendly calibration audit script — writes to /tmp/calibration-reports/"
    - path: ".gitignore"
      contains: "calibration-reports/"
  key_links:
    - from: "scripts/calibration-report.ts"
      to: "src/lib/learning.ts (reliabilityDiagram + hosmerLemeshow)"
      via: "pure-function call against query results"
      pattern: "reliabilityDiagram\\(|hosmerLemeshow\\("
---

# Plan 19-A-06: Calibration validation harness + reliability diagram

<universal_preamble>

## Autonomous Execution Clause (D-04..D-07)

Land primitives + script → tests green → manual run produces baseline /tmp/calibration-reports/<date>.md → commit. No shadow needed (audit script, not hot path). Reports are generated artifacts — they live in /tmp, NOT in the repo.

## Hard Cleanup Gate (Definition of Done)

1. (N/A — no shadow)
2. (N/A — no replacement)
3. (N/A)
4. (N/A)
5. `npm test` green; `npm run calibration-report` writes file to /tmp/calibration-reports/ successfully

</universal_preamble>

<objective>
Per D-22, deliver the calibration validation harness: reliability diagram (10 quantile bins) + Hosmer-Lemeshow chi-square test. Output to `/tmp/calibration-reports/<date>.md` for ongoing audit (per CLAUDE.md "Never store generated research artifacts" rule). Tests pinned against synthetic calibrated/miscalibrated data.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md
@.planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md
@docs/plans/2026-05-07-cipher-v2-excellence-implementation-plan.md
@CLAUDE.md
@src/lib/learning.ts
@scripts/tune-lambda.ts

<interfaces>
```typescript
export interface ReliabilityBin {
  binIndex: number;
  binLow: number;
  binHigh: number;
  meanPrediction: number;
  observedFrequency: number;
  count: number;
}

export function reliabilityDiagram(args: {
  predictions: number[];
  outcomes: boolean[];
  nBins?: number; // default 10 quantile bins
}): ReliabilityBin[];

export interface HosmerLemeshowResult {
  chiSquare: number;
  degreesOfFreedom: number;
  pValue: number;
  bins: ReliabilityBin[];
}

export function hosmerLemeshow(args: {
  predictions: number[];
  outcomes: boolean[];
  nBins?: number;
}): HosmerLemeshowResult;
```
</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-A-06-01 | Tampering | wrong chi-square formula | mitigate | Pin formula: `Σ_g [(O_1g - E_1g)² / (E_1g(1 - π_g)) ]` per Hosmer-Lemeshow 2000 §5; df = nBins - 2; p-value via jstat.chisquare.cdf or pinned approximation |
| T-19-A-06-02 | Information Disclosure | calibration reports leak via repo | mitigate | Reports written to /tmp/calibration-reports/ (NOT committed to repo per CLAUDE.md "Never store generated research artifacts"); .gitignore entry for calibration-reports/ to belt-and-suspender against accidental commits if working dir contains the path |

</threat_model>

<tasks>

<task type="auto" tdd="true" id="19-A-06-01">
  <name>Task 1: Write tests/scripts/calibration-report.test.ts (synthetic)</name>
  <read_first>
    - .planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md (D-22)
    - Hosmer-Lemeshow paper / Wikipedia formula
  </read_first>
  <behavior>
    - Test 1: `reliabilityDiagram on perfectly calibrated synthetic (predictions == frequencies) returns bins with |meanPrediction - observedFrequency| < 0.05`
    - Test 2: `reliabilityDiagram on over-confident synthetic (predictions push to extremes vs reality) returns bins with observedFrequency closer to 0.5`
    - Test 3: `reliabilityDiagram bin counts sum to total samples`
    - Test 4: `hosmerLemeshow on calibrated data returns p-value > 0.05 (cannot reject null of good fit)`
    - Test 5: `hosmerLemeshow on miscalibrated data returns p-value < 0.05`
    - Test 6: `hosmerLemeshow returns chi-square ≥ 0 and df = nBins - 2`
    - Test 7: `nBins=10 default produces 10 bins`
    - Test 8: `predictions array length must match outcomes array length (throws otherwise)`
  </behavior>
  <action>
    Create `tests/scripts/calibration-report.test.ts`. Import primitives from learning.ts. Synthesize calibrated (n=10000, p=outcome bernoulli matched) and miscalibrated (n=10000, predictions=0.9 but outcomes 50/50) data with deterministic seed.
  </action>
  <acceptance_criteria>
    - File exists; ≥8 tests
    - RED initially
  </acceptance_criteria>
  <automated>npx vitest run tests/scripts/calibration-report.test.ts 2>&1 | grep -qE "Cannot find|reliabilityDiagram"</automated>
  <done>8 failing tests written</done>
</task>

<task type="auto" tdd="true" id="19-A-06-02">
  <name>Task 2: Implement reliabilityDiagram + hosmerLemeshow in learning.ts</name>
  <read_first>
    - tests/scripts/calibration-report.test.ts
    - src/lib/learning.ts (find pure-function section to add)
  </read_first>
  <action>
    Add to `src/lib/learning.ts`:
    ```typescript
    export interface ReliabilityBin {
      binIndex: number;
      binLow: number;
      binHigh: number;
      meanPrediction: number;
      observedFrequency: number;
      count: number;
    }

    export function reliabilityDiagram(args: {
      predictions: number[];
      outcomes: boolean[];
      nBins?: number;
    }): ReliabilityBin[] {
      const { predictions, outcomes } = args;
      const nBins = args.nBins ?? 10;
      if (predictions.length !== outcomes.length) {
        throw new Error('reliabilityDiagram: arrays must be same length');
      }
      // sort by prediction, partition into nBins quantile bins
      const indexed = predictions.map((p, i) => ({ p, o: outcomes[i] }));
      indexed.sort((a, b) => a.p - b.p);
      const binSize = Math.floor(indexed.length / nBins);
      const out: ReliabilityBin[] = [];
      for (let b = 0; b < nBins; b++) {
        const start = b * binSize;
        const end = b === nBins - 1 ? indexed.length : start + binSize;
        const slice = indexed.slice(start, end);
        const meanP = slice.reduce((s, x) => s + x.p, 0) / Math.max(1, slice.length);
        const obsF = slice.filter(x => x.o).length / Math.max(1, slice.length);
        out.push({
          binIndex: b,
          binLow: slice[0]?.p ?? 0,
          binHigh: slice[slice.length - 1]?.p ?? 1,
          meanPrediction: meanP,
          observedFrequency: obsF,
          count: slice.length,
        });
      }
      return out;
    }

    export interface HosmerLemeshowResult {
      chiSquare: number;
      degreesOfFreedom: number;
      pValue: number;
      bins: ReliabilityBin[];
    }

    export function hosmerLemeshow(args: {
      predictions: number[];
      outcomes: boolean[];
      nBins?: number;
    }): HosmerLemeshowResult {
      const bins = reliabilityDiagram(args);
      // chi-square = Σ [(O_1g - E_1g)² / (E_1g · (1 - π_g))]
      let chi2 = 0;
      for (const b of bins) {
        const O1 = b.observedFrequency * b.count;
        const E1 = b.meanPrediction * b.count;
        const piG = b.meanPrediction;
        const denom = E1 * (1 - piG);
        if (denom > 0) chi2 += ((O1 - E1) ** 2) / denom;
      }
      const df = bins.length - 2;
      const pValue = 1 - chiSquareCDF(chi2, df); // implement or import from jstat
      return { chiSquare: chi2, degreesOfFreedom: df, pValue, bins };
    }
    ```

    Implement or import `chiSquareCDF`. If `jstat` already in tree (per STATE.md), use `jstat.chisquare.cdf(chi2, df)`.
  </action>
  <acceptance_criteria>
    - All 8 tests pass
    - Both functions exported
    - DB-free (no @/lib/db imports added)
  </acceptance_criteria>
  <automated>npx vitest run tests/scripts/calibration-report.test.ts</automated>
  <done>8/8 tests GREEN; primitives in learning.ts</done>
</task>

<task type="auto" id="19-A-06-03">
  <name>Task 3: Implement scripts/calibration-report.ts (writes to /tmp/calibration-reports/)</name>
  <read_first>
    - scripts/tune-lambda.ts (existing pattern reference)
    - prisma/schema.prisma (LearnedPattern, DiffusionTrace, PriceOutcome)
    - CLAUDE.md ("Never store generated research artifacts inside the repository")
  </read_first>
  <action>
    Create `scripts/calibration-report.ts`:
    ```typescript
    #!/usr/bin/env tsx
    import { writeFileSync, mkdirSync } from 'node:fs';
    import path from 'node:path';
    import { prisma } from '../src/lib/db';
    import { reliabilityDiagram, hosmerLemeshow } from '../src/lib/learning';

    // Per CLAUDE.md "Never store generated research artifacts inside the repository":
    // calibration reports are generated audit artifacts → write to /tmp.
    const OUTPUT_DIR = '/tmp/calibration-reports';

    async function main() {
      const SIGNAL_CLASSES = ['diffusion', 'technical', 'insider', 'institutional'] as const;
      const lines: string[] = [`# Calibration Report — ${new Date().toISOString().slice(0,10)}`, ''];

      for (const sc of SIGNAL_CLASSES) {
        // pull resolved DiffusionTrace where pattern.signal_class = sc
        const traces = await prisma.diffusionTrace.findMany({
          where: { /* ... */ },
          include: { outcome: true },
        });
        const resolved = traces.filter(t => t.outcome != null);
        if (resolved.length < 30) {
          lines.push(`## ${sc}\n_n=${resolved.length} — insufficient data_\n`);
          continue;
        }
        const predictions = resolved.map(t => t.predicted_probability);
        const outcomes = resolved.map(t => t.outcome!.alpha_vs_spy_pct > 0);
        const hl = hosmerLemeshow({ predictions, outcomes });
        lines.push(`## ${sc} (n=${resolved.length})`);
        lines.push(`- chi-square: ${hl.chiSquare.toFixed(3)}`);
        lines.push(`- df: ${hl.degreesOfFreedom}`);
        lines.push(`- p-value: ${hl.pValue.toFixed(4)}`);
        lines.push(`- verdict: ${hl.pValue >= 0.05 ? '✓ calibrated (cannot reject)' : '✗ miscalibrated (reject null)'}`);
        lines.push(`\n| Bin | mean_pred | obs_freq | n | bar |`);
        lines.push(`|-----|-----------|----------|---|-----|`);
        for (const b of hl.bins) {
          const bar = '█'.repeat(Math.round(b.observedFrequency * 20));
          lines.push(`| ${b.binIndex} | ${b.meanPrediction.toFixed(3)} | ${b.observedFrequency.toFixed(3)} | ${b.count} | ${bar} |`);
        }
        lines.push('');
      }

      mkdirSync(OUTPUT_DIR, { recursive: true });
      const fname = path.join(OUTPUT_DIR, `${new Date().toISOString().slice(0,10)}.md`);
      writeFileSync(fname, lines.join('\n'));
      console.log(`Report written to ${fname}`);
    }
    main().catch(e => { console.error(e); process.exit(1); });
    ```

    Add to `package.json` scripts: `"calibration-report": "tsx scripts/calibration-report.ts"`.

    DO NOT create any `calibration-reports/` directory in the repo. DO NOT commit a `.gitkeep` file. Reports live in /tmp/calibration-reports/ exclusively.
  </action>
  <acceptance_criteria>
    - File `scripts/calibration-report.ts` exists
    - `grep -q "/tmp/calibration-reports" scripts/calibration-report.ts`
    - `! grep -q "OUTPUT_DIR.*'calibration-reports'" scripts/calibration-report.ts` (must NOT use repo-relative path)
    - `grep -q '"calibration-report"' package.json`
    - Manual run: `npm run calibration-report` writes a file under `/tmp/calibration-reports/`
    - `! test -d calibration-reports` (no repo-local directory created)
    - Output file is valid Markdown (renders without error)
  </acceptance_criteria>
  <automated>test -f scripts/calibration-report.ts && grep -q "/tmp/calibration-reports" scripts/calibration-report.ts && grep -q "calibration-report" package.json && ! test -d calibration-reports</automated>
  <done>Audit script wired; reports go to /tmp; no repo pollution</done>
</task>

<task type="auto" id="19-A-06-04">
  <name>Task 4: Add calibration-reports/ to .gitignore + run baseline + commit</name>
  <action>
    1. Edit `.gitignore` — append (if not already present):
    ```
    # Generated audit artifacts (per CLAUDE.md "Never store generated research artifacts")
    calibration-reports/
    ```
    This is belt-and-suspenders — the script writes to /tmp anyway, but the .gitignore guards against an accidental local `calibration-reports/` dir at the repo root being staged.

    2. Run `npm run calibration-report` to produce baseline at /tmp/calibration-reports/<date>.md (smoke test only — NOT committed).

    3. Commit:
    ```
    feat(19-a-06): calibration validation harness — reliability diagram + Hosmer-Lemeshow

    Pure functions reliabilityDiagram + hosmerLemeshow in learning.ts.
    Audit script scripts/calibration-report.ts writes per-signal-class
    chi-square + reliability bin chart to /tmp/calibration-reports/<date>.md.

    Reports are generated audit artifacts — written to /tmp per CLAUDE.md
    "Never store generated research artifacts inside the repository".
    .gitignore entry added as belt-and-suspenders.

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```
  </action>
  <acceptance_criteria>
    - `npx vitest run` exits 0
    - `grep -q "calibration-reports/" .gitignore`
    - No `calibration-reports/` directory committed to repo: `! git ls-files | grep -q "^calibration-reports/"`
    - `git log -1 --pretty=%s` matches "feat(19-a-06)"
  </acceptance_criteria>
  <automated>git log -1 --pretty=%s | grep -q "19-a-06" && grep -q "calibration-reports" .gitignore && ! git ls-files | grep -q "^calibration-reports/"</automated>
  <done>Calibration harness live with baseline report at /tmp; no generated artifacts in repo</done>
</task>

</tasks>

<verification>
- [ ] 8 unit tests pass
- [ ] `npm run calibration-report` writes valid Markdown to /tmp/calibration-reports/
- [ ] reliabilityDiagram + hosmerLemeshow are DB-free pure functions
- [ ] No calibration-reports/ directory committed to repo (CLAUDE.md compliance)
- [ ] .gitignore has calibration-reports/ entry
- [ ] Phase 18 sanity test still green
</verification>

<success_criteria>
1. Operator can run quarterly to check calibration drift
2. Synthetic miscalibrated data correctly flagged as p<0.05
3. Output Markdown has both numeric stats + ASCII chart
4. Reports never committed (CLAUDE.md compliance)
</success_criteria>

<output>
Create `.planning/phases/19-cipher-v2-0-excellence/19-A-06-SUMMARY.md`.
</output>
</content>
</invoke>