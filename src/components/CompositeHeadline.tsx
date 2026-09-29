// src/components/CompositeHeadline.tsx
// Phase 24 Wave 4 (D-04, REASON-03). Pure presentational component.
//
// Renders the composite signal as the visual anchor at the top of
// EngineCalibrationPanel. Reads composite_* fields from EngineCalibration
// (populated by engine-context.ts + post-process overwrite in Wave 3).
//
// Gate states:
//   - 'active'                — show composite prob + CI band + K-of-4 subline
//   - 'insufficient_coverage' — < MIN_CLASSES_ACTIVE=2 classes active on this ticker
//   - 'insufficient_history'  — no CompositeCalibrationSnapshot yet for the cell
//
// Trust boundary (REASON-05): this component reads props only. It never fetches,
// never mutates, and never receives LLM-authored composite values. The
// gemini-analysis.ts post-process (Phase 24 Wave 3) copies these values from
// the engine-authored EngineContext into analysis.engine_calibration.

'use client';

export type CompositeGateStatus =
  | 'active'
  | 'insufficient_coverage'
  | 'insufficient_history';

export interface CompositeHeadlineProps {
  /** Composite probability ∈ [0, 1]; null when gate is not active. */
  prob: number | null;
  /** Widened lower CI bound (√(4/K) applied); null when gate is not active. */
  ciLow: number | null;
  /** Widened upper CI bound (√(4/K) applied); null when gate is not active. */
  ciHigh: number | null;
  /** Number of ACTIVE signal classes (0-4). */
  classCount: number;
  /** Gate state — controls which copy branch renders. */
  gateStatus: CompositeGateStatus;
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export function CompositeHeadline({
  prob,
  ciLow,
  ciHigh,
  classCount,
  gateStatus,
}: CompositeHeadlineProps) {
  // ── Branch 1: insufficient_coverage (K < MIN_CLASSES_ACTIVE) ─────────────
  if (gateStatus === 'insufficient_coverage') {
    return (
      <div
        data-testid="composite-headline"
        className="mb-5 p-4 rounded-lg bg-surface-container-low border border-outline-variant/40"
      >
        <div className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant mb-2">
          Cipher Composite Signal
        </div>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          insufficient signal coverage — fewer than 2 signal classes are TRUSTED yet.
        </p>
      </div>
    );
  }

  // ── Branch 2: insufficient_history (no snapshot yet) ─────────────────────
  if (gateStatus === 'insufficient_history' || prob == null) {
    return (
      <div
        data-testid="composite-headline"
        className="mb-5 p-4 rounded-lg bg-surface-container-low border border-outline-variant/40"
      >
        <div className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant mb-2">
          Cipher Composite Signal
        </div>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          insufficient history — composite calibration is still warming up.
        </p>
      </div>
    );
  }

  // ── Branch 3: ACTIVE ─────────────────────────────────────────────────────
  const ciLowLabel = ciLow != null ? pct(ciLow) : '—';
  const ciHighLabel = ciHigh != null ? pct(ciHigh) : '—';

  return (
    <div
      data-testid="composite-headline"
      className="mb-5 p-4 rounded-lg bg-primary/5 border border-primary/20"
    >
      <div className="text-[10px] font-bold tracking-widest uppercase text-primary mb-2">
        Cipher Composite Signal
      </div>
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-4xl font-mono tabular-nums font-semibold text-on-surface">
          {pct(prob)}
        </span>
        <span className="text-[11px] font-mono text-on-surface-variant tracking-widest uppercase">
          range: [{ciLowLabel}, {ciHighLabel}] · {classCount} of 4 signals active
        </span>
      </div>
    </div>
  );
}
