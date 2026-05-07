---
phase: 19
plan: 19-B-01
wave: B
type: execute
depends_on: [19-Z-01, 19-Z-02, 19-Z-03, 19-Z-04]
files_modified:
  - src/lib/data/cache/upstash.ts
  - src/lib/data/cache/cache-keys.ts
  - tests/lib/data/cache/upstash.test.ts
  - package.json
  - .env.example
autonomous: true
requirements: []
shadow_required: false
hard_cleanup_gate: true
must_haves:
  truths:
    - "cached(key, fetcher, opts) returns fetched value on miss + populates Redis"
    - "cached returns Redis value on hit + skips fetcher (verified via vi.fn call count)"
    - "cached refetches after TTL expiry"
    - "cached falls through to fetcher on Redis outage (graceful degrade per D-24)"
    - "invalidate(key) evicts the cache entry"
    - "Centralized CACHE_KEYS + TTL_SECONDS in cache-keys.ts (no inline TTLs)"
    - "@upstash/redis v1.38.0 pinned in package.json (RESEARCH-verified)"
  artifacts:
    - path: "src/lib/data/cache/upstash.ts"
      provides: "cached() + invalidate() generic wrappers"
      exports: ["cached", "invalidate", "type CacheOptions"]
    - path: "src/lib/data/cache/cache-keys.ts"
      provides: "CACHE_KEYS + TTL_SECONDS constants"
      exports: ["CACHE_KEYS", "TTL_SECONDS", "type CacheKey"]
    - path: ".env.example"
      contains: "UPSTASH_REDIS_REST_URL"
  key_links:
    - from: "src/lib/data/cache/upstash.ts"
      to: "@upstash/redis"
      via: "Redis HTTP client"
      pattern: "from '@upstash/redis'"
---

# Plan 19-B-01: Upstash Redis client + cache-keys + TTL config

<universal_preamble>

## Autonomous Execution Clause (D-04..D-07)

Land cache wrapper + tests → smoke test against Upstash sandbox → commit. No shadow needed (wrapper is opt-in; existing fetchers untouched).

## Hard Cleanup Gate (Definition of Done)

1. (N/A — primitive only)
2. (N/A)
3. (N/A)
4. (N/A — no flag introduced; FEATURE_DATA_CACHE flag is owned by 19-B-08 rollout)
5. `npm test` green; manual smoke test against real Upstash sandbox confirms hit/miss

</universal_preamble>

<objective>
Land Upstash Redis cache wrapper per D-24. `cached(key, fetcher, opts)` is the foundation every Wave B adapter (Tiingo, Twelve Data, Exa) builds on. Graceful degrade on Redis outage = transparent fallthrough to fetcher.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md
@.planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md
@docs/plans/2026-05-07-cipher-v2-excellence-implementation-plan.md

<interfaces>
```typescript
export type CacheKey = string;

export const CACHE_KEYS: {
  quote: (ticker: string) => CacheKey;
  fundamentals: (ticker: string) => CacheKey;
  options: (ticker: string) => CacheKey;
  community: (ticker: string) => CacheKey;
  news: (ticker: string) => CacheKey;
  source_pkg: (ticker: string) => CacheKey;
};

export const TTL_SECONDS: {
  quote: 300;          // 5min
  fundamentals: 86_400; // 24h
  options: 900;         // 15min
  community: 600;       // 10min
  news: 1_800;          // 30min
  source_pkg: 600;      // 10min
};

export interface CacheOptions {
  ttlSeconds: number;
  bypass?: boolean;
}

export async function cached<T>(key: CacheKey, fetcher: () => Promise<T>, opts: CacheOptions): Promise<T>;
export async function invalidate(key: CacheKey): Promise<void>;
```
</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-B-01-01 | Tampering | cache poisoning via key collision | mitigate | CACHE_KEYS uses uppercase ticker + namespace prefix (`quote:AAPL`); no user-controlled key paths; per-key namespace prevents cross-domain collision |
| T-19-B-01-02 | DoS | Redis outage breaks fetches | mitigate | cached() catches Redis errors and falls through to fetcher (D-24); never re-throws Redis errors |
| T-19-B-01-03 | Information Disclosure | API tokens in Redis URL | mitigate | UPSTASH_REDIS_REST_TOKEN read from env, never logged; URL strings sanitized before persist (handled at higher level by 19-Z-03 sanitize) |

