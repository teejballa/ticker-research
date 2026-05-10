// Phase 19-Z-02 live-DB integration test — covers D-46 / D-47 / D-48.
//
// Verifies the consolidated additive migration `phase19_additive_columns_and_tables`
// applied to Neon:
//   1. ShadowComparison accepts inserts (path_name, latencies, costs, JSONB outputs)
//   2. RollbackLog accepts inserts (feature_flag + reason)
//   3. CommunityChatter unique constraint on (ticker, source, url, scraped_at) is enforced
//   4. LearnedPattern.parent_alpha / rolling_ic_20d / dsr default to NULL on existing rows
//   5. LearnedPattern accepts non-null writes to new Phase 19 columns
//   6. ShadowComparison index `(path_name, created_at DESC)` is present in pg_indexes
//
// Runs against a live DATABASE_URL via `npm run test:integration`. Skipped if no DB.

import { describe, it, expect, afterAll, afterEach } from 'vitest';
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

const HAS_DB = !!process.env.DATABASE_URL && /^postgres/i.test(process.env.DATABASE_URL ?? '');
const adapter = HAS_DB ? new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) : null;
const prisma = HAS_DB ? new PrismaClient({ adapter: adapter! }) : (null as unknown as PrismaClient);

const TEST_PATH_NAME = '19-z-02-test-path';
const TEST_FLAG = '19-z-02-test-flag';
const TEST_TICKER = 'PHASE19TST';
const TEST_SOURCE = 'phase19-test-source';

afterAll(async () => {
  if (HAS_DB) await prisma.$disconnect();
});

afterEach(async () => {
  if (!HAS_DB) return;
  await prisma.shadowComparison.deleteMany({ where: { path_name: TEST_PATH_NAME } });
  await prisma.rollbackLog.deleteMany({ where: { feature_flag: TEST_FLAG } });
  await prisma.communityChatter.deleteMany({ where: { ticker: TEST_TICKER } });
});

