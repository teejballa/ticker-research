// tests/phase-20-status.unit.test.ts
//
// Phase 20 / Plan 20-Z-06 — unit tests for the composite done gate.
//
// Coverage:
//   - rollup exit-code policy (3 tests)
//   - ALL_CHECKS registry invariants (4 tests)
//   - renderMarkdownSummary stdout invariants (3 tests)
//   - per-check {pass | fail | pending} paths for all 15 checks (45 tests)
//   - per-check edge cases (T-20-Z-06-01 / -03 / -05): empty card, cron flap,
//     hand-curated literal (3 tests)
//
// All tests use injected mocks for Prisma + fs + exec — no real DB, no real
// filesystem read of the production tree, no real shell.

import { describe, it, expect } from 'vitest';

import {
  runAllChecks,
  rollupExitCode,
  renderMarkdownSummary,
} from '../scripts/phase-20-status';
import { ALL_CHECKS } from '../scripts/lib/phase-20-checks/index';
import { checkGmeCrowdedConsensus } from '../scripts/lib/phase-20-checks/check-gme-crowded-consensus';
import { checkPerDocumentNlpCoverage } from '../scripts/lib/phase-20-checks/check-per-document-nlp-coverage';
import { checkSourceTierDataDriven } from '../scripts/lib/phase-20-checks/check-source-tier-data-driven';
import { checkTimeDecayIcirUplift } from '../scripts/lib/phase-20-checks/check-time-decay-icir-uplift';
import { checkPerSourceIcir30d } from '../scripts/lib/phase-20-checks/check-per-source-icir-30d';
import { checkBrier } from '../scripts/lib/phase-20-checks/check-brier';
import { checkEce } from '../scripts/lib/phase-20-checks/check-ece';
import { checkBotFilterFpAndCoordinationF1 } from '../scripts/lib/phase-20-checks/check-bot-filter-fp-and-coordination-f1';
import { checkNumericGrounding } from '../scripts/lib/phase-20-checks/check-numeric-grounding';
import { checkCitationCoverage } from '../scripts/lib/phase-20-checks/check-citation-coverage';
import { checkModelCardsFresh } from '../scripts/lib/phase-20-checks/check-model-cards-fresh';
import { checkLookaheadBias } from '../scripts/lib/phase-20-checks/check-lookahead-bias';
import { checkTelemetry7d } from '../scripts/lib/phase-20-checks/check-telemetry-7d';
import { checkFairnessAudit } from '../scripts/lib/phase-20-checks/check-fairness-audit';
import { checkFlagsGraduated } from '../scripts/lib/phase-20-checks/check-flags-graduated';
import type { CheckDeps, CheckResult } from '../scripts/lib/phase-20-checks/types';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** All-pending dependency surface — every check returns 'pending'. */
function emptyDeps(overrides: Partial<CheckDeps> = {}): CheckDeps {
  return {
    prisma: {},
    fs: {
      readFileSync: () => {
        throw new Error('not implemented');
      },
      existsSync: () => false,
    },
    exec: () => ({ exitCode: 0, stdout: '', stderr: '' }),
    featuresPath: '/tmp/features.ts',
    modelCardsGlob: '/tmp/docs/cards/MODEL-CARD-*.md',
    metricsDir: '/tmp/metrics',
    repoRoot: '/tmp/repo',
    ...overrides,
  };
}

function fakeResult(status: 'pass' | 'fail' | 'pending', blocker_for: number): CheckResult {
  return {
    name: `check-${blocker_for}`,
    dod_label: `DoD #${blocker_for}`,
    blocker_for,
    branch: 'hygiene',
    status,
    evidence: 'fake',
  };
}

// -----------------------------------------------------------------------------
// Rollup exit-code policy
// -----------------------------------------------------------------------------

