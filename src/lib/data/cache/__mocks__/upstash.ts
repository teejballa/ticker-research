// Phase: 30 — Provider Health Hardening
//
// In-memory mock for @upstash/redis used by Phase-30 breaker / cost-anomaly /
// done-gate tests. Mirrors the surface of `src/lib/data/cache/upstash.ts` plus
// the underlying `@upstash/redis` client methods consumed by Wave 1-3 code.
//
// Decisions covered as test infrastructure (D-04 / D-05 / D-06 / D-15):
//   - D-04: Breaker state lives in Upstash → tests need a deterministic key/value store
//   - D-05: Trailing-20-call ring buffer → lpush + ltrim + lrange surface
//   - D-06: 30s half-open SETNX probe lock → set(..., { nx: true })
//   - D-15: 1h cost-anomaly counter w/ TTL → incr + expire + lazy-expiry get
//
// Usage from tests:
//   import { __resetMockRedis, __advanceMockTime, getRedis } from
//     '@/lib/data/cache/__mocks__/upstash';
//   vi.mock('@/lib/data/cache/upstash', async () =>
//     import('@/lib/data/cache/__mocks__/upstash')
//   );
//
// Time semantics: `__advanceMockTime(ms)` mutates a module-level offset that
// `mockNow()` adds to `Date.now()`. Async REST paths that look at wall-clock
// for expiry/state-machine transitions use `mockNow()` instead of `Date.now()`,
// so tests can fast-forward past the 30s breaker window or 1h cost-anomaly
// window without vitest fake-timers (which don't always cover async paths
// cleanly). Real adapters never import this file — only tests do.

export type CacheKey = string;

interface StoredValue {
  value: string;
  expiresAt: number | null;
}

let kvStore: Map<string, StoredValue> = new Map();
let listStore: Map<string, string[]> = new Map();
let mockTimeOffsetMs = 0;

function mockNow(): number {
  return Date.now() + mockTimeOffsetMs;
}

