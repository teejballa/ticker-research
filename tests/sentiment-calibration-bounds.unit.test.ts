// tests/sentiment-calibration-bounds.unit.test.ts
// Plan 20-B-03 Task 1 — module-load Zod assertion + frozen const guards.

import { describe, expect, it } from 'vitest';
import {
  CALIBRATION_BOUNDS,
  validateCalibrationBounds,
} from '../src/lib/sentiment/calibration-hyperparameters';

describe('20-B-03 Task 1 — calibration-hyperparameters', () => {
  it('validateCalibrationBounds() does not throw on shipped CALIBRATION_BOUNDS', () => {
    expect(() => validateCalibrationBounds()).not.toThrow();
  });

  it('validateCalibrationBounds() throws when T_MIN >= T_MAX', () => {
    const bad = { ...CALIBRATION_BOUNDS, T_MIN: 1.0, T_MAX: 1.0 } as Record<
      string,
      unknown
    >;
    expect(() => validateCalibrationBounds(bad)).toThrow();
  });

  it('validateCalibrationBounds() throws when SHIP_GATE_ECE >= 1', () => {
    const bad = { ...CALIBRATION_BOUNDS, SHIP_GATE_ECE: 1.0 } as Record<
      string,
      unknown
    >;
    expect(() => validateCalibrationBounds(bad)).toThrow();
  });

  it('CALIBRATION_BOUNDS is frozen — direct mutation throws in strict mode', () => {
    'use strict';
    expect(Object.isFrozen(CALIBRATION_BOUNDS)).toBe(true);
    expect(() => {
      (CALIBRATION_BOUNDS as unknown as Record<string, number>).T_MIN = 0.01;
    }).toThrow();
  });

  it('CALIBRATION_BOUNDS exposes the expected literal constants', () => {
    expect(CALIBRATION_BOUNDS.T_MIN).toBe(0.1);
    expect(CALIBRATION_BOUNDS.T_MAX).toBe(10.0);
    expect(CALIBRATION_BOUNDS.T_INITIAL).toBe(1.0);
    expect(CALIBRATION_BOUNDS.N_BINS_ECE).toBe(10);
    expect(CALIBRATION_BOUNDS.N_FOLDS_CV).toBe(5);
    expect(CALIBRATION_BOUNDS.PRODUCTION_LABELS_FLOOR).toBe(500);
    expect(CALIBRATION_BOUNDS.SHIP_GATE_ECE).toBe(0.05);
    expect(CALIBRATION_BOUNDS.SHIP_GATE_BRIER).toBe(0.24);
  });
});
