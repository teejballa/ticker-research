// tests/sentiment/per-message-pass.unit.test.ts
//
// Plan 20-B-02 — runPerMessagePass orchestrator unit suite.
//
// Mocks:
//   - classifyFinBERT      (HF endpoint client)
//   - ./local-finbert-fallback (secondary tier, dynamic-imported)
//   - insertObservation    (20-Z-01 DAO)
//   - prisma.$queryRaw     (today's count query for cost cap)
//
// Coverage:
//   (1) Volume gate (≤50 messages) → zero-counts, no classifier called
//   (2) Mode=off → zero-counts, no classifier called
//   (3) Happy path (100 messages, all HF succeed) → primary_path_count=100,
//       all insertObservation calls use classifier_version 'finbert-prosus-{sha8}'
//   (4) HF fails, local succeeds → secondary_path_count=100
//   (5) Both fail → tertiary_path_count=100; insertObservation still called
//       100× with classifier_score=null and classifier_version suffix '-null'
//   (6) Cost cap: today_count=950 + 100 msgs → 50 classified, 50 cost-capped
//   (7) Duplicate handling: insertObservation throws DuplicateError for some
//       messages — caught silently, counts only reflect successful inserts

import { describe, it, expect, vi, beforeEach } from 'vitest';

const classifyFinBERTMock = vi.fn();
const classifyFinBERTLocalMock = vi.fn();
const insertObservationMock = vi.fn();
const queryRawMock = vi.fn();

vi.mock('@/lib/sentiment/finsentllm', () => ({
  classifyFinBERT: (text: string) => classifyFinBERTMock(text),
  FINBERT_PINNED_SHA8: '4556d130',
}));

vi.mock('@/lib/sentiment/local-finbert-fallback', () => ({
  classifyFinBERTLocal: (text: string) => classifyFinBERTLocalMock(text),
}));

vi.mock('@/lib/sentiment/observation-store', async () => {
  // Preserve the real DuplicateError class for instanceof checks.
  const actual = await vi.importActual<typeof import('@/lib/sentiment/observation-store')>(
    '@/lib/sentiment/observation-store',
  );
  return {
    ...actual,
    insertObservation: (input: unknown) => insertObservationMock(input),
  };
});

vi.mock('@/lib/db', () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => queryRawMock(...args),
  },
}));

import {
  runPerMessagePass,
  CLASSIFIER_VERSION,
  MODEL_VERSION,
  VOLUME_GATE,
  COST_CAP_MESSAGES_PER_TICKER_PER_DAY,
  type PerMessagePassInput,
} from '@/lib/sentiment/per-message-pass';
import { SentimentObservationDuplicateError } from '@/lib/sentiment/observation-store';

function makeMessages(n: number): PerMessagePassInput['messages'] {
  return Array.from({ length: n }, (_, i) => ({
    message_id: `m${i}`,
    body: `Message body ${i}`,
    author_handle: `user${i}`,
    published_at: null,
    author_features: {
      account_age_days: null,
      follower_count: null,
      is_verified: null,
      message_count_30d: null,
    },
  }));
}

beforeEach(() => {
  classifyFinBERTMock.mockReset();
  classifyFinBERTLocalMock.mockReset();
  insertObservationMock.mockReset();
  queryRawMock.mockReset();
  queryRawMock.mockResolvedValue([{ count: BigInt(0) }]); // default — no rows today
  insertObservationMock.mockResolvedValue({ id: 'mock-uuid' });
});

describe('runPerMessagePass — module constants', () => {
  it('exports VOLUME_GATE=50 and COST_CAP=1000 (S1 cite-and-pin)', () => {
    expect(VOLUME_GATE).toBe(50);
    expect(COST_CAP_MESSAGES_PER_TICKER_PER_DAY).toBe(1000);
  });

  it('CLASSIFIER_VERSION = finbert-prosus-{sha8}; MODEL_VERSION suffix = -v1', () => {
    expect(CLASSIFIER_VERSION).toBe('finbert-prosus-4556d130');
    expect(MODEL_VERSION).toBe('finbert-prosus-4556d130-v1');
  });
});

describe('runPerMessagePass — gating', () => {
  it('mode=off → zero counts, no classifier invoked', async () => {
    const result = await runPerMessagePass(
      { ticker: 'AAPL', messages: makeMessages(100) },
      'off',
    );
    expect(result).toEqual({
      classified_count: 0,
      null_count: 0,
      cost_capped_count: 0,
      primary_path_count: 0,
      secondary_path_count: 0,
      tertiary_path_count: 0,
    });
    expect(classifyFinBERTMock).not.toHaveBeenCalled();
    expect(insertObservationMock).not.toHaveBeenCalled();
  });

  it('volume gate (≤50 msgs) → zero counts, no classifier invoked', async () => {
    const result = await runPerMessagePass(
      { ticker: 'AAPL', messages: makeMessages(30) },
      'shadow',
    );
    expect(result.classified_count).toBe(0);
    expect(classifyFinBERTMock).not.toHaveBeenCalled();
    expect(insertObservationMock).not.toHaveBeenCalled();
  });

  it('boundary: exactly 50 msgs → zero counts (gate is > 50)', async () => {
    const result = await runPerMessagePass(
      { ticker: 'AAPL', messages: makeMessages(50) },
      'shadow',
    );
    expect(result.classified_count).toBe(0);
    expect(classifyFinBERTMock).not.toHaveBeenCalled();
  });
});

