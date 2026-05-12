/**
 * Plan 20-Z-03 — T-20-Z-03-02 mitigation.
 *
 * Daily retention sweep. Deletes ProviderCallLog rows older than 90 days.
 * 90d horizon balances dashboard utility (rolling baselines need >=7d) with
 * table-size growth (~5k rows/day x 90d = ~450k rows steady-state, well within
 * Neon free tier).
 *
 * Auth: same Bearer CRON_SECRET pattern as other cron handlers.
 */
import { NextResponse } from 'next/server';
import { deleteOlderThan } from '@/lib/telemetry/provider-call-log';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RETENTION_DAYS = 90;

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  const result = await deleteOlderThan(RETENTION_DAYS);
  console.log(
    `[provider-call-log-retention] deleted=${result.deleted} threshold_days=${RETENTION_DAYS}`,
  );
  return NextResponse.json({
    deleted: result.deleted,
    threshold_days: RETENTION_DAYS,
    ran_at: new Date().toISOString(),
  });
}
