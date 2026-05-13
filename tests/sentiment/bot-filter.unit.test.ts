import { describe, it, expect } from 'vitest';
import {
  PUMP_PHRASES,
  textCosineSimilarity,
  pumpPhraseDensity,
  cresciBotScore,
  MIN_ACCOUNT_AGE_DAYS,
  MAX_SELF_SIMILARITY,
  MAX_PUMP_DENSITY,
  MAX_HASHTAG_COUNT,
} from '@/lib/sentiment/bot-filter';

describe('PUMP_PHRASES — literal 9-entry deep-equal', () => {
  it('is exactly the 9 phrases in documented order', () => {
    expect(PUMP_PHRASES).toEqual([
      'to the moon',
      'rocket',
      '100x',
      'moonshot',
      'bagholder',
      'yolo',
      'tendies',
      'rip',
      'lambo',
    ]);
    expect(PUMP_PHRASES.length).toBe(9);
  });
});

describe('textCosineSimilarity — 4-gram character cosine', () => {
  it('identical non-trivial inputs → 1.0', () => {
    const s = 'GME to the moon 100x rocket';
    expect(textCosineSimilarity(s, s)).toBeCloseTo(1.0, 10);
  });

  it('disjoint vocabularies → 0.0', () => {
    expect(textCosineSimilarity('aaaaaaaa', 'zzzzzzzz')).toBe(0);
  });

  it('empty inputs → 0.0', () => {
    expect(textCosineSimilarity('', 'anything goes here')).toBe(0);
    expect(textCosineSimilarity('something', '')).toBe(0);
  });

  it('partial overlap → in (0, 1)', () => {
    const c = textCosineSimilarity(
      'GME to the moon 100x rocket',
      'GME bagholder bagholder',
    );
    expect(c).toBeGreaterThan(0);
    expect(c).toBeLessThan(1);
  });
});

describe('pumpPhraseDensity — count/token_count', () => {
  it('"to the moon to the moon" (6 tokens, 2 phrase hits) → 2/6 ≈ 0.333', () => {
    const d = pumpPhraseDensity('to the moon to the moon');
    expect(d).toBeCloseTo(2 / 6, 6);
  });

  it('empty string → 0', () => {
    expect(pumpPhraseDensity('')).toBe(0);
  });

  it('no phrase present → 0', () => {
    expect(pumpPhraseDensity('I have been holding this stock since 2010')).toBe(0);
  });

  it('case-insensitive substring matching', () => {
    const d = pumpPhraseDensity('TO THE MOON now');
    expect(d).toBeGreaterThan(0);
  });
});

describe('cresciBotScore — first-match enum + features populated', () => {
  it('young account (age 5d, clean text, 0 hashtags) → young_account', () => {
    const r = cresciBotScore({
      account_age_days: 5,
      messages: ['nothing suspicious here at all'],
      hashtag_counts: [0],
    });
    expect(r.is_bot).toBe(true);
    expect(r.reason).toBe('young_account');
    expect(r.features.account_age_days).toBe(5);
  });

  it('high self-similarity (200d, 3 identical, 0 tags) → high_self_similarity', () => {
    const msg = 'BUY NOW GME GME GME super great stock right now';
    const r = cresciBotScore({
      account_age_days: 200,
      messages: [msg, msg, msg],
      hashtag_counts: [0, 0, 0],
    });
    expect(r.is_bot).toBe(true);
    expect(r.reason).toBe('high_self_similarity');
    expect(r.features.max_text_cosine_similarity).toBeCloseTo(1.0, 6);
  });

  it('pump density (200d, "to the moon rocket 100x ..." repeated) → pump_density', () => {
    const r = cresciBotScore({
      account_age_days: 200,
      messages: [
        'to the moon rocket 100x',
        'lambo tendies yolo rip',
        'moonshot bagholder',
      ],
      hashtag_counts: [0, 0, 0],
    });
    expect(r.is_bot).toBe(true);
    expect(r.reason).toBe('pump_density');
    expect(r.features.pump_phrase_density).toBeGreaterThan(MAX_PUMP_DENSITY);
  });

  it('hashtag spam (200d, 1 long varied msg, hashtag_counts=[8]) → hashtag_spam', () => {
    // Long, varied content (low cosine self-similarity inapplicable for 1 msg) and
    // no pump phrases — only the hashtag count should fire.
    const r = cresciBotScore({
      account_age_days: 200,
      messages: ['I have been thinking about portfolio diversification this week'],
      hashtag_counts: [8],
    });
    expect(r.is_bot).toBe(true);
    expect(r.reason).toBe('hashtag_spam');
    expect(r.features.hashtag_count_max).toBe(8);
  });

  it('clean profile (1000d, diverse text, 0 tags) → clean / not bot', () => {
    const r = cresciBotScore({
      account_age_days: 1000,
      messages: [
        'I think AAPL margins held up surprisingly well last quarter',
        'Watching the cloud segment for signs of slowdown',
        'Long-term thesis still intact in my view',
      ],
      hashtag_counts: [0, 0, 0],
    });
    expect(r.is_bot).toBe(false);
    expect(r.reason).toBe('clean');
  });

  it('features object populated regardless of which gate fired', () => {
    const r = cresciBotScore({
      account_age_days: 5,
      messages: ['hi'],
      hashtag_counts: [0],
    });
    expect(r.features).toHaveProperty('account_age_days');
    expect(r.features).toHaveProperty('max_text_cosine_similarity');
    expect(r.features).toHaveProperty('pump_phrase_density');
    expect(r.features).toHaveProperty('hashtag_count_max');
  });

  it('threshold constants exported at literal values', () => {
    expect(MIN_ACCOUNT_AGE_DAYS).toBe(30);
    expect(MAX_SELF_SIMILARITY).toBe(0.5);
    expect(MAX_PUMP_DENSITY).toBe(0.1);
    expect(MAX_HASHTAG_COUNT).toBe(5);
  });

  it('empty hashtag_counts → hashtag_count_max=0 (does not flag)', () => {
    const r = cresciBotScore({
      account_age_days: 1000,
      messages: ['ordinary message'],
      hashtag_counts: [],
    });
    expect(r.features.hashtag_count_max).toBe(0);
    expect(r.reason).toBe('clean');
  });
});
