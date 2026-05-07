---
phase: 19
plan: 19-Z-04
wave: Z
type: execute
depends_on: [19-Z-01, 19-Z-02, 19-Z-03]
files_modified:
  - scripts/model-card-status.ts
  - scripts/model-card-grep-patterns.json
  - tests/scripts/model-card-status.test.ts
  - package.json
autonomous: true
requirements: []
shadow_required: false
hard_cleanup_gate: true
must_haves:
  truths:
    - "Script exits zero ONLY when all 9 composite-DoD conditions hold"
    - "Script exits non-zero with explicit punch list of unmet conditions"
    - "All 9 condition checks per design §11 + RESEARCH §model-card-status check list"
    - "Zero feature flags from Phase 19 remaining in features.ts is a hard gate"
    - "Zero references to old code paths is a hard gate (read from grep-patterns.json)"
  artifacts:
    - path: "scripts/model-card-status.ts"
      provides: "tsx scripts/model-card-status.ts — composite Phase 19 done gate"
      min_lines: 150
    - path: "scripts/model-card-grep-patterns.json"
      provides: "registry of pre-cutover grep patterns each Wave A/B/C plan must register"
    - path: "package.json"
      contains: "\"model-card-status\":"
  key_links:
    - from: "scripts/model-card-status.ts"
      to: "prisma DB + grep tree + features.ts"
      via: "9 distinct checks"
      pattern: "checks\\.push"
---

# Plan 19-Z-04: model-card-status script (composite Phase 19 done gate)

<universal_preamble>

## Autonomous Execution Clause (D-04..D-07)

The agent (Claude) executes this plan end-to-end. Land code → unit tests green (with mocked Prisma) → manual run against current state shows expected unmet conditions punch list → commit. No shadow lifecycle for this script — it IS the gate.

## Hard Cleanup Gate (Definition of Done)

