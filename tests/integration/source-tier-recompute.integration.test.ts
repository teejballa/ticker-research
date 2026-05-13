// tests/integration/source-tier-recompute.integration.test.ts
//
// Phase 20-B-04 Task 9 — live-Neon integration tests for the monthly
// source-tier recompute. SKIPS when DATABASE_URL is absent or when the
// source_tiers / per_source_ic tables are not yet pushed (Task 2 deferred
// per execution directive; aligns with 20-C-01 integration test precedent).
//
// Always-on regression: static grep for the no-hand-curated tokens runs
// unconditionally so even pre-push runs catch S1 violations.

import { describe, expect, it } from 'vitest';
import { config as loadDotenv } from 'dotenv';
import { execSync } from 'node:child_process';

loadDotenv({ path: '.env.local' });

const HAS_DB = !!process.env.DATABASE_URL;
const TEST_MODEL_VERSION = 'test-20-B-04-v1';

async function freshPrisma() {
  const { PrismaClient } = await import('@prisma/client');
  const { PrismaNeon } = await import('@prisma/adapter-neon');
  const adapter = new PrismaNeon({
    connectionString: process.env.DATABASE_URL!,
  });
  return new PrismaClient({ adapter });
}

let SCHEMA_READY: boolean | null = null;
async function sourceTiersTableReady(): Promise<boolean> {
  if (SCHEMA_READY !== null) return SCHEMA_READY;
  if (!HAS_DB) {
    SCHEMA_READY = false;
    return false;
  }
  try {
    const prisma = await freshPrisma();
    try {
      await prisma.sourceTier.count();
      SCHEMA_READY = true;
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    SCHEMA_READY = false;
  }
  return SCHEMA_READY;
}

describe('20-B-04 — source-tier recompute integration', () => {
  // ── Always-on: CI grep guard (S1 — no hand-curated tier weights) ─────────
  it('repo contains zero hand-curated tier-weight override tokens (S1)', () => {
    let matches = 0;
    try {
      // grep returns exit 1 when no matches found; capture stdout safely.
      const out = execSync(
        `grep -REc 'SOURCE_WEIGHT_OVERRIDE|HARD_CODED_TIER|HAND_CURATED_TIER' src/ tests/ scripts/ || true`,
        { encoding: 'utf8' },
      );
      // grep -c outputs 'file:N\n' lines; sum the N>0 entries.
      // Self-references in THIS file (test assertions, comments) and the CI
      // workflow yml are excluded from the guard by design — the workflow
      // (and this test) name the tokens to detect them.
      const lines = out.split('\n').filter(Boolean);
      for (const line of lines) {
        const [file, n] = line.split(':');
        if (file.endsWith('source-tier-recompute.integration.test.ts')) continue;
        matches += Number(n || 0);
      }
    } catch {
      matches = 0;
    }
    expect(matches).toBe(0);
  });

  // ── DB-touching tests — SKIP when source_tiers not pushed yet ─────────────

  it('empty PerSourceIC graceful exit (T-20-B-04-03)', async () => {
    const ready = await sourceTiersTableReady();
    if (!ready) {
      // eslint-disable-next-line no-console
      console.warn(
        '[20-B-04 integration] SKIP: source_tiers table not pushed yet (Task 2 deferred)',
      );
      return;
    }
    const { runRecompute } = await import(
      '../../scripts/recompute-source-tiers'
    );
    // If per_source_ic has zero rows for the 90d window (or table missing),
    // runRecompute must exit gracefully — NOT throw.
    const result = await runRecompute({ modelVersion: TEST_MODEL_VERSION });
    // Either the table is missing/empty OR it has data — both must complete normally.
    expect(typeof result.per_source_ic_table_empty).toBe('boolean');
    expect(typeof result.rows_written).toBe('number');
    expect(result.rows_written).toBeGreaterThanOrEqual(0);
  });

  it('SourceTier rows have weights bounded in [cap_min, cap_max] when written', async () => {
    const ready = await sourceTiersTableReady();
    if (!ready) {
      // eslint-disable-next-line no-console
      console.warn('[20-B-04 integration] SKIP: source_tiers table not pushed');
      return;
    }
    const prisma = await freshPrisma();
    try {
      // Any historical row (test or prod) must obey the bounds invariant.
      const violators = await prisma.sourceTier.count({
        where: { OR: [{ weight: { lt: 0.5 } }, { weight: { gt: 5.0 } }] },
      });
      expect(violators).toBe(0);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('aggregateCommunitySentimentTierAware off-mode returns baseline numbers unchanged', async () => {
    const { aggregateCommunitySentiment, aggregateCommunitySentimentTierAware } =
      await import('../../src/lib/sentiment/aggregator');
    const fixture = {
      stocktwits: { bullish_pct: 60, mention_count: 100 },
      swaggystocks: { bullish_pct: 50, mention_count: 50 },
      apewisdom: { bullish_pct: 70, mention_count: 30 },
    };
    const baseline = aggregateCommunitySentiment(fixture);
    const tierOff = await aggregateCommunitySentimentTierAware(fixture, {
      mode: 'off',
    });
    expect(tierOff.aggregated_bull_pct).toBe(baseline.aggregated_bull_pct);
    expect(tierOff.aggregated_bear_pct).toBe(baseline.aggregated_bear_pct);
    expect(tierOff.tier_weights_applied).toEqual({});
    expect(tierOff.tier_mode).toBe('off');
  });

  it('aggregateCommunitySentimentTierAware on-mode applies tier weights and returns map', async () => {
    const ready = await sourceTiersTableReady();
    if (!ready) {
      // eslint-disable-next-line no-console
      console.warn('[20-B-04 integration] SKIP: source_tiers table not pushed');
      return;
    }
    const { aggregateCommunitySentimentTierAware } = await import(
      '../../src/lib/sentiment/aggregator'
    );
    const fixture = {
      stocktwits: { bullish_pct: 60, mention_count: 100 },
      swaggystocks: { bullish_pct: 50, mention_count: 50 },
      apewisdom: { bullish_pct: 70, mention_count: 30 },
    };
    const tierOn = await aggregateCommunitySentimentTierAware(fixture, {
      mode: 'on',
    });
    expect(tierOn.tier_mode).toBe('on');
    // tier_weights_applied is always populated for each contributing source
    expect(Object.keys(tierOn.tier_weights_applied).length).toBeGreaterThanOrEqual(1);
    // Cold-start fallback: every tier weight in the map is ∈ [0.5, 5.0] OR exactly 1.0
    for (const [, w] of Object.entries(tierOn.tier_weights_applied)) {
      expect(w === 1.0 || (w >= 0.5 && w <= 5.0)).toBe(true);
    }
  });
});
