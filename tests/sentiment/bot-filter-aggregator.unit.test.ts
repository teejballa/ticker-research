import { describe, it, expect } from 'vitest';
import {
  applyBotFilterToCount,
  type BotFilterSummary,
} from '@/lib/sentiment/aggregator';

describe('applyBotFilterToCount — three-mode weight gate', () => {
  it("mode='off' → count unchanged regardless of n_flagged", () => {
    expect(applyBotFilterToCount(100, 0, 'off')).toBe(100);
    expect(applyBotFilterToCount(100, 30, 'off')).toBe(100);
    expect(applyBotFilterToCount(100, 999, 'off')).toBe(100);
  });

  it("mode='shadow' → count unchanged (persistence runs, consumer doesn't)", () => {
    expect(applyBotFilterToCount(100, 0, 'shadow')).toBe(100);
    expect(applyBotFilterToCount(100, 30, 'shadow')).toBe(100);
  });

  it("mode='on' + 0 flagged → count unchanged", () => {
    expect(applyBotFilterToCount(100, 0, 'on')).toBe(100);
  });

  it("mode='on' + flagged authors → count reduced by n_flagged", () => {
    expect(applyBotFilterToCount(100, 30, 'on')).toBe(70);
    expect(applyBotFilterToCount(50, 10, 'on')).toBe(40);
  });

  it("mode='on' + flagged > count → clamps at 0 (never negative)", () => {
    expect(applyBotFilterToCount(20, 30, 'on')).toBe(0);
    expect(applyBotFilterToCount(0, 5, 'on')).toBe(0);
  });

  it("invariant — output never exceeds input count when mode='on'", () => {
    for (let count = 0; count <= 100; count += 17) {
      for (let n_flag = 0; n_flag <= 100; n_flag += 11) {
        const out = applyBotFilterToCount(count, n_flag, 'on');
        expect(out).toBeGreaterThanOrEqual(0);
        expect(out).toBeLessThanOrEqual(count);
      }
    }
  });
});

describe('BotFilterSummary — shape contract for downstream consumers', () => {
  it('carries the three audited fields needed by ResearchReport subtext', () => {
    const summary: BotFilterSummary = {
      authors_flagged: 3,
      messages_flagged_coordinated: 55,
      coordinated_posting: true,
    };
    expect(summary.authors_flagged).toBe(3);
    expect(summary.messages_flagged_coordinated).toBe(55);
    expect(summary.coordinated_posting).toBe(true);
  });
});
