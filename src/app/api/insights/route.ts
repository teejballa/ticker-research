import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getMarketStatus } from '@/lib/market-status';
import { credibleInterval95, posteriorMean } from '@/lib/learning';
import type { SentimentDimensions } from '@/lib/sentiment-dimensions';

export const dynamic = 'force-dynamic';

interface DataPoint {
  ticker: string;
  diffusion_gap: number;
  direction: number;
  quality: number;
  quantity: number;
  tier_breakdown: SentimentDimensions['tier_breakdown'];
  price_change_3d: number | null;
  price_change_7d: number | null;
  source: 'report' | 'snapshot';
  recorded_at: string;
}

function correlationScore(points: DataPoint[], signalFn: (d: DataPoint) => boolean) {
  const ws = points.filter(d => signalFn(d) && d.price_change_7d !== null);
  if (ws.length === 0) return { signal_positive_pct: 0, avg_7d_return: 0, sample_size: 0 };
  const positive = ws.filter(d => (d.price_change_7d ?? 0) > 0);
  const avg = ws.reduce((s, d) => s + (d.price_change_7d ?? 0), 0) / ws.length;
  return {
    signal_positive_pct: Math.round((positive.length / ws.length) * 100),
    avg_7d_return: Math.round(avg * 10) / 10,
    sample_size: ws.length,
  };
}

interface SparklinePoint { niche: number; middle: number; mainstream: number; scanned_at: string; }

