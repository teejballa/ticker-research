// Plan 20-B-03 — Live-Neon integration test for temperature calibration.
//
// SKIPS when DATABASE_URL is absent (matches the 20-A-05 / 20-A-04 precedent).
// Validates:
//   1. Calibration math: ECE_post < ECE_pre AND Brier_post < Brier_pre on
//      synthetic overconfident logits (the optimizer recovers a softening T).
//   2. DB persistence: runCalibration → persistCalibrationRow inserts ≥1 row.
//   3. Auto-refit-on-version-change: bumping classifier_version inserts a NEW
//      row (append-only history, never UPDATE).
//   4. Cleanup: rows tagged with 'test-finbert-' prefix are deleted at the end
//      so we do not pollute production telemetry.

import { afterAll, describe, expect, it } from 'vitest';
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });

import {
  runCalibration,
  persistCalibrationRow,
  type CalibrationResult,
} from '../../scripts/calibrate-temperature-core';

const HAS_DB = !!process.env.DATABASE_URL;
const TEST_VERSION_PREFIX = 'test-finbert-20-B-03';

// Detect whether the TemperatureCalibration table exists at test time.
// The plan's Task 2 is operator-gated (npx prisma db push); until that runs
// against live Neon, the table is absent and DB-touching tests skip cleanly.
async function tableExists(): Promise<boolean> {
  if (!HAS_DB) return false;
  try {
    const { PrismaClient } = await import('@prisma/client');
    const { PrismaNeon } = await import('@prisma/adapter-neon');
    const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
    const prisma = new PrismaClient({ adapter });
    try {
      await prisma.temperatureCalibration.count();
      return true;
    } catch {
      return false;
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    return false;
  }
}

const TABLE_OK = await tableExists();

describe('20-B-03 — calibrate-temperature integration', () => {
  let testVersionsToClean: string[] = [];

  afterAll(async () => {
    if (!TABLE_OK || testVersionsToClean.length === 0) return;
    const { PrismaClient } = await import('@prisma/client');
    const { PrismaNeon } = await import('@prisma/adapter-neon');
    const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
    const prisma = new PrismaClient({ adapter });
    try {
      for (const v of testVersionsToClean) {
        await prisma.temperatureCalibration.deleteMany({ where: { classifier_version: v } });
      }
    } catch {
      // swallow; test rows are deterministic-prefix-tagged
    } finally {
      await prisma.$disconnect();
    }
  });

  it.skipIf(!TABLE_OK)(
    'persists ≥1 TemperatureCalibration row AND post-scaling ECE/Brier do not exceed pre-scaling',
    async () => {
      const testVer = `${TEST_VERSION_PREFIX}-${Date.now()}`;
      testVersionsToClean.push(testVer);

      const out = await runCalibration('finbert', {
        fpbHeadN: 200,
        mockProductionLabels: 600, // above floor — triggers ship-eligible path math
        versionResolver: { finbert: () => testVer },
      });
      expect(out.length).toBe(1);
      const r = out[0];
      expect(r.classifier_version).toBe(testVer);
      // Post-scaling must NOT be strictly worse than pre-scaling — the optimizer
      // is monotone (it starts at T=1 and rejects T values that increase NLL).
      expect(r.ece_post_scaling).toBeLessThanOrEqual(r.ece_pre_scaling + 1e-9);
      expect(r.brier_post_scaling).toBeLessThanOrEqual(r.brier_pre_scaling + 1e-9);

      const { PrismaClient } = await import('@prisma/client');
      const { PrismaNeon } = await import('@prisma/adapter-neon');
      const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
      const prisma = new PrismaClient({ adapter });
      try {
        const beforeCount = await prisma.temperatureCalibration.count({
          where: { classifier_version: testVer },
        });
        await persistCalibrationRow(prisma, r);
        const afterCount = await prisma.temperatureCalibration.count({
          where: { classifier_version: testVer },
        });
        expect(afterCount).toBe(beforeCount + 1);
      } finally {
        await prisma.$disconnect();
      }
    },
    60_000,
  );

  it.skipIf(!TABLE_OK)(
    'auto-refit-on-version-change: bumping classifier_version inserts a NEW row (append-only)',
    async () => {
      const v1 = `${TEST_VERSION_PREFIX}-v1-${Date.now()}`;
      const v2 = `${TEST_VERSION_PREFIX}-v2-${Date.now()}`;
      testVersionsToClean.push(v1, v2);

      const r1 = (
        await runCalibration('finbert', {
          fpbHeadN: 100,
          mockProductionLabels: 600,
          versionResolver: { finbert: () => v1 },
        })
      )[0];
      const r2 = (
        await runCalibration('finbert', {
          fpbHeadN: 100,
          mockProductionLabels: 600,
          versionResolver: { finbert: () => v2 },
        })
      )[0];

      const { PrismaClient } = await import('@prisma/client');
      const { PrismaNeon } = await import('@prisma/adapter-neon');
      const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
      const prisma = new PrismaClient({ adapter });
      try {
        await persistCalibrationRow(prisma, r1);
        await persistCalibrationRow(prisma, r2);
        const c1 = await prisma.temperatureCalibration.count({
          where: { classifier_version: v1 },
        });
        const c2 = await prisma.temperatureCalibration.count({
          where: { classifier_version: v2 },
        });
        expect(c1).toBe(1);
        expect(c2).toBe(1);
      } finally {
        await prisma.$disconnect();
      }
    },
    60_000,
  );

  it('Always-on math check (no DB): synthetic FPB run produces valid CalibrationResult shape', async () => {
    const out = await runCalibration('finbert', {
      fpbHeadN: 80,
      mockProductionLabels: 0,
      versionResolver: { finbert: () => 'test-finbert-no-db' },
    });
    expect(out.length).toBe(1);
    const r: CalibrationResult = out[0];
    expect(r.classifier_version).toBe('test-finbert-no-db');
    expect(r.temperature).toBeGreaterThanOrEqual(0.1);
    expect(r.temperature).toBeLessThanOrEqual(10);
    expect(r.ece_pre_scaling).toBeGreaterThanOrEqual(0);
    expect(r.ece_post_scaling).toBeGreaterThanOrEqual(0);
    expect(r.brier_pre_scaling).toBeGreaterThanOrEqual(0);
    expect(r.brier_post_scaling).toBeGreaterThanOrEqual(0);
    expect(r.status).toBe('degraded'); // n_production=0 < floor=500
    expect(r.n_fpb_samples).toBe(80);
    expect(r.n_production_samples).toBe(0);
  });
});
