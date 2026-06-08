#!/usr/bin/env tsx
/* CI gate per CONTEXT.md D-20 + CLAUDE.md rule #6 (feature-leakage audit).
   Every feature in FEATURE_NAMES_36 (12 base + 12 ticker-rolling-z60d + 12 cross-sectional-zxs = 36)
   must have a knowable_at annotation in FEATURE_ASOF_REGISTRY. Audit blocks merges that
   introduce un-annotated features. Also audits CANONICAL_FEATURE_NAMES (7 lit-cited features).

   CLAUDE.md load-bearing rule #6:
   "Feature-leakage audit at every data-source addition. Every feature in SourcePackage must be
   tagged with the as-of-time it would have been knowable at decision time."

   Usage:
     npx tsx scripts/check-feature-asof.ts         # exits 0 if all features annotated
     npm run check-feature-asof                     # same
*/

import { FEATURE_NAMES_36 } from '../src/lib/learning';
import { CANONICAL_FEATURE_NAMES } from '../src/lib/baselines/canonical-features';

// ---------------------------------------------------------------------------
// FEATURE_ASOF_REGISTRY
//
// Format: featureName -> knowable_at timestamp anchor description.
// The anchor describes the earliest point-in-time at which the feature value
// is knowable without lookahead bias (CLAUDE.md rule #6).
//
// Anchor key:
//   'snapshot_scanned_at'     — known at the moment the sentiment scan runs (intraday)
//   'price_close_t-1d'        — requires prior day's close (known at scan time for daily bars)
//   'sector_etf_close_t-1d'   — sector ETF prior close (known at scan time)
//
// DO NOT add features here without verifying their timestamp semantics. Wrong annotations
// are a form of lookahead bias and invalidate the IS paper methodology.
// ---------------------------------------------------------------------------

const FEATURE_ASOF_REGISTRY: Record<string, string> = {
  // -------------------------------------------------------------------------
  // 12 base features (positions 0-11 of FEATURE_NAMES_36)
  // -------------------------------------------------------------------------

  // Diffusion features (positions 0-5) — computed from SentimentSnapshot at scan time
  'v_niche':                    'snapshot_scanned_at',  // niche mention velocity at scan time
  'v_middle':                   'snapshot_scanned_at',  // middle mention velocity at scan time
  'v_mainstream':               'snapshot_scanned_at',  // mainstream mention velocity at scan time
  'niche_lead_cycles':          'snapshot_scanned_at',  // niche-lead-cycles from diffusion trace
  'q_z':                        'snapshot_scanned_at',  // quality-z from diffusion trace
  'qual_z':                     'snapshot_scanned_at',  // qual-z from diffusion trace

  // Technical features (positions 6-11) — computed from prior-day OHLCV bars
  'rsi_14':                     'price_close_t-1d',     // 14-period RSI on prior-close series
  'macd_histogram':             'price_close_t-1d',     // MACD histogram from prior-close series
  'sma_relative_spread':        'price_close_t-1d',     // (sma50 - sma200) / sma200 — never absolute price
  'atr_14':                     'price_close_t-1d',     // 14-period ATR from prior-close series
  'volume_ratio':               'price_close_t-1d',     // volume / 20d avg volume
  'tech_pattern_uptrend_flag':  'price_close_t-1d',     // boolean from tech_pattern classification

  // -------------------------------------------------------------------------
  // 12 ticker-rolling 60-day z-score companions (positions 12-23 of FEATURE_NAMES_36)
  // Suffix: _z60d — z-score of base feature vs ticker's own 60-day history
  // As-of time: same as base feature (computed from same bar / snapshot)
  // -------------------------------------------------------------------------
  'v_niche_z60d':                    'snapshot_scanned_at',
  'v_middle_z60d':                   'snapshot_scanned_at',
  'v_mainstream_z60d':               'snapshot_scanned_at',
  'niche_lead_cycles_z60d':          'snapshot_scanned_at',
  'q_z_z60d':                        'snapshot_scanned_at',
  'qual_z_z60d':                     'snapshot_scanned_at',
  'rsi_14_z60d':                     'price_close_t-1d',
  'macd_histogram_z60d':             'price_close_t-1d',
  'sma_relative_spread_z60d':        'price_close_t-1d',
  'atr_14_z60d':                     'price_close_t-1d',
  'volume_ratio_z60d':               'price_close_t-1d',
  'tech_pattern_uptrend_flag_z60d':  'price_close_t-1d',

  // -------------------------------------------------------------------------
  // 12 cross-sectional z-score companions (positions 24-35 of FEATURE_NAMES_36)
  // Suffix: _zxs — z-score of base feature within today's BACKFILL_UNIVERSE
  // As-of time: same as base feature (cross-section computed at scan time)
  // -------------------------------------------------------------------------
  'v_niche_zxs':                    'snapshot_scanned_at',
  'v_middle_zxs':                   'snapshot_scanned_at',
  'v_mainstream_zxs':               'snapshot_scanned_at',
  'niche_lead_cycles_zxs':          'snapshot_scanned_at',
  'q_z_zxs':                        'snapshot_scanned_at',
  'qual_z_zxs':                     'snapshot_scanned_at',
  'rsi_14_zxs':                     'price_close_t-1d',
  'macd_histogram_zxs':             'price_close_t-1d',
  'sma_relative_spread_zxs':        'price_close_t-1d',
  'atr_14_zxs':                     'price_close_t-1d',
  'volume_ratio_zxs':               'price_close_t-1d',
  'tech_pattern_uptrend_flag_zxs':  'price_close_t-1d',

  // -------------------------------------------------------------------------
  // 7 canonical features (CANONICAL_FEATURE_NAMES — for the canonical7 baseline)
  // All annotated with @knowable_at snapshot.scanned_at in canonical-features.ts
  // -------------------------------------------------------------------------
  'rsi_14_canonical':           'snapshot_scanned_at',  // same as rsi_14; separate registry key for canonical
  'macd_hist':                  'snapshot_scanned_at',  // MACD histogram (canonical name)
  'sentiment_pct':              'snapshot_scanned_at',  // StockTwits bull% at scan time
  'insider_net_flow':           'snapshot_scanned_at',  // Quiver insider net buy USD prior 30d
  'institutional_net_flow':     'snapshot_scanned_at',  // Quiver 13F net institutional flow prior quarter
  'put_call_ratio':             'snapshot_scanned_at',  // options put/call ratio at snapshot time
  'sector_return':              'snapshot_scanned_at',  // sector ETF prior 5d return
};

