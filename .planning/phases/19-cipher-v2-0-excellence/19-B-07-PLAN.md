---
phase: 19
plan: 19-B-07
wave: B
type: execute
depends_on: [19-Z-01, 19-Z-02, 19-Z-03, 19-Z-04, 19-B-06]
files_modified:
  - src/lib/data/cache/runtime-cache.ts
  - src/app/api/research/[ticker]/route.ts
  - next.config.ts
  - tests/lib/data/cache/runtime-cache.test.ts
autonomous: true
requirements: []
shadow_required: true
hard_cleanup_gate: true
must_haves:
  truths:
    - "SourcePackage assembly wrapped in Vercel Runtime Cache with 10min idempotency (D-30)"
    - "next.config.ts enables experimental.cacheComponents = true (Next 16 'use cache' directive)"
    - "getCachedSourcePackage uses 'use cache: remote' directive + cacheLife({revalidate: 600, expire: 600})"
    - "Cache hit rate ≥70% on warm production traffic (Wave B success metric)"
    - "Shadow A/B vs uncached path verifies no behavioral change for repeated requests"
  artifacts:
    - path: "src/lib/data/cache/runtime-cache.ts"
      provides: "getCachedSourcePackage with 'use cache: remote' directive"
      exports: ["getCachedSourcePackage"]
    - path: "src/app/api/research/[ticker]/route.ts"
      provides: "Wraps SourcePackage build in cached fn"
      contains: "getCachedSourcePackage"
    - path: "next.config.ts"
      contains: "cacheComponents"
  key_links:
    - from: "src/lib/data/cache/runtime-cache.ts"
      to: "Vercel Runtime Cache (remote)"
      via: "'use cache: remote' directive (Next.js 16 cache components)"
      pattern: "use cache: remote"
---

# Plan 19-B-07: Vercel Runtime Cache integration (10min SourcePackage idempotency)

<universal_preamble>

## Autonomous Execution Clause (D-04..D-07)

Land Runtime Cache wrapper behind FEATURE_DATA_CACHE shadow → drive traffic → verdict PASS on hit rate ≥70% AND latency reduction → cutover.

## Hard Cleanup Gate (Definition of Done)

1. `shadow-reports/19-B-07.json` PASS — cache hit rate ≥70% on warm traffic, latency p50 drop, no behavioral disagreement
2. Cutover PR merged (FEATURE_DATA_CACHE → on default)
3. 7d post-cutover with zero RollbackLog entries
4. Flag-removal PR merged
5. Full suite green

</universal_preamble>

<objective>
Per D-30, integrate Vercel Runtime Cache for SourcePackage with 10-minute idempotency. Multiple requests for the same ticker within 10min share cached result. Uses Next.js 16 `'use cache: remote'` directive (compiler-derived keys) to push results into Vercel Runtime Cache.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md
@.planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md
@docs/plans/2026-05-07-cipher-v2-excellence-design.md
@.planning/phases/19-cipher-v2-0-excellence/19-B-06-SUMMARY.md
@src/app/api/research/[ticker]/route.ts
@next.config.ts

<interfaces>
```typescript
// src/lib/data/cache/runtime-cache.ts
'use cache: remote';
import { cacheLife } from 'next/cache';
export async function getCachedSourcePackage(ticker: string): Promise<SourcePackage>;
```
</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-B-07-01 | Tampering | stale data served past 10min idempotency | mitigate | cacheLife({revalidate: 600, expire: 600}) — both at 600s; Next 16 compiler-derived keys prevent manual hashing bugs (per RESEARCH "Don't Hand-Roll") |
| T-19-B-07-02 | Information Disclosure | cached SourcePackage cross-tenant leak | mitigate | Cache key includes only ticker (no user_id); SourcePackage contains no per-user data; per-user filtering happens AFTER SourcePackage in /api/analysis flow |

</threat_model>

<tasks>

