import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Wave 3 Task 1 (Phase 24, REASON-01..05, D-05) — verify EngineContext gains
// the 7 composite_* fields and getEngineContextForTicker populates them.
//
// The full runtime call requires a live Neon connection (loads snapshots for
// (regime × cap_class) via findFirst with ALL-regime cold-start fallback).
// For the unit run we verify the contract structurally: (a) the EngineContext
// interface in src/lib/engine-context.ts declares all 7 fields, and (b) the
// getEngineContextForTicker function returns them in its literal. The live-DB
// integration cross-check lives in tests/integration/ (opt-in via
// `npm run test:integration`) and is not required for Wave 3 acceptance.
describe('EngineContext composite fields (Wave 3)', () => {
  const enginePath = resolve(__dirname, '../../src/lib/engine-context.ts');
  const source = readFileSync(enginePath, 'utf8');

  it('EngineContext interface declares all 7 composite_* fields (non-optional)', () => {
    expect(source).toMatch(/composite_prob:\s*number\s*\|\s*null/);
    expect(source).toMatch(/composite_ci_low:\s*number\s*\|\s*null/);
    expect(source).toMatch(/composite_ci_high:\s*number\s*\|\s*null/);
    expect(source).toMatch(/composite_class_count:\s*number/);
    expect(source).toMatch(/composite_gate_status:\s*'active'\s*\|\s*'insufficient_coverage'\s*\|\s*'insufficient_history'/);
    expect(source).toMatch(/composite_class_weights:\s*Record</);
    expect(source).toMatch(/composite_per_class_calibrated:\s*Record</);
  });

  it('getEngineContextForTicker returns all 7 composite_* fields in its object literal', () => {
    // The Section 14 block appears BEFORE the return; the return literal names
    // each field. Verify all 7 are in the return object.
    expect(source).toMatch(/return\s*{[\s\S]*?composite_prob,[\s\S]*?}/);
    expect(source).toMatch(/return\s*{[\s\S]*?composite_ci_low,[\s\S]*?}/);
    expect(source).toMatch(/return\s*{[\s\S]*?composite_ci_high,[\s\S]*?}/);
    expect(source).toMatch(/return\s*{[\s\S]*?composite_class_count,[\s\S]*?}/);
    expect(source).toMatch(/return\s*{[\s\S]*?composite_gate_status,[\s\S]*?}/);
    expect(source).toMatch(/return\s*{[\s\S]*?composite_class_weights,[\s\S]*?}/);
    expect(source).toMatch(/return\s*{[\s\S]*?composite_per_class_calibrated,[\s\S]*?}/);
  });

  it('Section 14 reads CompositeCalibrationSnapshot with ALL-regime cold-start fallback (Warning #3)', () => {
    // Both findFirst queries must exclude status='insufficient_data' so
    // insufficient snapshots do not defeat the ALL-regime cold-start fallback.
    const findFirstCount = (source.match(/prisma\.compositeCalibrationSnapshot\.findFirst/g) ?? []).length;
    expect(findFirstCount).toBeGreaterThanOrEqual(2);
    const insufficientDataGuardCount = (source.match(/status:\s*{\s*not:\s*'insufficient_data'\s*}/g) ?? []).length;
    expect(insufficientDataGuardCount).toBeGreaterThanOrEqual(2);
  });
});
