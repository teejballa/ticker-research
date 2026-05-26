import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const CLI = resolve(__dirname, '../../scripts/backfill-historical.ts');

describe('single feature-extraction path (COVERAGE-08)', () => {
  it('backfill CLI source exists', () => {
    // RED until Plan 02/03 create the CLI.
    expect(existsSync(CLI)).toBe(true);
  });
  it('imports computeTechnicalSnapshot (canonical path)', () => {
    const src = readFileSync(CLI, 'utf8');
    expect(src).toMatch(/computeTechnicalSnapshot/);
  });
  it('does NOT import technicalindicators directly (no forked extractor)', () => {
    const src = readFileSync(CLI, 'utf8');
    expect(src).not.toMatch(/from ['"]technicalindicators['"]/);
  });
});
