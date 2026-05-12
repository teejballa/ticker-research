// src/lib/prompts/_manifest.ts
// Plan 20-Z-04 — manifest for the prompt registry.
//
// Loads every src/lib/prompts/_vN/<id>.md file at module load time, parses the
// YAML frontmatter, and exposes a typed RegisteredPrompt[] for registry.ts.
//
// Design choices:
//  - fs.readFileSync at module load (NOT per-request). Module load happens
//    once per Vercel cold start. Subsequent requests reuse the in-memory
//    REGISTERED_PROMPTS constant — zero per-request overhead.
//  - Path resolution uses fileURLToPath(import.meta.url) → __dirname for ESM
//    compatibility under Vitest + Next.js bundled server runtime.
//  - The frontmatter parser is hand-written (no yaml dep) — the format is
//    fixed and small, so 30 lines of parser code beats adding a dependency.
//  - Bodies are read verbatim — substring(afterSecondDashLine). Bit-identical
//    with the on-disk file ensures the golden snapshot test catches any drift.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import type { PromptId, PromptVersion, RegisteredPrompt } from './registry';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Frontmatter parser ──────────────────────────────────────────────────────
// Format (authoritative for v1 / v2 / vN .md files):
//
//   ---
//   id: gemini-research-brief-system
//   version: v1
//   description: <single-line-string or multi-line scalar>
//   created_at: 2026-05-11T00:00:00Z
//   deprecated_at: null
//   variables:
//     - foo
//     - bar
//   ---
//   <body>
//
// The parser is line-oriented: simple `key: value` for scalars, and the
// special-cased `variables:` list parsed as a YAML sequence (one item per
// `  - name` line). The body is everything after the second `---` line.

interface ParsedFrontmatter {
  id: string;
  version: string;
  description: string;
  created_at: string;
  deprecated_at: string | null;
  variables: string[];
}

function parsePromptFile(text: string): { fm: ParsedFrontmatter; body: string } {
  // Normalize CRLF → LF so the parse is platform-stable.
  const norm = text.replace(/\r\n/g, '\n');
  const lines = norm.split('\n');
  if (lines[0] !== '---') {
    throw new Error('prompt file must begin with `---` frontmatter delimiter');
  }
  // Find the closing `---` of the frontmatter (must be at column 0).
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') { close = i; break; }
  }
  if (close === -1) {
    throw new Error('prompt file frontmatter missing closing `---`');
  }

  const fm: ParsedFrontmatter = {
    id: '',
    version: '',
    description: '',
    created_at: '',
    deprecated_at: null,
    variables: [],
  };

  let i = 1;
  while (i < close) {
    const line = lines[i];
    if (line === '' || line.startsWith('#')) { i++; continue; }
    // Key on this line (column 0)?
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (!m) { i++; continue; }
    const key = m[1];
    const valueRaw = m[2];
    if (key === 'variables') {
      // YAML sequence: read subsequent indented lines until we hit another
      // top-level key or the closing `---`.
      const vars: string[] = [];
      i++;
      while (i < close) {
        const next = lines[i];
        const seq = next.match(/^\s+-\s*(.+)\s*$/);
        if (!seq) break;
        vars.push(seq[1].trim());
        i++;
      }
      fm.variables = vars;
      continue;
    }
    // Scalar.
    const value = valueRaw.trim();
    if (key === 'id') fm.id = unquote(value);
    else if (key === 'version') fm.version = unquote(value);
    else if (key === 'description') fm.description = unquote(value);
    else if (key === 'created_at') fm.created_at = unquote(value);
    else if (key === 'deprecated_at') {
      fm.deprecated_at = value === 'null' || value === '' ? null : unquote(value);
    }
    i++;
  }

  // Body = everything after the closing `---` line. join('\n') preserves the
  // original newline layout. We trim the first leading newline ONLY if the
  // frontmatter close was immediately followed by a single `\n` — keeps the
  // file's body equal to the substring from byte 0 of line (close+1) onward.
  const body = lines.slice(close + 1).join('\n');
  return { fm, body };
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

// ── Load every _vN/<id>.md file ─────────────────────────────────────────────

function loadVersionDir(versionDir: string): RegisteredPrompt[] {
  if (!existsSync(versionDir)) return [];
  const files = readdirSync(versionDir).filter((f) => f.endsWith('.md'));
  const out: RegisteredPrompt[] = [];
  for (const f of files) {
    const text = readFileSync(join(versionDir, f), 'utf8');
    const { fm, body } = parsePromptFile(text);
    out.push({
      id: fm.id as PromptId,
      version: fm.version as PromptVersion,
      template: body,
      variables: Object.freeze([...fm.variables]),
      description: fm.description,
      created_at: fm.created_at,
      deprecated_at: fm.deprecated_at,
    });
  }
  return out;
}

function loadAllVersions(): RegisteredPrompt[] {
  // Discover every `_vN` sibling directory under prompts/. Scanning is cheap
  // (small directory) and keeps the registry self-bootstrapping when future
  // plans add new versions.
  const promptsRoot = __dirname;
  const entries = readdirSync(promptsRoot, { withFileTypes: true });
  const versionDirs = entries
    .filter((e) => e.isDirectory() && /^_v\d+$/.test(e.name))
    .map((e) => join(promptsRoot, e.name));
  const all: RegisteredPrompt[] = [];
  for (const d of versionDirs) all.push(...loadVersionDir(d));
  return all;
}

export const REGISTERED_PROMPTS: ReadonlyArray<RegisteredPrompt> = Object.freeze(loadAllVersions());
