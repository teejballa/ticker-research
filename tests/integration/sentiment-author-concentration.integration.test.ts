/**
 * Plan 20-A-04 — Integration test for author-concentration aggregator
 * + per-ticker Q1 calibration round-trip.
 *
 * Skips with documented reason when DATABASE_URL is unavailable so CI without
 * a live DB stays green. Covers:
 *
 *   Test 1: end-to-end Gini computation on seeded 5-author 24h window
 *   Test 2: n_authors<5 sentinel — aggregator returns null fields
 *   Test 3: AuthorShareCalibration round-trip — calibration script writes row,
 *           aggregator applies Q1-relative down-weight (×0.5)
 *   Test 4: PIT discipline — aggregator filters by fetched_at (NOT the
 *           upstream-claimed-timestamp). Static-source grep.
 *   Test 5: One cron-equivalent invocation inserts ≥1 row for test ticker.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe('Author-concentration via Gini (live Neon integration)', () => {
  // ─── Static-source PIT grep gate (runs even without DB) ───────────────────
  it('Test 4 [no-DB]: aggregator filters by fetched_at, not the upstream-claimed-timestamp', () => {
    const src = readFileSync(
      resolve(__dirname, '../../src/lib/sentiment/aggregator.ts'),
      'utf8',
    );
    // Strip comments before substring check — comments may legitimately
    // reference the banned identifier as documentation.
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(stripped).toContain('fetched_at');
    expect(stripped).not.toContain('published_at');
  });

  it('Test 4b [no-DB]: calibration script filters by fetched_at only', () => {
    const src = readFileSync(
      resolve(__dirname, '../../scripts/calibrate-author-share-thresholds.ts'),
      'utf8',
    );
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(stripped).toContain('fetched_at');
    expect(stripped).not.toContain('published_at');
  });

  if (!HAS_DB) {
    it.skip('SKIPPED: DATABASE_URL not set — live tests require Neon', () => {
      // Documented skip — CI without DB reports as skip, not failure.
    });
    return;
  }

  // ─── Live-DB tests below ──────────────────────────────────────────────────
  const TEST_TICKER = `TESTGINI_A04_${Date.now()}`;
  const TEST_MODEL_VERSION = 'gini-test-v1';

  it('Test 1: end-to-end Gini computation on a seeded 24h window (n=5 distinct authors)', async () => {
    process.env.FEATURE_AUTHOR_GINI = 'on';
    const { prisma } = await import('@/lib/db');
    const { computeAuthorConcentration } = await import(
      '@/lib/sentiment/aggregator'
    );

    // Seed 12 rows: author counts [5, 3, 2, 1, 1]
    const now = new Date();
    const plan = [
      { author: 'a1', n: 5 },
      { author: 'a2', n: 3 },
      { author: 'a3', n: 2 },
      { author: 'a4', n: 1 },
      { author: 'a5', n: 1 },
    ];
    let seq = 0;
    try {
      for (const p of plan) {
        for (let i = 0; i < p.n; i++) {
          await prisma.sentimentObservation.create({
            data: {
              ticker: TEST_TICKER,
              source: 'stocktwits',
              message_id: `gini-${TEST_TICKER}-${seq++}`,
              fetched_at: new Date(now.getTime() - i * 60_000),
              raw_body_hash: 'a'.repeat(64),
              classifier_version: 'fixture@v1',
              classifier_score: 0.5,
              author_id: `${TEST_TICKER}-${p.author}-hashed`,
              author_features_snapshot: {},
              model_version: TEST_MODEL_VERSION,
            },
          });
        }
      }

      const result = await computeAuthorConcentration(TEST_TICKER, now);
      expect(result.gini_coefficient).not.toBeNull();
      expect(result.author_concentration).not.toBeNull();
      expect(result.author_concentration!.length).toBeLessThanOrEqual(5);
      // Independent reference: gini of [5,3,2,1,1]
      // sorted = [1,1,2,3,5]; total=12; n=5
      // weightedSum = 1*1 + 2*1 + 3*2 + 4*3 + 5*5 = 1+2+6+12+25 = 46
      // G = (2*46)/(5*12) - 6/5 = 92/60 - 1.2 = 1.5333 - 1.2 = 0.3333
      expect(result.gini_coefficient!).toBeGreaterThan(0.2);
      expect(result.gini_coefficient!).toBeLessThan(0.5);
      // Top author should be a1 (5/12 = 0.417)
      expect(result.author_concentration![0].share).toBeCloseTo(5 / 12, 2);
    } finally {
      await prisma.sentimentObservation.deleteMany({
        where: { ticker: TEST_TICKER },
      });
      delete process.env.FEATURE_AUTHOR_GINI;
    }
  });

  it('Test 2: n_authors<5 returns null sentinel', async () => {
    process.env.FEATURE_AUTHOR_GINI = 'on';
    const { prisma } = await import('@/lib/db');
    const { computeAuthorConcentration } = await import(
      '@/lib/sentiment/aggregator'
    );

    const sparseTicker = `TESTGINI_SPARSE_${Date.now()}`;
    const now = new Date();
    try {
      for (let i = 0; i < 4; i++) {
        await prisma.sentimentObservation.create({
          data: {
            ticker: sparseTicker,
            source: 'stocktwits',
            message_id: `sparse-${i}`,
            fetched_at: new Date(now.getTime() - i * 60_000),
            raw_body_hash: 'b'.repeat(64),
            classifier_version: 'fixture@v1',
            classifier_score: 0.5,
            author_id: `sparse-author-${i}-hashed`,
            author_features_snapshot: {},
            model_version: TEST_MODEL_VERSION,
          },
        });
      }
      const result = await computeAuthorConcentration(sparseTicker, now);
      expect(result.gini_coefficient).toBeNull();
      expect(result.author_concentration).toBeNull();
    } finally {
      await prisma.sentimentObservation.deleteMany({
        where: { ticker: sparseTicker },
      });
      delete process.env.FEATURE_AUTHOR_GINI;
    }
  });

  it('Test 3: AuthorShareCalibration round-trip — Q1 down-weight applied', async () => {
    process.env.FEATURE_AUTHOR_GINI = 'on';
    const { prisma } = await import('@/lib/db');
    const { computeAuthorConcentration, AUTHOR_GINI_DOWNWEIGHT } = await import(
      '@/lib/sentiment/aggregator'
    );

    const roundTripTicker = `TESTGINI_RT_${Date.now()}`;
    const now = new Date();
    try {
      // Insert a calibration row with q1 = 0.10
      await prisma.authorShareCalibration.create({
        data: {
          ticker: roundTripTicker,
          q1_author_share_pct: 0.1,
          n_observations: 100,
          training_window_days: 90,
        },
      });

      // Seed observations: author A has 6/20 = 30% (> 0.10 → down-weight);
      // authors B/C/D/E/F each have a smaller share.
      const plan = [
        { author: 'A', n: 6 },
        { author: 'B', n: 4 },
        { author: 'C', n: 4 },
        { author: 'D', n: 3 },
        { author: 'E', n: 2 },
        { author: 'F', n: 1 },
      ];
      let seq = 0;
      for (const p of plan) {
        for (let i = 0; i < p.n; i++) {
          await prisma.sentimentObservation.create({
            data: {
              ticker: roundTripTicker,
              source: 'stocktwits',
              message_id: `rt-${roundTripTicker}-${seq++}`,
              fetched_at: new Date(now.getTime() - i * 60_000),
              raw_body_hash: 'c'.repeat(64),
              classifier_version: 'fixture@v1',
              classifier_score: 0.5,
              author_id: `${roundTripTicker}-${p.author}-hashed`,
              author_features_snapshot: {},
              model_version: TEST_MODEL_VERSION,
            },
          });
        }
      }

      const result = await computeAuthorConcentration(roundTripTicker, now);
      const aHash = `${roundTripTicker}-A-hashed`;
      const fHash = `${roundTripTicker}-F-hashed`;
      expect(result.weight_multipliers.get(aHash)).toBe(AUTHOR_GINI_DOWNWEIGHT);
      expect(result.weight_multipliers.get(fHash)).toBe(1.0);
    } finally {
      await prisma.sentimentObservation.deleteMany({
        where: { ticker: roundTripTicker },
      });
      await prisma.authorShareCalibration.deleteMany({
        where: { ticker: roundTripTicker },
      });
      delete process.env.FEATURE_AUTHOR_GINI;
    }
  });

  it('Test 5: cron-equivalent invocation inserts ≥1 calibration row', async () => {
    const { prisma } = await import('@/lib/db');
    const { calibrateAuthorShareThresholds } = await import(
      '@/../scripts/calibrate-author-share-thresholds'
    );

    const cronTicker = `TESTGINI_CRON_${Date.now()}`;
    const now = new Date();
    try {
      // Seed 5+ rows so the ticker passes minObservations gate (we pass 1 below).
      for (let i = 0; i < 5; i++) {
        await prisma.sentimentObservation.create({
          data: {
            ticker: cronTicker,
            source: 'stocktwits',
            message_id: `cron-${i}`,
            fetched_at: new Date(now.getTime() - i * 60_000),
            raw_body_hash: 'd'.repeat(64),
            classifier_version: 'fixture@v1',
            classifier_score: 0.5,
            author_id: `cron-author-${i}-hashed`,
            author_features_snapshot: {},
            model_version: TEST_MODEL_VERSION,
          },
        });
      }

      const result = await calibrateAuthorShareThresholds({
        minObservations: 1,
        trainingWindowDays: 90,
      });
      expect(result.rows_inserted).toBeGreaterThanOrEqual(1);

      const persisted = await prisma.authorShareCalibration.findFirst({
        where: { ticker: cronTicker },
      });
      expect(persisted).not.toBeNull();
      expect(persisted!.q1_author_share_pct).toBeGreaterThanOrEqual(0);
      expect(persisted!.q1_author_share_pct).toBeLessThanOrEqual(1);
    } finally {
      await prisma.sentimentObservation.deleteMany({
        where: { ticker: cronTicker },
      });
      await prisma.authorShareCalibration.deleteMany({
        where: { ticker: cronTicker },
      });
    }
  });
});