1. (N/A — this plan IS the composite gate)
2. (N/A)
3. (N/A)
4. (N/A)
5. `npm test` green; `npm run model-card-status` exits non-zero today (with informative punch list, since waves A/B/C haven't shipped) and exits zero only when Phase 19 is actually complete

</universal_preamble>

<objective>
Deliver the `npm run model-card-status` composite gate per D-08 + design §11 + RESEARCH §"19-Z-04 model-card-status". This single command is the final gate that determines whether Phase 19 is complete. It checks live DB queries + grep tree + features.ts for 9 distinct conditions and exits zero only when all hold.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md
@.planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md
@docs/plans/2026-05-07-cipher-v2-excellence-design.md
@docs/plans/2026-05-07-cipher-v2-excellence-implementation-plan.md
@.planning/phases/19-cipher-v2-0-excellence/19-Z-01-SUMMARY.md
@.planning/phases/19-cipher-v2-0-excellence/19-Z-02-SUMMARY.md
@src/lib/db.ts
@src/lib/features.ts

<interfaces>
```typescript
// scripts/model-card-status.ts (Plan 19-Z-04 deliverable)
interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

// 9 checks per design §11 / RESEARCH §"model-card-status":
// 1. conformal-coverage: ≥80% ACTIVE cells have conformal_low/high
// 2. dsr: avg(dsr) > threshold (calibrated by Plan 19-A-04)
// 3. pbo: avg(pbo) < threshold
// 4. ic-monitor (×4 signal classes): rolling_ic_20d populated in last 7d
// 5. pooled: ≥80% of cells have parent_alpha
// 6. finsentllm: ≥95% of last-30d SentimentSnapshot rows have finsentllm_score
// 7. citations: ≥90% URL coverage on analyst/news claims in last-30d Reports
// 8. no-old-X: zero matches for each registered pre-cutover grep pattern
// 9. flag-removed-X: each Phase 19 FEATURE_* flag absent from features.ts
```
</interfaces>
</context>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Local fs grep + DB query → exit code | composite gate decides Phase 19 done state |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-Z-04-01 | Tampering | gate too lenient → false PASS | mitigate | Every check must be hard-coded, no env var thresholds; thresholds match design §11 + RESEARCH; unit-tested with mocked DB returning each unmet condition individually |
| T-19-Z-04-02 | Business Logic | grep pattern registry stale | mitigate | model-card-grep-patterns.json is source of truth — every cutover plan REGISTERS its pre-cutover pattern in this file; CI check validates registry not empty |
| T-19-Z-04-03 | Information Disclosure | leaked DB content in stdout | accept | Only aggregate counts/percentages logged, no raw rows |

</threat_model>

<tasks>

<task type="auto" tdd="true" id="19-Z-04-01">
  <name>Task 1: Write failing tests/scripts/model-card-status.test.ts with mocked Prisma</name>
  <read_first>
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (lines 730-825 — full check list)
    - docs/plans/2026-05-07-cipher-v2-excellence-design.md (lines 411-432 — composite DoD)
    - vitest.config.ts (vitest mocking patterns)
  </read_first>
  <behavior>
    Each test mocks `@/lib/db` prisma and asserts exit code or returned punch list:
    - Test 1: `exits 0 when all 9 conditions met` — mock all queries to return passing values; mock fs grep to return zero matches; mock features.ts read to contain zero FEATURE_* phase 19 flags
    - Test 2: `exits non-zero when conformal coverage < 80%` — mock count to return 50/100; assert failure includes 'conformal-coverage'
    - Test 3: `exits non-zero when DSR avg below threshold` — assert failure mentions 'dsr'
    - Test 4: `exits non-zero when PBO avg above threshold` — assert failure mentions 'pbo'
    - Test 5: `exits non-zero when any signal class missing rolling_ic_20d in last 7d` — assert failure mentions 'ic-diffusion' (or whichever class)
    - Test 6: `exits non-zero when pooled coverage < 80%` — assert failure mentions 'pooled'
    - Test 7: `exits non-zero when finsentllm coverage < 95%` — assert failure mentions 'finsentllm'
    - Test 8: `exits non-zero when citations URL coverage < 90%` — assert failure mentions 'citations'
    - Test 9: `exits non-zero when any registered grep pattern still matches in tree` — assert failure mentions 'no-old-<pattern-name>'
    - Test 10: `exits non-zero when any FEATURE_* phase 19 flag still present in features.ts` — assert failure mentions 'flag-removed-<flag>'
    - Test 11: `output is a punch list — every failed check appears in stderr/stdout` — assert all failed reasons present
  </behavior>
  <action>
    Create `tests/scripts/model-card-status.test.ts`:
    - Use `vi.mock('@/lib/db', () => ({ prisma: { learnedPattern: { count: vi.fn(), aggregate: vi.fn() }, sentimentSnapshot: { count: vi.fn() }, report: { findMany: vi.fn() } } }))`
    - Mock `node:child_process` exec for grep
    - Mock `node:fs` readFileSync for features.ts content
    - Refactor model-card-status.ts to export `runChecks(deps): Promise<Check[]>` so test can call it directly without invoking the script entrypoint (avoid process.exit in tests)
    - Assert via returned Check[] array, then separately assert script entry calls process.exit(0|1)
  </action>
  <acceptance_criteria>
    - File `tests/scripts/model-card-status.test.ts` exists
    - `grep -c "it(" tests/scripts/model-card-status.test.ts` returns ≥11
    - Test FAILS module-not-found
  </acceptance_criteria>
  <automated>npx vitest run tests/scripts/model-card-status.test.ts 2>&1 | grep -q "Cannot find module" && echo "RED-OK"</automated>
  <done>11 failing tests covering all 9 condition classes</done>
</task>

<task type="auto" id="19-Z-04-02">
  <name>Task 2: Create scripts/model-card-grep-patterns.json registry</name>
  <read_first>
    - docs/plans/2026-05-07-cipher-v2-excellence-design.md (lines 320-321 — registry per plan that does cutover)
  </read_first>
  <action>
    Create `scripts/model-card-grep-patterns.json` initial registry. Each Wave A/B/C cutover plan REGISTERS its pre-cutover pattern by appending to this file as part of its cutover PR. Initial content (all empty arrays — patterns added per cutover):
    ```json
    {
      "patterns": [
        { "name": "PLACEHOLDER", "pattern": "<<NEVER-MATCHES>>", "registered_by_plan": "19-Z-04-init", "registered_at": "2026-05-07" }
      ],
      "_doc": "Each Phase 19 cutover plan adds its pre-cutover grep pattern here. After cutover, model-card-status verifies zero matches in src/, tests/, scripts/. PLACEHOLDER never matches and is here so the registry is non-empty before any cutover lands.",
      "_format": "Each entry: { name: <human-readable>, pattern: <ripgrep regex>, registered_by_plan: <plan-id>, registered_at: <date> }"
    }
    ```
  </action>
  <acceptance_criteria>
    - File `scripts/model-card-grep-patterns.json` exists and is valid JSON
    - `node -e "console.log(JSON.parse(require('fs').readFileSync('scripts/model-card-grep-patterns.json')).patterns.length)"` returns ≥1
  </acceptance_criteria>
  <automated>node -e "const j = JSON.parse(require('fs').readFileSync('scripts/model-card-grep-patterns.json')); if (!Array.isArray(j.patterns)) process.exit(1)"</automated>
  <done>Pattern registry seeded with placeholder; future cutovers append</done>
</task>

<task type="auto" tdd="true" id="19-Z-04-03">
  <name>Task 3: Implement scripts/model-card-status.ts to make tests green</name>
  <read_first>
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (lines 730-825 — verbatim TS skeleton)
    - tests/scripts/model-card-status.test.ts (just written)
    - src/lib/features.ts
    - scripts/model-card-grep-patterns.json
  </read_first>
  <action>
    Implement `scripts/model-card-status.ts` per the RESEARCH skeleton (lines 730-825), with these exact 9 check categories:

    1. **conformal-coverage**: `prisma.learnedPattern.count({where: {conformal_low: {not: null}, status: 'ACTIVE'}}) / prisma.learnedPattern.count({where: {status: 'ACTIVE'}}) >= 0.80`

    2. **dsr**: `prisma.learnedPattern.aggregate({where: {status: 'ACTIVE'}, _avg: {dsr: true}})._avg.dsr > 0.5` (Assumption A3 — threshold tuned by 19-A-04 audit; if audit lowers it, update constant in this file)

    3. **pbo**: `prisma.learnedPattern.aggregate({where: {status: 'ACTIVE'}, _avg: {pbo: true}})._avg.pbo < 0.5`

    4. **ic-{class}** for class ∈ {diffusion, technical, insider, institutional}: count of LearnedPattern with `signal_class=class AND rolling_ic_20d not null AND last_updated >= now-7d` > 0

    5. **pooled**: `count(parent_alpha not null) / count(*) >= 0.80`

    6. **finsentllm**: `count(SentimentSnapshot where scanned_at>=now-30d AND finsentllm_score not null) / count(SentimentSnapshot where scanned_at>=now-30d) >= 0.95`

    7. **citations**: read last-30d Reports, flat-map citations_v2 from analysis JSON, count where `source ∈ {analyst, news}` total + with_url; ratio >= 0.90

    8. **no-old-{name}** for each entry in model-card-grep-patterns.json: `execSync('rg --count "${pattern}" src/ tests/ scripts/ || echo 0')` returns "0" or empty

    9. **flag-removed-{flag}** for each of the 15 Phase 19 flags: read `src/lib/features.ts`; assert flag name (e.g., `conformal_intervals`) NOT present anywhere in file

    Each check appended to `checks: Check[]`; final block:
    ```typescript
    const failed = checks.filter(c => !c.ok);
    if (failed.length === 0) {
      console.log('✓ Phase 19 done gate: ALL CHECKS PASSED');
      process.exit(0);
    } else {
      console.error('✗ Phase 19 done gate: FAILED');
      for (const c of failed) console.error(`  - ${c.name}: ${c.detail}`);
      process.exit(1);
    }
    ```

    Export `runChecks(deps: { prisma, fs, exec, featuresPath })` for testability — entrypoint wires real deps then calls runChecks then process.exits.
  </action>
  <acceptance_criteria>
    - File `scripts/model-card-status.ts` exists with ≥150 lines
    - All 11 unit tests pass: `npx vitest run tests/scripts/model-card-status.test.ts` exits 0
    - All 9 check categories present: `grep -c "name: 'conformal-coverage'\|name: 'dsr'\|name: 'pbo'\|name: 'pooled'\|name: 'finsentllm'\|name: 'citations'\|'ic-\|'no-old-\|'flag-removed-" scripts/model-card-status.ts` returns ≥9
    - Exports `runChecks` for unit testing
  </acceptance_criteria>
  <automated>npx vitest run tests/scripts/model-card-status.test.ts</automated>
  <done>11/11 tests GREEN; all 9 check categories implemented</done>
</task>

<task type="auto" id="19-Z-04-04">
  <name>Task 4: Add npm script + smoke test against current state (expect FAIL with informative punch list)</name>
  <read_first>
    - package.json (scripts section)
  </read_first>
  <action>
    Add to `package.json`:
    ```json
    "model-card-status": "tsx scripts/model-card-status.ts"
    ```

    Run `npm run model-card-status` against current pre-Wave-ABC state. Expected output: exit code 1 with punch list listing missing pieces (DSR null, parent_alpha null, finsentllm_score null, etc.) — this confirms the gate is wired correctly. The 15 `flag-removed-X` checks should ALL fail (because Z-01 just registered them) — that's the correct state pre-cutover.

    Capture stderr to confirm formatting; commit only after manual inspection confirms punch list is informative (not garbled).
  </action>
  <acceptance_criteria>
    - `grep -q '"model-card-status"' package.json`
    - `npm run model-card-status; CODE=$?; test "$CODE" = "1"` — script exits 1 (gate not yet met)
    - stderr contains "✗ Phase 19 done gate: FAILED"
    - stderr lists at least 15 failed conditions (one per Phase 19 flag still present)
  </acceptance_criteria>
  <automated>npm run model-card-status 2>&1 | grep -q "Phase 19 done gate"</automated>
  <done>Script wired; smoke test produces informative punch list as expected pre-completion</done>
</task>

<task type="auto" id="19-Z-04-05">
  <name>Task 5: Run full unit suite + commit Wave Z final piece</name>
  <read_first>
    - tests/learning.hyperparameters.test.ts (D-54 sanity)
  </read_first>
  <action>
    `npx vitest run` green. Stage `scripts/model-card-status.ts`, `scripts/model-card-grep-patterns.json`, `tests/scripts/model-card-status.test.ts`, `package.json`. Commit:
    ```
    feat(19-z-04): model-card-status composite Phase 19 done gate

    Single command (npm run model-card-status) checks 9 conditions per design §11:
      - conformal coverage ≥80%, DSR > threshold, PBO < threshold
      - rolling_ic_20d populated for all 4 signal classes (last 7d)
      - hierarchical pooling ≥80% (parent_alpha populated)
      - FinSentLLM live (≥95% of last-30d SentimentSnapshots)
      - Structured citations live (≥90% URL coverage on analyst/news)
      - Zero references to old code paths (registered grep patterns)
      - Zero Phase 19 feature flags remaining in features.ts

    Exits 0 only when ALL hold. Exits 1 with explicit punch list otherwise.

    Wave Z complete — Waves A/B/C may now begin in parallel.

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```
  </action>
  <acceptance_criteria>
    - `npx vitest run` exits 0
    - `git log -1 --pretty=%s` returns "feat(19-z-04): model-card-status composite Phase 19 done gate"
  </acceptance_criteria>
  <automated>git log -1 --pretty=%s | grep -q "19-z-04"</automated>
  <done>Wave Z fully landed; phase done-gate live</done>
</task>

</tasks>

<verification>
- [ ] tests/scripts/model-card-status.test.ts: 11/11 GREEN
- [ ] `npm run model-card-status` runs end-to-end without crash
- [ ] Script exits 1 today with punch list (waves not shipped)
- [ ] Script will exit 0 only when all 9 conditions hold (verified via mocked-true tests)
- [ ] Wave Z prerequisite for A/B/C now complete: features.ts + ShadowComparison schema + shadow-runner + verdict CLI + composite gate all live
</verification>

<success_criteria>
Plan 19-Z-04 is complete when:
1. `npm run model-card-status` is the canonical "is Phase 19 done?" command
2. Script reads from live DB + grep tree + features.ts
3. All 9 check categories enforced — gate is non-bypassable
4. Wave Z infra complete; Waves A/B/C may proceed in parallel
</success_criteria>

<output>
After completion, create `.planning/phases/19-cipher-v2-0-excellence/19-Z-04-SUMMARY.md`:
- 9 check categories enforced
- Initial run output (expected punch list)
- Phase done-gate procedure: only `npm run model-card-status; echo $?` returning 0 marks Phase 19 complete in ROADMAP
</output>
