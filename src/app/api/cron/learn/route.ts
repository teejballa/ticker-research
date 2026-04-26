// src/app/api/cron/learn/route.ts
// Daily learning cron — runs after price-followup at 07:30 UTC.
// 1. Pull newly-resolved 7d outcomes (idempotent via LearningEvent.outcome_id)
// 2. Reconstruct DiffusionTrace from preceding 4 snapshots per outcome
// 3. Compute SPY-relative hit, update Beta posterior + Bayesian logistic
// 4. Recompute Brier (in/out/null) + drift_z per pattern, reassign status
// 5. Write LearningEvent rows + AI-generated cycle_summary
// 6. Prune LearningEvent rows older than 90 days

import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import YahooFinance from 'yahoo-finance2';
import { prisma } from '@/lib/db';
import {
  computeDiffusionTrace,
  classifyCapClass,
  type FlowPattern,
  type CapClass,
  type SnapshotInput,
} from '@/lib/diffusion-trace';
import {
  updatePosterior,
  posteriorMean,
  brierScore,
  driftZ,
  classifyHit,
  initLogisticState,
  updateLogistic,
  predictLogistic,
  adversarialNullBrier,
  patternStatus,
  type LogisticState,
} from '@/lib/learning';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const FLOW_PATTERNS: FlowPattern[] = ['niche_leads', 'simultaneous', 'mainstream_first', 'flat'];
const CAP_CLASSES: CapClass[] = ['large_cap', 'mid_cap', 'small_cap', 'unknown'];

const FEATURE_NAMES = ['v_niche', 'v_middle', 'v_mainstream', 'niche_lead_cycles', 'q_z', 'qual_z'];

interface SpyHistory {
  closes: Map<string, number>;            // YYYY-MM-DD → close
}

async function fetchSpyHistory(daysBack = 60): Promise<SpyHistory> {
  const period1 = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const period2 = new Date();
  const result = await yf.chart('SPY', { period1, period2, interval: '1d' });
  const closes = new Map<string, number>();
  for (const q of result.quotes ?? []) {
    if (q.close == null) continue;
    closes.set(q.date.toISOString().split('T')[0], q.close);
  }
  return { closes };
}

function nearestSpyClose(history: SpyHistory, target: Date): number | null {
  // Walk back up to 5 days to find a trading-day close.
  for (let offset = 0; offset < 5; offset++) {
    const d = new Date(target.getTime() - offset * 24 * 60 * 60 * 1000);
    const key = d.toISOString().split('T')[0];
    const close = history.closes.get(key);
    if (close != null) return close;
  }
  return null;
}

interface ResolvedOutcome {
  outcome_id: string;
  ticker: string;
  scanned_at: Date;
  recorded_at: Date;
  price_at_scan: number;
  price_at_outcome: number;
  ticker_return_pct: number;
  source: 'report' | 'snapshot';
  source_id: string;
}

async function loadUnprocessedOutcomes(opts: { isBackfill: boolean }): Promise<ResolvedOutcome[]> {
  // Subquery: outcome_ids already incorporated into a LearningEvent
  const processedRows = await prisma.learningEvent.findMany({
    where: { outcome_id: { not: null } },
    select: { outcome_id: true },
  });
  const processed = new Set(processedRows.map(r => r.outcome_id!).filter(Boolean));

  const since = opts.isBackfill ? new Date(0) : new Date(Date.now() - 36 * 60 * 60 * 1000);

  const outcomes = await prisma.priceOutcome.findMany({
    where: { days_after: 7, recorded_at: { gte: since } },
    include: { snapshot: true, report: true },
    orderBy: { recorded_at: 'asc' },
  });

  const out: ResolvedOutcome[] = [];
  for (const o of outcomes) {
    if (processed.has(o.id)) continue;

    if (o.snapshot) {
      out.push({
        outcome_id: o.id,
        ticker: o.snapshot.ticker,
        scanned_at: o.snapshot.scanned_at,
        recorded_at: o.recorded_at,
        price_at_scan: o.snapshot.price_at_scan,
        price_at_outcome: o.price,
        ticker_return_pct: o.pct_change,
        source: 'snapshot',
        source_id: o.snapshot.id,
      });
    } else if (o.report) {
      const priceAt = o.report.price_at_report;
      if (priceAt == null) continue;
      out.push({
        outcome_id: o.id,
        ticker: o.report.ticker,
        scanned_at: o.report.analyzed_at,
        recorded_at: o.recorded_at,
        price_at_scan: priceAt,
        price_at_outcome: o.price,
        ticker_return_pct: o.pct_change,
        source: 'report',
        source_id: o.report.id,
      });
    }
  }
  return out;
}

