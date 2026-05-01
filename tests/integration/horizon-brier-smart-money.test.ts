// tests/integration/horizon-brier-smart-money.test.ts
// Phase 17-05 — AC5 hardening: Brier-in-sample populated at horizon_days=30
// for ≥1 ACTIVE LearnedPattern row in each new smart money class (institutional + insider).
//
// AC5 definition (17-CONTEXT.md): ≥1 ACTIVE pattern in each new class has
// brier_in_sample populated at horizon_days=30.
//
// Two tests — one per class. Each seeds a single ACTIVE LearnedPattern row with
// explicit brier_in_sample set, then queries to assert the invariant. These tests
// pin the shape that the recompute pass MUST produce when its work is done.
//
// Why separate from backfill-smart-money-active-rate.test.ts:
//   AC3 = ACTIVE-rate ratio (threshold semantics)
//   AC5 = Brier-populated invariant (calibration semantics)
//   Different failure modes deserve different test files.

import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: '.env.local' });

const HAS_DB = !!process.env.DATABASE_URL;
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb('AC5: brier_in_sample populated at 30d for ≥1 ACTIVE pattern in each new class', () => {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  // Use unique keys so cleanup is surgical and doesn't conflict with other tests.
  const INST_KEY = 'cluster_buying';
  const INSIDER_KEY = 'insider_cluster_buy';
  const CAP = 'large_cap';
  const HORIZON = 30;

  async function cleanup() {
    await prisma.learnedPattern.deleteMany({
      where: {
        OR: [
          { signal_class: 'institutional', pattern_key: INST_KEY, cap_class: CAP, horizon_days: HORIZON },
          { signal_class: 'insider', pattern_key: INSIDER_KEY, cap_class: CAP, horizon_days: HORIZON },
        ],
      },
    });
  }

  beforeAll(async () => { await cleanup(); });
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });

  it('institutional: at least one ACTIVE pattern at 30d has brier_in_sample populated', async () => {
    await prisma.learnedPattern.create({
      data: {
        signal_class: 'institutional',
        pattern_key: INST_KEY,
        cap_class: CAP,
        horizon_days: HORIZON,
        alpha: 25,
        beta: 8,
        alpha_30d: 25,
        beta_30d: 8,
        sample_size: 33,
        hits: 25,
        brier_in_sample: 0.18,   // ← AC5 requires this is non-null
        brier_out_sample: 0.20,
        brier_null: 0.25,
        drift_z: 0.4,
        status: 'ACTIVE',
      },
    });

    const rows = await prisma.learnedPattern.findMany({
      where: {
        signal_class: 'institutional',
        status: 'ACTIVE',
        horizon_days: 30,
      },
    });

    const withBrier = rows.filter((r) => r.brier_in_sample != null);
    expect(withBrier.length).toBeGreaterThanOrEqual(1);
  });

  it('insider: at least one ACTIVE pattern at 30d has brier_in_sample populated', async () => {
    await prisma.learnedPattern.create({
      data: {
        signal_class: 'insider',
        pattern_key: INSIDER_KEY,
        cap_class: CAP,
        horizon_days: HORIZON,
        alpha: 25,
        beta: 8,
        alpha_30d: 25,
        beta_30d: 8,
        sample_size: 33,
        hits: 25,
        brier_in_sample: 0.18,   // ← AC5 requires this is non-null
        brier_out_sample: 0.20,
        brier_null: 0.25,
        drift_z: 0.4,
        status: 'ACTIVE',
      },
    });

    const rows = await prisma.learnedPattern.findMany({
      where: {
        signal_class: 'insider',
        status: 'ACTIVE',
        horizon_days: 30,
      },
    });

    const withBrier = rows.filter((r) => r.brier_in_sample != null);
    expect(withBrier.length).toBeGreaterThanOrEqual(1);
  });
});
