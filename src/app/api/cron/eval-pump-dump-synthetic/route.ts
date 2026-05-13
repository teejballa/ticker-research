// src/app/api/cron/eval-pump-dump-synthetic/route.ts
//
// Plan 20-C-04 — Weekly synthetic pump-and-dump eval cron.
//
// Schedule: Tuesdays 09:00 UTC (vercel.json) — staggered against the 20-A-04
// Monday cron and the 20-A-02 nightly mention-baselines cron.
//
// Wall-clock budget: 120s (maxDuration). The default n_per_class=500 eval
// completes in well under 100ms on warm CPU; the 120s budget is defensive
// against cold-start, network jitter, and future eval size growth.
//
// CRON_SECRET protected per Vercel Cron best practice + cron-jobs skill:
// authorization header MUST be `Bearer ${process.env.CRON_SECRET}` when
// CRON_SECRET is set. When CRON_SECRET is unset (local dev), auth is skipped.
//
// Response shape: { f1, sensitivity, specificity, rule_version, ms_elapsed,
//   status: 'ok' | 'regression' | 'error' }. status === 'regression' when
// F1 < 0.6 OR specificity < 0.95 (mirrors the script's CLI exit-code logic).

import { NextResponse } from 'next/server';
import { runSyntheticEval } from '@/../scripts/eval-pump-dump-synthetic';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const t0 = Date.now();
  try {
    const r = await runSyntheticEval();
    const status = r.f1 >= 0.6 && r.specificity >= 0.95 ? 'ok' : 'regression';
    return NextResponse.json({
      f1: r.f1,
      sensitivity: r.sensitivity,
      specificity: r.specificity,
      rule_version: r.rule_version,
      ms_elapsed: Date.now() - t0,
      status,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { status: 'error', error: msg, ms_elapsed: Date.now() - t0 },
      { status: 500 },
    );
  }
}
