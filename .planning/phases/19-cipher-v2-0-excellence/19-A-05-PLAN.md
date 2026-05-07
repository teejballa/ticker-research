---
phase: 19
plan: 19-A-05
wave: A
type: execute
depends_on: [19-Z-01, 19-Z-02, 19-Z-03, 19-Z-04, 19-A-01]
files_modified:
  - src/lib/reasoning/alpha-decay-monitor.ts
  - src/app/api/cron/alpha-decay-watch/route.ts
  - vercel.json
  - tests/lib/reasoning/alpha-decay-monitor.test.ts
  - tests/integration/alpha-decay-watch.live.test.ts
  - scripts/alpha-decay-cron-benchmark.ts
autonomous: true
requirements: []
shadow_required: false
hard_cleanup_gate: true
must_haves:
  truths:
    - "rolling 20-day Spearman rank-IC computed per signal class (diffusion/technical/insider/institutional)"
    - "rolling_ic_20d column populated daily by /api/cron/alpha-decay-watch cron"
    - "ic_decay_flag = true when rolling_ic_20d < 0.02 for 5 consecutive days"
    - "ic_decay_flag = false when rolling_ic_20d recovers ≥ 0.02 for 3 consecutive days"
    - "/api/cron/alpha-decay-watch protected by CRON_SECRET Bearer auth (existing pattern)"
    - "vercel.json crons array includes new entry running daily at 06:00 UTC"
    - "alpha-decay-watch cron maxDuration ≤ 300 seconds (Hobby/default ceiling per CLAUDE.md note)"
    - "Cron benchmark on Neon with realistic universe completes in < 100s; fallback path documented if benchmark exceeds 100s"
  artifacts:
    - path: "src/lib/reasoning/alpha-decay-monitor.ts"
      provides: "Pure functions: rollingSpearmanIC, isDecayConfirmed, isDecayCleared"
      exports: ["rollingSpearmanIC", "isDecayConfirmed", "isDecayCleared"]
    - path: "src/app/api/cron/alpha-decay-watch/route.ts"
      provides: "Daily cron route — computes IC + sets flag"
    - path: "vercel.json"
      contains: "alpha-decay-watch"
    - path: "tests/integration/alpha-decay-watch.live.test.ts"
      provides: "Live-DB test — seeds outcomes, runs route, verifies flag set"
    - path: "scripts/alpha-decay-cron-benchmark.ts"
      provides: "One-shot benchmark of cron handler against real Neon universe; logs elapsed_ms; documents fallback if >100s"
  key_links:
    - from: "src/app/api/cron/alpha-decay-watch/route.ts"
      to: "src/lib/reasoning/alpha-decay-monitor.ts"
      via: "rollingSpearmanIC + isDecayConfirmed"
      pattern: "rollingSpearmanIC\\("
    - from: "src/app/api/cron/alpha-decay-watch/route.ts"
      to: "prisma.learnedPattern.update"
      via: "{ where: { id }, data: { rolling_ic_20d, ic_decay_flag } }"
      pattern: "rolling_ic_20d"
---

# Plan 19-A-05: Rolling 20d rank-IC monitor + alpha-decay-watch cron

<universal_preamble>

## Autonomous Execution Clause (D-04..D-07)

Land cron + monitor → integration test green → benchmark on live Neon (Task 5b) → Vercel cron deploys → 7-day quiet observation in production logs → commit. No shadow needed (additive metric column; no replacement of existing flow).

## Hard Cleanup Gate (Definition of Done)

1. (N/A — additive)
2. (N/A)
3. 7d post-deploy with cron firing daily and `RollbackLog` empty
4. (N/A)
5. `npm test` + `npm run test:integration` + `npm run test:e2e` all green; benchmark elapsed_ms < 100s on realistic universe (or fallback path activated)

</universal_preamble>

