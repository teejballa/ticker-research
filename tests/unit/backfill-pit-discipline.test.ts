import { describe, it, expect } from 'vitest';
// RED: src/lib/backtest/windowing.ts does not exist yet — Plan 03 creates it.
import { buildWeeklyAsOfDates, computeOutcomeRecordedAt } from '@/lib/backtest/windowing';

describe('backfill PIT discipline (COVERAGE-07)', () => {
  it('weekly asOf dates are historical and strictly increasing', () => {
    const start = new Date('2021-01-01T00:00:00Z');
    const end = new Date('2021-03-01T00:00:00Z');
    const dates = buildWeeklyAsOfDates(start, end);
    expect(dates.length).toBeGreaterThanOrEqual(7); // ~weekly over 2 months
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i].getTime()).toBeGreaterThan(dates[i - 1].getTime());
    }
    // None may be in the future / equal to run date
    expect(dates.every((d) => d.getTime() < Date.now())).toBe(true);
  });
  it('outcome recorded_at = scanned_at + days_after (NOT run date)', () => {
    const scanned = new Date('2021-02-05T00:00:00Z');
    const recorded = computeOutcomeRecordedAt(scanned, 30);
    const expected = scanned.getTime() + 30 * 86_400_000;
    expect(recorded.getTime()).toBe(expected);
    // explicitly must NOT be "now"
    expect(Math.abs(recorded.getTime() - Date.now())).toBeGreaterThan(86_400_000);
  });
});
