/**
 * Phase 19 — Feature flag matrix
 *
 * Three-mode flag (`off` | `shadow` | `on`) per env triple. Lifecycle:
 *   off → shadow → on → flag removed entirely (D-09, D-10).
 *
 * Every Wave A/B/C plan reads from this module to gate its new code path.
 * All 15 flags default to `off` on first deploy. Each graduates independently
 * after its own shadow verdict passes.
 *
 * Misconfiguration surfaces at module load via `FEATURES = resolveFeatures()`
 * so it fails fast at startup, not on first request (T-19-Z-01-01 mitigation).
 */

export type FeatureMode = 'off' | 'shadow' | 'on';

const FLAG_NAMES = [
  'conformal_intervals',
  'cpcv',
  'ic_decay_monitor',
  'hierarchical_pooling',
  'data_cache',
  'twelvedata_primary',
  'exa_primary',
  'finsentllm_ensemble',
  'community_supplemental',
  'cove_two_pass',
  'model_router',
  'contradiction_detector',
  'options_term_structure',
  'reputation_weighted_stocktwits',
  // Plan 20-A-01 — crowded-consensus flag (GME-100% fix)
  'crowded_consensus',
  // Plan 20-A-02 — robust mention-volume baseline replaces stocktwits_is_trending heuristic
  'mention_z_trending',
  // Plan 20-A-05 — cross-platform agreement signal + MIXED · LOW AGREEMENT badge
  'agreement_signal',
  // Plan 20-C-03 — Cresci-2019 bot filter + MinHash coordination detection
  'bot_filter',
  // Plan 20-C-04 — Pump-and-dump cluster detector (Nam/Yang 2023 baseline).
  // Computation flag: gates aggregator.computeManipulationWarning. Default
  // 'off' via parseMode (env var absent) — operator flips to 'shadow' for the
  // 30d FP-review gate, then 'on' after F1 ≥ 0.6 + 0 production FPs.
  'pump_dump_detector',
  // Plan 20-C-04 — UI banner gating. Separate from computation flag per
  // CONTEXT.md S3 (UI rollout gated separately). NEXT_PUBLIC_ prefix is used
  // at the render site for client-side visibility — this server-side flag is
  // included for grep traceability + parity with bot_filter pattern.
  'pump_dump_detector_ui',
  // Plan 20-B-01 — Gemini per-document sentiment + aspect classifier (cheap path).
  // Default 'shadow' is set by parseMode("shadow") wiring below + .env default.
  // Shadow lifecycle gated by frontmatter shadow_cutover_criteria in 20-B-01-PLAN.md.
  'per_doc_sentiment',
  // Plan 20-B-05 — per-aspect aggregation (bull% chip stack + research-brief
  // aspect breakdown). Env var: FEATURE_PER_ASPECT_AGGREGATE. Default 'shadow'
  // even when env var is absent (SHADOW_DEFAULT_FLAGS below) — additive in
  // shadow; cutover to 'on' gated by 4 criteria in 20-B-05-PLAN.md frontmatter.
  'per_aspect_aggregate',
  // Plan 20-D-03 — per-claim CoVe verification + UI (?) badge.
  // Env var: FEATURE_PER_CLAIM_VERIFIED. Default 'off'. Cutover to 'shadow'
  // then 'on' gated by the 4 numerical criteria in 20-D-03-PLAN.md frontmatter
  // (shadow_lifecycle.cutover_criteria). Client-side UI gate uses
  // NEXT_PUBLIC_FEATURE_PER_CLAIM_VERIFIED for the badge render at the
  // ResearchReport.tsx render site.
  'per_claim_verified',
] as const;

type FlagName = typeof FLAG_NAMES[number];

export type Features = {
  [K in FlagName as `${K}_enabled`]: boolean;
} & {
  [K in FlagName as `${K}_mode`]: FeatureMode;
};

/**
 * Map flag name → env var. Most flags use `FEATURE_<UPPER>` directly; the
 * conformal_intervals flag uses the shortened `FEATURE_CONFORMAL` per
 * `.env.example` (D-09 / impl-plan line 239). Override any other shorthands
 * by adding to this map.
 */
const FLAG_ENV_OVERRIDES: Partial<Record<FlagName, string>> = {
  conformal_intervals: 'FEATURE_CONFORMAL',
};

function envVarFor(name: FlagName): string {
  return FLAG_ENV_OVERRIDES[name] ?? `FEATURE_${name.toUpperCase()}`;
}

function parseMode(envValue: string | undefined, varName: string): FeatureMode {
  if (envValue == null || envValue === '' || envValue === 'false' || envValue === 'off') return 'off';
  if (envValue === 'true' || envValue === 'on') return 'on';
  if (envValue === 'shadow') return 'shadow';
  throw new Error(`${varName} must be one of: false, shadow, true (got: ${envValue})`);
}

// Plan 20-B-01 — per_doc_sentiment defaults to 'shadow' when env var is absent.
// Default-shadow flags do NOT block the main analysis but DO write artifacts
// (SentimentObservation rows + AnalysisResult.per_document_sentiment) so the
// cutover scoring window can begin accumulating evidence before any cron flip.
const SHADOW_DEFAULT_FLAGS: ReadonlySet<FlagName> = new Set<FlagName>([
  'per_doc_sentiment',
  // Plan 20-B-05 — additive per-aspect aggregator defaults to shadow so the
  // pipeline starts populating AnalysisResult.per_aspect_sentiment for the κ
  // cutover scoring window even before the operator flips the env var.
  'per_aspect_aggregate',
]);

export function resolveFeatures(): Features {
  const out = {} as Features;
  for (const name of FLAG_NAMES) {
    const envVar = envVarFor(name);
    const rawEnv = process.env[envVar];
    const mode = rawEnv == null && SHADOW_DEFAULT_FLAGS.has(name)
      ? ('shadow' as FeatureMode)
      : parseMode(rawEnv, envVar);
    (out as Record<string, unknown>)[`${name}_mode`] = mode;
    (out as Record<string, unknown>)[`${name}_enabled`] = mode === 'on';
  }
  return out;
}

export const FEATURES: Features = resolveFeatures();

// ── Plan 20-C-03 — Bot-filter three-mode flag (explicit re-export) ─────
// Generated as FEATURES.bot_filter_mode via the FLAG_NAMES tuple above; this
// type alias + re-export keeps grep-traceability for "BotFilterMode" callers
// (aggregator weight gate + UI subtext) and lets the eval scripts type-check.
export type BotFilterMode = FeatureMode;
export const BOT_FILTER_MODE: BotFilterMode = FEATURES.bot_filter_mode;

// ── Plan 20-B-05 — per-aspect aggregation flag (explicit re-export) ────
// Same shape as BotFilterMode above — generated via FLAG_NAMES; this re-export
// keeps FEATURE_PER_ASPECT_AGGREGATE grep-traceable for source-package wiring,
// research-brief prompt insertion, and PerAspectChips UI gating.
export const FEATURE_PER_ASPECT_AGGREGATE: FeatureMode = FEATURES.per_aspect_aggregate_mode;