</threat_model>

<tasks>

<task type="auto" id="19-B-01-01">
  <name>Task 1: Install @upstash/redis@1.38.0 + add env vars</name>
  <read_first>
    - package.json (verify @upstash/redis not already present)
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (line 151 — verified version 1.38.0 as of 2026-05-05)
  </read_first>
  <action>
    `npm install @upstash/redis@^1.38.0`. Verify in package.json `"dependencies"` section.

    Append to `.env.example`:
    ```
    # Phase 19-B-01 — Upstash Redis cache layer (graceful degrade if unset)
    UPSTASH_REDIS_REST_URL=
    UPSTASH_REDIS_REST_TOKEN=
    ```
  </action>
  <acceptance_criteria>
    - `grep -q '"@upstash/redis"' package.json`
    - `node -e "console.log(require('@upstash/redis').Redis)"` does not throw
    - `grep -q "UPSTASH_REDIS_REST_URL" .env.example`
  </acceptance_criteria>
  <automated>node -e "require('@upstash/redis')"</automated>
  <done>Dependency pinned; env vars documented</done>
</task>

<task type="auto" tdd="true" id="19-B-01-02">
  <name>Task 2: Write tests/lib/data/cache/upstash.test.ts (5 tests, RED)</name>
  <read_first>
    - docs/plans/2026-05-07-cipher-v2-excellence-implementation-plan.md (lines 612-660 — verbatim test block)
  </read_first>
  <behavior>
    5 tests verbatim from impl-plan lines 619-660:
    - Test 1: returns fetched value on miss + populates cache
    - Test 2: returns cached value on hit + skips fetcher
    - Test 3: refetches after TTL
    - Test 4: falls through to fetcher on Redis outage (graceful degrade)
    - Test 5: invalidate evicts key
  </behavior>
  <action>
    Create `tests/lib/data/cache/upstash.test.ts` with EXACT contents from impl-plan lines 614-660. Use `vi.useFakeTimers()` for TTL test. Mock @upstash/redis where needed.
  </action>
  <acceptance_criteria>
    - File exists; 5 tests
    - Test FAILS RED
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/data/cache/upstash.test.ts 2>&1 | grep -qE "Cannot find|FAIL"</automated>
  <done>5 failing tests written</done>
</task>

