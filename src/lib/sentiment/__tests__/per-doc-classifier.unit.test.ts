// src/lib/sentiment/__tests__/per-doc-classifier.unit.test.ts
// Plan 20-B-01 Task 5 — RED→GREEN unit tests for the Gemini per-doc classifier.
//
// All tests use the `_gemini` mock injection (ClassifyOpts._gemini) so the
// retry / fallback logic is exercised deterministically without hitting the
// AI Gateway. The integration test in tests/integration/per-doc-classifier.integration.test.ts
// covers the live-AI path.

import { describe, it, expect } from 'vitest';
import { classifyDocumentsBatch, type PerDocInput } from '@/lib/sentiment/per-doc-classifier';

const okInput = (overrides: Partial<PerDocInput> = {}): PerDocInput => ({
  doc_id: 'doc-1',
  text: 'AAPL reports Q4 EPS beat',
  source: 'news',
  ...overrides,
});

const wrapped = (records: Array<{ doc_id: string; polarity: number; confidence: number; aspects: string[] }>) => ({
  per_document_sentiment: records,
});

describe('classifyDocumentsBatch — input contract', () => {
  it('empty input → resolves to [] without invoking Gemini', async () => {
    let calls = 0;
    const result = await classifyDocumentsBatch([], { _gemini: async () => { calls += 1; return wrapped([]); } });
    expect(result).toEqual([]);
    expect(calls).toBe(0);
  });

  it('throws synchronously when any input doc_id is empty (caller bug)', async () => {
    await expect(
      classifyDocumentsBatch([okInput({ doc_id: '' })], { _gemini: async () => wrapped([]) }),
    ).rejects.toThrow(/doc_id/);
  });
});

describe('classifyDocumentsBatch — single Gemini call per batch', () => {
  it('valid response on first attempt → no retry, returns parsed records', async () => {
    let calls = 0;
    const result = await classifyDocumentsBatch(
      [okInput()],
      {
        _gemini: async () => {
          calls += 1;
          return wrapped([{ doc_id: 'doc-1', polarity: 0.8, confidence: 0.9, aspects: ['earnings'] }]);
        },
      },
    );
    expect(calls).toBe(1);
    expect(result.length).toBe(1);
    expect(result[0].doc_id).toBe('doc-1');
    expect(result[0].polarity).toBe(0.8);
    expect(result[0].confidence).toBe(0.9);
    expect(result[0].aspects).toEqual(['earnings']);
  });

  it('issues ONE batch call regardless of input size (cost defense T-20-B-01-02)', async () => {
    let calls = 0;
    const docs = Array.from({ length: 15 }, (_, i) => okInput({ doc_id: `doc-${i}` }));
    const records = docs.map((d) => ({ doc_id: d.doc_id, polarity: 0.1, confidence: 0.5, aspects: [] as string[] }));
    await classifyDocumentsBatch(docs, {
      _gemini: async () => {
        calls += 1;
        return wrapped(records);
      },
    });
    expect(calls).toBe(1);
  });
});

describe('classifyDocumentsBatch — Zod range rejections trigger one retry', () => {
  it('polarity > 1 → retries; if retry valid, returns valid result', async () => {
    let calls = 0;
    const result = await classifyDocumentsBatch([okInput()], {
      _gemini: async () => {
        calls += 1;
        return calls === 1
          ? wrapped([{ doc_id: 'doc-1', polarity: 1.5, confidence: 0.5, aspects: ['earnings'] }])
          : wrapped([{ doc_id: 'doc-1', polarity: 0.6, confidence: 0.5, aspects: ['earnings'] }]);
      },
    });
    expect(calls).toBe(2);
    expect(result[0].polarity).toBe(0.6);
  });

  it('polarity < -1 → retries', async () => {
    let calls = 0;
    const result = await classifyDocumentsBatch([okInput()], {
      _gemini: async () => {
        calls += 1;
        return calls === 1
          ? wrapped([{ doc_id: 'doc-1', polarity: -1.5, confidence: 0.5, aspects: [] }])
          : wrapped([{ doc_id: 'doc-1', polarity: -0.7, confidence: 0.5, aspects: [] }]);
      },
    });
    expect(calls).toBe(2);
    expect(result[0].polarity).toBe(-0.7);
  });

  it('confidence > 1 → retries', async () => {
    let calls = 0;
    const result = await classifyDocumentsBatch([okInput()], {
      _gemini: async () => {
        calls += 1;
        return calls === 1
          ? wrapped([{ doc_id: 'doc-1', polarity: 0.2, confidence: 1.5, aspects: [] }])
          : wrapped([{ doc_id: 'doc-1', polarity: 0.2, confidence: 0.6, aspects: [] }]);
      },
    });
    expect(calls).toBe(2);
    expect(result[0].confidence).toBe(0.6);
  });

  it('confidence < 0 → retries', async () => {
    let calls = 0;
    const result = await classifyDocumentsBatch([okInput()], {
      _gemini: async () => {
        calls += 1;
        return calls === 1
          ? wrapped([{ doc_id: 'doc-1', polarity: 0.2, confidence: -0.1, aspects: [] }])
          : wrapped([{ doc_id: 'doc-1', polarity: 0.2, confidence: 0.0, aspects: [] }]);
      },
    });
    expect(calls).toBe(2);
    expect(result[0].confidence).toBe(0);
  });
});

