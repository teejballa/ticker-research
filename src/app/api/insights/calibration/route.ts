// src/app/api/insights/calibration/route.ts
//
// Phase 20-C-02: JSON endpoint backing the /insights/calibration dashboard.
// Returns the newest reports/brier-*.json payload — array of
// EvalBrierResult one per classifier_version — plus its computed_at
// timestamp so the page can render a "last evaluated" footer.
//
// Filesystem read in dev (reports/ at repo root). In production
// (Vercel Functions read-only FS except /tmp), reads /tmp/reports.
// Returns 404 when no Brier evaluation has been written yet — the
// page renders an "first run scheduled Monday 08:00 UTC" empty state.

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { EvalBrierResult } from '../../../../../scripts/eval-brier';

export interface CalibrationResponse {
  results: EvalBrierResult[];
  computed_at: string;
  source_path: string;
}

export const dynamic = 'force-dynamic';

function resolveReportsDir(): string {
  return process.env.NODE_ENV === 'production'
    ? '/tmp/reports'
    : path.resolve(process.cwd(), 'reports');
}

function findNewestBrierJson(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^brier-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  if (files.length === 0) return null;
  return path.join(dir, files[files.length - 1]);
}

export async function fetchCalibrationPayload(): Promise<CalibrationResponse | null> {
  const dir = resolveReportsDir();
  const file = findNewestBrierJson(dir);
  if (file == null) return null;
  let parsed: EvalBrierResult[];
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as EvalBrierResult[];
  } catch (err) {
    console.error('[insights/calibration] failed to parse', file, err);
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { results: [], computed_at: '', source_path: file };
  }
  const computed_at = parsed[0]?.computed_at ?? '';
  return { results: parsed, computed_at, source_path: file };
}

export async function GET() {
  const payload = await fetchCalibrationPayload();
  if (payload == null) {
    return Response.json(
      { error: 'No Brier evaluation has been written yet.' },
      { status: 404 },
    );
  }
  return Response.json(payload);
}
