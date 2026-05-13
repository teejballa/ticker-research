/**
 * Plan 20-B-05 — Monthly cron: aspect-kappa monitor.
 *
 * Schedule: '0 8 1 * *' (1st of each month, 08:00 UTC — outside US market
 * hours, same family as the existing tune-decay / agreement-calibration crons).
 * Auth: CRON_SECRET Bearer header (project convention — matches all other
 * /api/cron/* routes).
 *
 * Measures Cohen's κ between the Gemini per-doc classifier's aspect tags and
 * the human-labeled fixture at tests/golden-tickers/_aspect_labels.json over
 * the 7-element ASPECT_TAGS taxonomy. Writes a JSON report and returns the
 * per-aspect + macro κ to the caller.
 *
 * CRITICAL: this cron MEASURES and REPORTS κ. It does NOT enforce a ship gate
 * here. The κ ≥ 0.6 cutover decision lives in HYPERPARAMETERS.md and the
 * model card — flipping FEATURE_PER_ASPECT_AGGREGATE from 'shadow' to 'on'
 * is an operator action gated on this cron's measured κ being ≥ 0.6 across
 * multiple monthly runs (S3 cutover criteria — same shape as the other
 * sentiment crons).
 */
// TODO(20-Z-03): wrap with withTelemetry('cron-aspect-kappa-monitor')

import { NextResponse } from 'next/server';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { classifyDocumentsBatch, type PerDocInput } from '@/lib/sentiment/per-doc-classifier';
import { ASPECT_TAGS, type AspectTag } from '@/lib/sentiment/aspects';
import { cohenKappaBinary } from '@/../scripts/eval-aspect-kappa';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface LabeledDoc {
  doc_id: string;
  text: string;
  source?: 'news' | 'community';
  human_aspects: AspectTag[];
}

interface PerAspectKappaRow {
  aspect: AspectTag;
  n11: number;
  n10: number;
  n01: number;
  n00: number;
  kappa: number | null;
}

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const fixturePath = resolve(process.cwd(), 'tests/golden-tickers/_aspect_labels.json');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as LabeledDoc[];
  if (!Array.isArray(fixture) || fixture.length === 0) {
    return NextResponse.json({ ok: false, error: 'fixture missing or empty' }, { status: 500 });
  }

  const inputs: PerDocInput[] = fixture.map((d) => ({
    doc_id: d.doc_id,
    text: d.text,
    source: d.source ?? 'news',
  }));

  const results = await classifyDocumentsBatch(inputs);
  const byId = new Map(results.map((r) => [r.doc_id, r]));

  const perAspect: PerAspectKappaRow[] = ASPECT_TAGS.map((aspect): PerAspectKappaRow => {
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
  const macro_avg_kappa = validKappas.length === 0 ? null : validKappas.reduce((a, b) => a + b, 0) / validKappas.length;

  const report = {
    ran_at: new Date().toISOString(),
    fixture_path: fixturePath,
    n_docs: fixture.length,
    per_aspect: perAspect,
    macro_avg_kappa,
    ship_gate_reference: 'HYPERPARAMETERS.md#per_aspect_aggregate (kappa >= 0.6)',
  };

  // Best-effort write to /tmp so the operator can inspect history; non-fatal
  // when the runtime doesn't permit writes (Vercel Functions FS is read-only
  // outside /tmp — /tmp is always writable).
  try {
    const outPath = `/tmp/aspect-kappa-${new Date().toISOString().slice(0, 10)}.json`;
    writeFileSync(outPath, JSON.stringify(report, null, 2));
  } catch {
    // swallow — return-value path is the cron's contract; the file is convenience only
  }

  return NextResponse.json({ ok: true, ...report });
}