describe('runPerMessagePass — 3-tier fallback chain', () => {
  it('happy path: 100 msgs, all HF succeed → primary_path_count=100', async () => {
    classifyFinBERTMock.mockResolvedValue({ score: 0.7, confidence: 0.9, model: 'finbert' });
    const result = await runPerMessagePass(
      { ticker: 'AAPL', messages: makeMessages(100) },
      'shadow',
    );
    expect(result.primary_path_count).toBe(100);
    expect(result.secondary_path_count).toBe(0);
    expect(result.tertiary_path_count).toBe(0);
    expect(result.cost_capped_count).toBe(0);
    expect(insertObservationMock).toHaveBeenCalledTimes(100);
    // Spot-check first insert: classifier_version is the success constant
    const firstCall = insertObservationMock.mock.calls[0][0];
    expect(firstCall.classifier_version).toBe('finbert-prosus-4556d130');
    expect(firstCall.model_version).toBe('finbert-prosus-4556d130-v1');
    expect(firstCall.classifier_score).toBe(0.7);
    expect(firstCall.source).toBe('stocktwits');
    expect(firstCall.author_id).toBe('stocktwits:user0');
  });

  it('HF fails, local succeeds → secondary_path_count=100', async () => {
    classifyFinBERTMock.mockResolvedValue({ score: null, confidence: null, model: 'finbert', error: '503' });
    classifyFinBERTLocalMock.mockResolvedValue({ score: 0.4, confidence: 0.7, model: 'finbert' });
    const result = await runPerMessagePass(
      { ticker: 'AAPL', messages: makeMessages(100) },
      'shadow',
    );
    expect(result.primary_path_count).toBe(0);
    expect(result.secondary_path_count).toBe(100);
    expect(result.tertiary_path_count).toBe(0);
    expect(insertObservationMock).toHaveBeenCalledTimes(100);
    const firstCall = insertObservationMock.mock.calls[0][0];
    expect(firstCall.classifier_score).toBe(0.4);
    expect(firstCall.classifier_version).toBe('finbert-prosus-4556d130');
  });

  it('both tiers fail → tertiary_path_count=100, classifier_version=-null suffix', async () => {
    classifyFinBERTMock.mockResolvedValue({ score: null, confidence: null, model: 'finbert', error: 'a' });
    classifyFinBERTLocalMock.mockResolvedValue({ score: null, confidence: null, model: 'finbert', error: 'b' });
    const result = await runPerMessagePass(
      { ticker: 'AAPL', messages: makeMessages(100) },
      'shadow',
    );
    expect(result.tertiary_path_count).toBe(100);
    expect(result.null_count).toBe(100);
    expect(insertObservationMock).toHaveBeenCalledTimes(100); // ALL still persist
    const firstCall = insertObservationMock.mock.calls[0][0];
    expect(firstCall.classifier_score).toBeNull();
    expect(firstCall.classifier_version).toBe('finbert-prosus-4556d130-null');
    expect(firstCall.model_version).toBe('finbert-prosus-4556d130-v1');
  });
});

describe('runPerMessagePass — cost cap', () => {
  it('today_count=950 + 100 msgs → 50 classified, 50 cost-capped', async () => {
    queryRawMock.mockResolvedValueOnce([{ count: BigInt(950) }]);
    classifyFinBERTMock.mockResolvedValue({ score: 0.5, confidence: 0.8, model: 'finbert' });
    const result = await runPerMessagePass(
      { ticker: 'AAPL', messages: makeMessages(100) },
      'shadow',
    );
    expect(result.primary_path_count).toBe(50);
    expect(result.cost_capped_count).toBe(50);
    expect(result.classified_count).toBe(50);
    expect(classifyFinBERTMock).toHaveBeenCalledTimes(50);
    expect(insertObservationMock).toHaveBeenCalledTimes(50);
  });

  it('today_count=1001 → 0 classified, 100 cost-capped (already over cap)', async () => {
    queryRawMock.mockResolvedValueOnce([{ count: BigInt(1001) }]);
    classifyFinBERTMock.mockResolvedValue({ score: 0.5, confidence: 0.8, model: 'finbert' });
    const result = await runPerMessagePass(
      { ticker: 'AAPL', messages: makeMessages(100) },
      'shadow',
    );
    expect(result.cost_capped_count).toBe(100);
    expect(result.primary_path_count).toBe(0);
    expect(classifyFinBERTMock).not.toHaveBeenCalled();
  });
});

describe('runPerMessagePass — duplicate handling (20-Z-01 contract)', () => {
  it('DuplicateError caught silently; counts reflect successful inserts only', async () => {
    classifyFinBERTMock.mockResolvedValue({ score: 0.6, confidence: 0.85, model: 'finbert' });
    let call = 0;
    insertObservationMock.mockImplementation(() => {
      call++;
      if (call > 50) {
        return Promise.reject(
          new SentimentObservationDuplicateError('AAPL', `m${call - 1}`, 'finbert-prosus-4556d130-v1'),
        );
      }
      return Promise.resolve({ id: `uuid-${call}` });
    });
    const result = await runPerMessagePass(
      { ticker: 'AAPL', messages: makeMessages(100) },
      'shadow',
    );
    // Insertions 1-50 succeed → primary_path_count=50; insertions 51-100 dup → silently skipped
    expect(result.primary_path_count).toBe(50);
    expect(result.classified_count).toBe(50);
    expect(insertObservationMock).toHaveBeenCalledTimes(100);
  });
});
