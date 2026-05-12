#!/usr/bin/env tsx
// scripts/check-model-cards.ts
//
// Phase 20 / Plan 20-Z-02 — S4 enforcement CI guard.
//
// Static-analysis check that fails CI when:
//   (a) missing-annotation     — a sentiment file with a classifier-shaped
//                                export (matching classifier_export_regex)
//                                has no `// @model-card: <path>` annotation.
//   (b) phantom-card           — annotation points to a card path that does
//                                not exist on disk.
//   (c) stale-card             — card's frontmatter `last_validated` is older
//                                than (today - retrain_cadence).
//   (d) placeholder-leak       — a card body still contains the literal
//                                `<<TODO>>` placeholder string.
//   (e) duplicate-annotation   — a file declares more than one `// @model-card:`
//                                line (ambiguous which card is canonical).
//
// The exported `runCardChecks(deps)` is pure and testable — tests pass
// in-memory fs + tmp dirs without spawning the script. The bottom of this
// file (after `require.main === module`) wires real Node deps and exits 0/1.

import * as nodeFs from 'node:fs';
import * as nodePath from 'node:path';

// -----------------------------------------------------------------------------
// Types — verbatim from PLAN.md <interfaces> block
// -----------------------------------------------------------------------------

export type CardCheckFinding = {
  kind:
    | 'missing-annotation'
    | 'phantom-card'
    | 'stale-card'
    | 'placeholder-leak'
    | 'duplicate-annotation';
  file: string;
  detail: string;
  classifier_export?: string;
  card_path?: string;
};

export type CardCheckConfig = {
  classifier_export_regex: string;
  default_retrain_cadence: string;
  exemptions: Array<{ file: string; reason: string }>;
};

export type CardCheckDeps = {
  fs: {
    readFileSync: (path: string) => string | Buffer;
    existsSync: (path: string) => boolean;
    readdirSync: (path: string) => string[];
  };
  sentimentGlob: string; // currently only the directory is read; passed for documentation
  repoRoot: string;
  today: Date;
  config: CardCheckConfig;
};

export type CardFrontmatter = {
  model_name: string;
  model_version: string;
  card_format: 'mitchell-2019' | 'gebru-2018';
  last_validated: string;
  retrain_cadence?: string;
  author: string;
  source_files: string[];
};

// -----------------------------------------------------------------------------
// Helpers (pure functions — also exported for direct unit-testing)
// -----------------------------------------------------------------------------

/**
 * Parse ISO-8601 duration like 'P90D', 'P6M', 'P1Y' into a day count.
 * Months are 30 days; years are 365 days. Throws on malformed input.
 */
export function parseIsoDurationDays(iso: string): number {
  if (typeof iso !== 'string' || iso.length === 0) {
    throw new Error(`parseIsoDurationDays: empty input`);
  }
  const m = /^P(\d+)([DMY])$/.exec(iso);
  if (!m) {
    throw new Error(`parseIsoDurationDays: malformed duration '${iso}' (expected /^P\\d+[DMY]$/)`);
  }
  const n = Number(m[1]);
  const unit = m[2];
  if (unit === 'D') return n;
  if (unit === 'M') return n * 30;
  if (unit === 'Y') return n * 365;
  throw new Error(`parseIsoDurationDays: unexpected unit '${unit}' in '${iso}'`);
}

/**
 * Parse the YAML frontmatter between the first two '---' lines.
 * Hand-rolled minimal parser — handles `key: value` and the specific
 * `source_files:\n  - <item>\n  - <item>` list shape used by Cipher cards.
 * Returns null when no frontmatter block is found.
 */
export function parseFrontmatter(body: string): CardFrontmatter | null {
  const lines = body.split(/\r?\n/);
  if (lines[0] !== '---') return null;
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      endIdx = i;
      break;
    }
  }
  if (endIdx < 0) return null;

  const obj: Record<string, string | string[]> = {};
  let currentListKey: string | null = null;

  for (let i = 1; i < endIdx; i++) {
    const line = lines[i];
    // List item line, e.g. `  - src/lib/sentiment/foo.ts`
    const listMatch = /^\s+-\s+(.*)$/.exec(line);
    if (currentListKey && listMatch) {
      (obj[currentListKey] as string[]).push(listMatch[1].trim());
      continue;
    }
    // `key:` (start of list) or `key: value` (scalar)
    const kvMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(line);
    if (kvMatch) {
      const key = kvMatch[1];
      const val = kvMatch[2].trim();
      if (val === '') {
        // start of a list
        obj[key] = [];
        currentListKey = key;
      } else {
        obj[key] = val;
        currentListKey = null;
      }
    }
  }

  const required = ['model_name', 'model_version', 'card_format', 'last_validated', 'author'];
  for (const k of required) {
    if (typeof obj[k] !== 'string') return null;
  }
  if (!Array.isArray(obj['source_files'])) return null;

  const card_format = obj['card_format'] as string;
  if (card_format !== 'mitchell-2019' && card_format !== 'gebru-2018') return null;

  return {
    model_name: obj['model_name'] as string,
    model_version: obj['model_version'] as string,
    card_format,
    last_validated: obj['last_validated'] as string,
    retrain_cadence: typeof obj['retrain_cadence'] === 'string' ? (obj['retrain_cadence'] as string) : undefined,
    author: obj['author'] as string,
    source_files: obj['source_files'] as string[],
  };
}

