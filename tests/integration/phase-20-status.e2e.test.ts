// tests/integration/phase-20-status.e2e.test.ts
//
// Phase 20 / Plan 20-Z-06 — end-to-end test invoking the REAL script
// (no mocks) against the current main tree. This is the mechanical
// verification of CONTEXT.md line 94 acceptance: "can exit non-zero today".
//
// The script SHOULD exit `2` on today's main (most upstream artifacts not
// yet landed), but `1` is also acceptable (any fail). What must NOT happen
// is exit `0` — that would mean every Phase-20 condition is satisfied,
// which is false until every wave-A/B/C/D plan has landed its artifact.
//
// Live invocation (not stubbed) is the explicit point of this test, so
// `execSync` is used directly rather than the injected `exec` shape used
// in the unit tests.

import { execSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';

function runScript(): { exitCode: number; stdout: string; stderr: string } {
  try {
    const stdout = execSync('npm run phase-20-status --silent', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      // 5-minute ceiling — the script issues a few Prisma queries + reads files;
      // should complete in seconds, but we give headroom for cold-start.
      timeout: 5 * 60 * 1000,
      maxBuffer: 64 * 1024 * 1024,
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      exitCode: typeof e.status === 'number' ? e.status : -1,
      stdout: String(e.stdout ?? ''),
      stderr: String(e.stderr ?? ''),
    };
  }
}

describe('phase-20-status (end-to-end on current main)', () => {
  it('exits 1 or 2 (non-zero) — Phase 20 is NOT yet done', () => {
    const { exitCode, stdout } = runScript();
    expect(
      exitCode === 1 || exitCode === 2,
      `expected exit 1 or 2 (got ${exitCode}); stdout tail:\n${stdout.split('\n').slice(-20).join('\n')}`,
    ).toBe(true);
  });

  it('stdout enumerates all 16 DoD condition labels (#2 through #16 verbatim + the rollup label)', () => {
    const { stdout } = runScript();
    // Every sub-check's blocker_for label (DoD #2..#16) appears in stdout.
    for (let n = 2; n <= 16; n++) {
      expect(stdout, `stdout missing DoD #${n} label`).toContain(`DoD #${n}`);
    }
    // DoD #1 is the rollup line, surfaced in the footer.
    expect(stdout).toContain('DoD #1');
  });

  it('stdout contains all 4 branch headings (Sentiment / Calibration / Report / Hygiene)', () => {
    const { stdout } = runScript();
    expect(stdout).toContain('## Sentiment');
    expect(stdout).toContain('## Calibration');
    expect(stdout).toContain('## Report');
    expect(stdout).toContain('## Hygiene');
  });
});