<task type="auto" tdd="true" id="19-B-01-03">
  <name>Task 3: Implement cache-keys.ts + upstash.ts</name>
  <read_first>
    - tests/lib/data/cache/upstash.test.ts (just written)
    - docs/plans/2026-05-07-cipher-v2-excellence-implementation-plan.md (lines 670-741 — verbatim impl)
  </read_first>
  <action>
    Create per impl-plan lines 670-741 verbatim:

    `src/lib/data/cache/cache-keys.ts`:
    ```typescript
    export type CacheKey = string;

    export const CACHE_KEYS = {
      quote:        (ticker: string) => `quote:${ticker.toUpperCase()}`,
      fundamentals: (ticker: string) => `fund:${ticker.toUpperCase()}`,
      options:      (ticker: string) => `opts:${ticker.toUpperCase()}`,
      community:    (ticker: string) => `comm:${ticker.toUpperCase()}`,
      news:         (ticker: string) => `news:${ticker.toUpperCase()}`,
      source_pkg:   (ticker: string) => `pkg:${ticker.toUpperCase()}`,
    } as const;

    export const TTL_SECONDS = {
      quote: 300,
      fundamentals: 86_400,
      options: 900,
      community: 600,
      news: 1_800,
      source_pkg: 600,
    } as const;
    ```

    `src/lib/data/cache/upstash.ts`:
    ```typescript
    import { Redis } from '@upstash/redis';

    let redisClient: Redis | null = null;

    function getRedis(): Redis | null {
      if (redisClient) return redisClient;
      const url = process.env.UPSTASH_REDIS_REST_URL;
      const token = process.env.UPSTASH_REDIS_REST_TOKEN;
      if (!url || !token) return null;
      redisClient = new Redis({ url, token });
      return redisClient;
    }

    export interface CacheOptions { ttlSeconds: number; bypass?: boolean }

    export async function cached<T>(
      key: string,
      fetcher: () => Promise<T>,
      opts: CacheOptions,
    ): Promise<T> {
      if (opts.bypass) return fetcher();
      const r = getRedis();
      if (!r) return fetcher();
      try {
        const hit = await r.get<T>(key);
        if (hit !== null && hit !== undefined) return hit;
      } catch {
        return fetcher();
      }
      const value = await fetcher();
      try { await r.set(key, value, { ex: opts.ttlSeconds }); } catch { /* swallow */ }
      return value;
    }

    export async function invalidate(key: string): Promise<void> {
      const r = getRedis();
      if (!r) return;
      try { await r.del(key); } catch { /* swallow */ }
    }
    ```
  </action>
  <acceptance_criteria>
    - All 5 tests pass: `npx vitest run tests/lib/data/cache/upstash.test.ts` exits 0
    - Both files exist
    - `grep -q "graceful\|catch" src/lib/data/cache/upstash.ts` (degrade behavior visible)
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/data/cache/upstash.test.ts</automated>
  <done>5/5 GREEN; cache wrapper ready for adapters</done>
</task>

<task type="auto" id="19-B-01-04">
  <name>Task 4: Smoke test against real Upstash sandbox + commit</name>
  <action>
    If Upstash sandbox creds are set in local env:
    ```bash
    npx tsx -e "import { cached, invalidate } from './src/lib/data/cache/upstash.ts'; \
      import { CACHE_KEYS, TTL_SECONDS } from './src/lib/data/cache/cache-keys.ts'; \
      const fetcher = async () => ({ price: 150, time: Date.now() }); \
      const a = await cached(CACHE_KEYS.quote('AAPL'), fetcher, { ttlSeconds: 60 }); \
      const b = await cached(CACHE_KEYS.quote('AAPL'), fetcher, { ttlSeconds: 60 }); \
      console.log('hit-equal:', a.time === b.time); \
      await invalidate(CACHE_KEYS.quote('AAPL'));"
    ```
    Confirm `hit-equal: true`.

    Commit:
    ```
    feat(19-b-01): Upstash Redis cache layer with graceful degrade

    cached(key, fetcher, opts) wraps any fetcher with TTL caching.
    Redis outage falls through to fetcher (D-24 — no hard dependency).
    Centralized CACHE_KEYS + TTL_SECONDS in cache-keys.ts (no inline TTLs).

    @upstash/redis@1.38.0 pinned (RESEARCH-verified 2026-05-05).

    Foundation for Wave B adapters (Tiingo, Twelve Data, Exa).

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```
  </action>
  <acceptance_criteria>
    - `git log -1 --pretty=%s` matches "feat(19-b-01)"
  </acceptance_criteria>
  <automated>git log -1 --pretty=%s | grep -q "19-b-01"</automated>
  <done>Cache wrapper committed; smoke verified</done>
</task>

</tasks>

<verification>
- [ ] 5 unit tests pass
- [ ] @upstash/redis 1.38.0 pinned
- [ ] CACHE_KEYS + TTL_SECONDS centralized
- [ ] Graceful degrade verified
</verification>

<success_criteria>
1. Wave B adapters (B-03/04/05) can import `cached` and `CACHE_KEYS`
2. Redis outage never blocks fetches
</success_criteria>

<output>
Create `.planning/phases/19-cipher-v2-0-excellence/19-B-01-SUMMARY.md`.
</output>
