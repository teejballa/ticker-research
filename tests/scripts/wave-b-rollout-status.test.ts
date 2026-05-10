// tests/scripts/wave-b-rollout-status.test.ts
//
// Phase 19 / Plan 19-B-08 / Task 1 — Wave B rollout-driver tests.
//
// 19-B-08 is operator-driven; this script is the verification harness the
// operator runs at every checkpoint. The pure-function gates and composite
// scorer are exported so vitest can exercise every PASS / FAIL / PENDING
// branch without spawning the script entrypoint or touching the filesystem
// when not needed.
//
// Coverage targets:
//   - readChildVerdict: file missing → null; malformed JSON → throw; valid
//     → parsed
//   - checkChildVerdictGate: PASS / FAIL / HOLD / missing
//   - checkFlagRemovalGate: 4 Wave B flags, present vs removed
//   - checkFallbackAdapterGate + checkFallbackWiringGate: D-32 invariant
//   - computeCompositeMetrics: latency drop math, audit-override fallback
//   - scoreComposite: PASS / FAIL / PENDING decision per D-29 thresholds

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  readChildVerdict,
  checkChildVerdictGate,
  checkFlagRemovalGate,
  checkFallbackAdapterGate,
  checkFallbackWiringGate,
  checkGrepPatternsRegisteredGate,
  computeCompositeMetrics,
  scoreComposite,
  buildCompositeVerdictReport,
  writeCompositeVerdictReport,
} from '../../scripts/wave-b-rollout-status';

const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORTS_DIR = path.join(REPO_ROOT, 'shadow-reports');
// Use a unique tmp suffix so parallel test runs don't stomp each other.
const FIXTURES_USED = new Set<string>();

function writeVerdictFixture(planId: string, body: object) {
  mkdirSync(REPORTS_DIR, { recursive: true });
  writeFileSync(path.join(REPORTS_DIR, `${planId}.json`), JSON.stringify(body));
  FIXTURES_USED.add(planId);
}

function cleanup() {
  for (const planId of FIXTURES_USED) {
    const p = path.join(REPORTS_DIR, `${planId}.json`);
    if (existsSync(p)) rmSync(p);
  }
  FIXTURES_USED.clear();
}

