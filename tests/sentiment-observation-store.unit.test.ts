import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    sentimentObservation: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import {
  insertObservation,
  sha256Hex,
  SentimentObservationDuplicateError,
} from '@/lib/sentiment/observation-store';

const baseInput = {
  ticker: 'GME',
  source: 'stocktwits' as const,
  message_id: 'msg-1',
  raw_body: 'to the moon',
  classifier_version: 'stocktwits-tag-v1',
  classifier_score: 0.8,
  model_version: 'stocktwits-tag-v1',
  decay_weight: null,
  author_id: 'sha256:abc',
  author_features_snapshot: {
    account_age_days: 1000,
    follower_count: 500,
    is_verified: false,
    message_count_30d: 42,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.sentimentObservation.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'row-1' });
});

describe('sha256Hex', () => {
  it('produces 64 lowercase hex chars', () => {
    const h = sha256Hex('hello');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
  it('is deterministic — same input → same hash', () => {
    expect(sha256Hex('abc')).toBe(sha256Hex('abc'));
  });
  it('is collision-resistant — different inputs → different hashes', () => {
    expect(sha256Hex('a')).not.toBe(sha256Hex('b'));
  });
});

describe('insertObservation — happy path', () => {
  it('hashes raw_body and never passes raw_body to Prisma', async () => {
    await insertObservation(baseInput);
    const call = (prisma.sentimentObservation.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.raw_body_hash).toBe(sha256Hex('to the moon'));
    expect(call.data).not.toHaveProperty('raw_body');
  });
  it('returns { id } from the create result', async () => {
    const r = await insertObservation(baseInput);
    expect(r).toEqual({ id: 'row-1' });
  });
  it('defaults fetched_at to a Date instance when not provided', async () => {
    await insertObservation(baseInput);
    const call = (prisma.sentimentObservation.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.fetched_at).toBeInstanceOf(Date);
  });
});

describe('insertObservation — validation', () => {
  it('rejects empty ticker', async () => {
    await expect(insertObservation({ ...baseInput, ticker: '' })).rejects.toThrow(/ticker/);
  });
  it('rejects empty message_id', async () => {
    await expect(insertObservation({ ...baseInput, message_id: '' })).rejects.toThrow(/message_id/);
  });
  it('rejects empty model_version', async () => {
    await expect(insertObservation({ ...baseInput, model_version: '' })).rejects.toThrow(/model_version/);
  });
  it('rejects empty raw_body (upstream signal bug)', async () => {
    await expect(insertObservation({ ...baseInput, raw_body: '' })).rejects.toThrow(/raw_body/);
  });
});

describe('insertObservation — PII allowlist (T-20-Z-01-01)', () => {
  it('rejects author_features_snapshot containing "bio"', async () => {
    await expect(insertObservation({
      ...baseInput,
      author_features_snapshot: { ...baseInput.author_features_snapshot, bio: 'long-text' } as unknown as typeof baseInput.author_features_snapshot,
    })).rejects.toThrow(/allowlist|bio/);
  });
  it('rejects author_features_snapshot containing "profile_text"', async () => {
    await expect(insertObservation({
      ...baseInput,
      author_features_snapshot: { ...baseInput.author_features_snapshot, profile_text: 'x' } as unknown as typeof baseInput.author_features_snapshot,
    })).rejects.toThrow(/allowlist|profile_text/);
  });
  it('rejects author_features_snapshot containing "email"', async () => {
    await expect(insertObservation({
      ...baseInput,
      author_features_snapshot: { ...baseInput.author_features_snapshot, email: 'x@y.com' } as unknown as typeof baseInput.author_features_snapshot,
    })).rejects.toThrow(/allowlist|email/);
  });
});

describe('insertObservation — duplicate handling (T-20-Z-01-04)', () => {
  it('throws SentimentObservationDuplicateError on Prisma P2002', async () => {
    (prisma.sentimentObservation.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    await expect(insertObservation(baseInput)).rejects.toBeInstanceOf(SentimentObservationDuplicateError);
  });
  it('typed error carries ticker + message_id + model_version', async () => {
    (prisma.sentimentObservation.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    try {
      await insertObservation(baseInput);
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SentimentObservationDuplicateError);
      const err = e as SentimentObservationDuplicateError;
      expect(err.ticker).toBe('GME');
      expect(err.message_id).toBe('msg-1');
      expect(err.model_version).toBe('stocktwits-tag-v1');
    }
  });
  it('rethrows non-P2002 Prisma errors unchanged', async () => {
    const other = Object.assign(new Error('Connection lost'), { code: 'P1001' });
    (prisma.sentimentObservation.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(other);
    await expect(insertObservation(baseInput)).rejects.toThrow(/Connection lost/);
  });
});
