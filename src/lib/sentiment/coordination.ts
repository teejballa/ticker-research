// @model-card: docs/cards/MODEL-CARD-bot-filter.md
//
// Plan 20-C-03 — MinHash + banding LSH for coordinated-posting detection.
//
// Params calibrated from Leskovec/Rajaraman/Ullman Ch. 3.4:
//   threshold ≈ (1/bands)^(1/rows)  →  (1/16)^(1/8) ≈ 0.707 ≈ 0.7 target
//   num_perm = bands × rows         →  16 × 8 = 128
//
// Detection requires ≥ COORDINATION_MIN_CLUSTER_SIZE=50 messages in a single
// cluster (NOT 2-3 incidental duplicates) — mitigates T-20-C-03-04 (MinHash
// collision false-positives).

import { createHash } from 'crypto';

export const MINHASH_NUM_PERM = 128;
export const LSH_BANDS = 16;
export const LSH_ROWS = 8;
export const COORDINATION_SIMILARITY = 0.7;
export const COORDINATION_MIN_CLUSTER_SIZE = 50;

// Sanity: bands × rows MUST equal num_perm. Asserted at module load.
if (LSH_BANDS * LSH_ROWS !== MINHASH_NUM_PERM) {
  throw new Error(
    `coordination.ts: LSH_BANDS (${LSH_BANDS}) × LSH_ROWS (${LSH_ROWS}) must equal MINHASH_NUM_PERM (${MINHASH_NUM_PERM})`,
  );
}

function shingles4(text: string): Set<string> {
  const s = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const out = new Set<string>();
  if (s.length < 4) return out;
  for (let i = 0; i <= s.length - 4; i++) out.add(s.slice(i, i + 4));
  return out;
}

/**
 * Hash a shingle to a uint32 with a seeded permutation (Broder 1997 style).
 * Uses sha256 for stability + portability (slower than xxHash but determinism
 * matters more than speed at 128 perm × ≤1000 messages per ticker).
 */
function hashSeeded(seed: number, s: string): number {
  const h = createHash('sha256');
  h.update(`${seed}:${s}`, 'utf8');
  const buf = h.digest();
  // First 4 bytes as uint32 — enough entropy for our cardinality budget.
  return buf.readUInt32BE(0);
}

export function minHash(text: string, num_perm: number = MINHASH_NUM_PERM): number[] {
  const sh = shingles4(text);
  const sig: number[] = new Array(num_perm).fill(0xffffffff);
  if (sh.size === 0) return sig;
  // Seeded permutations: for each of `num_perm` hash functions, take the
  // minimum hash across all shingles → that's the MinHash signature entry.
  for (let p = 0; p < num_perm; p++) {
    let min = 0xffffffff;
    for (const s of sh) {
      const v = hashSeeded(p, s);
      if (v < min) min = v;
    }
    sig[p] = min;
  }
  return sig;
}

/**
 * Banding LSH: split each signature into `LSH_BANDS` bands of `LSH_ROWS`
 * each. Hash each band → bucket. Ids that share any bucket form a candidate
 * pair. Return deduped clusters (transitive closure of candidate pairs).
 */
export function lshCluster(
  signatures: { id: string; minhash: number[] }[],
  threshold: number = COORDINATION_SIMILARITY,
): string[][] {
  void threshold; // threshold is informational — banding params encode it
  const buckets = new Map<string, string[]>();
  for (const { id, minhash } of signatures) {
    for (let b = 0; b < LSH_BANDS; b++) {
      const slice = minhash.slice(b * LSH_ROWS, (b + 1) * LSH_ROWS);
      const key = `${b}:${slice.join(',')}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(id);
    }
  }
  // Union-find over candidate pairs from any band match.
  const parent = new Map<string, string>();
  function find(x: string): string {
    if (!parent.has(x)) {
      parent.set(x, x);
      return x;
    }
    const p = parent.get(x)!;
    if (p === x) return x;
    const r = find(p);
    parent.set(x, r);
    return r;
  }
  function union(a: string, b: string) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  for (const ids of buckets.values()) {
    if (ids.length < 2) continue;
    const head = ids[0];
    for (let i = 1; i < ids.length; i++) union(head, ids[i]);
  }
  const groups = new Map<string, string[]>();
  for (const { id } of signatures) {
    const r = find(id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(id);
  }
  // Filter out singleton clusters (each id is its own root if no band matched).
  return Array.from(groups.values()).filter((g) => g.length >= 2);
}

/** Jaccard estimate from MinHash signatures (fraction of equal entries). */
function jaccard(a: number[], b: number[]): number {
  let eq = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] === b[i]) eq++;
  return n === 0 ? 0 : eq / n;
}

function avgPairwiseJaccard(sigs: number[][]): number {
  if (sigs.length < 2) return 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < sigs.length; i++) {
    for (let j = i + 1; j < sigs.length; j++) {
      sum += jaccard(sigs[i], sigs[j]);
      n++;
    }
  }
  return n === 0 ? 0 : sum / n;
}

export interface CoordinationClusterRow {
  ticker: string;
  window_start: Date;
  window_end: Date;
  n_messages: number;
  similarity_threshold: number;
  cluster_size: number;
  is_flagged: boolean;
  member_ids: string[];
}

export function detectCoordinatedPosting(
  ticker: string,
  window_start: Date,
  window_end: Date,
  messages: { id: string; text: string }[],
  window_size: number = COORDINATION_MIN_CLUSTER_SIZE,
): CoordinationClusterRow | null {
  if (messages.length === 0) return null;
  const sigs = messages.map((m) => ({ id: m.id, minhash: minHash(m.text) }));
  const clusters = lshCluster(sigs);
  let largest: string[] = [];
  for (const c of clusters) if (c.length > largest.length) largest = c;
  const sigMap = new Map(sigs.map((s) => [s.id, s.minhash]));
  const largestSigs = largest.map((id) => sigMap.get(id)!).filter(Boolean);
  const avg_jaccard = avgPairwiseJaccard(largestSigs);
  const is_flagged =
    largest.length >= window_size && avg_jaccard >= COORDINATION_SIMILARITY;

  if (!is_flagged) return null;
  return {
    ticker,
    window_start,
    window_end,
    n_messages: messages.length,
    similarity_threshold: COORDINATION_SIMILARITY,
    cluster_size: largest.length,
    is_flagged: true,
    member_ids: largest,
  };
}