async function buildTraceForOutcome(outcome: ResolvedOutcome): Promise<{ trace: ReturnType<typeof computeDiffusionTrace>; snapshotIds: string[] } | null> {
  // Pull up to 4 snapshots for this ticker BEFORE the outcome's scanned_at,
  // ordered oldest → newest.
  const snaps = await prisma.sentimentSnapshot.findMany({
    where: { ticker: outcome.ticker, scanned_at: { lte: outcome.scanned_at } },
    orderBy: { scanned_at: 'desc' },
    take: 4,
  });
  if (snaps.length < 2) return null;

  // Historical context for z-scoring
  const allTickerSnaps = await prisma.sentimentSnapshot.findMany({
    where: { ticker: outcome.ticker },
    select: { community_data: true },
    take: 50,
    orderBy: { scanned_at: 'desc' },
  });
  const histQuantity: number[] = [];
  const histQuality: number[] = [];
  for (const s of allTickerSnaps) {
    const cd = s.community_data as Record<string, unknown> | null;
    if (cd && typeof cd.quantity === 'number') histQuantity.push(cd.quantity);
    if (cd && typeof cd.quality === 'number') histQuality.push(cd.quality);
  }

  const inputs: SnapshotInput[] = snaps.map(s => ({
    scanned_at: s.scanned_at,
    community_data: (s.community_data ?? {}) as SnapshotInput['community_data'],
  }));

  const trace = computeDiffusionTrace(inputs, histQuantity, histQuality);
  return trace ? { trace, snapshotIds: snaps.map(s => s.id) } : null;
}

async function ensurePatternRow(flow_pattern: FlowPattern, cap_class: CapClass) {
  return prisma.learnedPattern.upsert({
    where: { flow_pattern_cap_class: { flow_pattern, cap_class } },
    create: { flow_pattern, cap_class },
    update: {},
  });
}

async function recomputePerPatternMetrics(history: SpyHistory) {
  // For each (flow_pattern, cap_class) cell, recompute Brier (in/out/null) +
  // 30d rolling posterior + drift_z.
  for (const fp of FLOW_PATTERNS) {
    for (const cc of CAP_CLASSES) {
      const traces = await prisma.diffusionTrace.findMany({
        where: { flow_pattern: fp, cap_class: cc },
        orderBy: { end_at: 'desc' },
        take: 500,
      });
      if (traces.length === 0) continue;

      // Collect (prediction, hit) pairs for Brier.
      // Prediction = current posterior mean for this cell at the time of the trace.
      // For simplicity we use the *current* posterior (slightly lagged but
      // bounded; refines as more data accrues).
      const cell = await prisma.learnedPattern.findUnique({
        where: { flow_pattern_cap_class: { flow_pattern: fp, cap_class: cc } },
      });
      if (!cell) continue;
      const predMean = posteriorMean({ alpha: cell.alpha, beta: cell.beta });

      const predictions: number[] = [];
      const outcomes: boolean[] = [];

      for (const t of traces) {
        // Find the matching outcome via snapshots/reports; reverse-link by ticker + window.
        const eventForTrace = await prisma.learningEvent.findFirst({
          where: { ticker: t.ticker, flow_pattern: fp, cap_class: cc, event_type: 'posterior_update' },
          orderBy: { occurred_at: 'desc' },
        });
        if (!eventForTrace?.outcome_id) continue;
        const outcome = await prisma.priceOutcome.findUnique({ where: { id: eventForTrace.outcome_id } });
        if (!outcome) continue;
        const tickerReturn = outcome.pct_change;
        const spyAtScan = nearestSpyClose(history, t.end_at);
        const spyAtOutcome = nearestSpyClose(history, outcome.recorded_at);
        if (spyAtScan == null || spyAtOutcome == null) continue;
        const spyReturn = ((spyAtOutcome - spyAtScan) / spyAtScan) * 100;
        const hit = classifyHit({ ticker_return_pct: tickerReturn, spy_return_pct: spyReturn });
        predictions.push(predMean);
        outcomes.push(hit);
      }

      if (predictions.length === 0) continue;

      const brier_in = brierScore(predictions, outcomes);
      const split = Math.max(1, predictions.length - 14);
      const brier_out = brierScore(predictions.slice(split), outcomes.slice(split));
      const nullResult = adversarialNullBrier(predictions, outcomes, 100);

      // 30d rolling
      const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentEvents = await prisma.learningEvent.findMany({
        where: {
          flow_pattern: fp,
          cap_class: cc,
          event_type: 'posterior_update',
          occurred_at: { gte: cutoff30d },
        },
      });
      let alpha_30d = 1, beta_30d = 1;
      for (const ev of recentEvents) {
        const d = ev.delta as { hit?: boolean } | null;
        if (d?.hit === true) alpha_30d++;
        else if (d?.hit === false) beta_30d++;
      }

      const drift_z = driftZ({
        rolling: { alpha: alpha_30d, beta: beta_30d },
        allTime: { alpha: cell.alpha, beta: cell.beta },
      });

      const status = patternStatus({
        sample_size: cell.sample_size,
        brier_in,
        brier_out,
        brier_null: nullResult.mean_null_brier,
        drift_z,
      });

      const prevStatus = cell.status;
      await prisma.learnedPattern.update({
        where: { flow_pattern_cap_class: { flow_pattern: fp, cap_class: cc } },
        data: {
          brier_in_sample: brier_in,
          brier_out_sample: brier_out,
          brier_null: nullResult.mean_null_brier,
          alpha_30d,
          beta_30d,
          drift_z,
          status,
        },
      });

      // Drift alert
      if (Math.abs(drift_z) > 2 && prevStatus !== status) {
        await prisma.learningEvent.create({
          data: {
            event_type: 'drift_alert',
            flow_pattern: fp,
            cap_class: cc,
            delta: { drift_z, prev_status: prevStatus, new_status: status },
            message: `${fp} × ${cc}: drift z=${drift_z.toFixed(2)}, status ${prevStatus}→${status}`,
          },
        });
      }
    }
  }
}

