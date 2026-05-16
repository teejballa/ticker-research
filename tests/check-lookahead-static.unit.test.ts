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

  // ─── Plan 30.1-04 — Reddit + HN PIT writers ──────────────────────────────
  // Behavior 7 of Plan 30.1-04 Task 1: the static lookahead check must
  // continue passing when the Reddit and HackerNews SentimentObservation
  // writers reference `published_at` — both call sites are explicit
  // LOOKAHEAD-OK overrides per CLAUDE.md §Statistical-Methods Reference
  // rule #6 (post.created_utc / story.created_at_i IS the as-of-time).
  // These tests assert that fixtures shaped like the Reddit/HN writer
  // bodies are correctly allowlisted.

  it('exits 0 when a Reddit writer fixture references published_at with LOOKAHEAD-OK', () => {
    mkdirSync(TMP_DIR, { recursive: true });
    writeFileSync(
      TMP_FILE,
      `// Synthetic Reddit writer fixture\n` +
        `const post = { source: 'reddit' as const, created_utc: 1715200000 };\n` +
        `// LOOKAHEAD-OK: post.created_utc IS the as-of-time (Reddit-claimed creation)\n` +
        `const fa = new Date(post.created_utc * 1000);\n` +
        `// LOOKAHEAD-OK: published_at mirrors fetched_at for Reddit\n` +
        `export const x = { fetched_at: fa, published_at: new Date(post.created_utc * 1000) };\n`,
    );
    stageTmp();
    const r = runCheck();
    expect(r.exitCode).toBe(0);
  });

  it('exits 0 when a HackerNews writer fixture references published_at with LOOKAHEAD-OK', () => {
    mkdirSync(TMP_DIR, { recursive: true });
    writeFileSync(
      TMP_FILE,
      `// Synthetic HackerNews writer fixture\n` +
        `const story = { source: 'hackernews' as const, created_at_i: 1715200000 };\n` +
        `// LOOKAHEAD-OK: HN Algolia created_at_i is Unix epoch seconds (verified)\n` +
        `const fa = new Date(story.created_at_i * 1000);\n` +
        `// LOOKAHEAD-OK: published_at mirrors fetched_at for HN — schema column is informational-only\n` +
        `export const x = { fetched_at: fa, published_at: new Date(story.created_at_i * 1000) };\n`,
    );
    stageTmp();
    const r = runCheck();
    expect(r.exitCode).toBe(0);
  });

  it('exits non-zero when a Reddit-shaped writer reference omits LOOKAHEAD-OK above published_at', () => {
    mkdirSync(TMP_DIR, { recursive: true });
    // Same Reddit shape but no LOOKAHEAD-OK comment on the line above
    // `published_at:` — this is the regression case Plan 30.1-04 guards
    // against (a future writer that forgets to mark the override).
    writeFileSync(
      TMP_FILE,
      `const post = { source: 'reddit' as const, created_utc: 1715200000 };\n` +
        `export const x = { published_at: new Date(post.created_utc * 1000) };\n`,
    );
    stageTmp();
    const r = runCheck();
    expect(r.exitCode).toBe(1);
    expect(r.stderr + r.stdout).toMatch(/published_at/);
  });
});
