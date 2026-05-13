/**
 * Plan 20-C-05 — End-to-end ablation integration test.
 *
 * Two synthetic 90-day scenarios:
 *   - Scenario A (uplift):  realized_alpha is correlated with
 *                           sentimentMomentumProduct (ρ≈0.15)
 *   - Scenario B (null):    realized_alpha is iid Gaussian, uncorrelated
 *                           with any feature
 *
 * All tests are deterministic — same seed produces byte-identical bootstrap
 * deltas. Reports are written to tmpdir to avoid polluting reports/ in CI.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  runAblation,
  type AblationDataRow,
  DEFAULT_ABLATION_CONFIG,
} from '../scripts/ablate-joint-features';

const SEED = 20260510;
const N_TICKERS = 200;
const N_DAYS = 90;
const ASOF = new Date('2026-05-12T00:00:00Z');

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rng: () => number): number {
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function makeFixture(
  scenario: 'uplift' | 'null',
  seed: number,
): AblationDataRow[] {
  const rng = mulberry32(seed);
  const rows: AblationDataRow[] = [];
  const baseDate = new Date('2026-02-11T00:00:00Z');
  for (let t = 0; t < N_TICKERS; t++) {
    const ticker = `T${t.toString().padStart(3, '0')}`;
    const capClass = ['large', 'mid', 'small'][t % 3];
    for (let d = 0; d < N_DAYS; d++) {
      const dt = new Date(baseDate.getTime() + d * 86400_000);
      const sentiment = 2 * rng() - 1; // [-1, +1]
      const returns_5d = 0.05 * gauss(rng);
      const volume_zscore = gauss(rng);
      const per_source_bull_pcts = [
        Math.max(0, Math.min(100, 50 + 20 * gauss(rng))),
        Math.max(0, Math.min(100, 50 + 20 * gauss(rng))),
        Math.max(0, Math.min(100, 50 + 20 * gauss(rng))),
      ];
      const sentiment_t_minus_3 = 2 * rng() - 1;
      let realized_alpha_7d: number;
      if (scenario === 'uplift') {
        // Design the signal so the JOINT feature bucket is what determines the
        // label, NOT just direction. We bucketize sentimentMomentumProduct into
        // 5 bins via the SAME breakpoints used by JOINT_FEATURE_BUCKETS, then
        // assign a strictly-monotone per-bucket alpha. This ensures the joint
        // pattern key has clear discriminative power over the sentiment-alone
        // key (which only sees direction).
        const smp = sentiment * Math.abs(returns_5d);
        const breakpoints = [-0.05, -0.01, 0.01, 0.05];
        let bucket = 0;
        for (let bi = 0; bi < breakpoints.length; bi++) {
          if (smp >= breakpoints[bi]) bucket = bi + 1;
        }
        // Per-bucket alpha: -0.10, -0.05, 0.00, 0.05, 0.10 — strongly monotone.
        const perBucketAlpha = [-0.10, -0.05, 0.0, 0.05, 0.10][bucket];
        realized_alpha_7d = perBucketAlpha + 0.005 * gauss(rng);
      } else {
        realized_alpha_7d = 0.02 * gauss(rng);
      }
      rows.push({
        ticker,
        date: dt.toISOString().slice(0, 10),
        sentiment,
        returns_5d,
        volume_zscore,
        per_source_bull_pcts,
        sentiment_t_minus_3,
        realized_alpha_7d,
        sentimentType: 'news',
        capClass,
        direction: (sentiment >= 0 ? 'bull' : 'bear') as 'bull' | 'bear',
      });
    }
  }
  return rows;
}

describe('ablate-joint-features integration (plan 20-C-05)', () => {
  let tmpReportsDir: string;

  beforeAll(() => {
    tmpReportsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ablation-'));
  });

  it('Scenario A (designed uplift): verdict=uplift AND ci95Lower > 0', async () => {
    const rows = makeFixture('uplift', SEED);
    const result = await runAblation({
      asOfDate: ASOF,
      ...DEFAULT_ABLATION_CONFIG,
      seed: SEED,
      dataSourceOverride: rows,
      reportsDir: tmpReportsDir,
    });
    expect(result.verdict).toBe('uplift');
    expect(result.bootstrap.ci95Lower).toBeGreaterThan(0);
  });

  it('Scenario B (null): verdict !== uplift', async () => {
    const rows = makeFixture('null', SEED);
    const result = await runAblation({
      asOfDate: ASOF,
      ...DEFAULT_ABLATION_CONFIG,
      seed: SEED,
      dataSourceOverride: rows,
      reportsDir: tmpReportsDir,
    });
    expect(result.verdict).not.toBe('uplift');
  });

  it('determinism: same seed produces byte-identical bootstrapDeltas', async () => {
    const rows = makeFixture('uplift', SEED);
    const r1 = await runAblation({
      asOfDate: ASOF,
      ...DEFAULT_ABLATION_CONFIG,
      seed: SEED,
      dataSourceOverride: rows,
      reportsDir: tmpReportsDir,
    });
    const r2 = await runAblation({
      asOfDate: ASOF,
      ...DEFAULT_ABLATION_CONFIG,
      seed: SEED,
      dataSourceOverride: rows,
      reportsDir: tmpReportsDir,
    });
    expect(r1.bootstrap.bootstrapDeltas).toEqual(r2.bootstrap.bootstrapDeltas);
  });

  it('literal assertions: nResamples=1000 and blockSize=7 surface in report', async () => {
    const rows = makeFixture('uplift', SEED);
    const result = await runAblation({
      asOfDate: ASOF,
      ...DEFAULT_ABLATION_CONFIG,
      seed: SEED,
      dataSourceOverride: rows,
      reportsDir: tmpReportsDir,
    });
    expect(result.bootstrap.nResamples).toBe(1000);
    expect(result.bootstrap.blockSize).toBe(7);
  });

  it('report file written with YAML frontmatter and required fields', async () => {
    const rows = makeFixture('uplift', SEED);
    const result = await runAblation({
      asOfDate: ASOF,
      ...DEFAULT_ABLATION_CONFIG,
      seed: SEED,
      dataSourceOverride: rows,
      reportsDir: tmpReportsDir,
    });
    expect(fs.existsSync(result.reportPath)).toBe(true);
    expect(result.reportPath).toMatch(
      /joint-features-ablation-\d{4}-\d{2}-\d{2}\.md$/,
    );
    const content = fs.readFileSync(result.reportPath, 'utf8');
    expect(content).toMatch(/^verdict:/m);
    expect(content).toMatch(/^decision:/m);
    expect(content).toMatch(/^ci95Lower:/m);
    expect(content).toMatch(/^ci95Upper:/m);
    expect(content).toMatch(/^blockSize:\s*7$/m);
    expect(content).toMatch(/^nResamples:\s*1000$/m);
  });

  it('multiple-testing guard: report body has NO per-feature p-values', async () => {
    const rows = makeFixture('uplift', SEED);
    const result = await runAblation({
      asOfDate: ASOF,
      ...DEFAULT_ABLATION_CONFIG,
      seed: SEED,
      dataSourceOverride: rows,
      reportsDir: tmpReportsDir,
    });
    const content = fs.readFileSync(result.reportPath, 'utf8');
    expect(content).not.toMatch(/sentimentMomentumProduct.*p\s*=\s*\d/);
    expect(content).not.toMatch(/sentimentVolumeInteraction.*p\s*=\s*\d/);
    expect(content).not.toMatch(/deltaSentiment3d.*p\s*=\s*\d/);
    expect(content).not.toMatch(/sentimentDispersion.*p\s*=\s*\d/);
  });

  it('null-result branch includes "No uplift detected" + "null result" prose', async () => {
    const rows = makeFixture('null', SEED);
    // Use a different reportsDir for the null run so the count_rolling logic
    // doesn't accidentally count previous uplift runs from the same test session.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ablation-null-'));
    const result = await runAblation({
      asOfDate: ASOF,
      ...DEFAULT_ABLATION_CONFIG,
      seed: SEED,
      dataSourceOverride: rows,
      reportsDir: dir,
    });
    if (result.verdict === 'null') {
      const content = fs.readFileSync(result.reportPath, 'utf8');
      expect(content).toMatch(/No uplift detected/);
      expect(content).toMatch(/null result/);
    } else {
      // Verdict was 'inconclusive' — still valid; just confirm not 'uplift'.
      expect(result.verdict).not.toBe('uplift');
    }
  });
});