async function loadCurrentLogisticState(): Promise<LogisticState> {
  const last = await prisma.logisticEpoch.findFirst({ orderBy: { epoch: 'desc' } });
  if (!last) return initLogisticState(FEATURE_NAMES);
  const c = last.coefficients as Record<string, { mu: number; sigma: number }>;
  return {
    intercept: last.intercept,
    intercept_var: ((c['_intercept']?.sigma) ?? 1) ** 2,
    weights: FEATURE_NAMES.map(n => c[n]?.mu ?? 0),
    weight_vars: FEATURE_NAMES.map(n => (c[n]?.sigma ?? 1) ** 2),
    feature_names: FEATURE_NAMES,
  };
}

async function persistLogisticEpoch(state: LogisticState, brier_in: number, brier_out: number, sampleSize: number) {
  const last = await prisma.logisticEpoch.findFirst({ orderBy: { epoch: 'desc' } });
  const epoch = (last?.epoch ?? 0) + 1;
  const coefficients: Record<string, { mu: number; sigma: number }> = {
    _intercept: { mu: state.intercept, sigma: Math.sqrt(state.intercept_var) },
  };
  for (let i = 0; i < FEATURE_NAMES.length; i++) {
    coefficients[FEATURE_NAMES[i]] = {
      mu: state.weights[i],
      sigma: Math.sqrt(state.weight_vars[i]),
    };
  }
  await prisma.logisticEpoch.create({
    data: { epoch, coefficients, intercept: state.intercept, brier_in, brier_out, sample_size: sampleSize },
  });
}

async function maybeWriteCycleSummary(stats: {
  outcomes_processed: number;
  hits: number;
  drift_alerts: number;
  cells_active: number;
}) {
  let message = `Cycle summary: ${stats.outcomes_processed} outcomes resolved (${stats.hits} hits), ${stats.drift_alerts} drift alerts, ${stats.cells_active} active cells.`;
  try {
    const { text } = await generateText({
      model: 'anthropic/claude-haiku-4.5',
      prompt: `Write a single-sentence research-log entry summarizing today's diffusion engine cycle. Do not use bullet points. Stats: ${stats.outcomes_processed} new 7d outcomes resolved, ${stats.hits} were hits (>1% excess vs SPY), ${stats.drift_alerts} drift alerts triggered, ${stats.cells_active} pattern cells currently ACTIVE. Keep under 30 words. Plain text, no quotes.`,
    });
    if (text && text.length > 0 && text.length < 400) message = text.trim();
  } catch {
    // fall back to deterministic summary
  }
  await prisma.learningEvent.create({
    data: {
      event_type: 'cycle_summary',
      delta: stats,
      message,
    },
  });
}

