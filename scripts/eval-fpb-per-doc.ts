#!/usr/bin/env tsx
/* eslint-disable no-console */
// scripts/eval-fpb-per-doc.ts
// Plan 20-B-01 Task 9 — FPB held-out ECE eval for the Gemini per-doc classifier.
//
// Loads data/eval/fpb-held-out.csv (Malo et al. 2014; Apache-2 license),
// classifies each row via classifyDocumentsBatch (batched at COST_CAP=30/req),
// computes binned ECE per Guo et al. 2017, and writes /tmp/fpb-ece-{date}.json.
// Exits 0 on PASS (ECE ≤ 0.15) or 1 on FAIL (deferred cutover to 20-B-03).
//
// Ship gate: ECE_SHIP_GATE = 0.15 (CONTEXT.md line 113 acceptance).

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { classifyDocumentsBatch } from '../src/lib/sentiment/per-doc-classifier';
import { COST_CAP_DOCS_PER_TICKER } from '../src/lib/sentiment/select-top-docs';

const ECE_SHIP_GATE = 0.15;

interface FpbRow {
  text: string;
  label: 'positive' | 'neutral' | 'negative';
}

/**
 * Minimal RFC-4180-ish CSV parser sufficient for the FPB held-out file.
 *  - Skip blank lines and lines beginning with '#'
 *  - First non-comment / non-blank line is the header
 *  - Supports quoted fields with embedded commas; doubled quotes ("") escape a literal quote
 */
function parseCsv(text: string): FpbRow[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const rows: string[][] = [];
  for (const raw of lines) {
    const line = raw.replace(/^\uFEFF/, '');
    if (line === '' || line.startsWith('#')) continue;
    const cells: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { cur += ch; }
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ',') { cells.push(cur); cur = ''; }
        else cur += ch;
      }
    }
    cells.push(cur);
    rows.push(cells);
  }
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idxText = header.indexOf('text');
  const idxLabel = header.indexOf('label');
  if (idxText === -1 || idxLabel === -1) {
    throw new Error(`fpb CSV missing required columns; header was: ${JSON.stringify(header)}`);
  }
  return rows.slice(1).map((r) => ({
    text: (r[idxText] ?? '').trim(),
    label: ((r[idxLabel] ?? '').trim().toLowerCase()) as FpbRow['label'],
  })).filter((r) => r.text.length > 0);
}

/** Guo et al. 2017 binned ECE: Σᵢ (|Bᵢ|/N)·|conf(Bᵢ) − acc(Bᵢ)|. */
function ece(records: { confidence: number; correct: boolean }[], bins = 10): number {
  if (records.length === 0) return 0;
  const buckets = Array.from({ length: bins }, () => ({ conf_sum: 0, correct_count: 0, n: 0 }));
  for (const r of records) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor(r.confidence * bins)));
    buckets[idx].n += 1;
    buckets[idx].conf_sum += r.confidence;
    if (r.correct) buckets[idx].correct_count += 1;
  }
  const N = records.length;
  return buckets.reduce((acc, b) => {
    if (b.n === 0) return acc;
    const meanConf = b.conf_sum / b.n;
    const accuracy = b.correct_count / b.n;
    return acc + (b.n / N) * Math.abs(meanConf - accuracy);
  }, 0);
}

function polarityToLabel(polarity: number, confidence: number): FpbRow['label'] {
  // Treat low-confidence predictions as neutral (matches the FPB neutral class).
  if (confidence < 0.3 || Math.abs(polarity) < 0.2) return 'neutral';
  return polarity > 0 ? 'positive' : 'negative';
}

async function main(): Promise<void> {
  const csvPath = join(process.cwd(), 'data/eval/fpb-held-out.csv');
  const rows = parseCsv(readFileSync(csvPath, 'utf8'));
  console.log(`[eval-fpb-per-doc] loaded ${rows.length} rows from ${csvPath}`);

  const docs = rows.map((r, i) => ({ doc_id: `fpb-${i}`, text: r.text, source: 'news' as const }));
  const results: { confidence: number; correct: boolean }[] = [];
  const BATCH = COST_CAP_DOCS_PER_TICKER; // 30

  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = docs.slice(i, i + BATCH);
    let out: Awaited<ReturnType<typeof classifyDocumentsBatch>> = [];
    try {
      out = await classifyDocumentsBatch(batch, { ticker: 'FPB-EVAL' });
    } catch (e) {
      console.error(`[eval-fpb-per-doc] batch starting at ${i} failed:`, e);
      continue;
    }
    for (let j = 0; j < batch.length; j++) {
      const label = rows[i + j].label;
      const pred = out.find((p) => p.doc_id === batch[j].doc_id);
      if (!pred) continue;
      const predLabel = polarityToLabel(pred.polarity, pred.confidence);
      const correct = predLabel === label;
      results.push({ confidence: pred.confidence, correct });
    }
  }

  const eceVal = ece(results, 10);
  const passed = eceVal <= ECE_SHIP_GATE;
  const date = new Date().toISOString();
  const out = {
    date,
    n: results.length,
    ece: eceVal,
    ship_gate: ECE_SHIP_GATE,
    passed,
  };
  const outPath = `/tmp/fpb-ece-${date}.json`;
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  console.log(`[eval-fpb-per-doc] wrote ${outPath}`);
  console.log(passed ? 'PASS ECE ≤ 0.15' : 'FAIL ECE > 0.15 — defer cutover to 20-B-03');
  process.exit(passed ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
