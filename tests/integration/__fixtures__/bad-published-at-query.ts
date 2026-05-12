/**
 * Plan 20-Z-07 — Synthetic violation fixture.
 *
 * Issues 3 deliberately-bad queries — WHERE / JOIN ON / ORDER BY all using
 * `published_at` on the sentiment_snapshots table. The regression test
 * imports this and asserts the matcher CATCHES the violations — proves the
 * matcher is real and not vacuously passing (matcher-validity meta-assertion;
 * threat T-20-Z-07-04).
 *
 * The queries reference `sentiment_snapshots.published_at` which does NOT
 * exist as a column. Postgres rejects each query with a column-does-not-exist
 * error AFTER the Prisma extension has captured the SQL string. We swallow
 * the Postgres error so the fixture function returns cleanly — what matters
 * is that the SQL string was captured for the matcher to inspect.
 *
 * This file is the ONLY non-test, non-allowlisted location in the repo that
 * may reference `published_at` in non-projection SQL — the static check
 * (scripts/check-lookahead-static.ts) hard-codes
 * `tests/integration/__fixtures__/` in its exclusion list to prevent
 * self-flagging.
 */
import type { PrismaClient } from '@prisma/client';

export async function runSyntheticBadQuery(
  prisma: PrismaClient,
): Promise<{ captured: boolean }> {
  // Bad query #1 — WHERE published_at > NOW() - INTERVAL '7 days'
  try {
    await prisma.$queryRawUnsafe(
      `SELECT id, ticker FROM sentiment_snapshots WHERE published_at > NOW() - INTERVAL '7 days' LIMIT 1`,
    );
  } catch {
    // Expected — column does not exist. The point is the SQL was captured
    // by withQueryCapture before Postgres rejected it.
  }

  // Bad query #2 — LEFT JOIN ... ON s.published_at = o.recorded_at
  try {
    await prisma.$queryRawUnsafe(
      `SELECT s.id FROM sentiment_snapshots s LEFT JOIN price_outcomes o ON s.published_at = o.recorded_at LIMIT 1`,
    );
  } catch {
    // Expected — same reason.
  }

  // Bad query #3 — ORDER BY published_at DESC
  try {
    await prisma.$queryRawUnsafe(
      `SELECT id FROM sentiment_snapshots ORDER BY published_at DESC LIMIT 1`,
    );
  } catch {
    // Expected.
  }

  return { captured: true };
}
