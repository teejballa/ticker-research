// Phase 19 Plan 19-A-07 — Hierarchical Bayesian pooling unit tests.
// Reference: 19-RESEARCH.md Example 3 (lines 519-578) — empirical Bayes
// hierarchical pooling via method-of-moments on a Beta hyperprior.
// Per-cell shrinkage: α_pooled = (n × α_local + λ × α_group) / (n + λ).
// λ ∈ [0.5, 50]. Cold-start (group < 5) → flat prior, shrinkage_strength=0.

import { describe, it, expect } from 'vitest';
import {
  hierarchicalPooledPosterior,
  type BetaPosterior,
  type PooledPosterior,
} from '../src/lib/learning';

const ID = (a: number, b: number): BetaPosterior => ({ alpha: a, beta: b });

describe('hierarchicalPooledPosterior (Plan 19-A-07 — empirical Bayes pooling)', () => {
  it('Test 1: cold-start (group_cells.length < 5) returns local unchanged + shrinkage_strength=0', () => {
    const local = ID(7, 4);
    const group: BetaPosterior[] = [ID(2, 3), ID(4, 5), ID(6, 6), ID(3, 8)]; // k=4 < 5
    const out = hierarchicalPooledPosterior({ cell_local: local, cell_n: 11, group_cells: group });
    expect(out.alpha_pooled).toBe(7);
    expect(out.beta_pooled).toBe(4);
    expect(out.shrinkage_strength).toBe(0);
  });

  it('Test 2: pooled posterior shrinks toward parent — sparse cell closer to group mean than rich cell', () => {
    const group: BetaPosterior[] = [
      ID(8, 4),
      ID(7, 3),
      ID(9, 5),
      ID(6, 4),
      ID(10, 4),
      ID(8, 5),
    ];
    const groupMean = group.reduce((acc, c) => acc + c.alpha / (c.alpha + c.beta), 0) / group.length;

    const sparseLocal = ID(0.5, 9.5); // local mean ≈ 0.05, far from groupMean
    const richLocal = ID(0.5, 99.5);  // local mean ≈ 0.005, also far from groupMean

    const sparse = hierarchicalPooledPosterior({ cell_local: sparseLocal, cell_n: 2, group_cells: group });
    const rich = hierarchicalPooledPosterior({ cell_local: richLocal, cell_n: 100, group_cells: group });

    const sparseMean = sparse.alpha_pooled / (sparse.alpha_pooled + sparse.beta_pooled);
    const richMean = rich.alpha_pooled / (rich.alpha_pooled + rich.beta_pooled);

    // Sparse cell pulled closer to groupMean than rich cell
    expect(Math.abs(sparseMean - groupMean)).toBeLessThan(Math.abs(richMean - groupMean));
  });

  it('Test 3: parent_alpha + parent_beta computed via method-of-moments from group means', () => {
    const group: BetaPosterior[] = [
      ID(8, 4),
      ID(7, 3),
      ID(9, 5),
      ID(6, 4),
      ID(10, 4),
      ID(8, 5),
    ];
    const out = hierarchicalPooledPosterior({ cell_local: ID(1, 1), cell_n: 0, group_cells: group });
    const parentMean = out.parent_alpha / (out.parent_alpha + out.parent_beta);
    const groupMean = group.reduce((a, c) => a + c.alpha / (c.alpha + c.beta), 0) / group.length;
    expect(parentMean).toBeCloseTo(groupMean, 5);
    expect(out.parent_alpha).toBeGreaterThan(0);
    expect(out.parent_beta).toBeGreaterThan(0);
  });

  it('Test 4: lambda bounded [0.5, 50]', () => {
    // Identical cells → variance ~0 → ratio → ∞ → λ should clamp to 50
    const tight: BetaPosterior[] = [ID(8, 2), ID(8, 2), ID(8, 2), ID(8, 2), ID(8, 2), ID(8, 2)];
    const tightOut = hierarchicalPooledPosterior({ cell_local: ID(1, 1), cell_n: 1, group_cells: tight });
    expect(tightOut.shrinkage_strength).toBeLessThanOrEqual(50);
    expect(tightOut.shrinkage_strength).toBeGreaterThanOrEqual(0.5);

    // Very dispersed group → λ should clamp to 0.5
    const wide: BetaPosterior[] = [
      ID(99, 1),
      ID(1, 99),
      ID(99, 1),
      ID(1, 99),
      ID(99, 1),
      ID(1, 99),
    ];
    const wideOut = hierarchicalPooledPosterior({ cell_local: ID(1, 1), cell_n: 1, group_cells: wide });
    expect(wideOut.shrinkage_strength).toBeLessThanOrEqual(50);
    expect(wideOut.shrinkage_strength).toBeGreaterThanOrEqual(0.5);
  });

  it('Test 5: alpha_pooled = (cell_n × cell_local.alpha + λ × parent_alpha) / (cell_n + λ) exact formula', () => {
    const local = ID(5, 3);
    const cell_n = 8;
    const group: BetaPosterior[] = [ID(8, 4), ID(7, 3), ID(9, 5), ID(6, 4), ID(10, 4), ID(8, 5)];
    const out = hierarchicalPooledPosterior({ cell_local: local, cell_n, group_cells: group });
    const expectedAlpha =
      (cell_n * local.alpha + out.shrinkage_strength * out.parent_alpha) /
      (cell_n + out.shrinkage_strength);
    const expectedBeta =
      (cell_n * local.beta + out.shrinkage_strength * out.parent_beta) /
      (cell_n + out.shrinkage_strength);
    expect(out.alpha_pooled).toBeCloseTo(expectedAlpha, 9);
    expect(out.beta_pooled).toBeCloseTo(expectedBeta, 9);
  });

  it('Test 6: pooled posterior is DB-free pure function (no @/lib/db import)', async () => {
    // Read the source file and confirm hierarchicalPooledPosterior block contains no prisma reference.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/learning.ts'),
      'utf8'
    );
    const fnStart = src.indexOf('export function hierarchicalPooledPosterior');
    expect(fnStart).toBeGreaterThan(-1);
    // Capture body up to the next top-level `export` declaration (or end of file).
    const after = src.slice(fnStart);
    const nextExport = after.indexOf('\nexport ', 1);
    const body = nextExport > 0 ? after.slice(0, nextExport) : after;
    expect(body).not.toMatch(/prisma/i);
    expect(body).not.toMatch(/from ['"]@\/lib\/db['"]/);
  });

  it("Test 7: group with all identical cells → parent ≈ each cell's posterior", () => {
    const group: BetaPosterior[] = [
      ID(8, 2),
      ID(8, 2),
      ID(8, 2),
      ID(8, 2),
      ID(8, 2),
      ID(8, 2),
    ];
    const out = hierarchicalPooledPosterior({ cell_local: ID(1, 1), cell_n: 0, group_cells: group });
    const parentMean = out.parent_alpha / (out.parent_alpha + out.parent_beta);
    const cellMean = 8 / 10;
    expect(parentMean).toBeCloseTo(cellMean, 5);
  });

  it('Test 8: group with high variance → smaller lambda (less shrinkage) than tight group', () => {
    const tight: BetaPosterior[] = [ID(8, 2), ID(8, 2), ID(8, 2), ID(8, 2), ID(8, 2), ID(8, 2)];
    const wide: BetaPosterior[] = [
      ID(20, 1),
      ID(1, 20),
      ID(20, 1),
      ID(1, 20),
      ID(20, 1),
      ID(1, 20),
    ];
    const tightOut = hierarchicalPooledPosterior({
      cell_local: ID(1, 1),
      cell_n: 1,
      group_cells: tight,
    });
    const wideOut = hierarchicalPooledPosterior({
      cell_local: ID(1, 1),
      cell_n: 1,
      group_cells: wide,
    });
    expect(wideOut.shrinkage_strength).toBeLessThan(tightOut.shrinkage_strength);
  });

  it('Test 9: n_local=0 → alpha_pooled = parent_alpha (full pool to parent)', () => {
    const group: BetaPosterior[] = [
      ID(8, 4),
      ID(7, 3),
      ID(9, 5),
      ID(6, 4),
      ID(10, 4),
      ID(8, 5),
    ];
    const out = hierarchicalPooledPosterior({
      cell_local: ID(99, 99), // local content irrelevant when cell_n=0
      cell_n: 0,
      group_cells: group,
    });
    expect(out.alpha_pooled).toBeCloseTo(out.parent_alpha, 9);
    expect(out.beta_pooled).toBeCloseTo(out.parent_beta, 9);
  });

  it('Test 10: n_local→∞ → alpha_pooled → cell_local.alpha (no pool)', () => {
    const local = ID(7, 3);
    const group: BetaPosterior[] = [ID(8, 4), ID(7, 3), ID(9, 5), ID(6, 4), ID(10, 4), ID(8, 5)];
    const huge = hierarchicalPooledPosterior({ cell_local: local, cell_n: 1e9, group_cells: group });
    expect(huge.alpha_pooled).toBeCloseTo(local.alpha, 5);
    expect(huge.beta_pooled).toBeCloseTo(local.beta, 5);
  });
});
