#!/usr/bin/env tsx
/* eslint-disable no-console */
// @model-card: docs/cards/MODEL-CARD-per-aspect-aggregate.md
// scripts/eval-aspect-kappa.ts
// Plan 20-B-05 Task — Cohen's κ harness for aspect-tag agreement between the
// Gemini per-doc classifier and a human-labeled fixture.
//
// CRITICAL: this script measures κ; it MUST NEVER assert a threshold. The
// κ ≥ 0.6 ship gate lives in HYPERPARAMETERS.md and the model card; cutover
// gating is the cron's job, not this eval's. Returning a number — not a
// pass/fail — keeps the harness reusable for ad-hoc operator runs and avoids
// duplicating the threshold in two places (S1 single-source-of-truth).
//
// Usage:
//   npx tsx scripts/eval-aspect-kappa.ts \
//     [--fixture=tests/golden-tickers/_aspect_labels.json] \
//     [--out=/tmp/aspect-kappa-<date>.json]
//
// The script:
//   1. Loads the labeled fixture (doc_id + text + human-labeled aspects[]).
//   2. Calls classifyDocumentsBatch() in one batched Gemini request (cost cap
//      enforced upstream by COST_CAP_DOCS_PER_TICKER — caller should chunk if
//      fixture > 30).
//   3. Computes per-aspect Cohen's κ on the binary indicator (aspect ∈ tags?)
//      across all docs, plus a macro-averaged κ over the 7 aspects.
//   4. Writes a JSON report to /tmp.
//
// Cohen's κ on binary labels (k1 = human-has-aspect, k2 = model-has-aspect):
//   p_o = (n11 + n00) / N
//   p_e = ((n11+n10)*(n11+n01) + (n00+n10)*(n00+n01)) / N²
//   κ   = (p_o − p_e) / (1 − p_e)        [returns NaN when p_e == 1 — no variance]

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { classifyDocumentsBatch, type PerDocInput } from '../src/lib/sentiment/per-doc-classifier';
import { ASPECT_TAGS, type AspectTag } from '../src/lib/sentiment/aspects';

interface LabeledDoc {
  doc_id: string;
  text: string;
  source?: 'news' | 'community';
  human_aspects: AspectTag[];
  /** Optional free-text describing the label decision — for runbook auditability. */
  notes?: string;
}

interface PerAspectKappa {
  aspect: AspectTag;
  n11: number;
  n10: number;
  n01: number;
  n00: number;
  kappa: number | null;
}

interface Report {
  ran_at: string;
  fixture_path: string;
  n_docs: number;
  per_aspect: PerAspectKappa[];
  macro_avg_kappa: number | null;
  /** Note for the operator — NOT an assertion. Threshold lives in HYPERPARAMETERS.md. */
  ship_gate_reference: 'HYPERPARAMETERS.md#per_aspect_aggregate (kappa >= 0.6)';
}

function getArg(flag: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.split('=')[1] : fallback;
}

function cohenKappaBinary(n11: number, n10: number, n01: number, n00: number): number | null {
  const N = n11 + n10 + n01 + n00;
  if (N === 0) return null;
  const p_o = (n11 + n00) / N;
  const row1 = (n11 + n10) / N;
  const row0 = (n01 + n00) / N;
  const col1 = (n11 + n01) / N;
  const col0 = (n10 + n00) / N;
  const p_e = row1 * col1 + row0 * col0;
  if (Math.abs(1 - p_e) < 1e-12) return null;
  return (p_o - p_e) / (1 - p_e);
}

async function main(): Promise<void> {
  const fixturePath = resolve(
    process.cwd(),
    getArg('--fixture', 'tests/golden-tickers/_aspect_labels.json'),
  );
  const outPath = getArg('--out', `/tmp/aspect-kappa-${new Date().toISOString().slice(0, 10)}.json`);

  const raw = readFileSync(fixturePath, 'utf8');
  const fixture = JSON.parse(raw) as LabeledDoc[];
  if (!Array.isArray(fixture) || fixture.length === 0) {
    throw new Error(`fixture at ${fixturePath} is empty or invalid`);
  }

  const inputs: PerDocInput[] = fixture.map((d) => ({
    doc_id: d.doc_id,
    text: d.text,
    source: d.source ?? 'news',
  }));

  console.log(`[aspect-kappa] classifying ${inputs.length} docs via Gemini …`);
  const results = await classifyDocumentsBatch(inputs);
  const byId = new Map(results.map((r) => [r.doc_id, r]));

  const perAspect: PerAspectKappa[] = ASPECT_TAGS.map((aspect): PerAspectKappa => {
    let n11 = 0, n10 = 0, n01 = 0, n00 = 0;
    for (const doc of fixture) {
      const humanHas = doc.human_aspects.includes(aspect);
      const model = byId.get(doc.doc_id);
      const modelHas = !!model && model.aspects.includes(aspect);
      if (humanHas && modelHas) n11++;
      else if (humanHas && !modelHas) n10++;
      else if (!humanHas && modelHas) n01++;
      else n00++;
    }
    return { aspect, n11, n10, n01, n00, kappa: cohenKappaBinary(n11, n10, n01, n00) };
  });

  const validKappas = perAspect.map((p) => p.kappa).filter((k): k is number => k != null && Number.isFinite(k));
  const macro = validKappas.length === 0 ? null : validKappas.reduce((a, b) => a + b, 0) / validKappas.length;

  const report: Report = {
    ran_at: new Date().toISOString(),
    fixture_path: fixturePath,
    n_docs: fixture.length,
    per_aspect: perAspect,
    macro_avg_kappa: macro,
    ship_gate_reference: 'HYPERPARAMETERS.md#per_aspect_aggregate (kappa >= 0.6)',
  };

  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`[aspect-kappa] wrote ${outPath}`);
  console.log(`[aspect-kappa] macro_avg_kappa = ${macro == null ? 'null' : macro.toFixed(3)}`);
  for (const p of perAspect) {
    console.log(`  ${p.aspect.padEnd(11)} κ=${p.kappa == null ? 'null' : p.kappa.toFixed(3)}  n11=${p.n11} n10=${p.n10} n01=${p.n01} n00=${p.n00}`);
  }
  console.log('[aspect-kappa] DONE — threshold lives in HYPERPARAMETERS.md, NOT here.');
}

if (require.main === module) {
  main().catch((e) => {
    console.error('[aspect-kappa] FAILED:', e);
    process.exit(1);
  });
}

export { cohenKappaBinary };
