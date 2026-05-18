/**
 * Plan 20-A-02 — unit tests for the robust mention-volume baseline.
 *
 * Covers:
 *   - medianAndMAD: empty input, single value, odd/even length, 1.4826 scaling
 *   - mentionZScore: standard z-score, EPSILON floor on MAD = 0 (T-20-A-02-02),
 *     today = median edge case
 *   - getZThresh: HYPERPARAMETERS.md absent → literature default, table parse,
 *     unknown cap_class fallback
 *   - SOURCE_TO_CLASS bucketing
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  medianAndMAD,
  mentionZScore,
  getZThresh,
  SOURCE_TO_CLASS,
  MAD_EPSILON,
  Z_THRESH_LITERATURE_DEFAULT,
  MIN_OBSERVATIONS_FOR_BASELINE,
  _resetZThreshCacheForTests,
} from '@/lib/sentiment/baseline';

describe('medianAndMAD', () => {
  it('returns {0,0} on empty input', () => {
    expect(medianAndMAD([])).toEqual({ median: 0, mad: 0 });
  });

  it('returns {x,0} on single-value input (MAD is 0 by definition)', () => {
    const r = medianAndMAD([7]);
    expect(r.median).toBe(7);
    expect(r.mad).toBe(0);
  });

  it('computes odd-length median exactly', () => {
    const r = medianAndMAD([1, 2, 3, 4, 5]);
    expect(r.median).toBe(3);
  });

  it('computes even-length median as average of middles', () => {
    const r = medianAndMAD([1, 2, 3, 4]);
    expect(r.median).toBe(2.5);
  });

  it('applies 1.4826 normal-equivalent scaling to MAD', () => {
    // For [1,2,3,4,5]: median=3, deviations=[0,1,1,2,2], sorted=[0,1,1,2,2], MAD_raw=1
    // MAD_scaled = 1.4826 * 1 = 1.4826
    const r = medianAndMAD([1, 2, 3, 4, 5]);
    expect(r.mad).toBeCloseTo(1.4826, 4);
  });

  it('is robust to outliers vs mean+std', () => {
    // [1,1,1,1,1000] — median=1, deviations sorted=[0,0,0,0,999], MAD_raw=0
    // mean+std would be polluted; median+MAD is not.
    const r = medianAndMAD([1, 1, 1, 1, 1000]);
    expect(r.median).toBe(1);
    expect(r.mad).toBe(0); // 1.4826 * 0
  });

  it('handles all-equal input (perfectly stable ticker)', () => {
    const r = medianAndMAD([5, 5, 5, 5, 5, 5]);
    expect(r.median).toBe(5);
    expect(r.mad).toBe(0);
  });
});

describe('mentionZScore', () => {
  it('returns 0 when today equals baseline median', () => {
    expect(mentionZScore(10, { median: 10, mad: 5 })).toBe(0);
  });

  it('returns positive z for above-median count', () => {
    expect(mentionZScore(20, { median: 10, mad: 5 })).toBe(2);
  });

  it('returns negative z for below-median count', () => {
    expect(mentionZScore(0, { median: 10, mad: 5 })).toBe(-2);
  });

  it('applies MAD_EPSILON floor (= 1.0) when baseline MAD is 0 — T-20-A-02-02', () => {
    // Without the floor: (5 - 0) / 0 = Infinity. With floor: 5 / 1 = 5.
    expect(mentionZScore(5, { median: 0, mad: 0 })).toBe(5);
    expect(MAD_EPSILON).toBe(1.0);
  });

  it('applies floor when MAD is below EPSILON', () => {
    expect(mentionZScore(5, { median: 0, mad: 0.5 })).toBe(5);
  });

  it('does NOT apply floor when MAD is above EPSILON', () => {
    expect(mentionZScore(5, { median: 0, mad: 2.5 })).toBe(2);
  });
});

describe('getZThresh', () => {
  let backupContent: string | null = null;
  const filepath = path.resolve(process.cwd(), 'HYPERPARAMETERS.md');

  beforeEach(() => {
    if (fs.existsSync(filepath)) {
      backupContent = fs.readFileSync(filepath, 'utf-8');
    } else {
      backupContent = null;
    }
    _resetZThreshCacheForTests();
  });

  afterEach(() => {
    if (backupContent != null) {
      fs.writeFileSync(filepath, backupContent);
    } else if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
    _resetZThreshCacheForTests();
  });

  it('returns literature default Z=2.0 when HYPERPARAMETERS.md is missing', () => {
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    _resetZThreshCacheForTests();
    expect(getZThresh('large_cap')).toBe(Z_THRESH_LITERATURE_DEFAULT);
  });

  it('parses Z_thresh from the calibration table block', () => {
    fs.writeFileSync(
      filepath,
      [
        '# Hyperparameters',
        '',
        '## Z_thresh per cap_class (Plan 20-A-02)',
        '',
        '| cap_class | Z_thresh | IC | n_examples |',
        '|---|---|---|---|',
        '| large_cap | 2.75 | 0.08 | 120 |',
        '| mid_cap | 2.50 | 0.05 | 200 |',
        '| small_cap | 1.50 | 0.06 | 80 |',
        '| unknown | 2.00 | 0.02 | 30 |',
        '',
      ].join('\n'),
    );
    _resetZThreshCacheForTests();
    expect(getZThresh('large_cap')).toBe(2.75);
    expect(getZThresh('mid_cap')).toBe(2.5);
    expect(getZThresh('small_cap')).toBe(1.5);
    expect(getZThresh('unknown')).toBe(2.0);
  });

  it('falls back to literature default for unknown cap_class', () => {
    fs.writeFileSync(
      filepath,
      [
        '## Z_thresh per cap_class (Plan 20-A-02)',
        '',
        '| cap_class | Z_thresh | IC | n_examples |',
        '|---|---|---|---|',
        '| large_cap | 3.0 | 0.07 | 100 |',
        '',
      ].join('\n'),
    );
    _resetZThreshCacheForTests();
    expect(getZThresh('large_cap')).toBe(3.0);
    expect(getZThresh('mid_cap')).toBe(Z_THRESH_LITERATURE_DEFAULT);
  });
});

describe('SOURCE_TO_CLASS', () => {
  it('maps community-class sources', () => {
    expect(SOURCE_TO_CLASS.stocktwits).toBe('community');
    expect(SOURCE_TO_CLASS.reddit).toBe('community');
    expect(SOURCE_TO_CLASS.x).toBe('community');
    expect(SOURCE_TO_CLASS.twitter).toBe('community');
    expect(SOURCE_TO_CLASS.hackernews).toBe('community');
    expect(SOURCE_TO_CLASS.apewisdom).toBe('community');
  });

  it('maps news and sec source classes', () => {
    expect(SOURCE_TO_CLASS.news).toBe('news');
    expect(SOURCE_TO_CLASS.sec).toBe('sec');
  });
});

describe('MIN_OBSERVATIONS_FOR_BASELINE', () => {
  it('is the classical CLT threshold of 30', () => {
    expect(MIN_OBSERVATIONS_FOR_BASELINE).toBe(30);
  });
});