/**
 * Return every `// @model-card: <path>` path declared in a file body.
 * Whitespace is trimmed; ordering is preserved.
 */
export function extractAnnotations(fileBody: string): string[] {
  const result: string[] = [];
  const re = /^\s*\/\/\s*@model-card:\s*(\S+)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fileBody)) !== null) {
    result.push(m[1].trim());
  }
  return result;
}

/**
 * Return the names of every export whose declared name matches the
 * classifier-shaped regex (e.g., starts with classify|score|aggregate|predict).
 * Matches both `export function NAME` and `export const NAME = …`.
 */
export function extractClassifierExports(fileBody: string, regex: RegExp): string[] {
  const names: string[] = [];
  const fnRe = /^export\s+(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
  const constRe = /^export\s+(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
  let m: RegExpExecArray | null;
  while ((m = fnRe.exec(fileBody)) !== null) names.push(m[1]);
  while ((m = constRe.exec(fileBody)) !== null) names.push(m[1]);
  return names.filter((n) => regex.test(n));
}

// -----------------------------------------------------------------------------
// Main check loop
// -----------------------------------------------------------------------------

/**
 * Pure function. Returns ALL findings (does NOT short-circuit) so CI logs
 * surface every issue at once.
 */
export function runCardChecks(deps: CardCheckDeps): CardCheckFinding[] {
  const findings: CardCheckFinding[] = [];
  const classifierRe = new RegExp(deps.config.classifier_export_regex, 'i');
  const exemptSet = new Set(deps.config.exemptions.map((e) => e.file));

  // Resolve the sentiment directory (parent of the glob's `*.ts` suffix).
  const sentimentDir = deps.sentimentGlob.replace(/\/[^/]*$/, '');
  const sentimentDirAbs = nodePath.join(deps.repoRoot, sentimentDir);

  let sentimentFiles: string[] = [];
  try {
    sentimentFiles = deps.fs.readdirSync(sentimentDirAbs).filter((f) => f.endsWith('.ts'));
  } catch {
    // Directory doesn't exist — skip the per-file pass, still run orphan-card scan below.
  }

  for (const fileName of sentimentFiles) {
    const relPath = `${sentimentDir}/${fileName}`;
    if (exemptSet.has(relPath)) continue;

    const absPath = nodePath.join(deps.repoRoot, relPath);
    let body: string;
    try {
      body = String(deps.fs.readFileSync(absPath));
    } catch {
      continue;
    }

    const annotations = extractAnnotations(body);
    const classifierExports = extractClassifierExports(body, classifierRe);

    if (classifierExports.length > 0 && annotations.length === 0) {
      findings.push({
        kind: 'missing-annotation',
        file: relPath,
        classifier_export: classifierExports[0],
        detail:
          `File exports classifier-shaped function(s) [${classifierExports.join(', ')}] ` +
          `but has no \`// @model-card:\` annotation. ` +
          `Add one or list this file in scripts/check-model-cards.config.json exemptions with a documented reason.`,
      });
    }

    if (annotations.length > 1) {
      findings.push({
        kind: 'duplicate-annotation',
        file: relPath,
        detail:
          `File has ${annotations.length} \`// @model-card:\` lines: ${annotations.join(', ')}. ` +
          `Exactly one annotation per file is required (the canonical card for the file's primary classifier-shaped export).`,
      });
    }

    for (const annotation of annotations) {
      const cardAbs = nodePath.join(deps.repoRoot, annotation);
      if (!deps.fs.existsSync(cardAbs)) {
        findings.push({
          kind: 'phantom-card',
          file: relPath,
          card_path: annotation,
          detail:
            `Annotation points to ${annotation} which does not exist on disk (relative to ${deps.repoRoot}).`,
        });
        continue;
      }

      let cardBody: string;
      try {
        cardBody = String(deps.fs.readFileSync(cardAbs));
      } catch {
        findings.push({
          kind: 'stale-card',
          file: relPath,
          card_path: annotation,
          detail: `Card ${annotation} could not be read.`,
        });
        continue;
      }

      const fm = parseFrontmatter(cardBody);
      if (!fm || !fm.last_validated) {
        findings.push({
          kind: 'stale-card',
          file: relPath,
          card_path: annotation,
          detail: `Card ${annotation} has missing or unparseable frontmatter; cannot determine staleness.`,
        });
      } else {
        const rawCadence = fm.retrain_cadence ?? deps.config.default_retrain_cadence;
        let cadenceDays: number | null = null;
        try {
          cadenceDays = parseIsoDurationDays(rawCadence);
        } catch {
          findings.push({
            kind: 'stale-card',
            file: relPath,
            card_path: annotation,
            detail: `Card ${annotation} has invalid retrain_cadence: ${rawCadence}.`,
          });
        }
        const lastValidated = new Date(`${fm.last_validated}T00:00:00Z`);
        if (Number.isNaN(lastValidated.getTime())) {
          findings.push({
            kind: 'stale-card',
            file: relPath,
            card_path: annotation,
            detail: `Card ${annotation} has unparseable last_validated: ${fm.last_validated}.`,
          });
        } else if (cadenceDays !== null) {
          const ageDays = (deps.today.getTime() - lastValidated.getTime()) / 86_400_000;
          if (ageDays > cadenceDays) {
            findings.push({
              kind: 'stale-card',
              file: relPath,
              card_path: annotation,
              detail:
                `Card ${annotation} last_validated ${fm.last_validated} is ${Math.floor(ageDays)} days old; ` +
                `cadence is ${cadenceDays} days. Re-validate and bump last_validated.`,
            });
          }
        }
      }

      if (cardBody.includes('<<TODO>>')) {
        findings.push({
          kind: 'placeholder-leak',
          file: relPath,
          card_path: annotation,
          detail:
            `Card ${annotation} contains <<TODO>> placeholder string — fill in or remove the section.`,
        });
      }
    }
  }

  // Orphan-card scan — flag any docs/cards/*.md that still contains
  // <<TODO>>, even if no sentiment-file annotation currently points to it.
  // Catches "card committed but not yet wired" during gradual rollout.
  const cardsDirAbs = nodePath.join(deps.repoRoot, 'docs/cards');
  let cardFiles: string[] = [];
  try {
    cardFiles = deps.fs.readdirSync(cardsDirAbs).filter((f) => f.endsWith('.md'));
  } catch {
    // No docs/cards dir — nothing to scan.
  }
  for (const card of cardFiles) {
    const relCard = `docs/cards/${card}`;
    // Avoid double-reporting cards already flagged via an annotation above.
    const alreadyFlagged = findings.some(
      (f) => f.kind === 'placeholder-leak' && f.card_path === relCard,
    );
    if (alreadyFlagged) continue;
    const absCard = nodePath.join(cardsDirAbs, card);
    let body: string;
    try {
      body = String(deps.fs.readFileSync(absCard));
    } catch {
      continue;
    }
    if (body.includes('<<TODO>>')) {
      findings.push({
        kind: 'placeholder-leak',
        file: relCard,
        card_path: relCard,
        detail:
          `Orphan card ${relCard} contains <<TODO>> placeholder string — ` +
          `fill in or remove the section before merging. (No sentiment-file annotation points here yet.)`,
      });
    }
  }

  return findings;
}

// -----------------------------------------------------------------------------
// Real-deps entrypoint
// -----------------------------------------------------------------------------

function printFindings(findings: CardCheckFinding[]): void {
  if (findings.length === 0) {
    // eslint-disable-next-line no-console
    console.log('check-model-cards: OK (0 findings)');
    return;
  }
  const grouped: Record<string, CardCheckFinding[]> = {};
  for (const f of findings) {
    if (!grouped[f.kind]) grouped[f.kind] = [];
    grouped[f.kind].push(f);
  }
  // eslint-disable-next-line no-console
  console.error(`check-model-cards: ${findings.length} finding(s)`);
  for (const kind of Object.keys(grouped)) {
    // eslint-disable-next-line no-console
    console.error(`\n  [${kind}] ${grouped[kind].length} case(s):`);
    for (const f of grouped[kind]) {
      // eslint-disable-next-line no-console
      console.error(`    - ${f.file}${f.card_path ? ` → ${f.card_path}` : ''}`);
      // eslint-disable-next-line no-console
      console.error(`      ${f.detail}`);
    }
  }
}

if (require.main === module) {
  const repoRoot = process.cwd();
  const configPath = nodePath.join(repoRoot, 'scripts/check-model-cards.config.json');
  const config: CardCheckConfig = JSON.parse(nodeFs.readFileSync(configPath, 'utf8'));
  const findings = runCardChecks({
    fs: {
      readFileSync: (p: string) => nodeFs.readFileSync(p),
      existsSync: (p: string) => nodeFs.existsSync(p),
      readdirSync: (p: string) => nodeFs.readdirSync(p),
    },
    sentimentGlob: 'src/lib/sentiment/*.ts',
    repoRoot,
    today: new Date(),
    config,
  });
  printFindings(findings);
  process.exit(findings.length > 0 ? 1 : 0);
}
