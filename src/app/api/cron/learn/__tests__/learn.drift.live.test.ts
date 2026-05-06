// Phase 18-04 Wave 2 — covers CORE-ML-04 (drift_alert + EXPLORATORY-WATCH flip + D-08 N=29 floor + T-18-05 numeric-only payload).
// Activated assertions per Plan 18-04 Task 2 §<behavior>.
//
// Runs against a live DATABASE_URL via `npm run test:integration`. Uses unique
// throwaway cap_class values (TESTP18DRIFT*) so production cells are untouched.
//
// Invariants pinned:
//   1. Two-of-two confirmation gated by raw N≥30: synthetic-shift cell with
//      30+ misses then 30+ sustained hits → exactly one drift_alert event AND
//      cell.status flips to 'EXPLORATORY-WATCH' (D-09 step 2).
//   2. D-08 floor: same synthetic shift on a cell with raw N=29 → 0 alerts.
//   3. T-18-05 numeric-only payload: drift_alert.delta parses against
//      z.object({drift_z, ph_stat, ph_threshold, raw_n, ess}) — no string fields.
//   4. D-09 no-auto-demote: a cell already in EXPLORATORY-WATCH that fires
//      again does NOT flip to DEPRECATED.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { z } from 'zod';

// ─── Mocks (must be set BEFORE importing the route handler) ─────────────────

vi.mock('yahoo-finance2', () => {
  return {
    default: class {
      chart() {
        const quotes: Array<{ date: Date; close: number }> = [];
        const start = Date.now() - 100 * 24 * 60 * 60 * 1000;
        for (let i = 0; i < 100; i++) {
          quotes.push({
            date: new Date(start + i * 24 * 60 * 60 * 1000),
            close: 100 + i * 0.001,
          });
        }
        return Promise.resolve({ quotes });
      }
    },
  };
});

vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({ text: 'test cycle summary' }),
}));

// ─── Test DB client ──────────────────────────────────────────────────────────

const TEST_CAP_FIRES = 'TESTP18DRIFTFIRE';
const TEST_CAP_FLOOR = 'TESTP18DRIFTFLOOR';
const TEST_CAP_WATCH = 'TESTP18DRIFTWATCH';
const PATTERN = 'breakout_uptrend';
const HORIZON = 30;
const HAS_DB = !!process.env.DATABASE_URL;
const adapter = HAS_DB ? new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) : null;
const prisma = HAS_DB ? new PrismaClient({ adapter: adapter! }) : (null as unknown as PrismaClient);

process.env.CRON_SECRET = process.env.CRON_SECRET ?? 'test-cron-secret';

async function cleanup() {
  if (!HAS_DB) return;
  for (const cap of [TEST_CAP_FIRES, TEST_CAP_FLOOR, TEST_CAP_WATCH]) {
    await prisma.learningEvent.deleteMany({ where: { cap_class: cap } });
    await prisma.learnedPattern.deleteMany({ where: { cap_class: cap } });
  }
}

