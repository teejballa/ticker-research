/**
 * Unit test for scripts/check-firecrawl-removed.ts.
 *
 * Invokes the CI guard via `npx tsx scripts/check-firecrawl-removed.ts` and
 * asserts exit 0 against the current tree. If a future commit re-introduces
 * a `firecrawl` reference outside the allowlist, this test fails.
 *
 * The allowlist (in scripts/check-firecrawl-removed.ts) covers this test file
 * and the script itself — the literal word may appear here legitimately
 * (CI guard plumbing).
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import * as path from 'path';

describe('check-firecrawl-removed CI guard (D-26, T-30.1-05-01)', () => {
  it('exits 0 on the current tree (no Firecrawl references in scanned dirs)', () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    let stdout = '';
    let stderr = '';
    let exitCode = 0;
    try {
      stdout = execSync('npx tsx scripts/check-firecrawl-removed.ts', {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; status?: number };
      stdout = err.stdout ?? '';
      stderr = err.stderr ?? '';
      exitCode = err.status ?? 1;
    }
    expect(exitCode, `script stderr:\n${stderr}\nstdout:\n${stdout}`).toBe(0);
    expect(stdout).toContain('PASS');
  });
});
