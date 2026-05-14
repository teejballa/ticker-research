// tests/unit/golden-ticker-manifest.unit.test.ts
//
// Plan 20-D-04 Task 1 — Zod-schema validation of _manifest.json + 8-category
// coverage assertion + per-dimension exemplar-variance assertion (>0.5 std dev).
//
// This file is the schema source-of-truth for the golden-ticker manifest. The
// orchestrated suite (Task 5) and the CLI runner (Task 8) both load the JSON;
// this test enforces that any malformed shape on disk fails at unit time.

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';

const TickerCategory = z.enum([
  'large-cap-equity',
  'mid-cap-equity',
  'meme-echo-chamber',
  'recently-public',
  'ETF',
  'SPAC',
  'ADR',
  'micro-cap-low-coverage',
]);
type TickerCategory = z.infer<typeof TickerCategory>;

const RotationPolicy = z.enum(['static', 'monthly']);

const ManifestTicker = z
  .object({
    symbol: z.string().min(1).max(20),
    category: TickerCategory,
    rotation_policy: RotationPolicy.default('static'),
    current_symbol: z.string().optional(),
    rationale: z.string().min(20),
  })
  .superRefine((t, ctx) => {
    if (t.rotation_policy === 'monthly' && !t.current_symbol) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'monthly rotation requires current_symbol',
        path: ['current_symbol'],
      });
    }
  });

export const ManifestSchema = z
  .object({
    version: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    tickers: z.array(ManifestTicker).length(8),
    required_categories: z.array(TickerCategory).length(8),
  })
  .superRefine((m, ctx) => {
    // Each category must appear exactly once.
    const seen = new Map<string, number>();
    for (const t of m.tickers) {
      seen.set(t.category, (seen.get(t.category) ?? 0) + 1);
    }
    for (const [cat, n] of seen.entries()) {
      if (n !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `category ${cat} appears ${n} times — must appear exactly once`,
          path: ['tickers'],
        });
      }
    }
    // Required categories must equal the categories present.
    const present = new Set(m.tickers.map((t) => t.category));
    for (const req of m.required_categories) {
      if (!present.has(req)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `required category ${req} missing from tickers`,
          path: ['required_categories'],
        });
      }
    }
    // Micro-cap slot must be monthly.
    const mc = m.tickers.find((t) => t.category === 'micro-cap-low-coverage');
    if (mc && mc.rotation_policy !== 'monthly') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'micro-cap-low-coverage slot must have rotation_policy=monthly',
        path: ['tickers'],
      });
    }
  });

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST_PATH = path.join(REPO_ROOT, 'tests/golden-tickers/_manifest.json');
const EXEMPLARS_DIR = path.join(REPO_ROOT, 'tests/golden-tickers/_human_labels');

const ALL_CATEGORIES: TickerCategory[] = [
  'large-cap-equity',
  'mid-cap-equity',
  'meme-echo-chamber',
  'recently-public',
  'ETF',
  'SPAC',
  'ADR',
  'micro-cap-low-coverage',
];

function makeValidManifest() {
  return {
    version: '2026-05-11',
    required_categories: [...ALL_CATEGORIES],
    tickers: [
      { symbol: 'AAPL', category: 'large-cap-equity', rotation_policy: 'static', rationale: 'Apex liquid large-cap baseline for numeric grounding.' },
      { symbol: 'DKNG', category: 'mid-cap-equity', rotation_policy: 'static', rationale: 'Mid-cap volatility profile retail-favorite signal mix.' },
      { symbol: 'GME', category: 'meme-echo-chamber', rotation_policy: 'static', rationale: 'Originating bug ticker — 100 percent bullish vendor tag.' },
      { symbol: 'SOFI', category: 'recently-public', rotation_policy: 'static', rationale: 'Recently-public; sparse SEC filings; exercises recently-listed.' },
      { symbol: 'SPY', category: 'ETF', rotation_policy: 'static', rationale: 'ETF branch — security_type etf; tests non-equity shape.' },
      { symbol: 'DWAC', category: 'SPAC', rotation_policy: 'static', rationale: 'SPAC branch; thin fundamentals; SPAC-specific rendering.' },
      { symbol: 'TSM', category: 'ADR', rotation_policy: 'static', rationale: 'Taiwan Semi ADR — foreign primary listing exercise.' },
      { symbol: 'ROTATING-MICRO', category: 'micro-cap-low-coverage', rotation_policy: 'monthly', current_symbol: 'MICROCAP', rationale: 'Monthly rotation per S9; pool-driven selection.' },
    ],
  };
}

