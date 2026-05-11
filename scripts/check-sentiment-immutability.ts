#!/usr/bin/env -S node --import tsx
/**
 * Plan 20-Z-01 — Immutability guard (T-20-Z-01-04).
 *
 * Greps the codebase for any UPDATE-shaped call against SentimentObservation
 * and exits non-zero. The whole PIT model collapses if a classifier-version
 * upgrade silently overwrites historical scores; this script is the CI gate
 * that prevents that.
 *
 * Approved escape hatches (allowlisted paths):
 *   - prisma/migrations/**         (Prisma-managed schema migrations)
 *   - scripts/check-sentiment-immutability.ts  (this file itself)
 *   - tests/**                                  (test mocks may reference the call shape)
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = process.cwd();
const SCAN_ROOTS = ['src', 'scripts'];
const FORBIDDEN_PATTERNS = [
  /prisma\.sentimentObservation\.update\b/,
  /prisma\.sentimentObservation\.updateMany\b/,
  /prisma\.sentimentObservation\.upsert\b/,
  /prisma\.sentimentObservation\.delete\b/,
  /prisma\.sentimentObservation\.deleteMany\b/,
];
const ALLOWLIST_FILES = new Set<string>([
  'scripts/check-sentiment-immutability.ts',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (name === 'node_modules' || name === '.next' || name === 'dist') continue;
      walk(p, out);
    } else if (name.endsWith('.ts') || name.endsWith('.tsx')) {
      out.push(p);
    }
  }
  return out;
}

const offenders: Array<{ file: string; line: number; text: string; pattern: string }> = [];
for (const root of SCAN_ROOTS) {
  const abs = join(ROOT, root);
  try {
    statSync(abs);
  } catch {
    continue;
  }
  for (const file of walk(abs)) {
    const rel = relative(ROOT, file);
    if (ALLOWLIST_FILES.has(rel)) continue;
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const pat of FORBIDDEN_PATTERNS) {
        if (pat.test(lines[i])) {
          offenders.push({ file: rel, line: i + 1, text: lines[i].trim(), pattern: pat.source });
        }
      }
    }
  }
}

if (offenders.length > 0) {
  console.error(
    'check-sentiment-immutability: FAIL — SentimentObservation is insert-only (Plan 20-Z-01 / T-20-Z-01-04).',
  );
  console.error('Backfills must use a NEW model_version, not overwrite an existing row.\n');
  for (const o of offenders) {
    console.error(`  ${o.file}:${o.line}  [${o.pattern}]`);
    console.error(`    ${o.text}`);
  }
  process.exit(1);
}
console.log(
  'check-sentiment-immutability: OK — no SentimentObservation UPDATE/UPSERT/DELETE found in src/ or scripts/.',
);
