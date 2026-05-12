#!/usr/bin/env -S node --import tsx
/**
 * Plan 20-Z-07 — Static lookahead-bias guard.
 *
 * Greps src for any reference to the literal `published_at`. For each match,
 * looks at the IMMEDIATELY-PRECEDING non-whitespace line. If that line
 * carries a `// LOOKAHEAD-OK: <reason>` comment with a non-empty reason, the
 * match is allowlisted. Otherwise, the match is reported and the script
 * exits 1.
 *
 * This is the FAST defense-in-depth layer (runs in <1s in CI). The runtime
 * hook in tests/integration/lookahead-bias.regression.test.ts is the
 * source-of-truth — it sees the actual SQL Prisma issues. Together they
 * form the S2 PIT runtime defense (CONTEXT.md line 17, phase threat
 * T-28-002).
 *
 * Comments are stripped before scanning so block / line comments do NOT
 * trigger the check — only real code references must carry an allowlist.
 *
 * Hard-coded exclusions (NOT configurable — prevents silent widening):
 *   - tests/**
 *   - scripts/**
 *   - src/**\/__tests__/**
 *   - src/**\/*.test.ts
 *   - tests/integration/__fixtures__/** (the synthetic-violation fixture)
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

interface Violation {
  file: string;
  line: number;
  text: string;
  reason: 'no-allowlist-comment' | 'allowlist-comment-empty';
}

const ALLOWLIST_REGEX = /\/\/\s*LOOKAHEAD-OK\s*:\s*(.*?)\s*$/;
// SCANNER_REGEX is the token we're guarding against. Word-boundary match
// so `unpublished_at` does not false-fire. Note that this script's own
// SOURCE FILE contains the literal `published_at` in this comment and in
// the regex below — that is exempted by listSourceFiles() because
// scripts/** is in the hard-coded exclusion list.
const SCANNER_REGEX = /\bpublished_at\b/;

function listSourceFiles(): string[] {
  // git ls-files restricts to tracked files; pathspec includes ts/tsx in src/
  // and any extra opt-in roots. tests/ scripts/ excluded by filter below.
  const out = execSync(`git ls-files 'src/**/*.ts' 'src/**/*.tsx'`, {
    encoding: 'utf-8',
  });
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((f) => !f.includes('__tests__'))
    .filter((f) => !f.endsWith('.test.ts'))
    .filter((f) => !f.endsWith('.test.tsx'));
}

/**
 * Strip TS/JS comments from `text` while preserving line numbers (replace
 * comment characters with spaces). Handles:
 *   - // line comments to end-of-line
 *   - /* block comments *\/ across multiple lines
 * Does NOT strip strings — `published_at` inside a string is real code that
 * could end up in a SQL template literal, so it must still be flagged.
 */
function stripComments(text: string): string {
  const chars = text.split('');
  let i = 0;
  const n = chars.length;
  let inString: '"' | "'" | '`' | null = null;
  while (i < n) {
    const c = chars[i];
    const next = i + 1 < n ? chars[i + 1] : '';
    if (inString) {
      // Handle escape sequences inside strings
      if (c === '\\' && i + 1 < n) {
        i += 2;
        continue;
      }
      if (c === inString) {
        inString = null;
      }
      i++;
      continue;
    }
    // Not currently inside a string
    if (c === '"' || c === "'" || c === '`') {
      inString = c as '"' | "'" | '`';
      i++;
      continue;
    }
    if (c === '/' && next === '/') {
      // Line comment — blank out until newline
      while (i < n && chars[i] !== '\n') {
        chars[i] = ' ';
        i++;
      }
      continue;
    }
    if (c === '/' && next === '*') {
      // Block comment — blank out until '*/' (preserve newlines for line tracking)
      chars[i] = ' ';
      chars[i + 1] = ' ';
      i += 2;
      while (i < n) {
        if (chars[i] === '*' && i + 1 < n && chars[i + 1] === '/') {
          chars[i] = ' ';
          chars[i + 1] = ' ';
          i += 2;
          break;
        }
        if (chars[i] !== '\n') chars[i] = ' ';
        i++;
      }
      continue;
    }
    i++;
  }
  return chars.join('');
}

function checkFile(file: string): Violation[] {
  const violations: Violation[] = [];
  const raw = readFileSync(file, 'utf-8');
  const rawLines = raw.split('\n');
  // Strip comments — we look for published_at in CODE only. But we still need
  // the ORIGINAL lines to find the allowlist comment on the preceding line.
  const stripped = stripComments(raw);
  const strippedLines = stripped.split('\n');

  for (let i = 0; i < strippedLines.length; i++) {
    if (!SCANNER_REGEX.test(strippedLines[i])) continue;
    // Look at preceding non-whitespace line for allowlist comment.
    // We check the ORIGINAL (un-stripped) text since the allowlist IS a
    // comment.
    let allowlist: string | null = null;
    let allowlistEmpty = false;
    for (let j = i - 1; j >= 0; j--) {
      if (rawLines[j].trim() === '') continue;
      const m = ALLOWLIST_REGEX.exec(rawLines[j]);
      if (m) {
        const reason = m[1].trim();
        if (reason.length === 0) {
          allowlistEmpty = true;
        } else {
          allowlist = reason;
        }
      }
      break; // only check the immediately-preceding non-whitespace line
    }
    if (allowlist !== null) continue; // allowlisted with non-empty reason → OK
    violations.push({
      file,
      line: i + 1,
      text: rawLines[i].trim(),
      reason: allowlistEmpty ? 'allowlist-comment-empty' : 'no-allowlist-comment',
    });
  }
  return violations;
}

function main(): number {
  const files = listSourceFiles();
  const allViolations: Violation[] = [];
  for (const f of files) {
    allViolations.push(...checkFile(f));
  }
  if (allViolations.length === 0) {
    process.stdout.write(
      `check-lookahead: 0 violations across ${files.length} files\n`,
    );
    return 0;
  }
  process.stderr.write(`check-lookahead: ${allViolations.length} violations:\n`);
  for (const v of allViolations) {
    process.stderr.write(
      `  ${v.file}:${v.line}: ${v.text}  (${v.reason}; ` +
        `suggested fix: use fetched_at; or add // LOOKAHEAD-OK: <reason> on the preceding line)\n`,
    );
  }
  return 1;
}

process.exit(main());
