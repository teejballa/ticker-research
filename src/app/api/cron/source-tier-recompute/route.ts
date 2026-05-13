// src/app/api/cron/source-tier-recompute/route.ts
//
// Plan 20-B-04 — monthly cron entrypoint for source-tier recompute.
//
// Schedule: '0 7 1 * *' (1st of month, 07:00 UTC) — 1h after 20-A-03 tune-decay
// to avoid simultaneous Neon load. Per Vercel cron docs, requires Bearer
// ${CRON_SECRET} authorization header check.
//
// Graceful degradation: when 20-C-01's PerSourceIC table is missing or empty,
// runRecompute returns per_source_ic_table_empty=true with rows_written=0 and
// the cron returns ok=true (no alert). Aggregator falls back to default weight=1.0
// per source via getWeightForSource() (T-20-B-04-03).

import { runRecompute } from '../../../../../scripts/recompute-source-tiers';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  try {
    const result = await runRecompute();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[cron:source-tier-recompute] failed', err);
    return Response.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
