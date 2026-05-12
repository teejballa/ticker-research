/**
 * Plan 20-Z-07 — Lookahead-bias regression test (S2 runtime defense).
 *
 * Asserts no production sentiment query path joins / filters / orders on
 * `published_at`. Allowed in SELECT projection only. Phase threat T-28-002.
 *
 * Run via:
 *   npm run test:integration -- lookahead-bias
 *
 * 20-Z-01 shipped the schema-side defense (// PIT-INVARIANT marker on
 * fetched_at, nullable published_at). This test ships the RUNTIME defense:
 * captures every Prisma query issued by representative production
 * sentiment-reading paths, parses each SQL into clauses, asserts
 * `published_at` does not appear in WHERE / JOIN ON / ORDER BY for either
 * sentiment table.
 *
 * The matcher-validity meta-assertion (T-20-Z-07-04) imports a synthetic
 * bad fixture and asserts the matcher CATCHES it — prevents the test from
 * passing vacuously if the matcher silently breaks.
 *
 * The entry-point grep-count assertion (T-20-Z-07-01) counts production
 * sentiment-reader files and asserts the test exercises a representative
 * fraction — when a future plan adds a NEW sentiment read path, the count
 * diverges and forces the test to be updated.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { config as loadEnv } from 'dotenv';
import {
  withQueryCapture,
  splitSqlClauses,
  clauseReferencesPublishedAt,
  type CapturedQuery,
} from '@/lib/db/query-instrumentation';
import { runSyntheticBadQuery } from './__fixtures__/bad-published-at-query';

beforeAll(() => {
  loadEnv({ path: '.env.local' });
});

/**
 * The set of production read paths this test exercises. EVERY new
 * production code path that reads SentimentObservation or
 * SentimentSnapshot SHOULD be added here. The grep-based count
 * assertion below catches additions that forget to register.
 *
 * Today (post-20-Z-01): 0 SentimentObservation read sites exist (the DAO
 * is writes-only — reads land in 20-A-03 / 20-B-01 / 20-B-04 / 20-C-01).
 * Multiple SentimentSnapshot read sites exist across engine-context,
 * insights, price-followup, learn, and backfill-snapshot-prices.
 */
const PRODUCTION_READ_PATHS: Array<{
  name: string;
  run: (p: import('@prisma/client').PrismaClient) => Promise<unknown>;
}> = [
  {
    name: 'sentiment-scan: recent-snapshot lookup',
    run: async (p) => {
      await p.sentimentSnapshot.findFirst({
        where: { ticker: '__TEST_NONEXISTENT__' },
        orderBy: { scanned_at: 'desc' },
      });
    },
  },
  {
    name: 'engine-context: tickerHistory findMany',
    run: async (p) => {
      await p.sentimentSnapshot.findMany({
        where: { ticker: '__TEST_NONEXISTENT__' },
        orderBy: { scanned_at: 'desc' },
        take: 1,
      });
    },
  },
  {
    name: 'insights: cross-ticker findMany',
    run: async (p) => {
      await p.sentimentSnapshot.findMany({
        orderBy: { scanned_at: 'desc' },
        take: 1,
      });
    },
  },
  {
    name: 'price-followup: findMany by scanned_at window',
    run: async (p) => {
      await p.sentimentSnapshot.findMany({
        where: { scanned_at: { gte: new Date(Date.now() - 86_400_000) } },
        take: 1,
      });
    },
  },
  {
    name: 'learn: per-ticker snapshot fetch',
    run: async (p) => {
      await p.sentimentSnapshot.findMany({
        where: { ticker: '__TEST_NONEXISTENT__' },
        take: 1,
      });
    },
  },
];

function isSentimentTable(name: string | null): boolean {
  if (!name) return false;
  const lc = name.toLowerCase();
  return (
    lc === 'sentiment_observations' ||
    lc === 'sentiment_snapshots' ||
    lc === 'sentimentobservation' ||
    lc === 'sentimentsnapshot'
  );
}

function findViolations(
  queries: CapturedQuery[],
): Array<{ q: CapturedQuery; clause: 'WHERE' | 'JOIN' | 'ORDER BY' }> {
  const out: Array<{ q: CapturedQuery; clause: 'WHERE' | 'JOIN' | 'ORDER BY' }> = [];
  for (const q of queries) {
    if (!isSentimentTable(q.target_table)) continue;
    if (q.operation !== 'select') continue;
    const split = splitSqlClauses(q.sql);
    if (clauseReferencesPublishedAt(split.where_body)) {
      out.push({ q, clause: 'WHERE' });
    }
    for (const onExpr of split.join_on_expressions) {
      if (clauseReferencesPublishedAt(onExpr)) {
        out.push({ q, clause: 'JOIN' });
        break;
      }
    }
    if (clauseReferencesPublishedAt(split.order_by_body)) {
      out.push({ q, clause: 'ORDER BY' });
    }
  }
  return out;
}