describe('phase-20-status rollup exit code', () => {
  it('exits 0 when every check passes', () => {
    const results: CheckResult[] = [];
    for (let i = 2; i <= 16; i++) results.push(fakeResult('pass', i));
    expect(rollupExitCode(results)).toBe(0);
  });

  it('exits 1 when any check fails (even with passes)', () => {
    const results: CheckResult[] = [];
    for (let i = 2; i <= 15; i++) results.push(fakeResult('pass', i));
    results.push(fakeResult('fail', 16));
    expect(rollupExitCode(results)).toBe(1);
  });

  it('exits 2 when ≥1 pending and 0 fail', () => {
    const results: CheckResult[] = [];
    results.push(fakeResult('pending', 2));
    for (let i = 3; i <= 16; i++) results.push(fakeResult('pass', i));
    expect(rollupExitCode(results)).toBe(2);
  });
});

// -----------------------------------------------------------------------------
// ALL_CHECKS registry invariants
// -----------------------------------------------------------------------------

describe('phase-20-status check rollup ALL_CHECKS registry', () => {
  it('has exactly 15 entries (DoD #2 through #16 inclusive)', () => {
    expect(ALL_CHECKS).toHaveLength(15);
  });

  it('has unique check names', async () => {
    const deps = emptyDeps();
    const results = await Promise.all(ALL_CHECKS.map((c) => c(deps)));
    const names = results.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('covers blocker_for values [2..16] exactly', async () => {
    const deps = emptyDeps();
    const results = await Promise.all(ALL_CHECKS.map((c) => c(deps)));
    const sortedBlockers = results.map((r) => r.blocker_for).sort((a, b) => a - b);
    expect(sortedBlockers).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  });

  it('returns pending for every check when no artifacts are present', async () => {
    const deps = emptyDeps();
    const results = await Promise.all(ALL_CHECKS.map((c) => c(deps)));
    for (const r of results) {
      expect(r.status).toBe('pending');
      expect(r.dod_label.length).toBeGreaterThan(0);
    }
  });
});

// -----------------------------------------------------------------------------
// renderMarkdownSummary invariants
// -----------------------------------------------------------------------------

describe('phase-20-status renderMarkdownSummary', () => {
  it('contains all 4 branch headings (Sentiment / Calibration / Report / Hygiene)', async () => {
    const deps = emptyDeps();
    const results = await runAllChecks(deps);
    const md = renderMarkdownSummary(results);
    expect(md).toContain('## Sentiment');
    expect(md).toContain('## Calibration');
    expect(md).toContain('## Report');
    expect(md).toContain('## Hygiene');
  });

  it('contains every dod_label verbatim', async () => {
    const deps = emptyDeps();
    const results = await runAllChecks(deps);
    const md = renderMarkdownSummary(results);
    for (const r of results) {
      expect(md).toContain(r.dod_label);
    }
  });

  it('contains a Rollup line matching the canonical format', async () => {
    const deps = emptyDeps();
    const results = await runAllChecks(deps);
    const md = renderMarkdownSummary(results);
    expect(md).toMatch(/^Rollup: \d+\/15; exit code [012]$/m);
  });
});

// -----------------------------------------------------------------------------
// Per-check unit tests — three paths each (pass / fail / pending)
// -----------------------------------------------------------------------------

describe('check-gme-crowded-consensus (DoD #2)', () => {
  it('pending when fixture missing', async () => {
    const r = await checkGmeCrowdedConsensus(emptyDeps());
    expect(r.status).toBe('pending');
    expect(r.blocker_for).toBe(2);
    expect(r.branch).toBe('sentiment');
  });

  it('pass when fixture has crowded_consensus=true', async () => {
    const deps = emptyDeps({
      fs: {
        readFileSync: () => JSON.stringify({ crowded_consensus: true }),
        existsSync: () => true,
      },
    });
    const r = await checkGmeCrowdedConsensus(deps);
    expect(r.status).toBe('pass');
  });

  it('fail when fixture has crowded_consensus=false', async () => {
    const deps = emptyDeps({
      fs: {
        readFileSync: () => JSON.stringify({ crowded_consensus: false }),
        existsSync: () => true,
      },
    });
    const r = await checkGmeCrowdedConsensus(deps);
    expect(r.status).toBe('fail');
  });
});

describe('check-per-document-nlp-coverage (DoD #3)', () => {
  it('pending when SentimentObservation model unavailable', async () => {
    const r = await checkPerDocumentNlpCoverage(emptyDeps());
    expect(r.status).toBe('pending');
    expect(r.blocker_for).toBe(3);
  });

  it('pass when ≥80% of rows have per_document_polarity', async () => {
    const deps = emptyDeps({
      prisma: {
        sentimentObservation: {
          count: async ({ where }: { where?: Record<string, unknown> } = {}) => {
            // First call: total. Second call: with-polarity.
            return where?.per_document_polarity ? 85 : 100;
          },
        },
      },
    });
    const r = await checkPerDocumentNlpCoverage(deps);
    expect(r.status).toBe('pass');
  });

  it('fail when <80% of rows have per_document_polarity', async () => {
    const deps = emptyDeps({
      prisma: {
        sentimentObservation: {
          count: async ({ where }: { where?: Record<string, unknown> } = {}) => {
            return where?.per_document_polarity ? 50 : 100;
          },
        },
      },
    });
    const r = await checkPerDocumentNlpCoverage(deps);
    expect(r.status).toBe('fail');
  });
});

describe('check-source-tier-data-driven (DoD #4)', () => {
  it('pending when SourceTier model unavailable', async () => {
    const r = await checkSourceTierDataDriven(emptyDeps());
    expect(r.status).toBe('pending');
    expect(r.blocker_for).toBe(4);
  });

  it('pass when rows are fresh and no hand-curated literals', async () => {
    const now = new Date();
    const deps = emptyDeps({
      prisma: {
        sourceTier: {
          findMany: async () => [
            { source: 'stocktwits', weight: 1.2, computed_from_ic_at: now },
            { source: 'news', weight: 0.8, computed_from_ic_at: now },
          ],
        },
      },
      exec: () => ({ exitCode: 0, stdout: '', stderr: '' }),
    });
    const r = await checkSourceTierDataDriven(deps);
    expect(r.status).toBe('pass');
  });

  it('fail when SourceTier rows are stale (>35d)', async () => {
    const stale = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const deps = emptyDeps({
      prisma: {
        sourceTier: {
          findMany: async () => [
            { source: 'stocktwits', weight: 1.2, computed_from_ic_at: stale },
          ],
        },
      },
      exec: () => ({ exitCode: 0, stdout: '', stderr: '' }),
    });
    const r = await checkSourceTierDataDriven(deps);
    expect(r.status).toBe('fail');
  });
});

describe('check-time-decay-icir-uplift (DoD #5)', () => {
  it('pending when metric file missing', async () => {
    const r = await checkTimeDecayIcirUplift(emptyDeps());
    expect(r.status).toBe('pending');
    expect(r.blocker_for).toBe(5);
  });

  it('pass when uplift ≥ 0.05', async () => {
    const deps = emptyDeps({
      fs: {
        readFileSync: () => JSON.stringify({ uplift: 0.07, baseline_icir: 0.1, decayed_icir: 0.17 }),
        existsSync: () => true,
      },
    });
    const r = await checkTimeDecayIcirUplift(deps);
    expect(r.status).toBe('pass');
  });

  it('fail when uplift < 0.05', async () => {
    const deps = emptyDeps({
      fs: {
        readFileSync: () => JSON.stringify({ uplift: 0.02 }),
        existsSync: () => true,
      },
    });
    const r = await checkTimeDecayIcirUplift(deps);
    expect(r.status).toBe('fail');
  });
});

describe('check-per-source-icir-30d (DoD #6)', () => {
  it('pending when SourceIcir model unavailable', async () => {
    const r = await checkPerSourceIcir30d(emptyDeps());
    expect(r.status).toBe('pending');
    expect(r.blocker_for).toBe(6);
  });

  it('pass when top source has ≥30 distinct days', async () => {
    const deps = emptyDeps({
      prisma: {
        sourceIcir: {
          groupBy: async () => [
            { source: 'stocktwits', _count: { _all: 35 } },
            { source: 'news', _count: { _all: 12 } },
          ],
        },
      },
    });
    const r = await checkPerSourceIcir30d(deps);
    expect(r.status).toBe('pass');
  });

  it('fail when top source has <30 days', async () => {
    const deps = emptyDeps({
      prisma: {
        sourceIcir: {
          groupBy: async () => [{ source: 'stocktwits', _count: { _all: 5 } }],
        },
      },
    });
    const r = await checkPerSourceIcir30d(deps);
    expect(r.status).toBe('fail');
  });
});

describe('check-brier (DoD #7)', () => {
  it('pending when metric file missing', async () => {
    const r = await checkBrier(emptyDeps());
    expect(r.status).toBe('pending');
    expect(r.blocker_for).toBe(7);
  });

  it('pass when brier ≤ 0.24', async () => {
    const deps = emptyDeps({
      fs: {
        readFileSync: () => JSON.stringify({ brier: 0.18 }),
        existsSync: () => true,
      },
    });
    const r = await checkBrier(deps);
    expect(r.status).toBe('pass');
  });

  it('fail when brier > 0.24', async () => {
    const deps = emptyDeps({
      fs: {
        readFileSync: () => JSON.stringify({ brier: 0.28 }),
        existsSync: () => true,
      },
    });
    const r = await checkBrier(deps);
    expect(r.status).toBe('fail');
  });
});

describe('check-ece (DoD #8)', () => {
  it('pending when metric file missing', async () => {
    const r = await checkEce(emptyDeps());
    expect(r.status).toBe('pending');
    expect(r.blocker_for).toBe(8);
  });

  it('pass when every classifier has ECE ≤ 0.05', async () => {
    const deps = emptyDeps({
      fs: {
        readFileSync: () => JSON.stringify({ gemini: 0.03, finbert: 0.04 }),
        existsSync: () => true,
      },
    });
    const r = await checkEce(deps);
    expect(r.status).toBe('pass');
  });

  it('fail when any classifier has ECE > 0.05', async () => {
    const deps = emptyDeps({
      fs: {
        readFileSync: () => JSON.stringify({ gemini: 0.03, finbert: 0.08 }),
        existsSync: () => true,
      },
    });
    const r = await checkEce(deps);
    expect(r.status).toBe('fail');
  });
});

describe('check-bot-filter-fp-and-coordination-f1 (DoD #9)', () => {
  it('pending when either metric file missing', async () => {
    const r = await checkBotFilterFpAndCoordinationF1(emptyDeps());
    expect(r.status).toBe('pending');
    expect(r.blocker_for).toBe(9);
  });

  it('pass when fp ≤ 0.05 AND f1 ≥ 0.6', async () => {
    const files: Record<string, string> = {
      'metrics/bot-filter-fp-rate.json': JSON.stringify({ fp_rate: 0.03 }),
      'metrics/coordination-f1.json': JSON.stringify({ f1: 0.72 }),
    };
    const deps = emptyDeps({
      metricsDir: 'metrics',
      fs: {
        readFileSync: (p: string) => files[p] ?? '{}',
        existsSync: (p: string) => Boolean(files[p]),
      },
    });
    const r = await checkBotFilterFpAndCoordinationF1(deps);
    expect(r.status).toBe('pass');
  });

  it('fail when f1 < 0.6', async () => {
    const files: Record<string, string> = {
      'metrics/bot-filter-fp-rate.json': JSON.stringify({ fp_rate: 0.03 }),
      'metrics/coordination-f1.json': JSON.stringify({ f1: 0.45 }),
    };
    const deps = emptyDeps({
      metricsDir: 'metrics',
      fs: {
        readFileSync: (p: string) => files[p] ?? '{}',
        existsSync: (p: string) => Boolean(files[p]),
      },
    });
    const r = await checkBotFilterFpAndCoordinationF1(deps);
    expect(r.status).toBe('fail');
  });
});

describe('check-numeric-grounding (DoD #10)', () => {
  it('pending when vitest spec missing', async () => {
    const r = await checkNumericGrounding(emptyDeps());
    expect(r.status).toBe('pending');
    expect(r.blocker_for).toBe(10);
  });

  it('pass when vitest exits 0', async () => {
    const deps = emptyDeps({
      fs: {
        readFileSync: () => '',
        existsSync: () => true,
      },
      exec: () => ({ exitCode: 0, stdout: '', stderr: '' }),
    });
    const r = await checkNumericGrounding(deps);
    expect(r.status).toBe('pass');
  });

  it('fail when vitest exits non-zero', async () => {
    const deps = emptyDeps({
      fs: {
        readFileSync: () => '',
        existsSync: () => true,
      },
      exec: () => ({ exitCode: 1, stdout: '', stderr: '' }),
    });
    const r = await checkNumericGrounding(deps);
    expect(r.status).toBe('fail');
  });
});

describe('check-citation-coverage (DoD #11)', () => {
  it('pending when metric file missing', async () => {
    const r = await checkCitationCoverage(emptyDeps());
    expect(r.status).toBe('pending');
    expect(r.blocker_for).toBe(11);
  });

  it('pass when every ticker has coverage ≥ 0.80', async () => {
    const deps = emptyDeps({
      fs: {
        readFileSync: () => JSON.stringify({ AAPL: 0.92, GME: 0.81, SPY: 0.88 }),
        existsSync: () => true,
      },
    });
    const r = await checkCitationCoverage(deps);
    expect(r.status).toBe('pass');
  });

  it('fail when any ticker has coverage < 0.80', async () => {
    const deps = emptyDeps({
      fs: {
        readFileSync: () => JSON.stringify({ AAPL: 0.92, GME: 0.65 }),
        existsSync: () => true,
      },
    });
    const r = await checkCitationCoverage(deps);
    expect(r.status).toBe('fail');
  });
});

describe('check-model-cards-fresh (DoD #12)', () => {
  it('pending when check-model-cards script missing', async () => {
    const r = await checkModelCardsFresh(emptyDeps());
    expect(r.status).toBe('pending');
    expect(r.blocker_for).toBe(12);
  });

  it('pass when every card has last_validated within 90d AND script exits 0', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const cardBody = `---\nmodel_name: x\nlast_validated: ${today}\n---\nbody\n`;
    const files: Record<string, string> = {};
    const filesExist: Record<string, boolean> = {
      '/tmp/repo/scripts/check-model-cards.ts': true,
      '/tmp/repo/docs/cards/MODEL-CARD-x.md': true,
    };
    files['/tmp/repo/docs/cards/MODEL-CARD-x.md'] = cardBody;
    const deps = emptyDeps({
      fs: {
        readFileSync: (p: string) => files[p] ?? '',
        existsSync: (p: string) => Boolean(filesExist[p]),
      },
      exec: (cmd: string) => {
        if (cmd.includes('check-model-cards')) {
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        if (cmd.includes('ls docs/cards')) {
          return { exitCode: 0, stdout: 'docs/cards/MODEL-CARD-x.md\n', stderr: '' };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });
    const r = await checkModelCardsFresh(deps);
    expect(r.status).toBe('pass');
  });

  it('fail when check-model-cards script exits non-zero', async () => {
    const deps = emptyDeps({
      fs: {
        readFileSync: () => '',
        existsSync: (p: string) => p.endsWith('scripts/check-model-cards.ts'),
      },
      exec: (cmd: string) => {
        if (cmd.includes('check-model-cards')) {
          return { exitCode: 1, stdout: '', stderr: '' };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });
    const r = await checkModelCardsFresh(deps);
    expect(r.status).toBe('fail');
  });
});

describe('check-lookahead-bias (DoD #13)', () => {
  it('pending when vitest spec missing', async () => {
    const r = await checkLookaheadBias(emptyDeps());
    expect(r.status).toBe('pending');
    expect(r.blocker_for).toBe(13);
  });

  it('pass when vitest exits 0', async () => {
    const deps = emptyDeps({
      fs: {
        readFileSync: () => '',
        existsSync: () => true,
      },
      exec: () => ({ exitCode: 0, stdout: '', stderr: '' }),
    });
    const r = await checkLookaheadBias(deps);
    expect(r.status).toBe('pass');
  });

  it('fail when vitest exits non-zero', async () => {
    const deps = emptyDeps({
      fs: {
        readFileSync: () => '',
        existsSync: () => true,
      },
      exec: () => ({ exitCode: 1, stdout: '', stderr: '' }),
    });
    const r = await checkLookaheadBias(deps);
    expect(r.status).toBe('fail');
  });
});

describe('check-telemetry-7d (DoD #14)', () => {
  it('pending when ProviderCallLog model unavailable', async () => {
    const r = await checkTelemetry7d(emptyDeps());
    expect(r.status).toBe('pending');
    expect(r.blocker_for).toBe(14);
  });

  it('pass when ≥7 distinct days of telemetry exist', async () => {
    const rows: Array<{ started_at: Date }> = [];
    for (let i = 0; i < 8; i++) {
      // Each row on a different calendar day, walking back from "today".
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      rows.push({ started_at: d });
    }
    const deps = emptyDeps({
      prisma: {
        providerCallLog: {
          findMany: async () => rows,
        },
      },
    });
    const r = await checkTelemetry7d(deps);
    expect(r.status).toBe('pass');
  });

  it('fail (cron-flap mitigation T-20-Z-06-03) when 14 rows on a single day', async () => {
    // All 14 rows share the same calendar day. Must NOT be 'pass'.
    const today = new Date();
    const rows: Array<{ started_at: Date }> = [];
    for (let i = 0; i < 14; i++) {
      rows.push({ started_at: today });
    }
    const deps = emptyDeps({
      prisma: {
        providerCallLog: {
          findMany: async () => rows,
        },
      },
    });
    const r = await checkTelemetry7d(deps);
    expect(r.status).toBe('fail');
  });
});

describe('check-fairness-audit (DoD #15)', () => {
  it('pending when audit file missing', async () => {
    const r = await checkFairnessAudit(emptyDeps());
    expect(r.status).toBe('pending');
    expect(r.blocker_for).toBe(15);
  });

  it('pass when audit has segments + body mentions Brier+ECE + ≥1 model card cites known_limitations', async () => {
    const auditBody = `---
title: phase-20 fairness audit
segments: [mega, large, mid, small, micro]
---
# Audit

mega: brier=0.20 ece=0.03
large: brier=0.22 ece=0.04
`;
    const cardBody = `---\nmodel_name: x\n---\n# Card\n## Known Limitations\nfoo\n`;
    const filesExist: Record<string, boolean> = {
      '/tmp/repo/docs/audits/phase-20-fairness.md': true,
      '/tmp/repo/docs/cards/MODEL-CARD-x.md': true,
    };
    const files: Record<string, string> = {
      '/tmp/repo/docs/audits/phase-20-fairness.md': auditBody,
      '/tmp/repo/docs/cards/MODEL-CARD-x.md': cardBody,
    };
    const deps = emptyDeps({
      fs: {
        readFileSync: (p: string) => files[p] ?? '',
        existsSync: (p: string) => Boolean(filesExist[p]),
      },
      exec: () => ({ exitCode: 0, stdout: 'docs/cards/MODEL-CARD-x.md\n', stderr: '' }),
    });
    const r = await checkFairnessAudit(deps);
    expect(r.status).toBe('pass');
  });

  it('fail when no model card references known_limitations', async () => {
    const auditBody = `---
segments: [mega, large]
---
mega: brier=0.20 ece=0.03
`;
    const cardBody = `---\nmodel_name: x\n---\nno mention here\n`;
    const filesExist: Record<string, boolean> = {
      '/tmp/repo/docs/audits/phase-20-fairness.md': true,
      '/tmp/repo/docs/cards/MODEL-CARD-x.md': true,
    };
    const files: Record<string, string> = {
      '/tmp/repo/docs/audits/phase-20-fairness.md': auditBody,
      '/tmp/repo/docs/cards/MODEL-CARD-x.md': cardBody,
    };
    const deps = emptyDeps({
      fs: {
        readFileSync: (p: string) => files[p] ?? '',
        existsSync: (p: string) => Boolean(filesExist[p]),
      },
      exec: () => ({ exitCode: 0, stdout: 'docs/cards/MODEL-CARD-x.md\n', stderr: '' }),
    });
    const r = await checkFairnessAudit(deps);
    expect(r.status).toBe('fail');
  });
});

describe('check-flags-graduated (DoD #16)', () => {
  it('pending when features.ts missing', async () => {
    const r = await checkFlagsGraduated(emptyDeps());
    expect(r.status).toBe('pending');
    expect(r.blocker_for).toBe(16);
  });

  it('pass when all Phase-20 flags are absent from features.ts (graduated)', async () => {
    // features.ts has none of the Phase-20 flags mentioned.
    const featuresBody = `export const FLAGS = ['unrelated'];\n`;
    const deps = emptyDeps({
      fs: {
        readFileSync: () => featuresBody,
        existsSync: () => true,
      },
    });
    const r = await checkFlagsGraduated(deps);
    expect(r.status).toBe('pass');
  });

  it('fail when a Phase-20 flag is present without a // DEFERRED: comment', async () => {
    const featuresBody = `export const FLAGS = ['per_document_nlp'];\n`;
    const deps = emptyDeps({
      fs: {
        readFileSync: () => featuresBody,
        existsSync: () => true,
      },
    });
    const r = await checkFlagsGraduated(deps);
    expect(r.status).toBe('fail');
  });
});

// -----------------------------------------------------------------------------
// Threat-model edge cases (T-20-Z-06-01 / -03 / -05)
// -----------------------------------------------------------------------------

describe('phase-20-status threat-model edge cases', () => {
  it('T-20-Z-06-01: model card with empty last_validated returns fail, not pass', async () => {
    const cardBody = `---\nmodel_name: x\nlast_validated:\n---\nbody\n`;
    const filesExist: Record<string, boolean> = {
      '/tmp/repo/scripts/check-model-cards.ts': true,
      '/tmp/repo/docs/cards/MODEL-CARD-x.md': true,
    };
    const deps = emptyDeps({
      fs: {
        readFileSync: () => cardBody,
        existsSync: (p: string) => Boolean(filesExist[p]),
      },
      exec: (cmd: string) => {
        if (cmd.includes('check-model-cards')) {
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        if (cmd.includes('ls docs/cards')) {
          return { exitCode: 0, stdout: 'docs/cards/MODEL-CARD-x.md\n', stderr: '' };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });
    const r = await checkModelCardsFresh(deps);
    expect(r.status).toBe('fail');
  });

  it('T-20-Z-06-03: cron flap — 14 rows on a single day must NOT pass', async () => {
    const today = new Date();
    const rows: Array<{ started_at: Date }> = [];
    for (let i = 0; i < 14; i++) rows.push({ started_at: today });
    const deps = emptyDeps({
      prisma: {
        providerCallLog: {
          findMany: async () => rows,
        },
      },
    });
    const r = await checkTelemetry7d(deps);
    expect(r.status).not.toBe('pass');
  });

  it('T-20-Z-06-05 / DoD #4: hand-curated literal in src/ triggers fail', async () => {
    const now = new Date();
    const deps = emptyDeps({
      prisma: {
        sourceTier: {
          findMany: async () => [{ source: 'stocktwits', weight: 1.0, computed_from_ic_at: now }],
        },
      },
      exec: () => ({
        exitCode: 0,
        stdout: 'src/lib/sentiment/source-tiers.ts:12:source_tier_weight = 1.5\n',
        stderr: '',
      }),
    });
    const r = await checkSourceTierDataDriven(deps);
    expect(r.status).toBe('fail');
  });
});
