// tests/scripts/wave-b-rollout-status.cli.test.ts
//
// Phase 19 / Plan 19-B-08 / Task 2 — wave-b-rollout-status CLI smoke test.
//
// Runs `npx tsx scripts/wave-b-rollout-status.ts --json` as a subprocess,
// parses the emitted JSON, and asserts:
//   - JSON is well-formed
//   - top-level shape contains plan_id, status, exit_code, gates,
//     composite_score, composite_metrics, generated_at
//   - exit_code matches the reported status
//   - gates array contains all 11 expected gates (2 verdicts, 4 flags, 4
//     fallback adapters, 1 fallback wiring) — Plan 19-B-08 surface
//   - composite_score.result is one of PASS / FAIL / PENDING
//
// This is the operator's interface — the smoke test catches breaking
// changes to the CLI contract.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts/wave-b-rollout-status.ts');

describe('wave-b-rollout-status CLI (Plan 19-B-08)', () => {
  it('--json emits well-formed JSON with expected shape', () => {
    const result = spawnSync('npx', ['tsx', SCRIPT_PATH, '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      // CLI reads no env vars; default 30s timeout is plenty.
      timeout: 30_000,
    });
    expect(result.status).not.toBeNull();
    expect(result.error).toBeUndefined();

    const parsed = JSON.parse(result.stdout);
    expect(parsed).toMatchObject({
      plan_id: '19-B-08',
      status: expect.stringMatching(/^(GREEN|PENDING|RED)$/),
      exit_code: expect.any(Number),
      gates: expect.any(Array),
      composite_score: {
        result: expect.stringMatching(/^(PASS|FAIL|PENDING)$/),
        reasons: expect.any(Array),
      },
      composite_metrics: expect.any(Object),
      generated_at: expect.any(String),
    });

    // Exit code matches reported status (3-way mapping per script CLI contract).
    const expectedExit = parsed.status === 'GREEN' ? 0 : parsed.status === 'RED' ? 1 : 2;
    expect(parsed.exit_code).toBe(expectedExit);
    expect(result.status).toBe(expectedExit);

    // 11 gates post-Tiingo-removal: 2 verdict + 3 flag-removed (was 4)
    // + 4 fallback adapter + 1 wiring + 1 grep-patterns-registered.
    expect(parsed.gates.length).toBe(11);

    const gateNames = parsed.gates.map((g: { name: string }) => g.name).sort();
    expect(gateNames).toEqual(
      [
        '19-B-06-verdict',
        '19-B-07-verdict',
        'fallback-anthropic-search',
        'fallback-finnhub',
        'fallback-polygon',
        'fallback-wired',
        'fallback-yahoo',
        'flag-removed-data_cache',
        'flag-removed-exa_primary',
        'flag-removed-twelvedata_primary',
        'grep-patterns-registered',
      ].sort(),
    );
  });

  it('current state: 4 D-32 fallback adapters all GREEN', () => {
    const result = spawnSync('npx', ['tsx', SCRIPT_PATH, '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      timeout: 30_000,
    });
    const parsed = JSON.parse(result.stdout) as {
      gates: { name: string; status: string }[];
    };
    const fallbackGates = parsed.gates.filter((g) => g.name.startsWith('fallback-'));
    for (const g of fallbackGates) {
      expect(g.status).toBe('GREEN');
    }
  });

  it('current state: grep-patterns-registered gate is GREEN', () => {
    const result = spawnSync('npx', ['tsx', SCRIPT_PATH, '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      timeout: 30_000,
    });
    const parsed = JSON.parse(result.stdout) as {
      gates: { name: string; status: string }[];
    };
    const gate = parsed.gates.find((g) => g.name === 'grep-patterns-registered');
    expect(gate?.status).toBe('GREEN');
  });
});
