import { describe, it, expect } from 'vitest';
import {
  MINHASH_NUM_PERM,
  LSH_BANDS,
  LSH_ROWS,
  COORDINATION_SIMILARITY,
  COORDINATION_MIN_CLUSTER_SIZE,
  minHash,
  lshCluster,
  detectCoordinatedPosting,
} from '@/lib/sentiment/coordination';

describe('coordination — literal constants (HYPERPARAMETERS.md alignment)', () => {
  it('MINHASH_NUM_PERM === 128', () => {
    expect(MINHASH_NUM_PERM).toBe(128);
  });
  it('LSH_BANDS === 16', () => {
    expect(LSH_BANDS).toBe(16);
  });
  it('LSH_ROWS === 8', () => {
    expect(LSH_ROWS).toBe(8);
  });
  it('COORDINATION_SIMILARITY === 0.7', () => {
    expect(COORDINATION_SIMILARITY).toBe(0.7);
  });
  it('COORDINATION_MIN_CLUSTER_SIZE === 50', () => {
    expect(COORDINATION_MIN_CLUSTER_SIZE).toBe(50);
  });
  it('module-load sanity: bands × rows === num_perm', () => {
    expect(LSH_BANDS * LSH_ROWS).toBe(MINHASH_NUM_PERM);
  });
});

describe('minHash — signature properties', () => {
  it('signature length === 128 for default num_perm', () => {
    const sig = minHash('hello world this is a test message');
    expect(sig.length).toBe(128);
  });

  it('signature length === num_perm when overridden', () => {
    const sig = minHash('hello world', 64);
    expect(sig.length).toBe(64);
  });

  it('deterministic — same input → same signature', () => {
    const text = 'GME to the moon 100x rocket';
    const a = minHash(text);
    const b = minHash(text);
    expect(a).toEqual(b);
  });

  it('empty / too-short text → signature of length 128 (all sentinel)', () => {
    const sig = minHash('');
    expect(sig.length).toBe(128);
  });
});

describe('lshCluster — banding LSH groups near-duplicates', () => {
  it('60 near-duplicate messages → returns a cluster of size >= 50', () => {
    const base = 'GME to the moon 100x rocket buy now stonks only go up ';
    const messages = Array.from({ length: 60 }, (_, i) => ({
      id: `m-${i}`,
      minhash: minHash(`${base}variation${i % 4}`),
    }));
    const clusters = lshCluster(messages);
    const largest = clusters.reduce((m, c) => Math.max(m, c.length), 0);
    expect(largest).toBeGreaterThanOrEqual(50);
  });

  it('60 disjoint random messages → no cluster of size ≥ 50', () => {
    const messages = Array.from({ length: 60 }, (_, i) => ({
      id: `m-${i}`,
      minhash: minHash(`completely_unique_${i}_${Math.random()}_${'q'.repeat(i % 7)}_${i * 17}`),
    }));
    const clusters = lshCluster(messages);
    const largest = clusters.reduce((m, c) => Math.max(m, c.length), 0);
    expect(largest).toBeLessThan(50);
  });
});

describe('detectCoordinatedPosting — null below threshold, fires on synthetic pump', () => {
  it('30 messages (below MIN_CLUSTER_SIZE=50) → null', () => {
    const base = 'GME to the moon ';
    const messages = Array.from({ length: 30 }, (_, i) => ({
      id: `m-${i}`,
      text: `${base}variant${i % 3}`,
    }));
    const result = detectCoordinatedPosting(
      'GME',
      new Date(0),
      new Date(),
      messages,
    );
    expect(result).toBeNull();
  });

  it('50 near-duplicate pump messages → flagged cluster', () => {
    const base = 'GME to the moon 100x rocket buy now to the moon ';
    const messages = Array.from({ length: 60 }, (_, i) => ({
      id: `m-${i}`,
      text: `${base}var${i % 4}`,
    }));
    const result = detectCoordinatedPosting(
      'GME',
      new Date(0),
      new Date(),
      messages,
    );
    expect(result).not.toBeNull();
    expect(result!.is_flagged).toBe(true);
    expect(result!.cluster_size).toBeGreaterThanOrEqual(50);
    expect(result!.similarity_threshold).toBe(COORDINATION_SIMILARITY);
    expect(result!.ticker).toBe('GME');
  });

  it('empty messages → null (no work, no flag)', () => {
    const result = detectCoordinatedPosting('GME', new Date(0), new Date(), []);
    expect(result).toBeNull();
  });
});

describe('empirical collision rate — T-20-C-03-04 sanity', () => {
  it(
    'on 200 random-text pairs the false-positive cluster rate is < 0.10',
    () => {
      // T-20-C-03-04 mitigation: theoretical FP for two disjoint docs is
      // ~1 - (1 - 0.7^8)^16 ≈ 0.04; sample budget = 200 pairs to keep CI test
      // time bounded (sha256 × 128 perm × 2 docs × N pairs dominates). Binomial
      // precision at n=200 still detects a >10% rate at α=0.05.
      let collisions = 0;
      const pairs = 200;
      for (let i = 0; i < pairs; i++) {
        const a = minHash(`alpha-${i}-${'A'.repeat(((i * 13) % 23) + 4)}-${Math.random()}`);
        const b = minHash(`beta-${i}-${'B'.repeat(((i * 17) % 19) + 4)}-${Math.random()}`);
        const cs = lshCluster([
          { id: 'a', minhash: a },
          { id: 'b', minhash: b },
        ]);
        if (cs.some((c) => c.length >= 2)) collisions++;
      }
      const rate = collisions / pairs;
      // eslint-disable-next-line no-console
      console.log(`[coordination] empirical_minhash_pair_collision_rate=${rate}`);
      expect(rate).toBeLessThan(0.1);
    },
    30_000,
  );
});