// ---------------------------------------------------------------------------
// All feature name sets to audit
// ---------------------------------------------------------------------------

const ALL_FEATURE_NAMES: readonly string[] = FEATURE_NAMES_36;
const CANONICAL_NAMES: readonly string[] = CANONICAL_FEATURE_NAMES;

function main(): number {
  let anyFailed = false;

  // Audit FEATURE_NAMES_36 (engine logistic features)
  const missing36: string[] = [];
  for (const name of ALL_FEATURE_NAMES) {
    if (!(name in FEATURE_ASOF_REGISTRY)) missing36.push(name);
  }

  if (missing36.length > 0) {
    console.error(`check-feature-asof: ${missing36.length} engine feature(s) missing knowable_at annotation:`);
    for (const m of missing36) console.error(`  - ${m}`);
    console.error('Add an entry to FEATURE_ASOF_REGISTRY in scripts/check-feature-asof.ts');
    console.error('See CLAUDE.md rule #6 (feature-leakage audit at every data-source addition).');
    anyFailed = true;
  } else {
    console.log(`check-feature-asof: ${ALL_FEATURE_NAMES.length}/${ALL_FEATURE_NAMES.length} engine features (FEATURE_NAMES_36) annotated ✓`);
  }

  // Audit CANONICAL_FEATURE_NAMES (canonical7 baseline features)
  const missingCanonical: string[] = [];
  for (const name of CANONICAL_NAMES) {
    // canonical feature names overlap with engine names (rsi_14 is in both)
    // so we accept either the exact name OR a _canonical suffix variant
    const inRegistry = (name in FEATURE_ASOF_REGISTRY) || (`${name}_canonical` in FEATURE_ASOF_REGISTRY);
    if (!inRegistry) missingCanonical.push(name);
  }

  if (missingCanonical.length > 0) {
    console.error(`check-feature-asof: ${missingCanonical.length} canonical feature(s) missing knowable_at annotation:`);
    for (const m of missingCanonical) console.error(`  - ${m}`);
    console.error('Add an entry to FEATURE_ASOF_REGISTRY in scripts/check-feature-asof.ts');
    anyFailed = true;
  } else {
    console.log(`check-feature-asof: ${CANONICAL_NAMES.length}/${CANONICAL_NAMES.length} canonical features (CANONICAL_FEATURE_NAMES) annotated ✓`);
  }

  if (!anyFailed) {
    const total = ALL_FEATURE_NAMES.length + CANONICAL_NAMES.length;
    console.log(`check-feature-asof: all ${total} features have knowable_at annotations ✓`);
    console.log('CLAUDE.md rule #6 (feature-leakage audit) satisfied.');
  }

  return anyFailed ? 1 : 0;
}

process.exit(main());
