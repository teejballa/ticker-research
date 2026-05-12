#!/usr/bin/env tsx
// scripts/check-prompt-versions.ts
//
// Plan 20-Z-04 — CI gate that fails on prompt-body drift without a version bump.
//
// Behavior (T-20-Z-04-01 mitigation):
//   1. Resolve the diff base. Prefer `origin/main`; fall back to `main`.
//   2. List every changed file under src/lib/prompts/_v*/*.md between base and HEAD.
//   3. For each `_vN/<id>.md` with a non-whitespace content diff:
//        - If the same diff also adds `_v(N+1)/<id>.md` → pass (version bump).
//        - If not → exit 1 with a clear error.
//   4. Whitespace-only diffs emit a WARNING (informational; T-20-Z-04-02 accepted threat).
//   5. New-version-skip detection: a new `_vN/<id>.md` with N > 1 must have
//      `_v(N-1)/<id>.md` already present somewhere on disk — catches accidental
//      `_v3/foo.md` when only `_v1/foo.md` exists.
//   6. Clean tree (no changes) → exit 0.
//
// CLI exit codes:
//   0 — green (no violations, or only whitespace warnings)
//   1 — violations found
//   2 — script failure (git unavailable, etc.)

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface Finding {
  kind: 'body-change-without-bump' | 'version-skip' | 'whitespace-warning';
  path: string;
  detail: string;
}

const PROMPTS_DIR = path.join(process.cwd(), 'src', 'lib', 'prompts');

