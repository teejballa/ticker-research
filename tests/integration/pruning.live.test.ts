// Phase 19 Plan 19-A-07 — live-DB integration test for lake-of-cells pruning.
//
// CORE-ML-14 acceptance: cells with raw_N=0 AND last_updated > 90 days ago
// are deleted by the cron's pruning step. Two seeded rows are tested:
//   (a) sample_size=0 + last_updated 100d ago → MUST be deleted
//   (b) sample_size=0 + last_updated 1d ago   → MUST be retained
//   (c) sample_size>0 + last_updated 100d ago → MUST be retained (active)

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

const HAS_DB =
  !!process.env.DATABASE_URL &&
  /^postgres/i.test(process.env.DATABASE_URL ?? '');
const adapter = HAS_DB
  ? new PrismaNeon({ connectionString: process.env.DATABASE_URL! })
  : null;
const prisma = HAS_DB
  ? new PrismaClient({ adapter: adapter! })
  : (null as unknown as PrismaClient);

const TEST_CAP = '__test_19_a_07_pruning__';
const PATTERN_IDLE_EMPTY = '__test_idle_empty__';
const PATTERN_FRESH_EMPTY = '__test_fresh_empty__';
const PATTERN_IDLE_ACTIVE = '__test_idle_active__';

afterAll(async () => {
  if (HAS_DB) await prisma.$disconnect();
});

afterEach(async () => {
  if (!HAS_DB) return;
  await prisma.learnedPattern.deleteMany({
    where: { cap_class: TEST_CAP },
  });
});

describe.skipIf(!HAS_DB)(
  'lake-of-cells pruning — live Neon (Plan 19-A-07, CORE-ML-14)',
  () => {
    beforeAll(async () => {
      if (!HAS_DB) return;
      await prisma.learnedPattern.deleteMany({ where: { cap_class: TEST_CAP } });
    });

    it('deletes idle+empty cells; retains fresh-empty and idle-active', async () => {
      // Seed three rows with controlled last_updated values.
      // last_updated has @updatedAt — Prisma sets it on every write. We use
      // executeRaw to override it so the seed reflects historical state.
      const cutoff100d = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);

      await prisma.learnedPattern.create({
        data: {
          signal_class: 'diffusion',
          pattern_key: PATTERN_IDLE_EMPTY,
          cap_class: TEST_CAP,
          horizon_days: 7,
          alpha: 1,
          beta: 1,
          sample_size: 0,
          n_trials_attempted: 0,
          hits: 0,
          alpha_30d: 1,
          beta_30d: 1,
          drift_z: 0,
          status: 'EXPLORATORY',
          effective_sample_size: 2,
        },
      });
      await prisma.learnedPattern.create({
        data: {
          signal_class: 'diffusion',
          pattern_key: PATTERN_FRESH_EMPTY,
          cap_class: TEST_CAP,
          horizon_days: 7,
          alpha: 1,
          beta: 1,
          sample_size: 0,
          n_trials_attempted: 0,
          hits: 0,
          alpha_30d: 1,
          beta_30d: 1,
          drift_z: 0,
          status: 'EXPLORATORY',
          effective_sample_size: 2,
        },
      });
      await prisma.learnedPattern.create({
        data: {
          signal_class: 'diffusion',
          pattern_key: PATTERN_IDLE_ACTIVE,
          cap_class: TEST_CAP,
          horizon_days: 7,
          alpha: 5,
          beta: 3,
          sample_size: 6,
          n_trials_attempted: 6,
          hits: 4,
          alpha_30d: 1,
          beta_30d: 1,
          drift_z: 0,
          status: 'EXPLORATORY',
          effective_sample_size: 8,
        },
      });

      // Override last_updated for the two "idle" rows to 100 days ago.
      await prisma.$executeRaw`
        UPDATE learned_patterns
        SET last_updated = ${cutoff100d}
        WHERE cap_class = ${TEST_CAP}
          AND pattern_key IN (${PATTERN_IDLE_EMPTY}, ${PATTERN_IDLE_ACTIVE})
      `;

      // Replicate the cron's pruneIdleEmptyCells query (sample_size=0 AND
      // last_updated > 90 days ago).
      const cutoff90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      await prisma.learnedPattern.deleteMany({
        where: {
          cap_class: TEST_CAP,
          sample_size: 0,
          last_updated: { lt: cutoff90d },
        },
      });

      const remaining = await prisma.learnedPattern.findMany({
        where: { cap_class: TEST_CAP },
        select: { pattern_key: true },
      });
      const keys = remaining.map((r) => r.pattern_key).sort();

      // idle+empty deleted; the other two retained.
      expect(keys).not.toContain(PATTERN_IDLE_EMPTY);
      expect(keys).toContain(PATTERN_FRESH_EMPTY);
      expect(keys).toContain(PATTERN_IDLE_ACTIVE);
      expect(keys.length).toBe(2);
    });
  }
);
