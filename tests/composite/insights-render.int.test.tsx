// @vitest-environment jsdom
// tests/composite/insights-render.int.test.tsx
// Phase 24 Wave 4 Task 24-04-02 (REASON-04).
//
// Verifies /insights/calibration surfaces the composite reliability card
// for classifier_version='cipher-composite-v1' when eval-brier's payload
// includes it. Two-part contract:
//
//   1. Structural: page.tsx is data-driven — no hardcoded classifier
//      whitelist that could exclude 'cipher-composite-v1' (Info #8
//      false-confidence gap defence). Verified by file-source grep.
//   2. Render: mount the page's ReliabilityDiagram directly with a
//      cipher-composite-v1 result and assert the card renders with the
//      classifier version visible.
//
// Info #8 defence: previous scaffold called fetch(http://localhost:3000/...)
// and required a running dev server + seeded DB. Wave 3 established the
// pattern of file-source structural verification for env-dependent
// integrations. This test follows that pattern so it runs in CI without
// a running server.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { ReliabilityDiagram } from '@/app/insights/calibration/components/ReliabilityDiagram';
import type { EvalBrierResult } from '../../scripts/eval-brier';

// ─────────────────────────────────────────────────────────────────────────
// Structural: page.tsx is data-driven — REASON-04 wiring
// ─────────────────────────────────────────────────────────────────────────

describe('/insights/calibration — page.tsx wiring (REASON-04)', () => {
  const pagePath = path.resolve(process.cwd(), 'src/app/insights/calibration/page.tsx');
  const pageSrc = readFileSync(pagePath, 'utf8');

  it('page renders one ReliabilityDiagram per classifier_version (data-driven .map)', () => {
    // If page.tsx starts filtering the results array or hardcoding a
    // classifier_version whitelist, this assertion has to be revisited.
    expect(pageSrc).toMatch(/payload\.results\.map/);
    expect(pageSrc).toMatch(/<ReliabilityDiagram\s+result=/);
  });

  it('page.tsx does NOT hardcode a classifier_version whitelist excluding cipher-composite-v1', () => {
    // A regex-style whitelist would look like:
    //   payload.results.filter(r => r.classifier_version === 'foo')
    // or a hardcoded array like ['foo','bar'] used for exclusion.
    // Assert neither pattern appears — the .map is over the raw results.
    expect(pageSrc).not.toMatch(/results\.filter\s*\(/);
    expect(pageSrc).not.toMatch(/ALLOWED_CLASSIFIERS/);
    expect(pageSrc).not.toMatch(/CLASSIFIER_WHITELIST/);
  });

  it('eval-brier.ts includes cipher-composite-v1 in the composite loop (Wave 3 wiring)', () => {
    const evalBrierPath = path.resolve(process.cwd(), 'scripts/eval-brier.ts');
    const src = readFileSync(evalBrierPath, 'utf8');
    // Wave 3 (24-03) added a `compositeVersions` array + a loop that pushes
    // one EvalBrierResult per composite classifier version.
    expect(src).toMatch(/cipher-composite-v1/);
    expect(src).toMatch(/compositeVersions/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Render: composite reliability card mounts when payload includes it
// ─────────────────────────────────────────────────────────────────────────

describe('/insights/calibration — composite reliability card render (REASON-04)', () => {
  function makeCompositeResult(overrides: Partial<EvalBrierResult> = {}): EvalBrierResult {
    return {
      computed_at: '2026-09-29T03:00:00.000Z',
      classifier_version: 'cipher-composite-v1',
      n: 250,
      base_rate: 0,
      brier: 0.22,
      reliability: 0.04,
      resolution: 0,
      uncertainty: 0,
      bs_check: 0,
      corp: {
        recalibrated_curve: {
          x: [0.1, 0.3, 0.5, 0.7, 0.9],
          y: [0.12, 0.28, 0.51, 0.72, 0.88],
        },
        bin_counts: [40, 55, 60, 55, 40],
      },
      status: 'evaluated',
      ship_gate: { threshold: 0.24, met: true },
      ...overrides,
    };
  }

  it('renders a ReliabilityDiagram card that surfaces classifier_version=cipher-composite-v1', () => {
    const result = makeCompositeResult();
    render(<ReliabilityDiagram result={result} />);
    // The diagram card shows the classifier_version somewhere in its heading
    // or metadata. Assert the string appears in the rendered DOM.
    expect(document.body.textContent).toMatch(/cipher-composite-v1/);
  });
});
