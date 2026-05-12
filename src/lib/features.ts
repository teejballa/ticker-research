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

export function resolveFeatures(): Features {
  const out = {} as Features;
  for (const name of FLAG_NAMES) {
    const envVar = envVarFor(name);
    const mode = parseMode(process.env[envVar], envVar);
    (out as Record<string, unknown>)[`${name}_mode`] = mode;
    (out as Record<string, unknown>)[`${name}_enabled`] = mode === 'on';
  }
  return out;
}

export const FEATURES: Features = resolveFeatures();
