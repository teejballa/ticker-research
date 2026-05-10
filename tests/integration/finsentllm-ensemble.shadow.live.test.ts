// tests/integration/finsentllm-ensemble.shadow.live.test.ts
//
// Phase 19 / Plan 19-C-02 — live-DB shadow lifecycle test for the
// `finsentllm-ensemble` path.
//
// EXCLUDED from `npx vitest run` (default unit suite) by vitest.config.ts
// `exclude: ['tests/integration/**']`. Run via:
//
//   npm run test:integration -- finsentllm-ensemble.shadow.live
//
// What this test asserts (D-34 + D-47 + 19-Z-04 gate):
//   1. Shadow mode for path_name='finsentllm-ensemble' persists a
//      ShadowComparison row through Neon (round-trip).
//   2. The ensemble new-path output JSONB carries finsentllm_score +
//      model_agreement keys that map directly onto SentimentSnapshot
//      columns (D-47 — Float? both).
//   3. The off-path is a strict no-op (no ShadowComparison row written).
//   4. afterEach cleanup removes seeded test rows so the production
//      ShadowComparison index stays clean.
//
// Mock strategy: the 3 HF clients are mocked via `vi.mock('@/lib/sentiment/finsentllm')`.
// The shadow harness (`runWithShadow`) is exercised end-to-end against the
// live Neon ShadowComparison table (cuid IDs, indexes, JSONB columns) — only
// the upstream HF SDK is mocked because real HF Inference Endpoint calls
// would burn HF credits + cold-start the endpoints during CI.
//
// The end-to-end Pearson ≥0.85 + ≥95% chatter-coverage verdict gate is
// enforced out-of-band by `npm run shadow-verdict 19-C-02` against the
// production ShadowComparison table after the shadow window drives ≥200
// rows over 7d (per RESEARCH Pitfall 4 — extended window for HF cold-start).

import { describe, it, expect, vi, afterAll, afterEach, beforeAll } from 'vitest';
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

const HAS_DB = !!process.env.DATABASE_URL && /^postgres/i.test(process.env.DATABASE_URL ?? '');
const adapter = HAS_DB ? new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) : null;
const prisma = HAS_DB ? new PrismaClient({ adapter: adapter! }) : (null as unknown as PrismaClient);

const TEST_PATH = 'finsentllm-ensemble';
const TEST_TICKER_PREFIX = 'C02TST';

// Mock the 3 HF clients so the ensemble math runs against deterministic
// inputs without burning real HF credits. Each mock returns a fixed
// SentimentScore — the shadow run exercises the harness, JSONB
// serialization, and DB round-trip with these values.
vi.mock('@/lib/sentiment/finsentllm', () => ({
  classifyFinGPT: vi.fn(async () => ({ score: 0.5, confidence: 0.8, model: 'fingpt-v3' })),
  classifyMistralFin: vi.fn(async () => ({ score: 0.3, confidence: 0.9, model: 'mistral-fin-7b' })),
  classifyFinBERT: vi.fn(async () => ({ score: 0.7, confidence: 0.7, model: 'finbert' })),
}));

beforeAll(() => {
  // Ensemble's null-sentinel contract still requires the env vars to be
  // present in production; mocks bypass them but we keep this here so the
  // test is hermetic regardless of CI env.
  process.env.HF_INFERENCE_TOKEN ??= 'test-token';
  process.env.HF_FINGPT_ENDPOINT ??= 'https://example/fingpt@deadbeef';
  process.env.HF_MISTRAL_FIN_ENDPOINT ??= 'https://example/mistral-fin@deadbeef';
  process.env.HF_FINBERT_ENDPOINT ??= 'https://example/finbert@deadbeef';
});

afterAll(async () => {
  if (HAS_DB) await prisma.$disconnect();
});

afterEach(async () => {
  if (!HAS_DB) return;
  // Strip every test ticker we may have seeded (ticker prefix lets us match
  // multiple tests' rows in one delete).
  await prisma.shadowComparison.deleteMany({
    where: {
      path_name: TEST_PATH,
      ticker: { startsWith: TEST_TICKER_PREFIX },
    },
  });
});