describe.skipIf(!HAS_DB)('Phase 19-Z-02 schema additions (live Neon)', () => {
  it('inserts ShadowComparison row and reads it back', async () => {
    const created = await prisma.shadowComparison.create({
      data: {
        path_name: TEST_PATH_NAME,
        ticker: 'AAPL',
        old_output_json: { a: 1 },
        new_output_json: { a: 2 },
        old_latency_ms: 120,
        new_latency_ms: 95,
        old_cost_usd: 0.0123,
        new_cost_usd: 0.0089,
      },
    });
    expect(created.id).toMatch(/^c[a-z0-9]+/); // cuid prefix
    expect(created.path_name).toBe(TEST_PATH_NAME);
    expect(created.old_latency_ms).toBe(120);
    expect(created.new_latency_ms).toBe(95);
    expect(created.old_cost_usd).toBeCloseTo(0.0123, 6);
    expect(created.new_cost_usd).toBeCloseTo(0.0089, 6);
    expect(created.created_at).toBeInstanceOf(Date);
    const fetched = await prisma.shadowComparison.findUnique({ where: { id: created.id } });
    expect(fetched).not.toBeNull();
    expect(fetched!.new_output_json).toEqual({ a: 2 });
  });

  it('inserts RollbackLog row and reads it back', async () => {
    const created = await prisma.rollbackLog.create({
      data: {
        feature_flag: TEST_FLAG,
        reason: 'integration-test',
      },
    });
    expect(created.id).toMatch(/^c[a-z0-9]+/);
    expect(created.feature_flag).toBe(TEST_FLAG);
    expect(created.reason).toBe('integration-test');
    expect(created.created_at).toBeInstanceOf(Date);
  });

  it('CommunityChatter unique constraint enforces (ticker, source, url, scraped_at)', async () => {
    const scraped_at = new Date('2026-05-07T15:00:00Z');
    const seed = {
      ticker: TEST_TICKER,
      source: TEST_SOURCE,
      url: 'https://example.com/post/1',
      raw_text: 'hello world',
      finsentllm_score: 0.42,
      reputation_weight: 1.0,
      scraped_at,
    } as const;
    const first = await prisma.communityChatter.create({ data: seed });
    expect(first.ticker).toBe(TEST_TICKER);
    expect(first.finsentllm_score).toBeCloseTo(0.42, 6);
    // Duplicate (same composite key) must throw a Prisma unique-constraint error.
    await expect(prisma.communityChatter.create({ data: seed })).rejects.toThrow();
    // A row with a different scraped_at on the same (ticker, source, url) is allowed.
    const second = await prisma.communityChatter.create({
      data: { ...seed, scraped_at: new Date('2026-05-07T16:00:00Z') },
    });
    expect(second.id).not.toBe(first.id);
  });

  it('LearnedPattern columns accept NULL on every Phase 19 column (column nullability check)', async () => {
    // Original intent: every additive Phase 19 column is nullable (verifies the
    // 19-Z-02 migration applied @nullable to each new field). Once
    // FEATURE_HIERARCHICAL_POOLING flips on, the daily learn cron writes
    // parent_alpha/parent_beta/shrinkage_strength on every cell, so a
    // direct row-value assertion no longer maps to "column nullability".
    //
    // Reframe: query Postgres' information_schema directly to confirm each
    // column allows NULL (which is the actual schema invariant under test).
    const cols: Array<{ column_name: string; is_nullable: string }> = await prisma.$queryRaw`
      SELECT column_name::text AS column_name, is_nullable::text AS is_nullable
      FROM information_schema.columns
      WHERE table_name = 'learned_patterns'
        AND column_name IN (
          'rolling_ic_20d', 'ic_decay_flag', 'dsr', 'pbo',
          'conformal_low', 'conformal_high',
          'parent_alpha', 'parent_beta', 'shrinkage_strength'
        )
    `;
    expect(cols.length).toBe(9);
    for (const c of cols) {
      expect(c.is_nullable).toBe('YES');
    }
  });

  it('LearnedPattern accepts non-null writes to new Phase 19 columns', async () => {
    const existing = await prisma.learnedPattern.findFirst({
      orderBy: { last_updated: 'desc' },
    });
    if (!existing) return;
    const before = {
      rolling_ic_20d: existing.rolling_ic_20d,
      ic_decay_flag: existing.ic_decay_flag,
      dsr: existing.dsr,
      pbo: existing.pbo,
      conformal_low: existing.conformal_low,
      conformal_high: existing.conformal_high,
      parent_alpha: existing.parent_alpha,
      parent_beta: existing.parent_beta,
      shrinkage_strength: existing.shrinkage_strength,
    };
    try {
      const updated = await prisma.learnedPattern.update({
        where: { id: existing.id },
        data: {
          rolling_ic_20d: 0.045,
          ic_decay_flag: true,
          dsr: 1.23,
          pbo: 0.18,
          conformal_low: 0.31,
          conformal_high: 0.69,
          parent_alpha: 2.5,
          parent_beta: 3.5,
          shrinkage_strength: 0.42,
        },
      });
      expect(updated.rolling_ic_20d).toBeCloseTo(0.045, 6);
      expect(updated.ic_decay_flag).toBe(true);
      expect(updated.dsr).toBeCloseTo(1.23, 6);
      expect(updated.pbo).toBeCloseTo(0.18, 6);
      expect(updated.conformal_low).toBeCloseTo(0.31, 6);
      expect(updated.conformal_high).toBeCloseTo(0.69, 6);
      expect(updated.parent_alpha).toBeCloseTo(2.5, 6);
      expect(updated.parent_beta).toBeCloseTo(3.5, 6);
      expect(updated.shrinkage_strength).toBeCloseTo(0.42, 6);
    } finally {
      // Restore original values so we don't poison production data.
      await prisma.learnedPattern.update({
        where: { id: existing.id },
        data: before,
      });
    }
  });

  it('ShadowComparison has index on (path_name, created_at DESC) per pg_indexes', async () => {
    const rows = await prisma.$queryRawUnsafe<{ indexname: string; indexdef: string }[]>(
      `SELECT indexname::text AS indexname, indexdef::text AS indexdef
       FROM pg_indexes
       WHERE tablename = 'ShadowComparison'
         AND indexname = 'ShadowComparison_path_name_created_at_idx'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toMatch(/path_name/);
    expect(rows[0].indexdef).toMatch(/created_at\s+DESC/);
  });
});