async function pruneOldEvents() {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  await prisma.learningEvent.deleteMany({ where: { occurred_at: { lt: cutoff } } });
}

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stats = { outcomes_processed: 0, hits: 0, traces_built: 0, drift_alerts: 0, cells_active: 0, errors: 0 };

  try {
    const existingPatternCount = await prisma.learnedPattern.count();
    const isBackfill = existingPatternCount === 0;

    const history = await fetchSpyHistory(60);
    const outcomes = await loadUnprocessedOutcomes({ isBackfill });
    let logisticState = await loadCurrentLogisticState();

    const trainingX: number[][] = [];
    const trainingY: (0 | 1)[] = [];

    for (const o of outcomes) {
      try {
        const built = await buildTraceForOutcome(o);
        if (!built || !built.trace) continue;
        const trace = built.trace;
        stats.traces_built++;

        // SPY-relative hit
        const spyAtScan = nearestSpyClose(history, o.scanned_at);
        const spyAtOutcome = nearestSpyClose(history, o.recorded_at);
        if (spyAtScan == null || spyAtOutcome == null) continue;
        const spyReturn = ((spyAtOutcome - spyAtScan) / spyAtScan) * 100;
        const hit = classifyHit({ ticker_return_pct: o.ticker_return_pct, spy_return_pct: spyReturn });
        if (hit) stats.hits++;

        // Persist trace
        await prisma.diffusionTrace.create({
          data: {
            ticker: o.ticker,
            cap_class: trace.cap_class,
            end_at: o.scanned_at,
            window_cycles: trace.source_count,
            v_niche: trace.v_niche,
            v_middle: trace.v_middle,
            v_mainstream: trace.v_mainstream,
            q_z: trace.q_z,
            qual_z: trace.qual_z,
            niche_lead_cycles: trace.niche_lead_cycles,
            flow_pattern: trace.flow_pattern,
            source_snapshot_ids: built.snapshotIds,
          },
        });

        // Update Beta posterior (skip 'flat' — uninformative)
        if (trace.flow_pattern !== 'flat') {
          await ensurePatternRow(trace.flow_pattern, trace.cap_class);
          const cell = await prisma.learnedPattern.findUnique({
            where: { flow_pattern_cap_class: { flow_pattern: trace.flow_pattern, cap_class: trace.cap_class } },
          });
          if (cell) {
            const updated = updatePosterior({ alpha: cell.alpha, beta: cell.beta }, hit);
            await prisma.learnedPattern.update({
              where: { flow_pattern_cap_class: { flow_pattern: trace.flow_pattern, cap_class: trace.cap_class } },
              data: {
                alpha: updated.alpha,
                beta: updated.beta,
                sample_size: cell.sample_size + 1,
                hits: cell.hits + (hit ? 1 : 0),
              },
            });
          }
        }

        // Update logistic
        const x = [trace.v_niche, trace.v_middle, trace.v_mainstream, trace.niche_lead_cycles, trace.q_z, trace.qual_z];
        const y: 0 | 1 = hit ? 1 : 0;
        logisticState = updateLogistic(logisticState, x, y);
        trainingX.push(x);
        trainingY.push(y);

        // LearningEvent for posterior_update
        await prisma.learningEvent.create({
          data: {
            event_type: 'posterior_update',
            ticker: o.ticker,
            outcome_id: o.outcome_id,
            flow_pattern: trace.flow_pattern,
            cap_class: trace.cap_class,
            delta: {
              hit,
              ticker_return_pct: o.ticker_return_pct,
              spy_return_pct: spyReturn,
              v_niche: trace.v_niche,
              v_mainstream: trace.v_mainstream,
            },
            message: `${o.ticker} (${trace.cap_class}, ${trace.flow_pattern}): ${hit ? 'HIT' : 'MISS'} — ticker ${o.ticker_return_pct.toFixed(2)}% vs SPY ${spyReturn.toFixed(2)}%`,
          },
        });
        stats.outcomes_processed++;
      } catch (err) {
        stats.errors++;
        console.error('[learn] outcome error', o.outcome_id, err);
      }
    }

    // Recompute aggregate metrics + drift after all updates
    if (stats.outcomes_processed > 0) {
      await recomputePerPatternMetrics(history);
    }

    // Persist logistic epoch (using batch Brier from this run)
    if (trainingX.length > 0) {
      const preds = trainingX.map(x => predictLogistic(logisticState, x));
      const outs = trainingY.map(y => y === 1);
      const brier_in = brierScore(preds, outs);
      const split = Math.max(1, preds.length - 14);
      const brier_out = brierScore(preds.slice(split), outs.slice(split));
      await persistLogisticEpoch(logisticState, brier_in, brier_out, trainingX.length);
    }

    // Active cells count for summary
    stats.cells_active = await prisma.learnedPattern.count({ where: { status: 'ACTIVE' } });
    const driftCount = await prisma.learningEvent.count({
      where: {
        event_type: 'drift_alert',
        occurred_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    stats.drift_alerts = driftCount;

    if (stats.outcomes_processed > 0) {
      await maybeWriteCycleSummary({
        outcomes_processed: stats.outcomes_processed,
        hits: stats.hits,
        drift_alerts: stats.drift_alerts,
        cells_active: stats.cells_active,
      });
    }

    await pruneOldEvents();

    return NextResponse.json({ ok: true, isBackfill, ...stats });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Learn cron failed', ...stats },
      { status: 500 },
    );
  }
}