<task type="auto" id="19-B-07-01">
  <name>Task 1: Enable cache components in next.config.ts</name>
  <read_first>
    - next.config.ts (existing config)
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (lines 583-602 — Code Example 4)
  </read_first>
  <action>
    Edit `next.config.ts`:
    ```typescript
    const nextConfig = {
      // ... existing config
      experimental: {
        ...((existingConfig as any).experimental ?? {}),
        cacheComponents: true,
      },
    };
    ```

    Verify Next.js version is 16.x: `node -p "require('next/package.json').version"`. If not, executor must update Next FIRST or postpone this plan (the directive requires Next 16).

    NOTE TO EXECUTOR: Per the system reminder, your training data on Next.js cache components may be outdated. Read https://nextjs.org/docs/app/api-reference/directives/use-cache and https://vercel.com/docs/caching/runtime-cache for the current API. If the API has shifted (e.g., from `'use cache: remote'` to a different directive), update the runtime-cache.ts accordingly.
  </action>
  <acceptance_criteria>
    - `grep -q "cacheComponents.*true\|cacheComponents:\s*true" next.config.ts`
    - Next.js version ≥ 16.x
    - `npm run build` (in dev script) does not error on the new config
  </acceptance_criteria>
  <automated>grep -q "cacheComponents" next.config.ts</automated>
  <done>cache components enabled</done>
</task>

<task type="auto" tdd="true" id="19-B-07-02">
  <name>Task 2: Write tests/lib/data/cache/runtime-cache.test.ts</name>
  <read_first>
    - https://nextjs.org/docs/app/api-reference/directives/use-cache (executor reads live)
    - https://vercel.com/docs/caching/runtime-cache
  </read_first>
  <behavior>
    - Test 1: `getCachedSourcePackage returns SourcePackage on first call`
    - Test 2: `getCachedSourcePackage second call within 10min — cache hit (verified by checking the underlying assembler is called once)` — note: `'use cache'` is hard to test via vitest unit; may need integration test or jest's runtime-cache mock
    - Test 3: `cacheLife revalidate=600 expire=600 verified via Next.js cache config inspection`
    - Test 4: `behavior identical to non-cached path (parity test)`

    If `'use cache'` directive cannot be exercised in vitest (likely — it requires Next compiler), mark these as integration tests with skip + manual verification per RESEARCH §"Manual-Only Verifications".
  </behavior>
  <action>
    Create `tests/lib/data/cache/runtime-cache.test.ts`. If unit-testing the directive isn't feasible, write a parity test that calls the underlying assembler directly and asserts the cache wrapper produces identical output.
  </action>
  <acceptance_criteria>
    - File exists; tests written or marked manual with explicit reason
  </acceptance_criteria>
  <automated>test -f tests/lib/data/cache/runtime-cache.test.ts</automated>
  <done>Tests scaffolded; directive limitations noted</done>
</task>

<task type="auto" id="19-B-07-03">
  <name>Task 3: Implement src/lib/data/cache/runtime-cache.ts</name>
  <read_first>
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (lines 583-602 — verbatim impl)
    - src/lib/data/source-package.ts (existing buildSourcePackageNewLadder fn name)
  </read_first>
  <action>
    Create `src/lib/data/cache/runtime-cache.ts`:
    ```typescript
    'use cache: remote';

    import { cacheLife } from 'next/cache';
    import { buildSourcePackage } from '@/lib/data/source-package'; // assumes new ladder is the public entry post-19-B-06

    /**
     * Vercel Runtime Cache wrapper for SourcePackage.
     * 10min idempotency per CONTEXT D-30.
     * Compiler-derived cache keys per Next.js 16 cache components.
     */
    export async function getCachedSourcePackage(ticker: string) {
      cacheLife({ revalidate: 600, expire: 600 });
      return buildSourcePackage(ticker);
    }
    ```
  </action>
  <acceptance_criteria>
    - File exists with `'use cache: remote'` directive at top
    - `grep -q "cacheLife.*600" src/lib/data/cache/runtime-cache.ts`
  </acceptance_criteria>
  <automated>head -1 src/lib/data/cache/runtime-cache.ts | grep -q "'use cache: remote'" && grep -q "cacheLife" src/lib/data/cache/runtime-cache.ts</automated>
  <done>Wrapper implemented per Next.js 16 cache components API</done>
</task>