export async function GET() {
  try {
    const [reports, snapshots, patterns, recentEvents, lastEpoch, recentTraces, technicalPatterns] = await Promise.all([
      prisma.report.findMany({
        where: { price_at_report: { not: null } },
        include: { outcomes: true },
        orderBy: { analyzed_at: 'desc' },
        take: 500,
      }),
      prisma.sentimentSnapshot.findMany({
        include: { outcomes: true },
        orderBy: { scanned_at: 'desc' },
        take: 1000,
      }),
      // Phase 16-05: diffusion-only patterns (legacy callers still use flow_pattern + cap_class).
      prisma.learnedPattern.findMany({
        where: { signal_class: 'diffusion' },
        orderBy: [{ pattern_key: 'asc' }, { cap_class: 'asc' }],
      }),
      prisma.learningEvent.findMany({ orderBy: { occurred_at: 'desc' }, take: 10 }),
      prisma.logisticEpoch.findFirst({ orderBy: { epoch: 'desc' } }),
      prisma.diffusionTrace.findMany({
        where: { flow_pattern: 'niche_leads' },
        orderBy: { end_at: 'desc' },
        take: 8,
      }),
      // Phase 16-05: technical pattern library (8 TechPatterns × 3 cap_classes × 6 horizons = 144 cells).
      prisma.learnedPattern.findMany({
        where: { signal_class: 'technical' },
        orderBy: [{ pattern_key: 'asc' }, { cap_class: 'asc' }, { horizon_days: 'asc' }],
      }),
    ]);

    const dataPoints: DataPoint[] = [];

    for (const r of reports) {
      if (!r.community_data) continue;
      const dims = r.community_data as unknown as SentimentDimensions;
      dataPoints.push({
        ticker: r.ticker,
        diffusion_gap: dims.diffusion_gap,
        direction: dims.direction,
        quality: dims.quality,
        quantity: dims.quantity,
        tier_breakdown: dims.tier_breakdown,
        price_change_3d: r.outcomes.find(o => o.days_after === 3)?.pct_change ?? null,
        price_change_7d: r.outcomes.find(o => o.days_after === 7)?.pct_change ?? null,
        source: 'report',
        recorded_at: r.analyzed_at.toISOString(),
      });
    }

    for (const s of snapshots) {
      const dims = s.community_data as unknown as SentimentDimensions;
      dataPoints.push({
        ticker: s.ticker,
        diffusion_gap: dims.diffusion_gap,
        direction: dims.direction,
        quality: dims.quality,
        quantity: dims.quantity,
        tier_breakdown: dims.tier_breakdown,
        price_change_3d: s.outcomes.find(o => o.days_after === 3)?.pct_change ?? null,
        price_change_7d: s.outcomes.find(o => o.days_after === 7)?.pct_change ?? null,
        source: 'snapshot',
        recorded_at: s.scanned_at.toISOString(),
      });
    }

    const resolved = dataPoints.filter(d => d.price_change_7d !== null);
    const highGap = resolved.filter(d => d.diffusion_gap > 2);
    const highGapBullish = highGap.filter(d => d.direction > 0.6 && (d.price_change_7d ?? 0) > 3);
    const thesisPct = highGap.length > 0 ? Math.round((highGapBullish.length / highGap.length) * 100) : null;

    const diffusionSignals = dataPoints
      .filter(d => d.diffusion_gap > 2.5 && d.price_change_7d === null)
      .sort((a, b) => b.diffusion_gap - a.diffusion_gap)
      .slice(0, 10);

    // ─── NEW: pattern_library (12-cell grid) ─────────────────────────────
    const pattern_library = patterns.map(p => {
      const ci = credibleInterval95({ alpha: p.alpha, beta: p.beta });
      const ci_30d = credibleInterval95({ alpha: p.alpha_30d, beta: p.beta_30d });
      const week_delta = posteriorMean({ alpha: p.alpha_30d, beta: p.beta_30d }) - posteriorMean({ alpha: p.alpha, beta: p.beta });
      return {
        // Phase 16-05: schema renamed flow_pattern → pattern_key (signal_class='diffusion').
        // Wire shape preserved for legacy InsightsDashboard consumers.
        flow_pattern: p.pattern_key,
        cap_class: p.cap_class,
        alpha: p.alpha,
        beta: p.beta,
        posterior_mean: ci.mean,
        ci_low: ci.low,
        ci_high: ci.high,
        ci_30d_mean: ci_30d.mean,
        sample_size: p.sample_size,
        hits: p.hits,
        brier_in: p.brier_in_sample,
        brier_out: p.brier_out_sample,
        brier_null: p.brier_null,
        drift_z: p.drift_z,
        status: p.status,
        week_delta,
        last_updated: p.last_updated.toISOString(),
      };
    });

    // ─── NEW: live_diffusion_map (current niche_leads tickers w/ sparkline) ──
    const live_diffusion_map: Array<{
      ticker: string;
      cap_class: string;
      flow_pattern: string;
      sparkline: SparklinePoint[];
      logistic_score: number | null;
      logistic_ci_low: number | null;
      logistic_ci_high: number | null;
      end_at: string;
    }> = [];

    for (const t of recentTraces) {
      // Pull the 4 source snapshots for the sparkline
      const snaps = await prisma.sentimentSnapshot.findMany({
        where: { id: { in: t.source_snapshot_ids } },
        orderBy: { scanned_at: 'asc' },
      });
      const sparkline: SparklinePoint[] = snaps.map(s => {
        const cd = (s.community_data ?? {}) as { tier_breakdown?: { niche: number; middle: number; mainstream: number } };
        return {
          niche: cd.tier_breakdown?.niche ?? 0,
          middle: cd.tier_breakdown?.middle ?? 0,
          mainstream: cd.tier_breakdown?.mainstream ?? 0,
          scanned_at: s.scanned_at.toISOString(),
        };
      });

      // Logistic score
      let logistic_score: number | null = null;
      let logistic_ci_low: number | null = null;
      let logistic_ci_high: number | null = null;
      if (lastEpoch) {
        const c = lastEpoch.coefficients as Record<string, { mu: number; sigma: number }>;
        const x = [t.v_niche, t.v_middle, t.v_mainstream, t.niche_lead_cycles, t.q_z, t.qual_z];
        const featureNames = ['v_niche', 'v_middle', 'v_mainstream', 'niche_lead_cycles', 'q_z', 'qual_z'];
        let z = lastEpoch.intercept;
        let varSum = (c['_intercept']?.sigma ?? 0) ** 2;
        for (let i = 0; i < featureNames.length; i++) {
          const coef = c[featureNames[i]];
          if (!coef) continue;
          z += coef.mu * x[i];
          varSum += (coef.sigma * x[i]) ** 2;
        }
        const sd = Math.sqrt(varSum);
        const sigmoid = (v: number) => 1 / (1 + Math.exp(-v));
        logistic_score = sigmoid(z);
        logistic_ci_low = sigmoid(z - 1.96 * sd);
        logistic_ci_high = sigmoid(z + 1.96 * sd);
      }

      live_diffusion_map.push({
        ticker: t.ticker,
        cap_class: t.cap_class,
        flow_pattern: t.flow_pattern,
        sparkline,
        logistic_score,
        logistic_ci_low,
        logistic_ci_high,
        end_at: t.end_at.toISOString(),
      });
    }

    // ─── NEW: engine_memory ──────────────────────────────────────────────
    const engine_memory = recentEvents.map(e => ({
      occurred_at: e.occurred_at.toISOString(),
      event_type: e.event_type,
      ticker: e.ticker,
      // Phase 16-05: schema renamed flow_pattern → pattern_key on LearningEvent.
      flow_pattern: e.pattern_key,
      cap_class: e.cap_class,
      message: e.message,
    }));

    // ─── NEW: concept_drift (worst |z| across patterns) ──────────────────
    const drifts = patterns.map(p => Math.abs(p.drift_z));
    const worst_z = drifts.length > 0 ? Math.max(...drifts) : 0;
    const drift_status: 'NORMAL' | 'WARNING' | 'ALERT' =
      worst_z > 2 ? 'ALERT' : worst_z > 1 ? 'WARNING' : 'NORMAL';

    // ─── NEW: null_check (best p-value across active patterns) ───────────
    const activePatterns = patterns.filter(p => p.status === 'ACTIVE' && p.brier_in_sample != null && p.brier_null != null);
    let null_check: { p_value: number; real_brier: number; null_brier: number } | null = null;
    if (activePatterns.length > 0) {
      const best = activePatterns.reduce((b, p) =>
        (p.brier_in_sample ?? 1) < (b.brier_in_sample ?? 1) ? p : b
      );
      null_check = {
        p_value: (best.brier_null ?? 0.25) > (best.brier_in_sample ?? 0.25) ? 0.01 : 0.5,
        real_brier: best.brier_in_sample ?? 0,
        null_brier: best.brier_null ?? 0.25,
      };
    }

    // ─── NEW: logistic_epoch ──────────────────────────────────────────────
    const logistic_epoch = lastEpoch ? {
      epoch: lastEpoch.epoch,
      coefficients: lastEpoch.coefficients,
      intercept: lastEpoch.intercept,
      brier_in: lastEpoch.brier_in,
      brier_out: lastEpoch.brier_out,
      sample_size: lastEpoch.sample_size,
      recorded_at: lastEpoch.recorded_at.toISOString(),
    } : null;

    // ─── Phase 16-05: technical_pattern_library (8 × 3 × 6 = 144 cells) ──────
    // Wire shape per plan 16-05 §interfaces. signal_class is always 'technical';
    // cap_class is locked to classifyCapClass()'s union (large_cap | mid_cap | small_cap);
    // horizon_days ∈ {3, 7, 14, 30, 60, 90}.
    const technical_pattern_library = technicalPatterns.map(p => {
      const ci = p.sample_size > 0 ? credibleInterval95({ alpha: p.alpha, beta: p.beta }) : null;
      return {
        signal_class: 'technical' as const,
        pattern_key: p.pattern_key,
        cap_class: p.cap_class,
        horizon_days: p.horizon_days,
        posterior_mean: p.sample_size > 0 ? posteriorMean({ alpha: p.alpha, beta: p.beta }) : null,
        ci: ci ? ([ci.low, ci.high] as [number, number]) : null,
        sample_size: p.sample_size,
        status: p.status,
      };
    });

    return NextResponse.json({
      // Existing fields
      total_data_points: dataPoints.length,
      resolved_outcomes: resolved.length,
      thesis: {
        statement: thesisPct !== null
          ? `In ${highGap.length} resolved data points where niche activity exceeded mainstream (diffusion gap >2x), ${thesisPct}% showed >3% price gain within 7 days.`
          : 'Accumulating data — thesis will appear once outcomes resolve (3–7 days after first scans).',
        high_gap_resolved: highGap.length,
        pct: thesisPct,
      },
      diffusion_signals: diffusionSignals,
      outcome_log: resolved.slice(0, 50),
      signal_correlation: {
        diffusion_gap: correlationScore(resolved, d => d.diffusion_gap > 2),
        direction: correlationScore(resolved, d => d.direction > 0.6),
        quality: correlationScore(resolved, d => d.quality > 0.5),
        quantity: correlationScore(resolved, d => d.quantity > 10),
      },

      // New learning-engine fields
      market_state: getMarketStatus(),
      pattern_library,
      live_diffusion_map,
      engine_memory,
      concept_drift: { worst_z, status: drift_status },
      null_check,
      logistic_epoch,
      // Phase 16-05: technical pattern library (signal_class='technical')
      technical_pattern_library,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Insights query failed' }, { status: 500 });
  }
}