function git(args: string): string {
  return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function gitOrEmpty(args: string): string {
  try { return git(args); } catch { return ''; }
}

function resolveBase(): string {
  // Prefer origin/main; fall back to main; if neither exists (fresh clone) use the first commit.
  const tries = ['origin/main', 'main'];
  for (const ref of tries) {
    const mb = gitOrEmpty(`merge-base HEAD ${ref}`);
    if (mb) return mb;
  }
  // Fall back to the root commit so a fresh local repo still produces a diff.
  const root = gitOrEmpty('rev-list --max-parents=0 HEAD');
  return root.split('\n')[0] || 'HEAD';
}

function changedPromptFiles(base: string): string[] {
  const out = gitOrEmpty(`diff --name-only ${base}..HEAD -- src/lib/prompts/`);
  if (!out) return [];
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter((p) => /^src\/lib\/prompts\/_v\d+\/[\w.\-]+\.md$/.test(p));
}

function parseVersionPath(p: string): { version: number; id: string } | null {
  const m = p.match(/^src\/lib\/prompts\/_v(\d+)\/(.+)\.md$/);
  if (!m) return null;
  return { version: parseInt(m[1], 10), id: m[2] };
}

function isWhitespaceOnlyDiff(base: string, p: string): boolean {
  // git diff with -w (whitespace-only diffs collapse to empty) — if the diff
  // with -w is empty AND the diff without -w is non-empty, the change is
  // whitespace-only.
  const withW = gitOrEmpty(`diff -w ${base}..HEAD -- ${p}`);
  const without = gitOrEmpty(`diff ${base}..HEAD -- ${p}`);
  return withW === '' && without !== '';
}

function diffIsNonEmpty(base: string, p: string): boolean {
  return gitOrEmpty(`diff ${base}..HEAD -- ${p}`).length > 0;
}

function diffShowsBodyChange(base: string, p: string): boolean {
  // Non-whitespace, non-empty diff that touches the body (we treat ANY
  // non-whitespace diff to a `_vN/*.md` file as a body change — frontmatter
  // edits (e.g. updating `deprecated_at`) ALSO require a version bump per S5,
  // since deprecation flips the latest-non-deprecated default and downstream
  // pins must be reviewed).
  if (!diffIsNonEmpty(base, p)) return false;
  if (isWhitespaceOnlyDiff(base, p)) return false;
  return true;
}

function siblingNextVersionAddedInDiff(p: string, changed: Set<string>): boolean {
  const parsed = parseVersionPath(p);
  if (!parsed) return false;
  const nextPath = `src/lib/prompts/_v${parsed.version + 1}/${parsed.id}.md`;
  return changed.has(nextPath);
}

function priorVersionExistsOnDisk(p: string): boolean {
  const parsed = parseVersionPath(p);
  if (!parsed) return false;
  if (parsed.version <= 1) return true; // no prior required for v1
  const priorPath = path.join(
    process.cwd(),
    'src', 'lib', 'prompts', `_v${parsed.version - 1}`, `${parsed.id}.md`,
  );
  return fs.existsSync(priorPath);
}

function isNewFile(base: string, p: string): boolean {
  // `git diff --diff-filter=A` lists added files only.
  const added = gitOrEmpty(`diff --name-only --diff-filter=A ${base}..HEAD -- src/lib/prompts/`);
  return added.split('\n').map((s) => s.trim()).includes(p);
}

function main(): number {
  if (!fs.existsSync(PROMPTS_DIR)) {
    // No prompts directory → nothing to check.
    return 0;
  }

  let base: string;
  try {
    base = resolveBase();
  } catch (err) {
    console.error(`[check-prompts] cannot resolve diff base: ${(err as Error).message}`);
    return 2;
  }

  const changedList = changedPromptFiles(base);
  if (changedList.length === 0) {
    console.log('[check-prompts] no changes to src/lib/prompts/_v*/ between base and HEAD — green.');
    return 0;
  }

  const changedSet = new Set(changedList);
  const findings: Finding[] = [];

  for (const p of changedList) {
    const parsed = parseVersionPath(p);
    if (!parsed) continue;

    // Skip files that were deleted in this diff.
    const fullPath = path.join(process.cwd(), p);
    if (!fs.existsSync(fullPath)) continue;

    const newFile = isNewFile(base, p);

    // Case A: a new _vN/<id>.md with N > 1 must have prior _v(N-1)/<id>.md
    // on disk (catches version-skips).
    if (newFile && parsed.version > 1 && !priorVersionExistsOnDisk(p)) {
      findings.push({
        kind: 'version-skip',
        path: p,
        detail: `New file _v${parsed.version}/${parsed.id}.md added but _v${parsed.version - 1}/${parsed.id}.md does not exist on disk. Backfill the missing prior version before bumping.`,
      });
      continue;
    }

    // Case B: edit to existing _vN/<id>.md (not a new file).
    if (!newFile) {
      if (!diffShowsBodyChange(base, p)) {
        // Whitespace-only or empty — emit warning per T-20-Z-04-02.
        if (isWhitespaceOnlyDiff(base, p)) {
          findings.push({
            kind: 'whitespace-warning',
            path: p,
            detail: 'Whitespace-only diff — informational. Body unchanged.',
          });
        }
        continue;
      }
      // Non-whitespace body change to an existing _vN/<id>.md — REQUIRES a
      // sibling _v(N+1)/<id>.md in the SAME diff.
      if (!siblingNextVersionAddedInDiff(p, changedSet)) {
        findings.push({
          kind: 'body-change-without-bump',
          path: p,
          detail: `Body changed at ${p} without bumping to _v${parsed.version + 1}/${parsed.id}.md. Either revert the body change OR create the new version directory.`,
        });
      }
    }
  }

  // Render output (markdown table for PR comment readability).
  const blocking = findings.filter((f) => f.kind !== 'whitespace-warning');
  const warnings = findings.filter((f) => f.kind === 'whitespace-warning');

  if (blocking.length === 0 && warnings.length === 0) {
    console.log('[check-prompts] all prompt diffs versioned correctly — green.');
    return 0;
  }

  if (warnings.length > 0) {
    console.log('| Path | Note |');
    console.log('|------|------|');
    for (const w of warnings) console.log(`| ${w.path} | ⚠️  ${w.detail} |`);
    console.log('');
  }

  if (blocking.length === 0) {
    console.log('[check-prompts] only whitespace warnings — exiting green per T-20-Z-04-02 (accepted threat).');
    return 0;
  }

  console.log('### Prompt Registry Gate — Violations Found');
  console.log('');
  console.log('| Kind | Path | Detail |');
  console.log('|------|------|--------|');
  for (const f of blocking) console.log(`| ${f.kind} | ${f.path} | ${f.detail} |`);
  console.log('');
  console.log('To fix:');
  console.log('  1. Revert the body change to the existing _vN/<id>.md, OR');
  console.log('  2. Create src/lib/prompts/_v(N+1)/<id>.md with the new body, AND');
  console.log('     run `npx vitest -u tests/prompts/registry.golden.test.ts` to update');
  console.log('     the golden snapshot, then commit both.');
  return 1;
}

// Run only when invoked as a script (not when imported by tests).
const isMain = process.argv[1] && process.argv[1].endsWith('check-prompt-versions.ts');
if (isMain) {
  process.exit(main());
}

// Exports for testability.
export {
  parseVersionPath,
  isWhitespaceOnlyDiff,
  siblingNextVersionAddedInDiff,
  priorVersionExistsOnDisk,
  resolveBase,
  main,
};