<task type="auto" id="19-B-07-04">
  <name>Task 4: Wire getCachedSourcePackage into /api/research/[ticker]/route.ts behind FEATURE_DATA_CACHE</name>
  <read_first>
    - src/app/api/research/[ticker]/route.ts (existing handler)
    - src/lib/features.ts (FEATURE_DATA_CACHE)
    - src/lib/shadow/shadow-runner.ts
  </read_first>
  <action>
    Edit research route:
    ```typescript
    import { getCachedSourcePackage } from '@/lib/data/cache/runtime-cache';
    import { buildSourcePackage } from '@/lib/data/source-package';
    import { FEATURES } from '@/lib/features';
    import { runWithShadow } from '@/lib/shadow/shadow-runner';

    // existing handler:
    const pkg = await runWithShadow(
      'runtime-cache',
      () => buildSourcePackage(ticker),
      () => getCachedSourcePackage(ticker),
      FEATURES.data_cache_mode,
      { ticker },
    );
    ```
  </action>
  <acceptance_criteria>
    - `grep -q "getCachedSourcePackage" src/app/api/research/\[ticker\]/route.ts`
    - `grep -q "runWithShadow.*'runtime-cache'" src/app/api/research/\[ticker\]/route.ts`
    - `grep -q "data_cache_mode" src/app/api/research/\[ticker\]/route.ts`
  </acceptance_criteria>
  <automated>grep -q "runWithShadow.*runtime-cache" src/app/api/research/\[ticker\]/route.ts</automated>
  <done>Cached path wired behind shadow gate</done>
</task>

<task type="auto" id="19-B-07-05">
  <name>Task 5: Initial commit (flag off)</name>
  <action>
    Commit:
    ```
    feat(19-b-07): Vercel Runtime Cache for SourcePackage (10min idempotency)

    'use cache: remote' wrapper getCachedSourcePackage(ticker) — Next.js 16
    cache components with cacheLife({revalidate: 600, expire: 600}).

    Wired into /api/research/[ticker]/route.ts behind FEATURE_DATA_CACHE
    via runWithShadow('runtime-cache', ...) — flag default off.

    next.config.ts experimental.cacheComponents enabled.

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```
  </action>
  <acceptance_criteria>
    - `git log -1 --pretty=%s` matches "feat(19-b-07)"
  </acceptance_criteria>
  <automated>git log -1 --pretty=%s | grep -q "19-b-07"</automated>
  <done>Code landed; ready for shadow lifecycle</done>
</task>

<task type="auto" id="19-B-07-06">
  <name>Task 6: Shadow → verdict → cutover → 7d hatch → flag removal</name>
  <read_first>
    - .planning/phases/19-cipher-v2-0-excellence/19-Z-03-SUMMARY.md
  </read_first>
  <action>
    Same lifecycle pattern as 19-B-06:
    a) `vercel env add FEATURE_DATA_CACHE shadow production` + redeploy
    b) Drive traffic 3-7d
    c) `npm run shadow-verdict 19-B-07` — verdict requires:
       - cache hit rate ≥ 70% (Wave B success metric)
       - latency p50 reduction
       - output disagreement < 1% (parity)
    d) PASS → cutover PR: flag default `on`, REMOVE the `runWithShadow` wrapper around the cache call (replace with direct `getCachedSourcePackage(ticker)`)
    e) 7d hatch
    f) Flag-removal PR: remove FEATURE_DATA_CACHE from features.ts + .env.example
  </action>
  <acceptance_criteria>
    - `shadow-reports/19-B-07.json` PASS with hit_rate ≥ 0.70
    - FEATURE_DATA_CACHE removed from features.ts post-7d
  </acceptance_criteria>
  <automated>test -f shadow-reports/19-B-07.json</automated>
  <done>Cache lifecycle complete</done>
</task>

</tasks>

<verification>
- [ ] cacheComponents enabled in next.config.ts
- [ ] getCachedSourcePackage uses 'use cache: remote' + cacheLife(600/600)
- [ ] Shadow verdict PASS — hit rate ≥70%, latency drop, parity verified
- [ ] FEATURE_DATA_CACHE removed post-cutover
</verification>

<success_criteria>
SourcePackage cache hit rate ≥70% on warm production traffic; latency p50 reduction observable.
</success_criteria>

<output>
Create `.planning/phases/19-cipher-v2-0-excellence/19-B-07-SUMMARY.md`.
</output>