describe('classifyDocumentsBatch — aspect enum rejection + final fallback', () => {
  it('out-of-enum aspect on attempt 1 → retries; out-of-enum on attempt 2 → fallback aspects:[]', async () => {
    let calls = 0;
    const result = await classifyDocumentsBatch([okInput()], {
      _gemini: async () => {
        calls += 1;
        return wrapped([{ doc_id: 'doc-1', polarity: 0.5, confidence: 0.5, aspects: ['marketing'] }]);
      },
    });
    expect(calls).toBe(2);
    expect(result.length).toBe(1);
    expect(result[0].aspects).toEqual([]);
    expect(result[0].polarity).toBe(0);
    expect(result[0].confidence).toBe(0);
  });

  it('out-of-enum aspect on attempt 1 → retry succeeds → returns valid result (NOT fallback)', async () => {
    let calls = 0;
    const result = await classifyDocumentsBatch([okInput()], {
      _gemini: async () => {
        calls += 1;
        return calls === 1
          ? wrapped([{ doc_id: 'doc-1', polarity: 0.5, confidence: 0.5, aspects: ['marketing'] }])
          : wrapped([{ doc_id: 'doc-1', polarity: 0.5, confidence: 0.5, aspects: ['earnings'] }]);
      },
    });
    expect(calls).toBe(2);
    expect(result[0].aspects).toEqual(['earnings']);
  });

  it('thrown error on both attempts → fallback record with aspects:[]', async () => {
    let calls = 0;
    const docs = [okInput(), okInput({ doc_id: 'doc-2' })];
    const result = await classifyDocumentsBatch(docs, {
      _gemini: async () => {
        calls += 1;
        throw new Error('Gateway 500');
      },
    });
    expect(calls).toBe(2);
    expect(result.length).toBe(2);
    for (const r of result) {
      expect(r.polarity).toBe(0);
      expect(r.confidence).toBe(0);
      expect(r.aspects).toEqual([]);
    }
    expect(result.map((r) => r.doc_id)).toEqual(['doc-1', 'doc-2']);
  });
});

describe('classifyDocumentsBatch — off-topic doc fixture', () => {
  it('Gemini returns polarity=0 confidence=0 aspects:[] for an off-topic doc → passes through unchanged', async () => {
    const offTopic: PerDocInput = {
      doc_id: 'off-01',
      text: 'Severe thunderstorms expected across the Midwest this weekend; flash flood warnings in effect.',
      source: 'news',
    };
    const result = await classifyDocumentsBatch([offTopic], {
      _gemini: async () => wrapped([{ doc_id: 'off-01', polarity: 0, confidence: 0, aspects: [] }]),
    });
    expect(result[0].polarity).toBe(0);
    expect(result[0].confidence).toBe(0);
    expect(result[0].aspects).toEqual([]);
  });
});

describe('classifyDocumentsBatch — boundary range values pass Zod', () => {
  it('polarity=-1, confidence=0, aspects=[] accepted', async () => {
    const result = await classifyDocumentsBatch([okInput()], {
      _gemini: async () => wrapped([{ doc_id: 'doc-1', polarity: -1, confidence: 0, aspects: [] }]),
    });
    expect(result[0].polarity).toBe(-1);
    expect(result[0].confidence).toBe(0);
  });

  it('polarity=+1, confidence=+1, max 7 aspects accepted', async () => {
    const result = await classifyDocumentsBatch([okInput()], {
      _gemini: async () => wrapped([{
        doc_id: 'doc-1',
        polarity: 1,
        confidence: 1,
        aspects: ['earnings', 'guidance', 'regulatory', 'M&A', 'macro', 'product', 'management'],
      }]),
    });
    expect(result[0].polarity).toBe(1);
    expect(result[0].confidence).toBe(1);
    expect(result[0].aspects.length).toBe(7);
  });
});
