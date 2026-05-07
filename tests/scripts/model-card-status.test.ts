// tests/scripts/model-card-status.test.ts
//
// Phase 19 / Plan 19-Z-04 / Task 1 — model-card-status composite gate tests.
//
// The script (scripts/model-card-status.ts) implements 9 distinct check
// categories per design §11 + RESEARCH §"19-Z-04 model-card-status":
//
//   1. conformal-coverage  — ≥80% ACTIVE cells have conformal_low/high
//   2. dsr                  — avg(dsr) > 0.5 across ACTIVE cells
//   3. pbo                  — avg(pbo) < 0.5 across ACTIVE cells
//   4. ic-{class}           — rolling_ic_20d populated in last 7d (×4 classes)
//   5. pooled               — ≥80% of cells have parent_alpha
//   6. finsentllm           — ≥95% of last-30d SentimentSnapshot rows have finsentllm_score
//   7. citations            — ≥90% URL coverage on analyst/news claims (last 30d)
//   8. no-old-{name}        — zero matches per registered grep pattern
//   9. flag-removed-{flag}  — each Phase 19 FEATURE_* flag absent from features.ts
//
// Tests mock Prisma + fs + child_process via dependency injection — the script
// exports `runChecks(deps)` for direct unit test invocation without spawning
// the script entrypoint (and without process.exit()).
//
// Test convention: each test calls runChecks() with a "happy" baseline of
// dependencies (everything passes), then perturbs ONE input to force a single
// expected failed check. Asserts the failed check name appears in the returned
// Check[] array.

import { describe, it, expect } from 'vitest';
import { runChecks, type Check, type RunChecksDeps } from '../../scripts/model-card-status';

// Phase 19 flags (must match src/lib/features.ts FLAG_NAMES + scripts/model-card-status.ts).
const PHASE_19_FLAGS = [
  'conformal_intervals',
  'cpcv',
  'ic_decay_monitor',
  'hierarchical_pooling',
  'data_cache',
  'tiingo_primary',
  'twelvedata_primary',
  'exa_primary',
  'finsentllm_ensemble',
  'community_supplemental',
  'cove_two_pass',
  'model_router',
  'contradiction_detector',
  'options_term_structure',
  'reputation_weighted_stocktwits',
];

const SIGNAL_CLASSES = ['diffusion', 'technical', 'insider', 'institutional'] as const;

/**
 * Build a passing-baseline deps object: every check returns OK.
 * Tests perturb individual fields to force one specific failure at a time.
 */
function passingDeps(): RunChecksDeps {
  return {
    prisma: {
      learnedPattern: {
        // Default: 100 ACTIVE cells, all 100 have conformal_low → 100% coverage.
        // For (status,signal_class,rolling_ic_20d,last_updated) IC checks, every
        // class returns recent>0. For pooled coverage, 100/100 have parent_alpha.
        count: async (args: { where?: Record<string, unknown> } | undefined) => {
          const where = args?.where ?? {};
          // IC monitor query — returns 1 for any signal_class with rolling_ic_20d filter
          if (where.signal_class && where.rolling_ic_20d) return 1;
          // conformal_low filter
          if (where.conformal_low) return 100;
          // parent_alpha filter
          if (where.parent_alpha) return 100;
          // status=ACTIVE filter
          if (where.status === 'ACTIVE') return 100;
          // total cells
          return 100;
        },
        aggregate: async (_args: unknown) => ({
          _avg: { dsr: 0.7, pbo: 0.3 },
        }),
      },
      sentimentSnapshot: {
        // 100 last-30d snaps, 100 with finsentllm_score → 100%
        count: async (args: { where?: Record<string, unknown> } | undefined) => {
          const where = args?.where ?? {};
          if (where.finsentllm_score) return 100;
          return 100;
        },
      },
      report: {
        // One report with two analyst citations (both have URL) → 100% URL coverage.
        findMany: async () => [
          {
            analysis: {
              citations_v2: [
                { source: 'analyst', url: 'https://example.com/a' },
                { source: 'news', url: 'https://example.com/n' },
              ],
            },
          },
        ],
      },
    },
    fs: {
      readFileSync: (path: string) => {
        if (path.endsWith('model-card-grep-patterns.json')) {
          return JSON.stringify({
            patterns: [
              {
                name: 'PLACEHOLDER',
                pattern: '<<NEVER-MATCHES>>',
                registered_by_plan: '19-Z-04-init',
                registered_at: '2026-05-07',
              },
            ],
          });
        }
        if (path.endsWith('features.ts') || path.endsWith('src/lib/features.ts')) {
          // Empty content → none of the Phase 19 flag identifiers appear.
          return '// Phase 19 flags removed';
        }
        return '';
      },
    },
    exec: (_cmd: string) => {
      // Default: zero matches for every grep.
      return '0';
    },
    featuresPath: 'src/lib/features.ts',
    grepPatternsPath: 'scripts/model-card-grep-patterns.json',
  };
}