<objective>
Add the rolling 20-day Spearman rank-IC monitor + daily cron that sets `ic_decay_flag` when IC < 0.02 for 5 consecutive days (D-21). This is the alpha-decay tripwire for the 4 signal classes — the Reddit/social signal alpha decay is hours, not days, per RESEARCH §"State of the Art".
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md
@.planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md
@docs/plans/2026-05-07-cipher-v2-excellence-implementation-plan.md
@src/app/api/cron/learn/route.ts
@vercel.json
@prisma/schema.prisma

<interfaces>
```typescript
// src/lib/reasoning/alpha-decay-monitor.ts (DB-free pure)
export function rollingSpearmanIC(args: {
  predictions: number[];
  realizedReturns: number[];
}): number;

export function isDecayConfirmed(rollingICs: number[], threshold: number, consecutiveDays: number): boolean;
export function isDecayCleared(rollingICs: number[], threshold: number, consecutiveDays: number): boolean;

// /api/cron/alpha-decay-watch — same auth pattern as /api/cron/learn:
// Authorization: Bearer ${CRON_SECRET}
```
</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-A-05-01 | Elevation of Privilege | unauthenticated cron route | mitigate | Reuse `if (authHeader !== Bearer ${CRON_SECRET}) return 401` pattern from /api/cron/learn — verify in unit test |
| T-19-A-05-02 | Tampering | wrong IC formula (Pearson vs Spearman) | mitigate | Pure-function pin to `simple-statistics`-equivalent rank-then-correlate; test against pinned vectors with known IC; deviation invalidates `ic_decay_flag` |
| T-19-A-05-03 | DoS | cron exceeds 300s on large universe with derived rolling-IC computation | mitigate | Task 5b benchmark on Neon with realistic row count; if elapsed_ms > 100s, activate documented fallback (batch + index hints, OR add rolling_ic_history JSONB column to LearnedPattern via 19-Z-02 schema bundle to skip per-cron recomputation); existing cron iterates only 4 signal classes × N cells × bounded last-30d traces, but realistic n_cells ≈ 200+ × 4 classes after pooling makes this worth measuring |

</threat_model>

<tasks>

<task type="auto" tdd="true" id="19-A-05-01">
  <name>Task 1: Write tests/lib/reasoning/alpha-decay-monitor.test.ts</name>
  <read_first>
    - .planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md (D-21 — IC threshold 0.02, 5 consecutive days)
    - simple-statistics docs OR write rank-correlate inline against pinned test vectors
  </read_first>
  <behavior>
    - Test 1: `rollingSpearmanIC of identical-rank arrays returns 1.0`
    - Test 2: `rollingSpearmanIC of reverse-rank arrays returns -1.0`
    - Test 3: `rollingSpearmanIC of pinned vectors (predictions=[0.1,0.3,0.5,0.7,0.9], returns=[0.05,0.10,0.20,0.30,0.40]) ≈ 1.0`
    - Test 4: `rollingSpearmanIC handles ties using midrank`
    - Test 5: `rollingSpearmanIC throws on length mismatch`
    - Test 6: `isDecayConfirmed returns true when last 5 ICs all < 0.02`
    - Test 7: `isDecayConfirmed returns false when 4 of last 5 < 0.02 (one above)`
    - Test 8: `isDecayCleared returns true when last 3 ICs all >= 0.02`
    - Test 9: `isDecayCleared returns false on transient recovery (1 day above)`
  </behavior>
  <action>
    Create `tests/lib/reasoning/alpha-decay-monitor.test.ts` with 9 tests using deterministic input arrays.
  </action>
  <acceptance_criteria>
    - File exists; `grep -c "it(" tests/lib/reasoning/alpha-decay-monitor.test.ts` returns ≥9
    - Test FAILS RED
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/reasoning/alpha-decay-monitor.test.ts 2>&1 | grep -qE "Cannot find|FAIL"</automated>
  <done>9 failing tests written</done>
</task>

