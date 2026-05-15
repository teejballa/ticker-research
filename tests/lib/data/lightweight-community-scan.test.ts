/**
 * Plan 30.1-03 — Task 2 + Task 3 tests for the community-scan orchestrator.
 *
 * Task 2 covers `toEngagementFromFields` + `ENGAGEMENT_TIER_THRESHOLDS`
 * (pure-function thresholds, no external dependencies).
 *
 * Task 3 covers the flag-gated orchestrator (Reddit / Firecrawl / shadow
 * branches) — added in a follow-up describe block.
 */
import { describe, it, expect } from 'vitest';
import {
  toEngagementFromFields,
  ENGAGEMENT_TIER_THRESHOLDS,
} from '@/lib/data/lightweight-community-scan';

describe('toEngagementFromFields (Plan 30.1-03 Task 2)', () => {
  it('returns high when score >= 100', () => {
    expect(toEngagementFromFields({ score: 100, num_comments: 0 })).toBe('high');
  });
  it('returns high when num_comments >= 50', () => {
    expect(toEngagementFromFields({ score: 0, num_comments: 50 })).toBe('high');
  });
  it('returns medium when score >= 20 but below high', () => {
    expect(toEngagementFromFields({ score: 50, num_comments: 0 })).toBe('medium');
  });
  it('returns medium when num_comments >= 10 but below high', () => {
    expect(toEngagementFromFields({ score: 0, num_comments: 20 })).toBe('medium');
  });
  it('returns low when both below medium', () => {
    expect(toEngagementFromFields({ score: 5, num_comments: 2 })).toBe('low');
  });
  it('thresholds are exported for plan 30.1-05 calibration', () => {
    expect(ENGAGEMENT_TIER_THRESHOLDS.high_score).toBe(100);
    expect(ENGAGEMENT_TIER_THRESHOLDS.high_comments).toBe(50);
    expect(ENGAGEMENT_TIER_THRESHOLDS.medium_score).toBe(20);
    expect(ENGAGEMENT_TIER_THRESHOLDS.medium_comments).toBe(10);
  });
});
