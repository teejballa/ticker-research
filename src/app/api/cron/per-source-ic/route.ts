// src/app/api/cron/per-source-ic/route.ts
//
// Phase 20-C-01: Daily cron — recomputes per-source rolling 20-day Spearman
// IC, Newey-West HAC p-value, and BH-FDR-corrected p-value across the
// (source × horizon) panel. Persists one PerSourceIC row per (source × horizon).
//
// Scheduled at `0 5 * * *` (05:00 UTC) — 1h before the existing alpha-decay-
// watch cron at 06:00 UTC, to avoid simultaneous Neon load.

import { runComputePerSourceIC } from '../../../../../scripts/compute-per-source-ic';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  const result = await runComputePerSourceIC({ asOf: new Date() });
  return Response.json({ ok: true, ...result });
}
