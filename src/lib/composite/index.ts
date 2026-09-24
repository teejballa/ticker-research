// Phase 24 barrel — public surface of src/lib/composite/*
export {
  composeSignal,
} from './compose';
export type {
  SignalClass,
  IsotonicPredictor,
  ClassInput,
  ComposeResult,
} from './compose';

export { widenCi, renormalize } from './weights';

export { fitAndSerialize, deserialize } from './isotonic-serde';
export type { IsotonicCurveJSON } from './isotonic-serde';