function failedCheckNames(checks: Check[]): string[] {
  return checks.filter((c) => !c.ok).map((c) => c.name);
}

describe('runChecks() — composite Phase 19 done gate', () => {
  it('Test 1: returns all OK when every condition holds (would exit 0)', async () => {
    const checks = await runChecks(passingDeps());
    const failed = checks.filter((c) => !c.ok);
    expect(failed).toEqual([]);
  });

  it('Test 2: fails conformal-coverage when < 80% of ACTIVE cells have conformal_low', async () => {
    const deps = passingDeps();
    deps.prisma.learnedPattern.count = async (args) => {
      const where = args?.where ?? {};
      if (where.conformal_low) return 50; // 50 of 100 = 50% < 80%
      if (where.parent_alpha) return 100;
      if (where.signal_class && where.rolling_ic_20d) return 1;
      if (where.status === 'ACTIVE') return 100;
      return 100;
    };
    const checks = await runChecks(deps);
    expect(failedCheckNames(checks)).toContain('conformal-coverage');
  });

  it('Test 3: fails dsr when avg DSR ≤ threshold', async () => {
    const deps = passingDeps();
    deps.prisma.learnedPattern.aggregate = async () => ({
      _avg: { dsr: 0.3, pbo: 0.3 },
    });
    const checks = await runChecks(deps);
    expect(failedCheckNames(checks)).toContain('dsr');
  });

  it('Test 4: fails pbo when avg PBO ≥ threshold', async () => {
    const deps = passingDeps();
    deps.prisma.learnedPattern.aggregate = async () => ({
      _avg: { dsr: 0.7, pbo: 0.7 },
    });
    const checks = await runChecks(deps);
    expect(failedCheckNames(checks)).toContain('pbo');
  });

  it('Test 5: fails ic-<class> when any signal class has zero recent rolling_ic_20d rows', async () => {
    const deps = passingDeps();
    deps.prisma.learnedPattern.count = async (args) => {
      const where = args?.where ?? {};
      if (where.signal_class === 'diffusion' && where.rolling_ic_20d) return 0;
      if (where.signal_class && where.rolling_ic_20d) return 1;
      if (where.conformal_low) return 100;
      if (where.parent_alpha) return 100;
      if (where.status === 'ACTIVE') return 100;
      return 100;
    };
    const checks = await runChecks(deps);
    const failed = failedCheckNames(checks);
    expect(failed.some((n) => n.startsWith('ic-'))).toBe(true);
    expect(failed).toContain('ic-diffusion');
  });

  it('Test 6: fails pooled when < 80% of cells have parent_alpha', async () => {
    const deps = passingDeps();
    deps.prisma.learnedPattern.count = async (args) => {
      const where = args?.where ?? {};
      if (where.conformal_low) return 100;
      if (where.parent_alpha) return 50; // 50/100 = 50% < 80%
      if (where.signal_class && where.rolling_ic_20d) return 1;
      if (where.status === 'ACTIVE') return 100;
      return 100;
    };
    const checks = await runChecks(deps);
    expect(failedCheckNames(checks)).toContain('pooled');
  });

  it('Test 7: fails finsentllm when < 95% of last-30d snapshots have finsentllm_score', async () => {
    const deps = passingDeps();
    deps.prisma.sentimentSnapshot.count = async (args) => {
      const where = args?.where ?? {};
      if (where.finsentllm_score) return 80; // 80/100 = 80% < 95%
      return 100;
    };
    const checks = await runChecks(deps);
    expect(failedCheckNames(checks)).toContain('finsentllm');
  });

  it('Test 8: fails citations when < 90% URL coverage on analyst/news claims', async () => {
    const deps = passingDeps();
    deps.prisma.report.findMany = async () => [
      {
        analysis: {
          citations_v2: [
            { source: 'analyst', url: 'https://example.com/a' },
            { source: 'analyst' /* no URL */ },
            { source: 'news' /* no URL */ },
            { source: 'news' /* no URL */ },
          ],
        },
      },
    ];
    const checks = await runChecks(deps);
    expect(failedCheckNames(checks)).toContain('citations');
  });

  it('Test 9: fails no-old-<name> when a registered grep pattern still matches', async () => {
    const deps = passingDeps();
    deps.fs.readFileSync = (path: string) => {
      if (path.endsWith('model-card-grep-patterns.json')) {
        return JSON.stringify({
          patterns: [
            {
              name: 'old-anthropic-search',
              pattern: 'anthropicSearch\\(',
              registered_by_plan: '19-B-05',
              registered_at: '2026-05-07',
            },
          ],
        });
      }
      if (path.endsWith('features.ts')) return '// none';
      return '';
    };
    deps.exec = (_cmd: string) => '7'; // 7 matches → not zero
    const checks = await runChecks(deps);
    const failed = failedCheckNames(checks);
    expect(failed.some((n) => n.startsWith('no-old-'))).toBe(true);
    expect(failed).toContain('no-old-old-anthropic-search');
  });

  it('Test 10: fails flag-removed-<flag> when a Phase 19 flag is still present in features.ts', async () => {
    const deps = passingDeps();
    deps.fs.readFileSync = (path: string) => {
      if (path.endsWith('model-card-grep-patterns.json')) {
        return JSON.stringify({
          patterns: [
            {
              name: 'PLACEHOLDER',
              pattern: '<<NEVER-MATCHES>>',
              registered_by_plan: '19-Z-04-init',
              registered_at: '2026-05-07',
            },
          ],
        });
      }
      if (path.endsWith('features.ts')) {
        // hierarchical_pooling still present → flag-removed-hierarchical_pooling fails.
        return "const FLAG_NAMES = ['hierarchical_pooling'] as const;";
      }
      return '';
    };
    const checks = await runChecks(deps);
    const failed = failedCheckNames(checks);
    expect(failed).toContain('flag-removed-hierarchical_pooling');
  });

  it('Test 11: produces a punch list — every failed check is enumerated with its name + detail', async () => {
    // Force multiple failures simultaneously.
    const deps = passingDeps();
    deps.prisma.learnedPattern.count = async (args) => {
      const where = args?.where ?? {};
      if (where.conformal_low) return 0; // 0% conformal coverage
      if (where.parent_alpha) return 0; // 0% pooled coverage
      if (where.signal_class && where.rolling_ic_20d) return 0; // 0 IC for every class
      if (where.status === 'ACTIVE') return 100;
      return 100;
    };
    deps.prisma.learnedPattern.aggregate = async () => ({
      _avg: { dsr: 0.0, pbo: 1.0 },
    });
    deps.prisma.sentimentSnapshot.count = async (args) => {
      const where = args?.where ?? {};
      if (where.finsentllm_score) return 0;
      return 100;
    };
    deps.prisma.report.findMany = async () => [
      { analysis: { citations_v2: [{ source: 'analyst' /* no URL */ }] } },
    ];
    deps.fs.readFileSync = (path: string) => {
      if (path.endsWith('model-card-grep-patterns.json')) {
        return JSON.stringify({
          patterns: [
            { name: 'leftover', pattern: 'oldThing', registered_by_plan: '19-X', registered_at: '2026-05-07' },
          ],
        });
      }
      if (path.endsWith('features.ts')) {
        // All 15 flags still present.
        const flagsArr = PHASE_19_FLAGS.map((f) => `'${f}'`).join(',');
        return `const FLAG_NAMES = [${flagsArr}] as const;`;
      }
      return '';
    };
    deps.exec = () => '5';

    const checks = await runChecks(deps);
    const failed = checks.filter((c) => !c.ok);

    // Every category should appear at least once in the failed punch list.
    const names = failed.map((c) => c.name);
    expect(names).toContain('conformal-coverage');
    expect(names).toContain('dsr');
    expect(names).toContain('pbo');
    expect(names).toContain('pooled');
    expect(names).toContain('finsentllm');
    expect(names).toContain('citations');
    // All 4 IC classes should fail.
    for (const cls of SIGNAL_CLASSES) {
      expect(names).toContain(`ic-${cls}`);
    }
    // The single registered pattern should fail.
    expect(names).toContain('no-old-leftover');
    // All 15 flag-removed checks should fail.
    for (const flag of PHASE_19_FLAGS) {
      expect(names).toContain(`flag-removed-${flag}`);
    }
    // Each failed check carries an informative detail string.
    for (const c of failed) {
      expect(typeof c.detail).toBe('string');
      expect(c.detail.length).toBeGreaterThan(0);
    }
  });
});
