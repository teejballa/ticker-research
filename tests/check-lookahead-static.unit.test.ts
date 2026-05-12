// tests/check-lookahead-static.unit.test.ts
//
// Plan 20-Z-07 — Task 5 Part A.
//
// Unit test for scripts/check-lookahead-static.ts.
//
// Asserts the static check (a) passes on a clean temp tree, (b) fails on a
// temp file containing a non-allowlisted published_at reference, (c) passes
// when the same reference carries a `// LOOKAHEAD-OK: <reason>` comment
// immediately above, (d) fails when the comment is empty.
//
// Strategy: write a deliberately-bad/good .ts file into src/ at a path the
// static check will pick up via `git ls-files 'src/**/*.ts'`. Because
// untracked files are NOT listed by `git ls-files`, we must `git add -N` the
// temp file so the static check sees it. The afterEach hook unstages and
// deletes the file so the repo returns to a clean state for the next test.
//
// The static check's hard-coded exclusions (tests/**, scripts/**, __tests__/,
// *.test.ts, __fixtures__/) mean we have to use a real src/ path that does
// not match those patterns. We use src/__lookahead_static_unit_tmp__/tmp.ts
// and clean it up rigorously.

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { execSync } from 'node:child_process';
import {
  writeFileSync,
  unlinkSync,
  mkdirSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';

const TMP_DIR = join(process.cwd(), 'src', '__lookahead_static_unit_tmp__');
const TMP_FILE = join(TMP_DIR, 'tmp.ts');

function cleanupTmp(): void {
  // Best-effort unstage so `git ls-files` no longer sees the file.
  try {
    execSync(`git rm -f --cached --ignore-unmatch -- "${TMP_FILE}"`, {
      stdio: 'ignore',
    });
  } catch {
    // ignore — file may not be staged
  }
  if (existsSync(TMP_FILE)) {
    try {
      unlinkSync(TMP_FILE);
    } catch {
      // ignore
    }
  }
  if (existsSync(TMP_DIR)) {
    try {
      rmSync(TMP_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

function stageTmp(): void {
  // intent-to-add so the file shows up in `git ls-files` without committing
  execSync(`git add -N -- "${TMP_FILE}"`, { stdio: 'ignore' });
}

function runCheck(): { exitCode: number; stderr: string; stdout: string } {
  try {
    const stdout = execSync('npm run --silent check-lookahead', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stderr: '', stdout };
  } catch (e) {
    const err = e as { status?: number; stderr?: Buffer; stdout?: Buffer };
    return {
      exitCode: err.status ?? 1,
      stderr: err.stderr?.toString() ?? '',
      stdout: err.stdout?.toString() ?? '',
    };
  }
}

describe('check-lookahead-static — unit', () => {
  beforeEach(() => {
    cleanupTmp();
  });

  afterEach(() => {
    cleanupTmp();
  });

  it('exits 0 on clean tree', () => {
    const r = runCheck();
    expect(r.exitCode).toBe(0);
  });

  it('exits non-zero on non-allowlisted published_at reference', () => {
    mkdirSync(TMP_DIR, { recursive: true });
    writeFileSync(
      TMP_FILE,
      `export const bad = 'WHERE published_at > NOW()';\n`,
    );
    stageTmp();
    const r = runCheck();
    expect(r.exitCode).toBe(1);
    expect(r.stderr + r.stdout).toMatch(/published_at/);
  });

  it('exits 0 when allowlist comment with non-empty reason is on preceding line', () => {
    mkdirSync(TMP_DIR, { recursive: true });
    writeFileSync(
      TMP_FILE,
      `// LOOKAHEAD-OK: display-only — surfaced in UI as upstream-claimed time alongside fetched_at\n` +
        `export const ok = 'SELECT published_at AS upstream_claimed_at FROM articles';\n`,
    );
    stageTmp();
    const r = runCheck();
    expect(r.exitCode).toBe(0);
  });

  it('exits non-zero when allowlist comment has empty reason', () => {
    mkdirSync(TMP_DIR, { recursive: true });
    writeFileSync(
      TMP_FILE,
      `// LOOKAHEAD-OK:\n` +
        `export const bad = 'WHERE published_at > NOW()';\n`,
    );
    stageTmp();
    const r = runCheck();
    expect(r.exitCode).toBe(1);
    expect(r.stderr + r.stdout).toMatch(
      /allowlist-comment-empty|no-allowlist-comment|published_at/,
    );
  });
});