<task type="auto" tdd="true" id="19-A-05-02">
  <name>Task 2: Implement src/lib/reasoning/alpha-decay-monitor.ts</name>
  <read_first>
    - tests/lib/reasoning/alpha-decay-monitor.test.ts
  </read_first>
  <action>
    Create `src/lib/reasoning/alpha-decay-monitor.ts`:
    ```typescript
    /**
     * Spearman rank-IC: Pearson correlation of ranks.
     * Uses midrank for ties.
     */
    export function rollingSpearmanIC(args: {
      predictions: number[];
      realizedReturns: number[];
    }): number {
      if (args.predictions.length !== args.realizedReturns.length) {
        throw new Error('rollingSpearmanIC: arrays must be same length');
      }
      if (args.predictions.length < 2) return 0;
      const rankP = midrankArray(args.predictions);
      const rankR = midrankArray(args.realizedReturns);
      return pearsonCorrelation(rankP, rankR);
    }

    function midrankArray(xs: number[]): number[] {
      const indexed = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
      const ranks = new Array<number>(xs.length);
      let i = 0;
      while (i < indexed.length) {
        let j = i;
        while (j < indexed.length - 1 && indexed[j + 1].v === indexed[i].v) j++;
        const midrank = (i + j) / 2 + 1;
        for (let k = i; k <= j; k++) ranks[indexed[k].i] = midrank;
        i = j + 1;
      }
      return ranks;
    }

    function pearsonCorrelation(a: number[], b: number[]): number {
      const n = a.length;
      const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / n;
      const ma = mean(a), mb = mean(b);
      let cov = 0, va = 0, vb = 0;
      for (let i = 0; i < n; i++) {
        const da = a[i] - ma, db = b[i] - mb;
        cov += da * db; va += da * da; vb += db * db;
      }
      const denom = Math.sqrt(va * vb);
      return denom === 0 ? 0 : cov / denom;
    }

    export function isDecayConfirmed(rollingICs: number[], threshold: number = 0.02, consecutiveDays: number = 5): boolean {
      if (rollingICs.length < consecutiveDays) return false;
      const tail = rollingICs.slice(-consecutiveDays);
      return tail.every(ic => ic < threshold);
    }

    export function isDecayCleared(rollingICs: number[], threshold: number = 0.02, consecutiveDays: number = 3): boolean {
      if (rollingICs.length < consecutiveDays) return false;
      const tail = rollingICs.slice(-consecutiveDays);
      return tail.every(ic => ic >= threshold);
    }
    ```
  </action>
  <acceptance_criteria>
    - All 9 tests pass
    - File is DB-free (no @/lib/db import)
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/reasoning/alpha-decay-monitor.test.ts && ! grep -q "@/lib/db\|prisma" src/lib/reasoning/alpha-decay-monitor.ts</automated>
  <done>9/9 tests GREEN; pure functions only</done>
</task>