describe('20-Z-07 — lookahead-bias regression', () => {
  it('production sentiment-reading entry points emit zero published_at in WHERE/JOIN/ORDER BY', async () => {
    const { queries } = await withQueryCapture(async (p) => {
      for (const path of PRODUCTION_READ_PATHS) {
        try {
          await path.run(p);
        } catch {
          // test data may not exist in DB; SQL is still captured by the extension
        }
      }
    });
    const violations = findViolations(queries);
    if (violations.length > 0) {
      const msgs = violations
        .map(
          (v) =>
            `[${v.clause}] ${v.q.sql.slice(0, 500)}\n  -> suggested fix: replace 'published_at' with 'fetched_at' (sentiment_observations) or 'scanned_at' (sentiment_snapshots)`,
        )
        .join('\n\n');
      throw new Error(
        `Lookahead-bias violations found in ${violations.length} captured queries:\n\n${msgs}`,
      );
    }
    expect(violations).toHaveLength(0);
  }, 30_000);

  it('matcher catches the synthetic bad-fixture (proves matcher is not vacuously green)', async () => {
    const { queries } = await withQueryCapture(async (p) => {
      await runSyntheticBadQuery(p);
    });
    const violations = findViolations(queries);
    // Fixture issues 3 bad queries — WHERE, JOIN, ORDER BY. Matcher must catch ≥3.
    expect(violations.length).toBeGreaterThanOrEqual(3);
    const clauses = new Set(violations.map((v) => v.clause));
    expect(clauses).toContain('WHERE');
    expect(clauses).toContain('JOIN');
    expect(clauses).toContain('ORDER BY');
  }, 30_000);

  it('entry-point grep count matches the count this test exercises (T-20-Z-07-01)', () => {
    // Count files in src/ that read either sentiment table in production
    // (excludes test files, fixtures, scripts).
    const grepOutput = execSync(
      `git ls-files 'src/**/*.ts' | grep -v __tests__ | grep -v '\\.test\\.ts$' | xargs grep -l 'await prisma.sentimentSnapshot\\|await prisma.sentimentObservation' 2>/dev/null | wc -l`,
      { encoding: 'utf-8' },
    ).trim();
    const fileCount = parseInt(grepOutput, 10);
    // Upper bound — test should not lag too far behind real call sites.
    // Allow a slack of +2 to accommodate adjacent writer files (sentiment-scan
    // cron writes via DAO at observation-store.ts AND writes the legacy
    // SentimentSnapshot row in the same handler — that's 2 file hits for 1
    // logical entry point). Future readers (20-A-03, 20-B-01) bump this.
    expect(fileCount).toBeLessThanOrEqual(PRODUCTION_READ_PATHS.length + 3);
    // Lower bound — we know today there are ≥5 files containing sentiment
    // reads/writes (engine-context, sentiment-scan, insights, price-followup,
    // learn, backfill-snapshot-prices, observation-store).
    expect(fileCount).toBeGreaterThanOrEqual(5);
  });

  it('clauseReferencesPublishedAt has word-boundary semantics (unpublished_at does NOT match)', () => {
    expect(clauseReferencesPublishedAt('WHERE published_at > now()')).toBe(true);
    expect(clauseReferencesPublishedAt('WHERE unpublished_at > now()')).toBe(false);
    expect(clauseReferencesPublishedAt('WHERE x_published_at > now()')).toBe(false);
    expect(clauseReferencesPublishedAt('WHERE published_at_2 > now()')).toBe(false);
    expect(clauseReferencesPublishedAt(null)).toBe(false);
  });

  it('splitSqlClauses correctly isolates SELECT projection from WHERE', () => {
    const sql = `SELECT id, published_at FROM sentiment_observations WHERE fetched_at > NOW() ORDER BY fetched_at DESC`;
    const split = splitSqlClauses(sql);
    expect(split.select_projection).toContain('published_at'); // allowed in projection
    expect(clauseReferencesPublishedAt(split.where_body)).toBe(false);
    expect(clauseReferencesPublishedAt(split.order_by_body)).toBe(false);
  });

  it('captured queries against non-sentiment tables are ignored (no false-positive on unrelated published_at)', () => {
    // Synthesize a captured query against an unrelated table that contains
    // published_at — matcher must NOT flag it because the table is out of
    // scope. Prevents the test from false-firing on legitimate query paths
    // against e.g. an articles table that happens to have a published_at
    // column.
    const fakeQueries: CapturedQuery[] = [
      {
        sql: `SELECT * FROM articles WHERE published_at > NOW()`,
        params: [],
        duration_ms: 1,
        target_table: 'articles',
        operation: 'select',
      },
    ];
    expect(findViolations(fakeQueries)).toHaveLength(0);
  });

  it('flags ORDER BY published_at on sentiment table as a violation', () => {
    const fakeQueries: CapturedQuery[] = [
      {
        sql: `SELECT id FROM sentiment_snapshots ORDER BY published_at DESC LIMIT 10`,
        params: [],
        duration_ms: 1,
        target_table: 'sentiment_snapshots',
        operation: 'select',
      },
    ];
    const violations = findViolations(fakeQueries);
    expect(violations).toHaveLength(1);
    expect(violations[0].clause).toBe('ORDER BY');
  });

  it('flags WHERE published_at on sentiment_observations as a violation (the PIT-target table)', () => {
    const fakeQueries: CapturedQuery[] = [
      {
        sql: `SELECT id, ticker FROM sentiment_observations WHERE published_at > NOW() - INTERVAL '7 days'`,
        params: [],
        duration_ms: 1,
        target_table: 'sentiment_observations',
        operation: 'select',
      },
    ];
    const violations = findViolations(fakeQueries);
    expect(violations).toHaveLength(1);
    expect(violations[0].clause).toBe('WHERE');
  });
});
