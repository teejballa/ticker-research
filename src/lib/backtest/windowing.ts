// src/lib/backtest/windowing.ts
// Phase 27 D-08/COVERAGE-07 — point-in-time windowing helpers.
// scanned_at MUST be the historical window date; recorded_at MUST be scanned_at + days_after.
// Setting either to the backfill RUN date collapses Phase 23's Purged-K-Fold to a single fold
// (RESEARCH § Purged-K-Fold CV Pool Compatibility). These functions never read Date.now().

const DAY_MS = 86_400_000;

/**
 * Weekly (+7d) asOf dates in [start, end], strictly increasing, last <= end.
 *
 * Caller is responsible for passing end <= now so no future dates are produced;
 * this module stays pure and does not enforce that constraint itself.
 */
export function buildWeeklyAsOfDates(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 7 * DAY_MS) {
    out.push(new Date(t));
  }
  return out;
}

/**
 * Outcome resolution date = scanned_at + days_after (PIT — never the run date).
 *
 * Pure arithmetic: no I/O, no Date.now() reads.
 */
export function computeOutcomeRecordedAt(scannedAt: Date, daysAfter: number): Date {
  return new Date(scannedAt.getTime() + daysAfter * DAY_MS);
}