<task type="auto" id="19-A-05-03">
  <name>Task 3: Implement /api/cron/alpha-decay-watch/route.ts</name>
  <read_first>
    - src/app/api/cron/learn/route.ts (auth pattern + Prisma update pattern)
    - prisma/schema.prisma (LearnedPattern.rolling_ic_20d, ic_decay_flag columns)
    - src/lib/reasoning/alpha-decay-monitor.ts (just created)
  </read_first>
  <action>
    Create `src/app/api/cron/alpha-decay-watch/route.ts`:

    ```typescript
    import { NextRequest } from 'next/server';
    import { prisma } from '@/lib/db';
    import { rollingSpearmanIC, isDecayConfirmed, isDecayCleared } from '@/lib/reasoning/alpha-decay-monitor';

    export const maxDuration = 300;

    export async function GET(request: NextRequest) {
      const authHeader = request.headers.get('authorization');
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
      }

      const SIGNAL_CLASSES = ['diffusion', 'technical', 'insider', 'institutional'] as const;
      const TWENTY_DAYS_AGO = new Date(Date.now() - 20 * 86_400_000);
      const updates: { id: string; ic: number; flag: boolean }[] = [];

      for (const signalClass of SIGNAL_CLASSES) {
        const cells = await prisma.learnedPattern.findMany({
          where: { signal_class: signalClass, status: { not: 'EXPLORATORY' } },
        });

        for (const cell of cells) {
          const traces = await prisma.diffusionTrace.findMany({
            where: { /* match cell key */ recorded_at: { gte: TWENTY_DAYS_AGO } },
            include: { outcome: true },
          });
          const resolved = traces.filter(t => t.outcome != null);
          if (resolved.length < 5) continue;

          const ic = rollingSpearmanIC({
            predictions: resolved.map(r => r.predicted_probability),
            realizedReturns: resolved.map(r => r.outcome!.alpha_vs_spy_pct),
          });

          const prior = (cell as any).rolling_ic_history ?? [];
          const newHistory = [...prior, ic].slice(-30);
          const decayConfirmed = isDecayConfirmed(newHistory);
          const decayCleared = cell.ic_decay_flag === true && isDecayCleared(newHistory);
          const newFlag = cell.ic_decay_flag === true ? !decayCleared : decayConfirmed;

          await prisma.learnedPattern.update({
            where: { id: cell.id },
            data: {
              rolling_ic_20d: ic,
              ic_decay_flag: newFlag,
            },
          });
          updates.push({ id: cell.id, ic, flag: newFlag });
        }
      }

      return Response.json({ ok: true, updates: updates.length });
    }
    ```

    Note: if `rolling_ic_history` column not in schema, the cron derives the IC each run from last-30d DiffusionTrace rows (simpler; preferred — keeps cron stateless). Per Task 5b's benchmark, if this derivation pushes runtime too high, the fallback is to add `rolling_ic_history JSONB` to LearnedPattern in 19-Z-02 schema bundle.
  </action>
  <acceptance_criteria>
    - File `src/app/api/cron/alpha-decay-watch/route.ts` exists
    - `grep -q "Bearer.*CRON_SECRET" src/app/api/cron/alpha-decay-watch/route.ts`
    - `grep -q "rollingSpearmanIC\|isDecayConfirmed" src/app/api/cron/alpha-decay-watch/route.ts`
    - `grep -q "rolling_ic_20d\|ic_decay_flag" src/app/api/cron/alpha-decay-watch/route.ts`
    - `maxDuration = 300` declared
  </acceptance_criteria>
  <automated>grep -q "Bearer.*CRON_SECRET" src/app/api/cron/alpha-decay-watch/route.ts && grep -q "rolling_ic_20d" src/app/api/cron/alpha-decay-watch/route.ts</automated>
  <done>Cron route implemented with auth + IC computation + flag transitions</done>
</task>

<task type="auto" id="19-A-05-04">
  <name>Task 4: Add cron entry to vercel.json</name>
  <read_first>
    - vercel.json (existing crons array — verify pattern)
  </read_first>
  <action>
    Edit `vercel.json` "crons" array. Add:
    ```json
    {
      "path": "/api/cron/alpha-decay-watch",
      "schedule": "0 6 * * *"
    }
    ```

    Schedule: 06:00 UTC daily (after market close in US, before market open in EU/Asia — minimizes load contention).
  </action>
  <acceptance_criteria>
    - `grep -q '"path": "/api/cron/alpha-decay-watch"' vercel.json`
    - `grep -q "0 6 \* \* \*" vercel.json` (or compatible cron expression)
    - vercel.json is valid JSON: `node -e "JSON.parse(require('fs').readFileSync('vercel.json'))"`
  </acceptance_criteria>
  <automated>node -e "JSON.parse(require('fs').readFileSync('vercel.json'))" && grep -q "alpha-decay-watch" vercel.json</automated>
  <done>Cron registered in Vercel config</done>
</task>