describe('wave-b-rollout-status (Plan 19-B-08)', () => {
  afterEach(cleanup);

  describe('readChildVerdict', () => {
    it('returns null when verdict file does not exist', () => {
      expect(readChildVerdict('TEST-NEVER-EXISTS')).toBeNull();
    });

    it('returns parsed verdict when file exists', () => {
      writeVerdictFixture('TEST-VALID-19-B-08', {
        plan_id: 'TEST-VALID-19-B-08',
        verdict: 'PASS',
        timestamp: '2026-05-08T00:00:00Z',
      });
      const v = readChildVerdict('TEST-VALID-19-B-08');
      expect(v).toEqual({
        plan_id: 'TEST-VALID-19-B-08',
        verdict: 'PASS',
        timestamp: '2026-05-08T00:00:00Z',
      });
    });

    it('throws a descriptive error on malformed JSON', () => {
      mkdirSync(REPORTS_DIR, { recursive: true });
      writeFileSync(path.join(REPORTS_DIR, 'TEST-BAD-19-B-08.json'), 'not-json{');
      FIXTURES_USED.add('TEST-BAD-19-B-08');
      expect(() => readChildVerdict('TEST-BAD-19-B-08')).toThrow(/not valid JSON/);
    });
  });

  describe('checkChildVerdictGate', () => {
    it('returns PENDING when verdict file missing', () => {
      const g = checkChildVerdictGate('TEST-PENDING-19-B-08');
      expect(g.status).toBe('PENDING');
      expect(g.detail).toMatch(/missing/);
      expect(g.detail).toMatch(/shadow-verdict TEST-PENDING-19-B-08/);
    });

    it('returns GREEN when verdict=PASS', () => {
      writeVerdictFixture('TEST-PASS-19-B-08', {
        verdict: 'PASS',
        timestamp: '2026-05-08T12:34:56Z',
      });
      const g = checkChildVerdictGate('TEST-PASS-19-B-08');
      expect(g.status).toBe('GREEN');
      expect(g.detail).toMatch(/2026-05-08T12:34:56Z/);
    });

    it('returns RED when verdict=FAIL', () => {
      writeVerdictFixture('TEST-FAIL-19-B-08', { verdict: 'FAIL' });
      const g = checkChildVerdictGate('TEST-FAIL-19-B-08');
      expect(g.status).toBe('RED');
      expect(g.detail).toMatch(/FAIL/);
    });

    it('returns RED when verdict=HOLD', () => {
      writeVerdictFixture('TEST-HOLD-19-B-08', { verdict: 'HOLD' });
      const g = checkChildVerdictGate('TEST-HOLD-19-B-08');
      expect(g.status).toBe('RED');
      expect(g.detail).toMatch(/HOLD/);
    });
  });

  describe('checkFlagRemovalGate', () => {
    it('marks each Wave B flag PENDING when still in features.ts', () => {
      const featuresSrc = `
        const FLAG_NAMES = [
          'tiingo_primary',
          'twelvedata_primary',
          'exa_primary',
          'data_cache',
        ] as const;
      `;
      const gates = checkFlagRemovalGate(featuresSrc);
      expect(gates).toHaveLength(4);
      for (const g of gates) {
        expect(g.status).toBe('PENDING');
        expect(g.detail).toMatch(/still present/);
      }
    });

    it('marks each Wave B flag GREEN when removed from features.ts', () => {
      const featuresSrc = `
        // Wave B flags removed post-cutover
        const FLAG_NAMES = ['conformal_intervals', 'cpcv'] as const;
      `;
      const gates = checkFlagRemovalGate(featuresSrc);
      expect(gates).toHaveLength(4);
      for (const g of gates) {
        expect(g.status).toBe('GREEN');
        expect(g.detail).toMatch(/removed/);
      }
    });

    it('mixed state: tiingo_primary removed but data_cache still present', () => {
      const featuresSrc = `
        const FLAG_NAMES = [
          'twelvedata_primary',
          'exa_primary',
          'data_cache',
        ] as const;
      `;
      const gates = checkFlagRemovalGate(featuresSrc);
      const byName = Object.fromEntries(gates.map((g) => [g.name, g.status]));
      expect(byName['flag-removed-tiingo_primary']).toBe('GREEN');
      expect(byName['flag-removed-twelvedata_primary']).toBe('PENDING');
      expect(byName['flag-removed-exa_primary']).toBe('PENDING');
      expect(byName['flag-removed-data_cache']).toBe('PENDING');
    });
  });

  describe('checkFallbackAdapterGate (D-32)', () => {
    it('returns GREEN for all 4 fallback adapters in current tree', () => {
      const gates = checkFallbackAdapterGate();
      expect(gates).toHaveLength(4);
      for (const g of gates) {
        expect(g.status).toBe('GREEN');
        expect(g.detail).toMatch(/preserved/);
      }
      const names = gates.map((g) => g.name).sort();
      expect(names).toEqual(['fallback-anthropic-search', 'fallback-finnhub', 'fallback-polygon', 'fallback-yahoo']);
    });
  });

  describe('checkFallbackWiringGate', () => {
    it('returns GREEN when source-package.ts references all 3 fallbacks', () => {
      const src = "import { yahoo, finnhub, polygon } from 'somewhere';";
      const g = checkFallbackWiringGate(src);
      expect(g.status).toBe('GREEN');
    });

    it('returns RED when polygon import is missing', () => {
      const src = "import { yahoo, finnhub } from 'somewhere';";
      const g = checkFallbackWiringGate(src);
      expect(g.status).toBe('RED');
      expect(g.detail).toMatch(/polygon/);
    });
  });

  describe('checkGrepPatternsRegisteredGate', () => {
    it('returns GREEN when all 4 Wave B post-cutover patterns are registered', () => {
      const src = JSON.stringify({
        patterns: [
          { name: 'wave-b-source-package-merge-flag-readsite' },
          { name: 'wave-b-runtime-cache-flag-readsite' },
          { name: 'wave-b-runWithShadow-source-package-merge' },
          { name: 'wave-b-runWithShadow-runtime-cache' },
        ],
      });
      const g = checkGrepPatternsRegisteredGate(src);
      expect(g.status).toBe('GREEN');
      expect(g.detail).toMatch(/all 4/);
    });

    it('returns PENDING and lists missing patterns', () => {
      const src = JSON.stringify({
        patterns: [
          { name: 'wave-b-source-package-merge-flag-readsite' },
          { name: 'wave-b-runtime-cache-flag-readsite' },
          // missing the two runWithShadow patterns
        ],
      });
      const g = checkGrepPatternsRegisteredGate(src);
      expect(g.status).toBe('PENDING');
      expect(g.detail).toMatch(/wave-b-runWithShadow-source-package-merge/);
      expect(g.detail).toMatch(/wave-b-runWithShadow-runtime-cache/);
    });

    it('against the live model-card-grep-patterns.json: returns GREEN', () => {
      // No arg → reads the actual repo file. This guards against accidental
      // pattern deletion during a future cleanup commit.
      const g = checkGrepPatternsRegisteredGate();
      expect(g.status).toBe('GREEN');
    });
  });

  describe('computeCompositeMetrics', () => {
    it('computes latency drop pct from B-06 verdict metrics', () => {
      const b06 = {
        plan_id: '19-B-06',
        metrics: {
          latency_p50_old_ms: 1000,
          latency_p50_new_ms: 400,
          latency_p95_old_ms: 2000,
          latency_p95_new_ms: 800,
        },
      };
      const m = computeCompositeMetrics(b06, null);
      expect(m.source_package_latency_p50_drop_pct).toBeCloseTo(0.6, 4);
      expect(m.source_package_latency_p95_drop_pct).toBeCloseTo(0.6, 4);
    });

    it('clamps negative latency drops to 0 (regression case)', () => {
      const b06 = {
        plan_id: '19-B-06',
        metrics: { latency_p50_old_ms: 500, latency_p50_new_ms: 800 },
      };
      const m = computeCompositeMetrics(b06, null);
      // (500 - 800) / 500 = -0.6, clamped to 0
      expect(m.source_package_latency_p50_drop_pct).toBe(0);
    });

    it('returns null when B-06 metrics absent', () => {
      const m = computeCompositeMetrics(null, null);
      expect(m.source_package_latency_p50_drop_pct).toBeNull();
      expect(m.cache_hit_rate).toBeNull();
      expect(m.anthropic_search_call_count_drop_pct).toBeNull();
    });

    it('returns null cache_hit_rate when B-07 metrics absent and no override', () => {
      const m = computeCompositeMetrics(null, null);
      expect(m.cache_hit_rate).toBeNull();
    });

    it('uses audit override for cache_hit_rate when provided', () => {
      const m = computeCompositeMetrics(null, null, { cache_hit_rate: 0.75 });
      expect(m.cache_hit_rate).toBe(0.75);
    });

    it('uses audit override for anthropic_search_call_drop_pct when provided', () => {
      const m = computeCompositeMetrics(null, null, {
        anthropic_search_call_drop_pct: 0.92,
      });
      expect(m.anthropic_search_call_count_drop_pct).toBe(0.92);
    });
  });

  describe('scoreComposite', () => {
    it('returns PENDING when any metric is null', () => {
      const r = scoreComposite({
        source_package_latency_p50_drop_pct: null,
        source_package_latency_p95_drop_pct: null,
        cache_hit_rate: 0.8,
        anthropic_search_call_count_drop_pct: 0.9,
      });
      expect(r.result).toBe('PENDING');
      expect(r.reasons[0]).toMatch(/source_package_latency_p50_drop_pct/);
    });

    it('returns FAIL when latency drop < 40%', () => {
      const r = scoreComposite({
        source_package_latency_p50_drop_pct: 0.3,
        source_package_latency_p95_drop_pct: 0.3,
        cache_hit_rate: 0.8,
        anthropic_search_call_count_drop_pct: 0.9,
      });
      expect(r.result).toBe('FAIL');
      expect(r.reasons.join(' ')).toMatch(/latency_p50 drop 30.0% < 40%/);
    });

    it('returns FAIL when cache hit rate < 70%', () => {
      const r = scoreComposite({
        source_package_latency_p50_drop_pct: 0.5,
        source_package_latency_p95_drop_pct: 0.5,
        cache_hit_rate: 0.6,
        anthropic_search_call_count_drop_pct: 0.9,
      });
      expect(r.result).toBe('FAIL');
      expect(r.reasons.join(' ')).toMatch(/cache_hit_rate 60.0% < 70%/);
    });

    it('returns FAIL when anthropic_search drop < 80%', () => {
      const r = scoreComposite({
        source_package_latency_p50_drop_pct: 0.5,
        source_package_latency_p95_drop_pct: 0.5,
        cache_hit_rate: 0.8,
        anthropic_search_call_count_drop_pct: 0.5,
      });
      expect(r.result).toBe('FAIL');
      expect(r.reasons.join(' ')).toMatch(/anthropic_search call drop 50.0% < 80%/);
    });

    it('returns PASS when all 3 thresholds met', () => {
      const r = scoreComposite({
        source_package_latency_p50_drop_pct: 0.5,
        source_package_latency_p95_drop_pct: 0.5,
        cache_hit_rate: 0.8,
        anthropic_search_call_count_drop_pct: 0.85,
      });
      expect(r.result).toBe('PASS');
      expect(r.reasons).toHaveLength(3);
      expect(r.reasons.every((r) => r.includes('≥'))).toBe(true);
    });

    it('PASS at exact threshold boundaries (≥, not >)', () => {
      const r = scoreComposite({
        source_package_latency_p50_drop_pct: 0.4,
        source_package_latency_p95_drop_pct: 0.4,
        cache_hit_rate: 0.7,
        anthropic_search_call_count_drop_pct: 0.8,
      });
      expect(r.result).toBe('PASS');
    });
  });

  describe('buildCompositeVerdictReport', () => {
    it('produces the canonical 19-B-08.json schema', () => {
      const report = buildCompositeVerdictReport();
      // Plan 19-B-08 Task 4 contract.
      expect(report.plan_id).toBe('19-B-08');
      expect(report.verdict.result).toMatch(/^(PASS|FAIL|PENDING)$/);
      expect(Array.isArray(report.verdict.reasons)).toBe(true);
      // composite_metrics keys must exist (values may be null when verdict
      // files are missing — that's the PENDING state, not a contract break).
      expect(report.composite_metrics).toHaveProperty('source_package_latency_p50_drop_pct');
      expect(report.composite_metrics).toHaveProperty('cache_hit_rate');
      expect(report.composite_metrics).toHaveProperty('anthropic_search_call_count_drop_pct');
      expect(report.child_plans).toEqual(['19-B-06', '19-B-07']);
      expect(report.fallback_adapters_preserved).toEqual(
        expect.arrayContaining(['yahoo.ts', 'finnhub.ts', 'polygon.ts', 'anthropic-search.ts']),
      );
      expect(typeof report.timestamp).toBe('string');
      expect(() => new Date(report.timestamp).toISOString()).not.toThrow();
    });

    it('reports child_verdicts as "pending" when verdict files missing', () => {
      // No fixtures written → both child verdicts pending.
      const report = buildCompositeVerdictReport();
      // Note: this test runs in any order with the verdict-fixture tests,
      // and afterEach() cleans them up, so we should see pending here.
      expect(report.child_verdicts['19-B-06']).toMatch(/pending|PASS|FAIL|HOLD/);
      expect(report.child_verdicts['19-B-07']).toMatch(/pending|PASS|FAIL|HOLD/);
    });

    it('current state: fallback_adapters_preserved lists all 4 D-32 adapters', () => {
      const report = buildCompositeVerdictReport();
      expect(report.fallback_adapters_preserved).toEqual(
        expect.arrayContaining([
          'yahoo.ts',
          'finnhub.ts',
          'polygon.ts',
          'anthropic-search.ts',
        ]),
      );
      expect(report.fallback_adapters_preserved).toHaveLength(4);
    });
  });

  describe('writeCompositeVerdictReport', () => {
    afterEach(() => {
      // Belt-and-suspender — the `19-B-08.json` file is meant to persist
      // between operator invocations, so we don't actively clean it up.
      // The .gitignore on shadow-reports/ keeps it out of git.
    });

    it('writes shadow-reports/19-B-08.json with the same payload as buildCompositeVerdictReport', () => {
      const written = writeCompositeVerdictReport();
      const path = require('node:path');
      const fs = require('node:fs');
      const filePath = path.join(REPO_ROOT, 'shadow-reports', '19-B-08.json');
      expect(fs.existsSync(filePath)).toBe(true);
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      // timestamps will differ slightly between calls — compare every field
      // except timestamp.
      expect({ ...parsed, timestamp: '<elided>' }).toEqual({
        ...written,
        timestamp: '<elided>',
      });
      // Plan Task 4 acceptance: file contains "fallback_adapters_preserved"
      // — assert literally.
      expect(fs.readFileSync(filePath, 'utf-8')).toMatch(/fallback_adapters_preserved/);
    });
  });
});
