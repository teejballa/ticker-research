// tests/unit/cron-module-load.unit.test.ts
//
// Regression test for the 2026-05-13 Bayesian-learning-engine-prod-broken bug.
//
// What broke:
//   src/lib/prompts/_manifest.ts used `readdirSync(__dirname)` + `readFileSync`
//   at MODULE LOAD time to enumerate _vN/<id>.md prompt bodies. Next.js's
//   file-tracer does NOT trace files referenced only via dynamic fs, so the
//   .md bodies were never copied into the Vercel lambda bundle. Every cold
//   start of `/api/cron/learn` (and every transitive importer of the registry)
//   threw `ENOENT: no such file or directory, scandir '/vercel/path0/src/lib/prompts'`
//   at module load — before any handler code ran — and the route returned HTTP
//   500. The Bayesian learning engine silently froze for >24h in production.
//
// Why this test catches it:
//   Vercel's serverless cold start does `require('./route.js')` which evaluates
//   the entire module graph including any top-level `readdirSync`/`readFileSync`.
//   This test mimics that exact behavior: `await import(...)` of every cron
//   route module. If the prompt registry (or any other module-load fs use)
//   regresses to dynamic-fs-at-module-load, this test will throw the same
//   ENOENT and fail — catching the bug BEFORE Vercel does.
//
// Coverage:
//   The three ML-pipeline crons (`learn`, `sentiment-scan`, `price-followup`)
//   plus a representative sample of the heavier Phase-20 crons that import
//   the prompt registry transitively (`per-source-ic`, `eval-citation-coverage`,
//   `tune-decay`, `agreement-calibration`).
//
// Mocking strategy:
//   The route modules transitively import @/lib/db (Prisma) which throws if
//   DATABASE_URL is unset. We mock the db + AI clients so module load is the
//   ONLY thing being tested — no DB connections, no AI calls.

import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock @/lib/db before ANY route module is loaded — they import the prisma
// singleton at top level which throws on import if DATABASE_URL is undefined.
vi.mock('@/lib/db', () => ({
  prisma: {
    sentimentSnapshot: { findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
    sentimentObservation: { findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
    learnedPattern: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), upsert: vi.fn() },
    logisticEpoch: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    learningEvent: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    priceOutcome: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    report: { findMany: vi.fn(), findFirst: vi.fn() },
    providerCallLog: { findMany: vi.fn(), create: vi.fn() },
    perSourceIc: { findMany: vi.fn(), upsert: vi.fn() },
    sourceTier: { findMany: vi.fn(), upsert: vi.fn() },
    botFilterFlag: { findMany: vi.fn(), create: vi.fn() },
    coordinationCluster: { findMany: vi.fn(), create: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(0),
    $transaction: vi.fn(async (cb: unknown) => {
      if (typeof cb === 'function') return cb({});
      return cb;
    }),
  },
}));

// Stub Anthropic + AI SDK clients — they validate API keys on import.
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create: vi.fn() }; },
  Anthropic: class { messages = { create: vi.fn() }; },
}));

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: vi.fn(() => ({})),
  createAnthropic: vi.fn(() => vi.fn(() => ({}))),
}));

vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({ text: '' }),
  generateObject: vi.fn().mockResolvedValue({ object: {} }),
  streamText: vi.fn(),
  tool: vi.fn(),
}));

// Mock yahoo-finance2 so module-load doesn't try network handshakes.
vi.mock('yahoo-finance2', () => ({
  default: class { quote = vi.fn(); historical = vi.fn(); chart = vi.fn(); search = vi.fn(); },
}));

// Set env vars that downstream modules read at top level.
beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgres://stub:stub@localhost/stub';
  process.env.CRON_SECRET ??= 'stub-cron-secret';
  process.env.ANTHROPIC_API_KEY ??= 'sk-ant-stub';
  process.env.GOOGLE_AI_API_KEY ??= 'stub';
});

// The exact set of routes that broke when prompt registry shipped. These are
// the routes whose import graph touches @/lib/prompts/registry — the ones
// most at risk of regressing this bug class.
const CRITICAL_CRON_ROUTES = [
  '@/app/api/cron/learn/route',
  '@/app/api/cron/sentiment-scan/route',
  '@/app/api/cron/price-followup/route',
  '@/app/api/cron/per-source-ic/route',
  '@/app/api/cron/tune-decay/route',
  '@/app/api/cron/agreement-calibration/route',
  '@/app/api/cron/eval-citation-coverage/route',
  '@/app/api/cron/eval-brier/route',
];

describe('cron module cold-start — regression for prompt-registry ENOENT bug (2026-05-13)', () => {
  for (const route of CRITICAL_CRON_ROUTES) {
    it(`${route} loads without throwing (no dynamic fs at module load)`, async () => {
      // dynamic import = same code path Vercel uses on lambda cold start.
      // If any module in the graph throws synchronously during evaluation
      // (e.g. _manifest.ts regressing to readdirSync), this will reject.
      await expect(import(/* @vite-ignore */ route)).resolves.toBeDefined();
    });
  }

  it('prompt registry REGISTERED_PROMPTS loads as a non-empty array', async () => {
    const { REGISTERED_PROMPTS } = await import('@/lib/prompts/_manifest');
    expect(Array.isArray(REGISTERED_PROMPTS)).toBe(true);
    expect(REGISTERED_PROMPTS.length).toBeGreaterThan(0);
    for (const p of REGISTERED_PROMPTS) {
      expect(typeof p.template).toBe('string');
      expect(p.template.length).toBeGreaterThan(0);
      expect(typeof p.id).toBe('string');
      expect(typeof p.version).toBe('string');
    }
  });

  it('prompt registry does NOT use node:fs / node:path / node:url at module load', async () => {
    // Read the on-disk _manifest.ts source and assert it does not import
    // node:fs / node:path / node:url. This is the static guarantee that
    // the bug cannot recur via a copy-paste regression.
    //
    // We strip out comment lines first so prose like "the previous code used
    // readdirSync" doesn't trip the regex.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const manifestPath = path.join(process.cwd(), 'src', 'lib', 'prompts', '_manifest.ts');
    const fullSrc = fs.readFileSync(manifestPath, 'utf8');
    // Strip block comments AND single-line // comments.
    const codeOnly = fullSrc
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');
    expect(codeOnly).not.toMatch(/from\s+['"]node:fs['"]/);
    expect(codeOnly).not.toMatch(/from\s+['"]node:url['"]/);
    expect(codeOnly).not.toMatch(/from\s+['"]node:path['"]/);
    expect(codeOnly).not.toMatch(/\b(readdirSync|readFileSync|existsSync)\s*\(/);
  });
});
