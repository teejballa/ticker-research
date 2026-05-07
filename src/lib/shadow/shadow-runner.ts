// src/lib/shadow/shadow-runner.ts
//
// Phase 19 / Plan 19-Z-03 — runWithShadow<T>() generic shadow A/B harness.
//
// Three-mode contract per FeatureMode (D-09):
//   off    → returns oldFn(); newFn never called
//   on     → returns newFn(); oldFn never called
//   shadow → returns oldFn() FIRST; newFn runs in setImmediate background;
//            persists ShadowComparison row with old/new outputs + latencies
//
// Critical invariants:
//   - D-14: shadow mode never injects new-path latency into user-facing path.
//   - T-19-Z-03-02: new-path errors NEVER propagate to caller (caught + logged
//     + persisted as new_output_json={error: <message>}).
//   - T-19-Z-03-03: URL strings sanitized before persist (V7 ASVS) — strips
//     embedded `user:pass@` auth from any string in the output graph.

import { prisma } from '@/lib/db';
import type { FeatureMode } from '@/lib/features';

export interface ShadowContext {
  ticker?: string;
  cost_old_usd?: number;
  cost_new_usd?: number;
}

/**
 * Recursively sanitize URL strings to strip embedded `user:pass@` auth segments
 * (per ASVS V7). Walks objects/arrays.
 */
function sanitize(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    // Match http(s)://user:pass@host → http(s)://***@host
    return value.replace(/(https?:\/\/)([^@/\s]+@)/g, '$1***@');
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitize(v);
    }
    return out;
  }
  return value;
}

/**
 * Generic shadow A/B harness. The canonical entry point for every Phase 19
 * cutover (D-05). Per-call discipline:
 *
 *   - mode='off'    → identical to calling oldFn() directly
 *   - mode='on'     → identical to calling newFn() directly
 *   - mode='shadow' → oldFn() value is what the user sees; newFn() runs
 *                     after-the-fact in setImmediate and persists a
 *                     ShadowComparison row for offline verdict scoring.
 *
 * @param pathName  Logical name for the comparison group (e.g. 'source-package-merge').
 *                  Used as ShadowComparison.path_name and queried by shadow-verdict CLI.
 * @param oldFn     Canonical (production) implementation.
 * @param newFn     Candidate implementation under shadow.
 * @param mode      FeatureMode from features.ts.
 * @param ctx       Optional context: ticker for traceability, per-call cost in USD.
 */
export async function runWithShadow<T>(
  pathName: string,
  oldFn: () => Promise<T>,
  newFn: () => Promise<T>,
  mode: FeatureMode,
  ctx: ShadowContext = {},
): Promise<T> {
  if (mode === 'off') return oldFn();
  if (mode === 'on') return newFn();

  // shadow mode — old returns first, new runs in background.
  const oldStart = Date.now();
  const oldResult = await oldFn();
  const oldLatency = Date.now() - oldStart;

  setImmediate(async () => {
    const newStart = Date.now();
    let newResult: T | null = null;
    let errorMsg: string | null = null;
    try {
      newResult = await newFn();
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[shadow] ${pathName} new-path error:`, errorMsg);
    }
    const newLatency = Date.now() - newStart;

    try {
      await prisma.shadowComparison.create({
        data: {
          path_name: pathName,
          ticker: ctx.ticker ?? null,
          old_output_json: sanitize(oldResult) as object,
          new_output_json: errorMsg
            ? { error: errorMsg }
            : (sanitize(newResult) as object),
          old_latency_ms: oldLatency,
          new_latency_ms: newLatency,
          old_cost_usd: ctx.cost_old_usd ?? null,
          new_cost_usd: ctx.cost_new_usd ?? null,
        },
      });
    } catch (persistErr) {
      // Persistence error must NEVER affect user — already returned.
      console.error(`[shadow] ${pathName} persist error:`, persistErr);
    }
  });

  return oldResult;
}
