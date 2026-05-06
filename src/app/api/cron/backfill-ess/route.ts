// src/app/api/cron/backfill-ess/route.ts
//
// Phase 18 / D-13: One-time idempotent backfill of effective_sample_size for
// all existing LearnedPattern cells. Walks every PriceOutcome ordered by
// recorded_at and replays through the Plan 18-01 decay primitives so all 504
// cells reflect their full decayed history (not just outcomes that resolve
// post-Plan 04 deploy).
//
// SECURITY:
//   - T-18-01: requires Authorization: Bearer ${CRON_SECRET} (verbatim copy
//     from /api/cron/learn line 841).
//   - T-18-03: requires process.env.ENABLE_BACKFILL_ESS === '1' (defaults
//     off in production; flipped on only during the migration window).
//   - T-18-02: all 504 cell updates + the idempotency marker land inside a
//     single prisma.$transaction. Neon rolls back atomically on failure.
//
// IDEMPOTENCY:
//   - Marker: LearningEvent of event_type='ess_backfill_complete'. Written
//     INSIDE the same transaction. Second invocation finds the marker and
//     returns { status: 'already_done' } without any DB writes.

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  decayWeights,
  computeESS,
  updatePosteriorWeighted,
  HYPERPARAMETERS,
  type WeightedObservation,
  type SignalClass,
} from '@/lib/learning';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MARKER_EVENT_TYPE = 'ess_backfill_complete';

interface CellKey {
  signal_class: string;
  pattern_key: string;
  cap_class: string;
  horizon_days: number;
}

function cellKeyOf(ev: {
  signal_class: string | null;
  pattern_key: string | null;
  cap_class: string | null;
  horizon_days: number | null;
}): string | null {
  if (!ev.signal_class || !ev.pattern_key || !ev.cap_class || ev.horizon_days == null) return null;
  return `${ev.signal_class}|${ev.pattern_key}|${ev.cap_class}|${ev.horizon_days}`;
}

export async function POST(request: NextRequest) {
  // T-18-01: auth gate (verbatim copy from /api/cron/learn line 841).
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // T-18-03: env-flag default-off DoS protection.
  if (process.env.ENABLE_BACKFILL_ESS !== '1') {
    return NextResponse.json({ error: 'Unauthorized', reason: 'backfill disabled' }, { status: 401 });
  }

  // T-18-03 idempotency check (read OUTSIDE the transaction — finding the marker
  // means we've already committed; no race because tx serializes the marker write).
  const existingMarker = await prisma.learningEvent.findFirst({
    where: { event_type: MARKER_EVENT_TYPE },
    orderBy: { occurred_at: 'desc' },
  });
  if (existingMarker) {
    return NextResponse.json({
      status: 'already_done',
      completed_at: existingMarker.occurred_at,
      message: existingMarker.message,
    });
  }

  const startedAt = new Date();

  // Pull the full event history (already keyed by cell via posterior_update events
  // written in /api/cron/learn). Each posterior_update event carries hit flags
  // in delta; we replay in chronological order.
  const allEvents = await prisma.learningEvent.findMany({
    where: {
      event_type: 'posterior_update',
      signal_class: { not: null },
      pattern_key: { not: null },
      cap_class: { not: null },
      horizon_days: { not: null },
    },
    orderBy: { occurred_at: 'asc' },
  });

  // Bucket events per cell.
  const byCell = new Map<string, typeof allEvents>();
  for (const ev of allEvents) {
    const k = cellKeyOf(ev);
    if (!k) continue;
    const arr = byCell.get(k) ?? [];
    arr.push(ev);
    byCell.set(k, arr);
  }

  // Pull current cell roster (504 rows) so we update every existing cell, even
  // ones that have zero events yet (ESS=0 stays correct, n_trials_attempted=0).
  const cells = await prisma.learnedPattern.findMany();

  const now = new Date();
  const cutoff30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Build the update set BEFORE the transaction — math only, no DB writes.
  type Update = {
    id: string;
    alpha: number;
    beta: number;
    effective_sample_size: number;
    alpha_30d: number;
    beta_30d: number;
  };
  const updates: Update[] = [];

  for (const cell of cells) {
    const key: CellKey = {
      signal_class: cell.signal_class,
      pattern_key: cell.pattern_key,
      cap_class: cell.cap_class,
      horizon_days: cell.horizon_days,
    };
    const hp = HYPERPARAMETERS[key.signal_class as SignalClass];
    const lambdaDays = hp?.lambda_days ?? 60;
    const events =
      byCell.get(`${key.signal_class}|${key.pattern_key}|${key.cap_class}|${key.horizon_days}`) ?? [];

    const obs: WeightedObservation[] = events.map((ev) => {
      const d = ev.delta as {
        hit?: boolean;
        diffusion_hit?: boolean;
        tech_hit?: boolean;
        insider_hit?: boolean;
        institutional_hit?: boolean;
      } | null;
      const hit =
        key.signal_class === 'diffusion'
          ? (d?.diffusion_hit ?? d?.hit ?? false)
          : key.signal_class === 'technical'
            ? (d?.tech_hit ?? d?.hit ?? false)
            : key.signal_class === 'insider'
              ? (d?.insider_hit ?? false)
              : (d?.institutional_hit ?? false);
      return { hit: hit === true, recorded_at: ev.occurred_at };
    });
    const weights = decayWeights(obs, lambdaDays, now);
    const ess = computeESS(weights);
    const post = updatePosteriorWeighted({ alpha: 1, beta: 1 }, obs, weights);

    let alpha_30d = 1;
    let beta_30d = 1;
    for (let i = 0; i < obs.length; i++) {
      if (obs[i].recorded_at < cutoff30d) continue;
      if (obs[i].hit) alpha_30d += 1;
      else beta_30d += 1;
    }

    updates.push({
      id: cell.id,
      alpha: post.alpha,
      beta: post.beta,
      effective_sample_size: ess,
      alpha_30d,
      beta_30d,
    });
  }

  // T-18-02: single atomic transaction includes the idempotency marker.
  await prisma.$transaction([
    ...updates.map((u) =>
      prisma.learnedPattern.update({
        where: { id: u.id },
        data: {
          alpha: u.alpha,
          beta: u.beta,
          effective_sample_size: u.effective_sample_size,
          alpha_30d: u.alpha_30d,
          beta_30d: u.beta_30d,
        },
      }),
    ),
    prisma.learningEvent.create({
      data: {
        event_type: MARKER_EVENT_TYPE,
        delta: {
          cells_updated: updates.length,
          total_outcomes_replayed: allEvents.length,
          started_at: startedAt.toISOString(),
          completed_at: new Date().toISOString(),
          hyperparameters_snapshot: HYPERPARAMETERS as unknown as Prisma.JsonObject,
        },
        message: `ESS backfill complete: ${updates.length} cells updated from ${allEvents.length} replayed outcomes (D-13). Started ${startedAt.toISOString()}.`,
      },
    }),
  ]);

  return NextResponse.json({
    status: 'completed',
    cells_updated: updates.length,
    total_outcomes_replayed: allEvents.length,
    duration_ms: Date.now() - startedAt.getTime(),
  });
}
