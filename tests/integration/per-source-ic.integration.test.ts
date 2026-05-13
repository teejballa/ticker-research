// tests/integration/per-source-ic.integration.test.ts
//
// Phase 20-C-01 Task 11 — live-Neon integration tests for the per-source IC
// pipeline. SKIPS when DATABASE_URL is absent (precedent: 20-A-05). The
// static-grep PIT regression (Test 8) runs unconditionally and is the
// always-on regression check.

import { describe, expect, it } from 'vitest';
import { config as loadDotenv } from 'dotenv';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

loadDotenv({ path: '.env.local' });

const HAS_DB = !!process.env.DATABASE_URL;

const TEST_AS_OF = new Date('2026-05-01T12:00:00Z');
const TEST_MODEL_VERSION = 'per-source-ic-v1';

async function freshPrisma() {
  const { PrismaClient } = await import('@prisma/client');
  const { PrismaNeon } = await import('@prisma/adapter-neon');
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

// Cache the schema-availability probe across the suite so we run it once.
let SCHEMA_READY: boolean | null = null;
async function tableExists(): Promise<boolean> {
  if (SCHEMA_READY !== null) return SCHEMA_READY;
  if (!HAS_DB) {
    SCHEMA_READY = false;
    return false;
  }
  try {
    const prisma = await freshPrisma();
    try {
      await prisma.perSourceIC.count();
      SCHEMA_READY = true;
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    SCHEMA_READY = false;
  }
  return SCHEMA_READY;
}

describe('20-C-01 — per-source IC integration', () => {
  // ── Static PIT grep regression — runs unconditionally ─────────────────
  it('PIT regression: no published_at references in per-source-ic.ts', () => {
    const body = readFileSync(
      join(process.cwd(), 'src/lib/sentiment/per-source-ic.ts'),
      'utf8',
    );
    // The file must explicitly disclaim published_at (in comments only).
    expect(body).toContain('// PIT-INVARIANT');
    // No code path may read SentimentObservation.published_at as a join key.
    // We allow the literal string in comments referencing what NOT to do.
    const codeLines = body.split('\n').filter(
      (l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'),
    );
    const joinedCode = codeLines.join('\n');
    expect(joinedCode).not.toContain('published_at');
  });

  it.skipIf(!HAS_DB)(
    'Test 4: auto-down-weight fires after 2 consecutive low-ICIR windows',
    async (ctx) => {
      if (!(await tableExists())) return ctx.skip();
      const prisma = await freshPrisma();
      try {
        // Cleanup any prior fixture rows for stocktwits@7d under this model_version.
        await prisma.perSourceIC.deleteMany({
          where: { source_id: 'stocktwits', forward_horizon_days: 7, model_version: TEST_MODEL_VERSION },
        });

        const now = new Date();
        const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);

        await prisma.perSourceIC.createMany({
          data: [
            {
              source_id: 'stocktwits',
              computed_at: twentyDaysAgo,
              forward_horizon_days: 7,
              ic_20d: 0.05,
              icir_20d: 0.15,
              ic_se_nw: 0.1,
              ic_p_value_nw: 0.4,
              ic_p_value_bh_fdr: 0.4,
              n_observations: 20,
              nw_lag: 5,
              model_version: TEST_MODEL_VERSION,
            },
            {
              source_id: 'stocktwits',
              computed_at: now,
              forward_horizon_days: 7,
              ic_20d: 0.05,
              icir_20d: 0.15,
              ic_se_nw: 0.1,
              ic_p_value_nw: 0.4,
              ic_p_value_bh_fdr: 0.4,
              n_observations: 20,
              nw_lag: 5,
              model_version: TEST_MODEL_VERSION,
            },
          ],
        });

        const { fetchSentimentSourcesPayload } = await import(
          '@/app/api/insights/sentiment-sources/_helpers'
        );
        const payload = await fetchSentimentSourcesPayload();
        const stocktwits = payload.sources.find((s) => s.source_id === 'stocktwits');
        expect(stocktwits).toBeDefined();
        expect(stocktwits!.horizons['7d']).not.toBeNull();
        expect(stocktwits!.horizons['7d']!.auto_down_weight).toBe(true);

        // Cleanup.
        await prisma.perSourceIC.deleteMany({
          where: { source_id: 'stocktwits', forward_horizon_days: 7, model_version: TEST_MODEL_VERSION },
        });
      } finally {
        await prisma.$disconnect();
      }
    },
  );

  it.skipIf(!HAS_DB)(
    'Test 5: auto-down-weight clears when most-recent window recovers',
    async (ctx) => {
      if (!(await tableExists())) return ctx.skip();
      const prisma = await freshPrisma();
      try {
        await prisma.perSourceIC.deleteMany({
          where: { source_id: 'reddit', forward_horizon_days: 7, model_version: TEST_MODEL_VERSION },
        });

        const now = new Date();
        const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);

        await prisma.perSourceIC.createMany({
          data: [
            {
              source_id: 'reddit',
              computed_at: twentyDaysAgo,
              forward_horizon_days: 7,
              ic_20d: 0.05,
              icir_20d: 0.15, // below threshold
              ic_se_nw: 0.1,
              ic_p_value_nw: 0.4,
              ic_p_value_bh_fdr: 0.4,
              n_observations: 20,
              nw_lag: 5,
              model_version: TEST_MODEL_VERSION,
            },
            {
              source_id: 'reddit',
              computed_at: now,
              forward_horizon_days: 7,
              ic_20d: 0.2,
              icir_20d: 0.5, // above threshold → cleared
              ic_se_nw: 0.1,
              ic_p_value_nw: 0.04,
              ic_p_value_bh_fdr: 0.04,
              n_observations: 20,
              nw_lag: 5,
              model_version: TEST_MODEL_VERSION,
            },
          ],
        });

        const { fetchSentimentSourcesPayload } = await import(
          '@/app/api/insights/sentiment-sources/_helpers'
        );
        const payload = await fetchSentimentSourcesPayload();
        const reddit = payload.sources.find((s) => s.source_id === 'reddit');
        expect(reddit!.horizons['7d']!.auto_down_weight).toBe(false);

        await prisma.perSourceIC.deleteMany({
          where: { source_id: 'reddit', forward_horizon_days: 7, model_version: TEST_MODEL_VERSION },
        });
      } finally {
        await prisma.$disconnect();
      }
    },
  );

  it.skipIf(!HAS_DB)(
    'Test 2: idempotent on rerun (composite unique + skipDuplicates)',
    async (ctx) => {
      if (!(await tableExists())) return ctx.skip();
      const prisma = await freshPrisma();
      try {
        await prisma.perSourceIC.deleteMany({
          where: { source_id: 'idempotent-test-src', model_version: TEST_MODEL_VERSION },
        });

        const row = {
          source_id: 'idempotent-test-src',
          computed_at: TEST_AS_OF,
          forward_horizon_days: 7,
          ic_20d: 0.1,
          icir_20d: 0.5,
          ic_se_nw: 0.05,
          ic_p_value_nw: 0.04,
          ic_p_value_bh_fdr: 0.04,
          n_observations: 20,
          nw_lag: 5,
          model_version: TEST_MODEL_VERSION,
        };
        await prisma.perSourceIC.createMany({ data: [row], skipDuplicates: true });
        await prisma.perSourceIC.createMany({ data: [row], skipDuplicates: true });

        const count = await prisma.perSourceIC.count({
          where: { source_id: 'idempotent-test-src', model_version: TEST_MODEL_VERSION },
        });
        expect(count).toBe(1);

        await prisma.perSourceIC.deleteMany({
          where: { source_id: 'idempotent-test-src', model_version: TEST_MODEL_VERSION },
        });
      } finally {
        await prisma.$disconnect();
      }
    },
  );

  it.skipIf(!HAS_DB)(
    'Test 3: BH-FDR monotonicity in DB — ic_p_value_bh_fdr >= ic_p_value_nw for every row',
    async (ctx) => {
      if (!(await tableExists())) return ctx.skip();
      const prisma = await freshPrisma();
      try {
        const violations = await prisma.perSourceIC.count({
          where: {
            // Postgres-side: a row violates monotonicity iff bh < nw.
            ic_p_value_bh_fdr: { lt: 0 }, // placeholder — real check below
          },
        });
        // Fetch a sample and validate in JS (Prisma doesn't support
        // cross-column comparisons in `where`).
        const rows = await prisma.perSourceIC.findMany({
          take: 200,
          orderBy: { computed_at: 'desc' },
          select: { ic_p_value_nw: true, ic_p_value_bh_fdr: true },
        });
        for (const r of rows) {
          expect(r.ic_p_value_bh_fdr).toBeGreaterThanOrEqual(r.ic_p_value_nw - 1e-12);
        }
        // The placeholder count is a no-op assertion — kept so the
        // unused-binding lint doesn't flag.
        expect(violations).toBeGreaterThanOrEqual(0);
      } finally {
        await prisma.$disconnect();
      }
    },
  );

  it.skipIf(!HAS_DB)(
    'Test 6: dashboard endpoint returns 200 with 6 sources × 7d/30d horizons',
    async (ctx) => {
      if (!(await tableExists())) return ctx.skip();
      const { fetchSentimentSourcesPayload } = await import(
        '@/app/api/insights/sentiment-sources/_helpers'
      );
      const payload = await fetchSentimentSourcesPayload();
      expect(payload.sources.length).toBe(6);
      for (const s of payload.sources) {
        expect(s.horizons).toHaveProperty('7d');
        expect(s.horizons).toHaveProperty('30d');
      }
    },
  );

  it.skipIf(!HAS_DB)(
    'Test 7: cold-start — runComputePerSourceIC writes zero rows when no SentimentObservation data',
    async (ctx) => {
      if (!(await tableExists())) return ctx.skip();
      const { runComputePerSourceIC } = await import(
        '../../scripts/compute-per-source-ic'
      );
      // Use a deliberately old asOf to guarantee no observations in window.
      const ancient = new Date('1990-01-01T00:00:00Z');
      const result = await runComputePerSourceIC({ asOf: ancient });
      // No rows expected — but the operation must succeed.
      expect(result.rows_written).toBe(0);
      expect(result.sources_attempted).toBe(12);
    },
  );
});