function isExpired(entry: StoredValue): boolean {
  return entry.expiresAt !== null && entry.expiresAt <= mockNow();
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function parseValue<T>(raw: string): T {
  // Real @upstash/redis auto-parses JSON when possible; mirror that behavior so
  // `get<T>` returns objects/numbers rather than the raw string when feasible.
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}

export interface SetOptions {
  ex?: number;
  nx?: boolean;
}

/**
 * MockRedis — in-memory implementation of the subset of @upstash/redis used by
 * the Phase-30 circuit breaker + cost-anomaly + cache code paths. Every method
 * returns a Promise so call sites don't accidentally rely on synchronous
 * shortcuts that the real REST client wouldn't expose.
 */
export class MockRedis {
  async get<T = string>(key: string): Promise<T | null> {
    const entry = kvStore.get(key);
    if (!entry) return null;
    if (isExpired(entry)) {
      // Lazy expiry — match Upstash semantics: an expired key returns null and
      // is reaped on next access.
      kvStore.delete(key);
      return null;
    }
    return parseValue<T>(entry.value);
  }

  async set(
    key: string,
    value: unknown,
    opts?: SetOptions,
  ): Promise<'OK' | null> {
    const existing = kvStore.get(key);
    const existsAndAlive = existing !== undefined && !isExpired(existing);

    if (opts?.nx && existsAndAlive) {
      // NX: only set when key does NOT exist — used by D-06 probe lock so only
      // one caller can flip the breaker to half-open at a time.
      return null;
    }

    const expiresAt =
      typeof opts?.ex === 'number' ? mockNow() + opts.ex * 1000 : null;

    kvStore.set(key, { value: stringify(value), expiresAt });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    const hadKey = kvStore.delete(key);
    const hadList = listStore.delete(key);
    return hadKey || hadList ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    const entry = kvStore.get(key);
    let next: number;
    if (!entry || isExpired(entry)) {
      next = 1;
    } else {
      const current = Number.parseInt(entry.value, 10);
      next = Number.isFinite(current) ? current + 1 : 1;
    }
    // Preserve existing TTL on incr — real Upstash keeps the original TTL when
    // the counter is incremented. We re-use the entry's expiresAt unless the
    // key was absent/expired, in which case the counter starts with no TTL
    // until the caller's next `expire(...)` call (D-15 cost-anomaly path).
    const expiresAt =
      entry && !isExpired(entry) ? entry.expiresAt : null;
    kvStore.set(key, { value: String(next), expiresAt });
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const entry = kvStore.get(key);
    if (!entry || isExpired(entry)) return 0;
    entry.expiresAt = mockNow() + seconds * 1000;
    kvStore.set(key, entry);
    return 1;
  }

  async lpush(key: string, ...values: string[]): Promise<number> {
    const list = listStore.get(key) ?? [];
    // Real LPUSH prepends in argument order, so the LAST arg becomes the head
    // when multiple values are pushed in one call. Mirror that exactly.
    for (const v of values) {
      list.unshift(v);
    }
    listStore.set(key, list);
    return list.length;
  }

  async ltrim(key: string, start: number, stop: number): Promise<'OK'> {
    const list = listStore.get(key);
    if (!list) return 'OK';
    // Negative indices count from the end (real Redis behavior). `stop === -1`
    // means "to end of list".
    const normStart = start < 0 ? Math.max(0, list.length + start) : start;
    const normStop = stop < 0 ? list.length + stop : stop;
    // LTRIM is inclusive on both ends; slice is exclusive on stop → +1.
    const trimmed = list.slice(normStart, normStop + 1);
    listStore.set(key, trimmed);
    return 'OK';
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const list = listStore.get(key);
    if (!list) return [];
    const normStart = start < 0 ? Math.max(0, list.length + start) : start;
    const normStop = stop < 0 ? list.length + stop : stop;
    return list.slice(normStart, normStop + 1);
  }
}

let singleton: MockRedis | null = null;

/**
 * Returns a singleton MockRedis instance. Mirrors the real `getRedis()` shape
 * in `src/lib/data/cache/upstash.ts`, but never returns null — tests want a
 * deterministic store, not graceful degrade. If a test needs to exercise the
 * "Redis unavailable" branch, it can override the mock per-call.
 */
export function getRedis(): MockRedis {
  if (!singleton) singleton = new MockRedis();
  return singleton;
}

/**
 * Test-only: clear all keys, lists, and the singleton client. Call from
 * `beforeEach` so state from one test never leaks into the next.
 */
export function __resetMockRedis(): void {
  kvStore = new Map();
  listStore = new Map();
  mockTimeOffsetMs = 0;
  singleton = null;
}

/**
 * Test-only: advance the mock wall clock forward by `ms`. Used to step past
 * the D-06 30s breaker window or D-15 1h cost-anomaly counter window without
 * fake-timers. Pass a negative value to step backwards (rare; only useful for
 * regression tests that explicitly need clock skew).
 */
export function __advanceMockTime(ms: number): void {
  mockTimeOffsetMs += ms;
}

/**
 * Test-only: expose the current mock time to tests that need to assert on
 * computed expiry deadlines. Not part of the production Upstash surface.
 */
export function __mockNow(): number {
  return mockNow();
}

// Re-export the legacy test-only reset helper name from the real module so
// callers that already `import { __resetUpstashClientForTests }` continue to
// work when vi.mock swaps this file in.
export function __resetUpstashClientForTests(): void {
  __resetMockRedis();
}

// Mirror the real module's `CacheOptions` / `cached` / `invalidate` surface so
// any code path that does `import { cached } from '@/lib/data/cache/upstash'`
// inside a tested module continues to compile after vi.mock substitution.

export interface CacheOptions {
  ttlSeconds: number;
  bypass?: boolean;
}

export async function cached<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: CacheOptions,
): Promise<T> {
  if (opts.bypass) return fetcher();
  const r = getRedis();
  const hit = await r.get<T>(key);
  if (hit !== null && hit !== undefined) return hit;
  const value = await fetcher();
  await r.set(key, value as unknown as string, { ex: opts.ttlSeconds });
  return value;
}

export async function invalidate(key: string): Promise<void> {
  const r = getRedis();
  await r.del(key);
}