describe.skipIf(!HAS_DB)('19-C-02 shadow lifecycle (live)', () => {
  it('shadow mode persists ShadowComparison row with finsentllm_score + model_agreement', async () => {
    // Dynamic import after vi.mock so the harness picks up the mocked
    // ensemble call inside the new-path closure.
    const { runWithShadow } = await import('@/lib/shadow/shadow-runner');
    const { ensembleSentiment } = await import('@/lib/sentiment/ensemble');

    const ticker = `${TEST_TICKER_PREFIX}-A`;

    const oldFn = async () => ({ finsentllm_score: null, model_agreement: null });
    const newFn = async () => {
      const r = await ensembleSentiment('AAPL beats earnings, revenue up 12%');
      return {
        finsentllm_score: r.score,
        model_agreement: r.model_agreement,
      };
    };

    const result = await runWithShadow(
      TEST_PATH,
      oldFn,
      newFn,
      'shadow',
      { ticker },
    );
    // Old-path return value reaches caller (D-14 invariant).
    expect(result).toEqual({ finsentllm_score: null, model_agreement: null });

    // Shadow-runner persists in setImmediate; poll briefly for the row.
    let row: { new_output_json: unknown; old_latency_ms: number | null; new_latency_ms: number | null } | null = null;
    for (let i = 0; i < 30 && !row; i++) {
      await new Promise(r => setTimeout(r, 100));
      row = await prisma.shadowComparison.findFirst({
        where: { path_name: TEST_PATH, ticker },
        orderBy: { created_at: 'desc' },
      });
    }
    expect(row).not.toBeNull();
    const newOut = row!.new_output_json as { finsentllm_score: number | null; model_agreement: number | null };
    expect(newOut).toHaveProperty('finsentllm_score');
    expect(newOut).toHaveProperty('model_agreement');
    // Mocked scores: weighted avg = (0.5*0.8 + 0.3*0.9 + 0.7*0.7) / (0.8+0.9+0.7) = 1.16/2.4
    expect(newOut.finsentllm_score).toBeCloseTo(1.16 / 2.4, 6);
    // Agreement: 1 - sqrt(((0.5-0.5)² + (0.3-0.5)² + (0.7-0.5)²)/3) = 1 - sqrt(0.0266…)
    expect(newOut.model_agreement).toBeCloseTo(1 - Math.sqrt(0.08 / 3), 6);
    expect(typeof row!.old_latency_ms).toBe('number');
    expect(typeof row!.new_latency_ms).toBe('number');
  });

  it('shadow mode persists model_agreement as a Float (round-trips JSONB)', async () => {
    const { runWithShadow } = await import('@/lib/shadow/shadow-runner');
    const { ensembleSentiment } = await import('@/lib/sentiment/ensemble');

    const ticker = `${TEST_TICKER_PREFIX}-B`;

    await runWithShadow(
      TEST_PATH,
      async () => ({ finsentllm_score: null, model_agreement: null }),
      async () => {
        const r = await ensembleSentiment('test text');
        return { finsentllm_score: r.score, model_agreement: r.model_agreement };
      },
      'shadow',
      { ticker },
    );

    let row: { new_output_json: unknown } | null = null;
    for (let i = 0; i < 30 && !row; i++) {
      await new Promise(r => setTimeout(r, 100));
      row = await prisma.shadowComparison.findFirst({
        where: { path_name: TEST_PATH, ticker },
        orderBy: { created_at: 'desc' },
      });
    }
    expect(row).not.toBeNull();
    const out = row!.new_output_json as { model_agreement: number | null };
    expect(typeof out.model_agreement).toBe('number');
    expect(out.model_agreement).toBeGreaterThanOrEqual(0);
    expect(out.model_agreement).toBeLessThanOrEqual(1);
  });

  it('shadow ShadowComparison row has path_name=finsentllm-ensemble (queryable for verdict CLI)', async () => {
    const { runWithShadow } = await import('@/lib/shadow/shadow-runner');
    const { ensembleSentiment } = await import('@/lib/sentiment/ensemble');

    const ticker = `${TEST_TICKER_PREFIX}-C`;

    await runWithShadow(
      TEST_PATH,
      async () => ({ finsentllm_score: null, model_agreement: null }),
      async () => {
        const r = await ensembleSentiment('text');
        return { finsentllm_score: r.score, model_agreement: r.model_agreement };
      },
      'shadow',
      { ticker },
    );

    let row: { path_name: string } | null = null;
    for (let i = 0; i < 30 && !row; i++) {
      await new Promise(r => setTimeout(r, 100));
      row = await prisma.shadowComparison.findFirst({
        where: { path_name: TEST_PATH, ticker },
        orderBy: { created_at: 'desc' },
      });
    }
    expect(row).not.toBeNull();
    expect(row!.path_name).toBe(TEST_PATH);
  });

  it('off mode does not persist any ShadowComparison row', async () => {
    const { runWithShadow } = await import('@/lib/shadow/shadow-runner');

    const ticker = `${TEST_TICKER_PREFIX}-D`;

    const result = await runWithShadow(
      TEST_PATH,
      async () => ({ finsentllm_score: null, model_agreement: null }),
      async () => {
        throw new Error('new-fn should never run when mode=off');
      },
      'off',
      { ticker },
    );
    expect(result).toEqual({ finsentllm_score: null, model_agreement: null });

    // Wait briefly to be sure setImmediate didn't queue anything.
    await new Promise(r => setTimeout(r, 250));
    const rows = await prisma.shadowComparison.findMany({
      where: { path_name: TEST_PATH, ticker },
    });
    expect(rows).toHaveLength(0);
  });

  // The end-to-end Pearson ≥0.85 + ≥95% chatter-coverage gate runs
  // out-of-band against the production ShadowComparison table after the
  // shadow window drives ≥200 rows over 7d (Pitfall 4 cold-start window).
  it.todo(
    'shadow-verdict 19-C-02 reports Pearson ≥0.85 + ≥95% chatter coverage (run after 7d shadow window)',
  );
});
