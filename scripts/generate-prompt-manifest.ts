#!/usr/bin/env tsx
// scripts/generate-prompt-manifest.ts
//
// Plan 20-Z-04 — bug fix follow-up (2026-05-13).
//
// Reads every src/lib/prompts/_vN/<id>.md file at BUILD time, parses YAML
// frontmatter, and emits src/lib/prompts/_manifest.generated.ts containing
// every body as an inline string literal in a typed REGISTERED_PROMPTS array.
//
// Why: the previous _manifest.ts used `readdirSync` / `readFileSync` at
// MODULE LOAD time. Next.js's serverless file-tracer does NOT trace files
// referenced only via dynamic fs at module load, so the .md bodies were
// never copied into the Vercel lambda bundle → every cold start of every
// route that transitively imported the registry crashed with
// `ENOENT: no such file or directory, scandir '/vercel/path0/src/lib/prompts'`.
//
// Solution: regenerate _manifest.generated.ts at prebuild and let the bundler
// turn the bodies into JS literals. Zero runtime fs. No bundler config
// needed (portable across webpack and turbopack).
//
// Frontmatter parser semantics are byte-identical to the previous in-place
// parser in _manifest.ts (intentionally — preserves the golden snapshot at
// tests/prompts/registry.golden.test.ts and the byte-equality test at
// tests/prompts/byte-equality.unit.test.ts).
//
// CI guard: run this script on prebuild AND in CI as `--check` mode to fail
// if the generated file is stale relative to the .md sources.

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const PROMPTS_ROOT = join(REPO_ROOT, 'src', 'lib', 'prompts');
const OUT_PATH = join(PROMPTS_ROOT, '_manifest.generated.ts');

// ── Frontmatter parser (byte-identical semantics to _manifest.ts) ───────────

interface ParsedFrontmatter {
  id: string;
  version: string;
  description: string;
  created_at: string;
  deprecated_at: string | null;
  variables: string[];
}

function parsePromptFile(text: string): { fm: ParsedFrontmatter; body: string } {
  const norm = text.replace(/\r\n/g, '\n');
  const lines = norm.split('\n');
  if (lines[0] !== '---') {
    throw new Error('prompt file must begin with `---` frontmatter delimiter');
  }
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
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (!m) { i++; continue; }
    const key = m[1];
    const valueRaw = m[2];
    if (key === 'variables') {
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

  const body = lines.slice(close + 1).join('\n');
  return { fm, body };
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

// ── Discover _vN/<id>.md sources ────────────────────────────────────────────

interface PromptSource {
  id: string;
  version: string;
  template: string;
  variables: string[];
  description: string;
  created_at: string;
  deprecated_at: string | null;
}

function loadAllVersions(): PromptSource[] {
  const entries = readdirSync(PROMPTS_ROOT, { withFileTypes: true });
  const versionDirs = entries
    .filter((e) => e.isDirectory() && /^_v\d+$/.test(e.name))
    .map((e) => e.name)
    .sort();

  const out: PromptSource[] = [];
  for (const ver of versionDirs) {
    const dir = join(PROMPTS_ROOT, ver);
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
    for (const f of files) {
      const text = readFileSync(join(dir, f), 'utf8');
      const { fm, body } = parsePromptFile(text);
      out.push({
        id: fm.id,
        version: fm.version,
        template: body,
        variables: [...fm.variables],
        description: fm.description,
        created_at: fm.created_at,
        deprecated_at: fm.deprecated_at,
      });
    }
  }
  return out;
}

// ── Emit _manifest.generated.ts ─────────────────────────────────────────────

function escapeBacktick(s: string): string {
  // Use template literal — escape backslash, backtick, and `${` sequences.
  // Preserves byte-equality with the source .md body when interpreted as a
  // JS template literal (no interpolation triggered).
  return s
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

function emit(prompts: PromptSource[]): string {
  const header = `// src/lib/prompts/_manifest.generated.ts
//
// AUTO-GENERATED by scripts/generate-prompt-manifest.ts. DO NOT EDIT.
//
// Regenerate after editing any src/lib/prompts/_v*/<id>.md by running:
//   npx tsx scripts/generate-prompt-manifest.ts
//
// This file is regenerated automatically on \`npm run build\` via the
// \`prebuild\` script. CI verifies it is in-sync with the .md sources
// via \`npx tsx scripts/generate-prompt-manifest.ts --check\`.
//
// Generated at build time so Next.js's file-tracer can statically resolve
// every prompt body — no runtime fs, no ENOENT crashes on cold start.

import type { PromptId, PromptVersion, RegisteredPrompt } from './registry';

`;

  const entries = prompts.map((p) => {
    const variables = p.variables.length === 0
      ? '[]'
      : `[${p.variables.map((v) => JSON.stringify(v)).join(', ')}]`;
    return `  {
    id: ${JSON.stringify(p.id)} as PromptId,
    version: ${JSON.stringify(p.version)} as PromptVersion,
    template: \`${escapeBacktick(p.template)}\`,
    variables: Object.freeze(${variables}),
    description: ${JSON.stringify(p.description)},
    created_at: ${JSON.stringify(p.created_at)},
    deprecated_at: ${p.deprecated_at === null ? 'null' : JSON.stringify(p.deprecated_at)},
  },`;
  }).join('\n');

  return `${header}export const REGISTERED_PROMPTS: ReadonlyArray<RegisteredPrompt> = Object.freeze([
${entries}
]);
`;
}

// ── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');

  const prompts = loadAllVersions();
  const content = emit(prompts);

  if (checkOnly) {
    if (!existsSync(OUT_PATH)) {
      console.error(`[generate-prompt-manifest] FAIL: ${OUT_PATH} does not exist. Run \`npx tsx scripts/generate-prompt-manifest.ts\` and commit.`);
      process.exit(1);
    }
    const existing = readFileSync(OUT_PATH, 'utf8');
    if (existing !== content) {
      console.error(`[generate-prompt-manifest] FAIL: ${OUT_PATH} is stale relative to .md sources.`);
      console.error('Regenerate with: npx tsx scripts/generate-prompt-manifest.ts');
      process.exit(1);
    }
    console.log(`[generate-prompt-manifest] OK — ${prompts.length} prompts, generated file is in-sync.`);
    return;
  }

  writeFileSync(OUT_PATH, content, 'utf8');
  console.log(`[generate-prompt-manifest] wrote ${OUT_PATH} (${prompts.length} prompts)`);
}

main();
