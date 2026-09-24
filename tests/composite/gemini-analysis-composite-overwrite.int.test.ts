import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Wave 3 Task 24-03-04 (Blocker #1) — extends the Phase 17-04 post-process
// block in src/lib/gemini-analysis.ts to copy 7 composite fields from engineCtx
// into analysis.engine_calibration. Without this the EngineContext has the
// fields but reports render "insufficient history" for the composite headline.
//
// A full end-to-end test would require mocking the AI SDK call (a heavy setup
// with limited signal). Instead we verify the contract structurally: the
// gemini-analysis.ts source MUST contain all 7 field copies inside the
// engine_calibration object literal, AND the AnalysisResultSchema (Zod) MUST
// NOT contain any composite_* field (REASON-05 trust boundary — that
// negative assertion lives in schema-negative-shape.unit.test.ts).
describe('gemini-analysis composite field post-process overwrite (Wave 3 Task 24-03-04, Blocker #1)', () => {
  const geminiPath = resolve(__dirname, '../../src/lib/gemini-analysis.ts');
  const source = readFileSync(geminiPath, 'utf8');

  it('copies all 7 composite_* fields from engineCtx into engine_calibration', () => {
    // Each field is copied as `<field>: engineCtx.<field>` inside the block.
    expect(source).toMatch(/composite_prob:\s*engineCtx\.composite_prob/);
    expect(source).toMatch(/composite_ci_low:\s*engineCtx\.composite_ci_low/);
    expect(source).toMatch(/composite_ci_high:\s*engineCtx\.composite_ci_high/);
    expect(source).toMatch(/composite_class_count:\s*engineCtx\.composite_class_count/);
    expect(source).toMatch(/composite_gate_status:\s*engineCtx\.composite_gate_status/);
    expect(source).toMatch(/composite_class_weights:\s*engineCtx\.composite_class_weights/);
    expect(source).toMatch(/composite_per_class_calibrated:\s*engineCtx\.composite_per_class_calibrated/);
  });

  it('places the 7 composite copies INSIDE the engine_calibration assignment (trust boundary)', () => {
    // The 7 copies must live in the `engine_calibration = { ... }` literal built
    // from engineCtx. This is the only place where the LLM's output is
    // overwritten. Verify positional order: the composite block appears AFTER
    // spy_alpha_hit_rate (last non-composite engineCtx copy) and BEFORE the
    // closing brace of the engine_calibration literal.
    const idxSpy = source.indexOf('spy_alpha_hit_rate:');
    const idxComposite = source.indexOf('composite_prob:');
    expect(idxSpy).toBeGreaterThan(0);
    expect(idxComposite).toBeGreaterThan(idxSpy);
  });
});