<task type="auto" tdd="true" id="19-A-05-05">
  <name>Task 5: Live-DB integration test tests/integration/alpha-decay-watch.live.test.ts</name>
  <read_first>
    - tests/integration/learn.ess.live.test.ts (Phase 18-04 pattern reference)
    - vitest.integration.config.ts
  </read_first>
  <behavior>
    - Test 1: `seed 5 ACTIVE LearnedPatterns + DiffusionTrace + PriceOutcome rows; invoke route handler with valid auth; assert rolling_ic_20d populated`
    - Test 2: `seed cells with synthetic IC < 0.02 over 5d; assert ic_decay_flag becomes true`
    - Test 3: `seed cell with ic_decay_flag=true + last 3d IC > 0.02; assert flag clears to false`
    - Test 4: `unauthenticated request returns 401`
    - Test 5: `cleanup: removes seeded test rows`
  </behavior>
  <action>
    Create `tests/integration/alpha-decay-watch.live.test.ts` mirroring Phase 18 pattern. Use unique test ticker prefix (e.g., `TEST-A05-`) for cleanup. Invoke route handler directly via `import { GET } from '@/app/api/cron/alpha-decay-watch/route'`.
  </action>
  <acceptance_criteria>
    - File exists
    - Tests pass against live Neon (or skipped with explicit message if DATABASE_URL not set)
  </acceptance_criteria>
  <automated>npx vitest run --config vitest.integration.config.ts tests/integration/alpha-decay-watch.live.test.ts</automated>
  <done>Integration test verifies end-to-end IC + flag behavior</done>
</task>

<task type="auto" id="19-A-05-5b">
  <name>Task 5b: Smoke benchmark cron handler on realistic Neon universe — fallback if &gt;100s</name>
  <read_first>
    - src/app/api/cron/alpha-decay-watch/route.ts (just-implemented handler)
    - prisma/schema.prisma (LearnedPattern row count expectations)
    - vercel.json (current maxDuration ceiling = 300s on Hobby/default; budget headroom)
  </read_first>
  <action>
    Create `scripts/alpha-decay-cron-benchmark.ts`:
    ```typescript
    #!/usr/bin/env tsx
    import { GET } from '../src/app/api/cron/alpha-decay-watch/route';

    async function main() {
      const realisticReq = new Request('http://localhost/api/cron/alpha-decay-watch', {
        headers: { 'authorization': `Bearer ${process.env.CRON_SECRET}` },
      });
      // @ts-expect-error — adapt Request to NextRequest shape for handler
      const t0 = Date.now();
      const res = await GET(realisticReq);
      const elapsed = Date.now() - t0;
      const body = await res.json();
      console.log(JSON.stringify({ elapsed_ms: elapsed, status: res.status, body }, null, 2));
      // Operator decision threshold:
      //   < 100s   → safe within 300s ceiling, large headroom; SHIP
      //   100-200s → tight; document and proceed but monitor production logs
      //   > 200s   → fallback REQUIRED before deploy (see action notes)
      if (elapsed > 200_000) {
        console.error(`FAIL: cron benchmark took ${elapsed}ms > 200000ms — activate fallback (see plan 19-A-05 Task 5b notes) before deploy`);
        process.exit(1);
      }
      if (elapsed > 100_000) {
        console.warn(`WARN: cron benchmark took ${elapsed}ms > 100000ms — within ceiling but document and monitor`);
      }
    }
    main().catch(e => { console.error(e); process.exit(2); });
    ```

    Add to `package.json` scripts: `"alpha-decay-cron-benchmark": "tsx scripts/alpha-decay-cron-benchmark.ts"`.

    **Run the benchmark on Neon production-like data** (or a Neon branch with realistic row counts: ≥200 LearnedPattern rows × 4 signal classes × ~30 DiffusionTrace rows per cell). Record `elapsed_ms` in the SUMMARY.

    **Fallback paths (if benchmark > 100s):**

    1. **Batch + index hints** (preferred, no schema change):
       - Replace per-cell `prisma.diffusionTrace.findMany` calls with a SINGLE batched query grouping by `(signal_class, pattern_key, cap_class, horizon_days)`
       - Add a covering index `(signal_class, recorded_at)` on DiffusionTrace if not present (would require 19-Z-02 reissue OR a follow-up migration plan)
       - Re-benchmark; ship if elapsed_ms < 100s

    2. **Add `rolling_ic_history JSONB` to LearnedPattern** (schema change):
       - Bundle as an addition to 19-Z-02 (still additive, nullable)
       - Cron writes the new value to history each day; reads only the cell's own history (no DiffusionTrace scan)
       - Updates this plan's `files_modified` AND 19-Z-02's prisma/schema.prisma additions
       - Reissue 19-Z-02 migration

    Document which fallback (if any) was activated in 19-A-05-SUMMARY.md.
  </action>
  <acceptance_criteria>
    - File `scripts/alpha-decay-cron-benchmark.ts` exists
    - `grep -q '"alpha-decay-cron-benchmark"' package.json`
    - Benchmark run output captured in commit message OR SUMMARY.md
    - elapsed_ms < 200000 OR documented fallback activated
  </acceptance_criteria>
  <automated>test -f scripts/alpha-decay-cron-benchmark.ts && grep -q "alpha-decay-cron-benchmark" package.json</automated>
  <done>Benchmark instrumented; cron meets 300s ceiling on realistic data OR fallback documented</done>