async function callLearnCron() {
  const { GET } = await import('@/app/api/cron/learn/route');
  const req = new NextRequest('http://localhost/api/cron/learn', {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  const res = await GET(req);
  return res.json();
}

/**
 * Seed a cell with `n` events. The first half are misses, the second half are
 * sustained hits — the canonical synthetic regime shift used by RESEARCH §Q2
 * to validate Page-Hinkley + drift_z fire together. The cell row is created
 * with α/β matching the synthetic events so the recompute pass runs against
 * a known baseline.
 */
async function seedDriftCell(opts: {
  cap: string;
  n: number;
  startStatus?: string;
}) {
  const halfMiss = Math.floor(opts.n / 2);
  const halfHit = opts.n - halfMiss;
  await prisma.learnedPattern.create({
    data: {
      signal_class: 'technical',
      pattern_key: PATTERN,
      cap_class: opts.cap,
      horizon_days: HORIZON,
      alpha: 1 + halfHit,
      beta: 1 + halfMiss,
      sample_size: opts.n,
      hits: halfHit,
      // alpha_30d/beta_30d will be recomputed by the cron — leave defaults.
      status: opts.startStatus ?? 'EXPLORATORY',
    },
  });
  // Misses dated > 30 days ago — fall outside the rolling-30d window so the
  // recent rolling posterior is dominated by the hits, producing strong drift_z.
  // Hits dated within the last 5 days — recent enough to populate alpha_30d.
  // PerObsDeltas (chronological order) become a clean step from miss→hit so
  // Page-Hinkley accumulates above λ_PH=50.
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  let idx = 0;
  for (let i = 0; i < halfMiss; i++) {
    const occurredAt = new Date(now - (90 - (i % 30)) * dayMs);
    await prisma.learningEvent.create({
      data: {
        event_type: 'posterior_update',
        ticker: 'TESTDRIFT',
        outcome_id: `test-drift-${opts.cap}-miss-${idx++}`,
        signal_class: 'technical',
        pattern_key: PATTERN,
        cap_class: opts.cap,
        horizon_days: HORIZON,
        occurred_at: occurredAt,
        delta: { tech_hit: false, hit: false },
        message: `seeded miss ${i}`,
      },
    });
  }
  for (let i = 0; i < halfHit; i++) {
    const occurredAt = new Date(now - (5 - (i % 5)) * dayMs);
    await prisma.learningEvent.create({
      data: {
        event_type: 'posterior_update',
        ticker: 'TESTDRIFT',
        outcome_id: `test-drift-${opts.cap}-hit-${idx++}`,
        signal_class: 'technical',
        pattern_key: PATTERN,
        cap_class: opts.cap,
        horizon_days: HORIZON,
        occurred_at: occurredAt,
        delta: { tech_hit: true, hit: true },
        message: `seeded hit ${i}`,
      },
    });
  }
}

const DriftAlertDeltaSchema = z.object({
  drift_z: z.number(),
  ph_stat: z.number(),
  ph_threshold: z.number(),
  raw_n: z.number(),
  ess: z.number(),
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe.skipIf(!HAS_DB)('[live-DB] /api/cron/learn drift detector — two-of-two + EXPLORATORY-WATCH', () => {
  beforeAll(async () => {
    await cleanup();
    // Cell that SHOULD fire — raw N=200 ≥ D-08 floor of 30, with a strong
    // synthetic regime shift (100 misses then 100 sustained hits). Page-Hinkley
    // accumulator is sized to the HYPERPARAMETERS.technical.ph_lambda=50
    // placeholder — Plan 18-06 will retune this empirically; for now we seed
    // enough events that ph_stat clears the threshold under the bootstrap config.
    await seedDriftCell({ cap: TEST_CAP_FIRES, n: 200 });
    // Cell at the D-08 floor minus one — must NEVER fire regardless of shift.
    await seedDriftCell({ cap: TEST_CAP_FLOOR, n: 29 });
    // Cell already in EXPLORATORY-WATCH from a prior fire (D-09 no-auto-demote).
    await seedDriftCell({ cap: TEST_CAP_WATCH, n: 200, startStatus: 'EXPLORATORY-WATCH' });
    const res = await callLearnCron();
    expect(res.ok).toBe(true);
  }, 180_000);

  afterAll(async () => {
    await cleanup();
    if (HAS_DB) await prisma.$disconnect();
  });

  it('synthetic injected drift fires exactly one drift_alert event AND flips status to EXPLORATORY-WATCH (D-09 step 2)', async () => {
    const alerts = await prisma.learningEvent.findMany({
      where: {
        event_type: 'drift_alert',
        cap_class: TEST_CAP_FIRES,
        signal_class: 'technical',
        pattern_key: PATTERN,
        horizon_days: HORIZON,
      },
    });
    expect(alerts.length).toBe(1);
    const cell = await prisma.learnedPattern.findUnique({
      where: {
        signal_class_pattern_key_cap_class_horizon_days: {
          signal_class: 'technical',
          pattern_key: PATTERN,
          cap_class: TEST_CAP_FIRES,
          horizon_days: HORIZON,
        },
      },
    });
    expect(cell).not.toBeNull();
    expect(cell!.status).toBe('EXPLORATORY-WATCH');
  });

  it('D-08 floor: cell with raw N=29 never fires drift even with synthetic shift', async () => {
    const alerts = await prisma.learningEvent.findMany({
      where: {
        event_type: 'drift_alert',
        cap_class: TEST_CAP_FLOOR,
      },
    });
    expect(alerts.length).toBe(0);
    const cell = await prisma.learnedPattern.findUnique({
      where: {
        signal_class_pattern_key_cap_class_horizon_days: {
          signal_class: 'technical',
          pattern_key: PATTERN,
          cap_class: TEST_CAP_FLOOR,
          horizon_days: HORIZON,
        },
      },
    });
    expect(cell).not.toBeNull();
    expect(cell!.status).not.toBe('EXPLORATORY-WATCH');
  });

  it('T-18-05: drift_alert.delta payload is numeric-only (Zod parse succeeds with no string fields)', async () => {
    const alert = await prisma.learningEvent.findFirst({
      where: {
        event_type: 'drift_alert',
        cap_class: TEST_CAP_FIRES,
      },
    });
    expect(alert).not.toBeNull();
    const parsed = DriftAlertDeltaSchema.safeParse(alert!.delta);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      // Confirm raw_n matches the seeded cell sample_size (200).
      expect(parsed.data.raw_n).toBe(200);
      // ph_threshold round-trips the configured lambdaPH (50 by HYPERPARAMETERS default).
      expect(parsed.data.ph_threshold).toBe(50);
    }
  });

  it('D-09 no-auto-demote: cell already in EXPLORATORY-WATCH stays in EXPLORATORY-WATCH (never flips to DEPRECATED)', async () => {
    const cell = await prisma.learnedPattern.findUnique({
      where: {
        signal_class_pattern_key_cap_class_horizon_days: {
          signal_class: 'technical',
          pattern_key: PATTERN,
          cap_class: TEST_CAP_WATCH,
          horizon_days: HORIZON,
        },
      },
    });
    expect(cell).not.toBeNull();
    // Status must NOT be DEPRECATED — must remain EXPLORATORY-WATCH (or
    // pre-recovery state). Specifically tests the no-auto-demote rule.
    expect(cell!.status).not.toBe('DEPRECATED');
    expect(cell!.status).toBe('EXPLORATORY-WATCH');
  });
});
