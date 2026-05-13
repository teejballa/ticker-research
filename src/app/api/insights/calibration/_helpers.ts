// Helpers extracted from route.ts — Next.js App Router only permits
// specific named exports (GET, POST, dynamic, etc.) from a route file,
// so the helper + type live here and route.ts imports them. Files
// prefixed with `_` are ignored by the App Router so this is not a route.

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { EvalBrierResult } from '../../../../../scripts/eval-brier';

export interface CalibrationResponse {
  results: EvalBrierResult[];
  computed_at: string;
  source_path: string;
}

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
