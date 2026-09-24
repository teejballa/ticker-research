// src/lib/composite/compose.ts
// Phase 24 (D-01, D-03, REASON-01). Pure composite arithmetic — ESS-weighted mean
// over per-class isotonic-calibrated posteriors. Zero I/O. Deterministic.

export type SignalClass = 'diffusion' | 'technical' | 'institutional' | 'insider';
export type IsotonicPredictor = (x: number) => number;

export interface ClassInput {
  raw_posterior: number | null;
  ess: number;
  status: 'ACTIVE' | 'EXPLORATORY' | 'EXPLORATORY-WATCH' | 'DEPRECATED' | 'NO_DATA';
}

export interface ComposeResult {
  composite_prob: number | null;
  class_count: number;
  gate_status: 'active' | 'insufficient_coverage' | 'insufficient_history';
  class_weights: Record<SignalClass, number>;
  per_class_calibrated: Record<SignalClass, number | null>;
}

const CLASSES: SignalClass[] = ['diffusion', 'technical', 'institutional', 'insider'];

export function composeSignal(
  inputs: Record<SignalClass, ClassInput>,
  curves: Record<SignalClass, IsotonicPredictor | null>,
  opts: { minClassesActive: number },
): ComposeResult {
  const active = CLASSES.filter(
    (c) =>
      inputs[c].status === 'ACTIVE' &&
      inputs[c].raw_posterior != null &&
      curves[c] != null,
  );

  const zeroed: Record<SignalClass, number> = { diffusion: 0, technical: 0, institutional: 0, insider: 0 };
  const nullPc: Record<SignalClass, number | null> = { diffusion: null, technical: null, institutional: null, insider: null };

  if (active.length < opts.minClassesActive) {
    return {
      composite_prob: null,
      class_count: active.length,
      gate_status: active.length === 0 ? 'insufficient_history' : 'insufficient_coverage',
      class_weights: zeroed,
      per_class_calibrated: nullPc,
    };
  }

  const totalEss = active.reduce((s, c) => s + inputs[c].ess, 0);
  const weights: Record<SignalClass, number> = { ...zeroed };
  const perClassCal: Record<SignalClass, number | null> = { ...nullPc };
  let composite = 0;
  for (const c of active) {
    const cal = curves[c]!(inputs[c].raw_posterior!);
    perClassCal[c] = cal;
    weights[c] = inputs[c].ess / totalEss;
    composite += weights[c] * cal;
  }

  return {
    composite_prob: composite,
    class_count: active.length,
    gate_status: 'active',
    class_weights: weights,
    per_class_calibrated: perClassCal,
  };
}
