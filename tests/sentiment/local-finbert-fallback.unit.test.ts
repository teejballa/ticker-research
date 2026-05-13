// tests/sentiment/local-finbert-fallback.unit.test.ts
//
// Plan 20-B-02 — local-finbert-fallback unit tests. Mocks @xenova/transformers
// to verify:
//   (1) Pipeline output → SentimentScore reduction (pos − neg, confidence)
//   (2) Errors → null sentinel (no throw); error message captured
//   (3) Lazy-load enforcement: grep of the module source for top-level
//       `^import.*@xenova` returns 0 lines (asserted via fs.readFileSync)
//   (4) Pipeline is cached: `pipeline()` factory invoked exactly once across
//       multiple `classifyFinBERTLocal` calls

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Mock @xenova/transformers. The mock has TWO layers:
//   - `pipeline()` factory (called once → returns the pipe fn)
//   - the returned pipe fn (called each invocation → returns label array)
const mockPipeFn = vi.fn();
const mockPipelineFactory = vi.fn(async () => mockPipeFn);

vi.mock('@xenova/transformers', () => ({
  pipeline: mockPipelineFactory,
}));

import { classifyFinBERTLocal, _resetPipelineCacheForTests } from '@/lib/sentiment/local-finbert-fallback';

beforeEach(() => {
  mockPipeFn.mockReset();
  mockPipelineFactory.mockClear();
  _resetPipelineCacheForTests();
});

describe('classifyFinBERTLocal — label reduction', () => {
  it('positive-dominant pipe output → SentimentScore with pos − neg', async () => {
    mockPipeFn.mockResolvedValueOnce([
      { label: 'positive', score: 0.84 },
      { label: 'neutral', score: 0.10 },
      { label: 'negative', score: 0.06 },
    ]);
    const r = await classifyFinBERTLocal('AAPL beat earnings');
    expect(r.model).toBe('finbert');
    expect(r.score).toBeCloseTo(0.78, 5);
    expect(r.confidence).toBeCloseTo(0.84, 5);
    expect(r.error).toBeUndefined();
  });

  it('all-neutral → score = 0, confidence = max', async () => {
    mockPipeFn.mockResolvedValueOnce([
      { label: 'neutral', score: 0.99 },
    ]);
    const r = await classifyFinBERTLocal('Fed steady');
    expect(r.score).toBe(0); // no pos or neg labels matched
    expect(r.confidence).toBeCloseTo(0.99, 5);
  });
});

describe('classifyFinBERTLocal — null sentinel on failure', () => {
  it('pipeline rejects → null sentinel, error captured (no throw)', async () => {
    mockPipeFn.mockRejectedValueOnce(new Error('OOM during inference'));
    const r = await classifyFinBERTLocal('hello');
    expect(r.score).toBeNull();
    expect(r.confidence).toBeNull();
    expect(r.error).toBe('OOM during inference');
  });
});

describe('classifyFinBERTLocal — lazy-load + caching', () => {
  it('source file has NO top-level @xenova import (lazy-load enforced)', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/lib/sentiment/local-finbert-fallback.ts'),
      'utf8',
    );
    // Grep equivalent of the plan's <verify>: `! grep -E "^import.*@xenova"`
    const topLevelImport = src
      .split('\n')
      .filter((line) => /^import\s.*@xenova/.test(line));
    expect(topLevelImport).toEqual([]);
  });

  it('pipeline() factory invoked exactly once across two calls (cached)', async () => {
    mockPipeFn.mockResolvedValue([{ label: 'positive', score: 0.7 }]);
    await classifyFinBERTLocal('first');
    await classifyFinBERTLocal('second');
    await classifyFinBERTLocal('third');
    expect(mockPipelineFactory).toHaveBeenCalledTimes(1);
    expect(mockPipeFn).toHaveBeenCalledTimes(3);
  });
});