describe('ManifestSchema', () => {
  it('accepts a valid 8-ticker manifest with all 8 required categories', () => {
    expect(() => ManifestSchema.parse(makeValidManifest())).not.toThrow();
  });

  it('rejects a manifest with 7 tickers', () => {
    const m = makeValidManifest();
    m.tickers.pop();
    expect(() => ManifestSchema.parse(m)).toThrow();
  });

  it('rejects a manifest with 9 tickers', () => {
    const m = makeValidManifest();
    m.tickers.push({
      symbol: 'EXTRA',
      category: 'large-cap-equity',
      rotation_policy: 'static',
      rationale: 'extra duplicate entry should be rejected.',
    });
    expect(() => ManifestSchema.parse(m)).toThrow();
  });

  it('rejects a manifest with duplicate categories', () => {
    const m = makeValidManifest();
    m.tickers[1].category = 'large-cap-equity';
    expect(() => ManifestSchema.parse(m)).toThrow();
  });

  it('rejects a manifest missing one of the 8 required categories', () => {
    const m = makeValidManifest();
    m.tickers[5] = { symbol: 'EXTRA2', category: 'large-cap-equity', rotation_policy: 'static', rationale: 'replacement that creates a missing category.' } as any;
    expect(() => ManifestSchema.parse(m)).toThrow();
  });

  it('rejects micro-cap slot lacking rotation_policy=monthly', () => {
    const m = makeValidManifest();
    m.tickers[7].rotation_policy = 'static';
    expect(() => ManifestSchema.parse(m)).toThrow();
  });

  it('rejects version not in YYYY-MM-DD format', () => {
    const m = makeValidManifest();
    m.version = '2026-5-11';
    expect(() => ManifestSchema.parse(m)).toThrow();
  });

  it('rejects rationale shorter than 20 chars', () => {
    const m = makeValidManifest();
    m.tickers[0].rationale = 'short';
    expect(() => ManifestSchema.parse(m)).toThrow();
  });

  it('on-disk _manifest.json parses successfully', () => {
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    expect(() => ManifestSchema.parse(parsed)).not.toThrow();
  });

  it('on-disk manifest covers exactly the CONTEXT.md §S9 8-category set', () => {
    const parsed = ManifestSchema.parse(JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')));
    const present = new Set(parsed.tickers.map((t) => t.category));
    expect(present.size).toBe(8);
    for (const cat of ALL_CATEGORIES) {
      expect(present.has(cat)).toBe(true);
    }
  });
});

describe('exemplar variance gate (per-dimension std > 0.5)', () => {
  const DIMS = [
    'numeric_grounding',
    'citation_coverage',
    'narrative_coherence',
    'hedging_quality',
    'contradiction_handling',
  ] as const;

  it('every dimension has population std dev > 0.5 across all committed exemplars', () => {
    if (!fs.existsSync(EXEMPLARS_DIR)) {
      throw new Error(`exemplars dir missing: ${EXEMPLARS_DIR}`);
    }
    const files = fs.readdirSync(EXEMPLARS_DIR).filter((f) => f.endsWith('.json'));
    if (files.length < 30) {
      throw new Error(`exemplar count ${files.length} < 30 — Task 4 must commit ≥30 exemplars`);
    }
    const byDim: Record<string, number[]> = Object.fromEntries(DIMS.map((d) => [d, []]));
    for (const f of files) {
      const j = JSON.parse(fs.readFileSync(path.join(EXEMPLARS_DIR, f), 'utf8'));
      for (const d of DIMS) {
        const v = j.human_scores?.[d];
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 5) {
          throw new Error(`exemplar ${f} dimension ${d} bad value ${v}`);
        }
        byDim[d].push(v);
      }
    }
    for (const d of DIMS) {
      const arr = byDim[d];
      const m = arr.reduce((a, b) => a + b, 0) / arr.length;
      const variance = arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
      const std = Math.sqrt(variance);
      // Variance must exceed 0.5 for Pearson denominator to be well-defined.
      expect(std).toBeGreaterThan(0.5);
    }
  });
});
