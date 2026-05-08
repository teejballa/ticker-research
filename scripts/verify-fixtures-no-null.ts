#!/usr/bin/env npx tsx
// scripts/verify-fixtures-no-null.ts
//
// Phase 19 Plan 19-A-04 — CI guard against fixture trivial-pass regression.
//
// Walks tests/fixtures/*.json (recursively). For every JSON object, traverses
// the tree and reports any field nested under an `expected` key whose value is
// `null`. Exits non-zero if any null-under-expected paths are found.
//
// Rationale (T-19-A-04-03): Plan 19-A-04 ships skeleton fixtures with
// expected.dsr / expected.pbo set to null. Task 4 instructs the executor to
// populate them with real golden-master values. This script is wired into
// `npm test` so any future commit that re-introduces a null expected field
// fails CI loudly.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

function* walkJson(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walkJson(full);
    } else if (full.endsWith('.json')) {
      yield full;
    }
  }
}

// Recursively scan an object. Track whether we're inside an `expected` subtree;
// once inside, any null leaf is a failure. Only fields literally named
// `expected` (or descendants thereof) are checked — sibling sections like
// `_note` may legitimately contain null/undefined documentation values.
function findNullsUnderExpected(
  obj: unknown,
  pathStack: string[] = [],
  insideExpected = false,
): string[] {
  const issues: string[] = [];
  if (obj === null) {
    if (insideExpected) issues.push(pathStack.join('.') || '<root>');
    return issues;
  }
  if (typeof obj !== 'object') return issues;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      issues.push(
        ...findNullsUnderExpected(
          obj[i],
          [...pathStack, String(i)],
          insideExpected,
        ),
      );
    }
    return issues;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    // Skip metadata fields that conventionally start with underscore — they
    // are documentation and may legitimately contain null/empty placeholders.
    if (k.startsWith('_')) continue;
    const childPath = [...pathStack, k];
    const childInsideExpected = insideExpected || k === 'expected';
    issues.push(...findNullsUnderExpected(v, childPath, childInsideExpected));
  }
  return issues;
}

function main(): number {
  const root = path.resolve(process.cwd(), 'tests/fixtures');
  if (!existsSync(root)) {
    console.error(`verify-fixtures-no-null: ${root} not found`);
    return 1;
  }
  let failures = 0;
  let scanned = 0;
  for (const file of walkJson(root)) {
    scanned++;
    let content: unknown;
    try {
      content = JSON.parse(readFileSync(file, 'utf-8'));
    } catch (e) {
      console.error(`verify-fixtures-no-null: cannot parse ${file}: ${String(e)}`);
      failures++;
      continue;
    }
    const nulls = findNullsUnderExpected(content);
    if (nulls.length > 0) {
      console.error(
        `FAIL: ${file} has null values at expected paths: ${nulls.join(', ')}`,
      );
      failures++;
    }
  }
  if (failures > 0) {
    console.error(
      `\n${failures} fixture file(s) have null expected values. Populate them per fixture _note instructions before commit.`,
    );
    return 1;
  }
  console.log(
    `OK: scanned ${scanned} fixture file(s); all expected.* fields are non-null`,
  );
  return 0;
}

process.exit(main());