</task>

<task type="auto" id="19-A-05-06">
  <name>Task 6: Full suite + commit</name>
  <action>
    Commit:
    ```
    feat(19-a-05): rolling 20d rank-IC monitor + alpha-decay-watch cron

    Pure-function module src/lib/reasoning/alpha-decay-monitor.ts:
      - rollingSpearmanIC (midrank ties; pinned test vectors)
      - isDecayConfirmed (5 consecutive days < 0.02)
      - isDecayCleared (3 consecutive days >= 0.02)

    New cron /api/cron/alpha-decay-watch (06:00 UTC daily, maxDuration 300s):
      - Iterates 4 signal classes × N cells each
      - Updates LearnedPattern.rolling_ic_20d + ic_decay_flag
      - CRON_SECRET Bearer auth (existing pattern)

    Benchmarked (Task 5b) on realistic Neon universe — elapsed_ms = <X>;
    fallback path = <none|batch-and-index|rolling_ic_history JSONB column>.

    Tripwire for the Reddit-style alpha-decay risk surfaced in RESEARCH.

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```
  </action>
  <acceptance_criteria>
    - `git log -1 --pretty=%s` matches "feat(19-a-05)"
    - Commit message contains the benchmark elapsed_ms result
  </acceptance_criteria>
  <automated>git log -1 --pretty=%s | grep -q "19-a-05"</automated>
  <done>Alpha-decay monitor + cron live; benchmark documented</done>
</task>

</tasks>

<verification>
- [ ] 9 unit tests pass
- [ ] 5 integration tests pass against live Neon
- [ ] Vercel cron configured (06:00 UTC daily)
- [ ] CRON_SECRET auth on new route
- [ ] LearnedPattern.rolling_ic_20d/ic_decay_flag populated by cron
- [ ] Benchmark elapsed_ms < 100s on realistic Neon universe (Task 5b) — or documented fallback activated
</verification>

<success_criteria>
1. Daily cron writes rolling_ic_20d for all 4 signal classes
2. ic_decay_flag transitions correctly
3. /insights and EngineCalibrationPanel can surface ic_decay_flag (via 19-Z-04 gate)
4. Cron benchmark proves runtime fits within 300s ceiling on realistic universe (or fallback documented)
</success_criteria>

<output>
Create `.planning/phases/19-cipher-v2-0-excellence/19-A-05-SUMMARY.md` documenting:
- Task 5b benchmark result (elapsed_ms on realistic Neon universe)
- Fallback path activated (if any) — link to schema or batching changes
- Verification that 7d post-deploy cron logs show stable runtime
</output>
</content>
</invoke>