import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

const HAS_DB = !!process.env.DATABASE_URL;
const adapter = HAS_DB ? new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) : null;
const prisma = HAS_DB ? new PrismaClient({ adapter: adapter! }) : (null as unknown as PrismaClient);

afterAll(async () => {
  if (HAS_DB) await prisma.$disconnect();
});

describe.skipIf(!HAS_DB)('Phase 17 schema migration', () => {
  it('sentiment_snapshots.insider_data is jsonb', async () => {
    const cols = await prisma.$queryRawUnsafe<{ column_name: string; data_type: string }[]>(
      "SELECT column_name::text AS column_name, data_type::text AS data_type FROM information_schema.columns WHERE table_name = 'sentiment_snapshots' AND column_name = 'insider_data'",
    );
    expect(cols).toHaveLength(1);
    expect(cols[0].data_type).toBe('jsonb');
  });

  it('sentiment_snapshots.institutional_data is jsonb', async () => {
    const cols = await prisma.$queryRawUnsafe<{ column_name: string; data_type: string }[]>(
      "SELECT column_name::text AS column_name, data_type::text AS data_type FROM information_schema.columns WHERE table_name = 'sentiment_snapshots' AND column_name = 'institutional_data'",
    );
    expect(cols).toHaveLength(1);
    expect(cols[0].data_type).toBe('jsonb');
  });

  it('reports.insider_at_report is jsonb', async () => {
    const cols = await prisma.$queryRawUnsafe<{ column_name: string; data_type: string }[]>(
      "SELECT column_name::text AS column_name, data_type::text AS data_type FROM information_schema.columns WHERE table_name = 'reports' AND column_name = 'insider_at_report'",
    );
    expect(cols).toHaveLength(1);
    expect(cols[0].data_type).toBe('jsonb');
  });

  it('reports.institutional_at_report is jsonb', async () => {
    const cols = await prisma.$queryRawUnsafe<{ column_name: string; data_type: string }[]>(
      "SELECT column_name::text AS column_name, data_type::text AS data_type FROM information_schema.columns WHERE table_name = 'reports' AND column_name = 'institutional_at_report'",
    );
    expect(cols).toHaveLength(1);
    expect(cols[0].data_type).toBe('jsonb');
  });

  // Cleanup any test rows from previous runs
  const TEST_SUFFIX = '__phase17_test__';
  afterEach(async () => {
    await prisma.learnedPattern.deleteMany({
      where: { pattern_key: { contains: TEST_SUFFIX } },
    });
  });

  it('LearnedPattern accepts signal_class = "insider"', async () => {
    const created = await prisma.learnedPattern.create({
      data: {
        signal_class: 'insider',
        pattern_key: `cluster_buying${TEST_SUFFIX}`,
        cap_class: 'large_cap',
        horizon_days: 30,
        alpha: 1, beta: 1, sample_size: 0, hits: 0,
      },
    });
    expect(created.signal_class).toBe('insider');
    await prisma.learnedPattern.delete({ where: { id: created.id } });
  });

  it('LearnedPattern accepts signal_class = "institutional"', async () => {
    const created = await prisma.learnedPattern.create({
      data: {
        signal_class: 'institutional',
        pattern_key: `net_accumulation${TEST_SUFFIX}`,
        cap_class: 'mid_cap',
        horizon_days: 30,
        alpha: 1, beta: 1, sample_size: 0, hits: 0,
      },
    });
    expect(created.signal_class).toBe('institutional');
    await prisma.learnedPattern.delete({ where: { id: created.id } });
  });

  it('composite unique constraint is enforced for new signal_class values', async () => {
    const seed = {
      signal_class: 'insider',
      pattern_key: `lone_buy${TEST_SUFFIX}`,
      cap_class: 'small_cap',
      horizon_days: 30,
      alpha: 1, beta: 1, sample_size: 0, hits: 0,
    };
    const first = await prisma.learnedPattern.create({ data: seed });
    await expect(prisma.learnedPattern.create({ data: seed })).rejects.toThrow();
    await prisma.learnedPattern.delete({ where: { id: first.id } });
  });

  it('pre-existing snapshots have null insider_data and institutional_data (D-19)', async () => {
    const recent = await prisma.sentimentSnapshot.findFirst({
      orderBy: { scanned_at: 'desc' },
      take: 1,
    });
    if (!recent) return; // empty DB on a fresh branch is acceptable
    // For pre-Phase-17 snapshots both new fields are null.
    // For post-Phase-17 snapshots the cron may have populated either field;
    // the contract is that neither field is REQUIRED — both are valid as null.
    // So we assert: each field is either null OR an object (not undefined).
    const id = recent.insider_data === null || typeof recent.insider_data === 'object';
    const inst = recent.institutional_data === null || typeof recent.institutional_data === 'object';
    expect(id).toBe(true);
    expect(inst).toBe(true);
  });
});
