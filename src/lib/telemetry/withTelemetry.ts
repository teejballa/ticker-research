/**
 * Plan 20-Z-03 — withTelemetry wrapper.
 *
 * Composes around any async fn (typically a withRetry-wrapped fetch). Captures
 * wall-clock timing, status, and cost. INSERT runs fire-and-forget — caller
 * sees IDENTICAL return value with IDENTICAL timing.
 *
 * T-20-Z-03-01: wrapper overhead p99 < 2ms (asserted in unit test).
 * T-20-Z-03-05: error_class is controlled enum, never raw message.
 */
import { COST_PER_CALL_USD, type ProviderId } from './cost-estimators';
import { classifyError, type TelemetryErrorClass } from './error-classifier';
import { recordCallAsync } from './provider-call-log';
// Phase 30 D-15 — cost-anomaly trip line (post-success) reads `getRedis` to
// INCR a counter keyed `cost_anomaly:gemini`. When the count reaches 3 within
// a 1h window the regular `breaker:gemini:state` key is written with
// `reason='cost_anomaly'` (1h TTL) so subsequent Gemini calls short-circuit
// through the same withBreaker primitive — no second breaker class.
import { getRedis } from '@/lib/data/cache/upstash';

// Plan 20-B-06 — the ProviderId union below (re-exported from cost-estimators)
// includes 'lm-fallback' so withTelemetry('lm-fallback', ...) is type-safe.
export type { ProviderId } from './cost-estimators';
export type { TelemetryErrorClass } from './error-classifier';

export interface WithTelemetryOptions<T> {
  /** Optional ticker context for per-ticker breakdowns. */
  ticker?: string;
  /** Estimate USD cost given the resolved value (e.g., gemini reads usage.inputTokens). Defaults to COST_PER_CALL_USD[provider_id]. */
  cost_usd_estimator?: (result: T) => number;
  /** Whether the value came from cache. Counted into cache_hit_rate on the dashboard. */
  cache_check?: () => boolean;
  /** True if this invocation is itself a fallback path (counted into fallback_rate). */
  is_fallback?: boolean;
  // TODO (CONTEXT.md line 173 — deferrable): future OTel collector hook.
  // extensions?: { otel?: 'off' | 'shadow' | 'on' };
}

/**
 * withTelemetry — wraps an external-call function and records latency / status / cost
 * to ProviderCallLog. Returns the EXACT value `fn()` returned. The INSERT runs
 * fire-and-forget — the caller never awaits it.
 *
 * @example wrap an existing withRetry-wrapped fetch:
 *   const quote = await withTelemetry('yahoo', () => withRetry(() => yahooFinance.quote(ticker)), { ticker });
 *
 * @example with a result-derived cost (Gemini):
 *   const out = await withTelemetry('gemini', () => generateObject({...}), {
 *     ticker,
 *     cost_usd_estimator: (r) => r.usage.inputTokens * GEMINI_TOKEN_RATES.input
 *                              + r.usage.outputTokens * GEMINI_TOKEN_RATES.output,
 *   });
 */
export async function withTelemetry<T>(
  provider_id: ProviderId,
  fn: () => Promise<T>,
  opts: WithTelemetryOptions<T> = {},
): Promise<T> {
  const started_at = new Date();
  const t0 = performance.now();
  let value: T;
  let error_class: TelemetryErrorClass | null = null;
  let http_status: number | null = null;
  let status: 'ok' | 'error' = 'ok';

  try {
    value = await fn();
  } catch (err) {
    status = 'error';
    error_class = classifyError(err);
    const e = err as { status?: number };
    if (typeof e?.status === 'number') http_status = e.status;
    const ended_at = new Date();
    const duration_ms = Math.max(0, Math.round(performance.now() - t0));
    recordCallAsync({
      provider_id,
      ticker: opts.ticker ?? null,
      started_at,
      ended_at,
      duration_ms,
      status,
      http_status,
      error_class,
      fallback_used: opts.is_fallback ?? false,
      cache_hit: false,
      cost_usd: 0,
      request_size_bytes: null,
      response_size_bytes: null,
      retry_count: 0,
    });
    throw err;
  }

  const ended_at = new Date();
  const duration_ms = Math.max(0, Math.round(performance.now() - t0));
  let cost_usd = COST_PER_CALL_USD[provider_id] ?? 0;
  if (opts.cost_usd_estimator) {
    try {
      cost_usd = opts.cost_usd_estimator(value);
    } catch {
      cost_usd = COST_PER_CALL_USD[provider_id] ?? 0;
    }
  }
  let cache_hit = false;
  if (opts.cache_check) {
    try {
      cache_hit = !!opts.cache_check();
    } catch {
      cache_hit = false;
    }
  }

  recordCallAsync({
    provider_id,
    ticker: opts.ticker ?? null,
    started_at,
    ended_at,
    duration_ms,
    status,
    http_status,
    error_class,
    fallback_used: opts.is_fallback ?? false,
    cache_hit,
    cost_usd,
    request_size_bytes: null,
    response_size_bytes: null,
    retry_count: 0,
  });

  // Phase 30 D-15 — cost-ceiling regression guard.
  // Gemini call costing more than $1.00 increments an Upstash counter; 3 such
  // calls within 1h trip a 1h provider-wide gemini breaker. Reuses the same
  // breaker:gemini:state key that withBreaker reads, so no second breaker class.
  // Per Amendment 2026-05-14: counter resets at TRIP time (DEL on trip) rather
  // than CLOSE time — equivalent observable behavior since while breaker is
  // open all Gemini calls short-circuit before reaching this path.
  if (provider_id === 'gemini' && typeof cost_usd === 'number' && cost_usd > 1.00) {
    queueMicrotask(async () => {
      try {
        const r = getRedis();
        if (!r) return;
        const key = 'cost_anomaly:gemini';
        const count = await r.incr(key);
        if (count === 1) await r.expire(key, 3600);
        if (count >= 3) {
          await r.set(
            'breaker:gemini:state',
            JSON.stringify({ status: 'open', opened_at: Date.now(), reason: 'cost_anomaly' }),
            { ex: 3600 },
          );
          await r.del(key);
          console.warn('[withTelemetry] gemini cost_anomaly breaker tripped:', { cost_usd, count });
        }
      } catch (err) {
        // Fire-and-forget — never block the caller. Cost-anomaly tracking is best-effort.
        console.warn('[withTelemetry] cost_anomaly tracking failed:', String(err));
      }
    });
  }

  return value;
}
