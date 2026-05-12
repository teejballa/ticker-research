// tests/check-model-cards.unit.test.ts
//
// Phase 20 / Plan 20-Z-02 — Task 6.
//
// Eight unit tests covering all five failure modes
// (missing-annotation / phantom-card / stale-card / placeholder-leak /
//  duplicate-annotation), the exemption-list mechanism, the clean-tree
// no-finding base case, and parseIsoDurationDays table cases.
//
// Tests use os.tmpdir() fixtures — no mocking, real fs.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  runCardChecks,
  parseIsoDurationDays,
  type CardCheckConfig,
  type CardCheckDeps,
} from '../scripts/check-model-cards';

const baseConfig: CardCheckConfig = {
  classifier_export_regex: '^(classify|score|aggregate|predict)',
  default_retrain_cadence: 'P90D',
  exemptions: [],
};

function makeDeps(
  repoRoot: string,
  today: Date = new Date('2026-05-10T00:00:00Z'),
  config: CardCheckConfig = baseConfig,
): CardCheckDeps {
  return {
    fs: {
      readFileSync: (p: string) => fs.readFileSync(p),
      existsSync: (p: string) => fs.existsSync(p),
      readdirSync: (p: string) => fs.readdirSync(p),
    },
    sentimentGlob: 'src/lib/sentiment/*.ts',
    repoRoot,
    today,
    config,
  };
}

function writeCard(
  repoRoot: string,
  filename: string,
  opts: {
    last_validated?: string;
    retrain_cadence?: string;
    card_format?: string;
    body_extra?: string;
  } = {},
): string {
  const last = opts.last_validated ?? '2026-05-10';
  const cadence = opts.retrain_cadence ?? 'P90D';
  const cardFmt = opts.card_format ?? 'mitchell-2019';
  const body = `---
model_name: fixture
model_version: v0.0.1
card_format: ${cardFmt}
last_validated: ${last}
retrain_cadence: ${cadence}
author: fixture@example.com
source_files:
  - src/lib/sentiment/foo.ts
---

# Fixture card body
${opts.body_extra ?? ''}
`;
  const full = path.join(repoRoot, 'docs/cards', filename);
  fs.writeFileSync(full, body);
  return `docs/cards/${filename}`;
}

function writeSentimentFile(repoRoot: string, filename: string, body: string): string {
  const full = path.join(repoRoot, 'src/lib/sentiment', filename);
  fs.writeFileSync(full, body);
  return `src/lib/sentiment/${filename}`;
}

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'check-mc-'));
  fs.mkdirSync(path.join(tmp, 'src/lib/sentiment'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'docs/cards'), { recursive: true });
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('runCardChecks — failure-mode coverage', () => {
  it('returns no findings on a clean fixture (annotation + valid card)', () => {
    writeCard(tmp, 'MODEL-CARD-foo.md', { last_validated: '2026-05-10' });
    writeSentimentFile(
      tmp,
      'foo.ts',
      `// @model-card: docs/cards/MODEL-CARD-foo.md\nexport function aggregateFoo() { return 1; }\n`,
    );
    const findings = runCardChecks(makeDeps(tmp));
    expect(findings).toHaveLength(0);
  });

  it('fires missing-annotation when classifier-shaped export has no // @model-card: line', () => {
    writeSentimentFile(
      tmp,
      'unsourced.ts',
      `export function aggregateFoo() { return 42; }\n`,
    );
    const findings = runCardChecks(makeDeps(tmp));
    const missing = findings.filter((f) => f.kind === 'missing-annotation');
    expect(missing).toHaveLength(1);
    expect(missing[0].classifier_export).toBe('aggregateFoo');
    expect(missing[0].file).toBe('src/lib/sentiment/unsourced.ts');
  });

  it('fires phantom-card when annotation points to a non-existent path', () => {
    writeSentimentFile(
      tmp,
      'phantom.ts',
      `// @model-card: docs/cards/MODEL-CARD-nope.md\nexport function classifyFoo() { return 1; }\n`,
    );
    const findings = runCardChecks(makeDeps(tmp));
    const phantom = findings.filter((f) => f.kind === 'phantom-card');
    expect(phantom).toHaveLength(1);
    expect(phantom[0].card_path).toContain('nope');
    expect(phantom[0].file).toBe('src/lib/sentiment/phantom.ts');
  });

  it('fires stale-card when last_validated is older than retrain_cadence', () => {
    writeCard(tmp, 'MODEL-CARD-stale.md', {
      last_validated: '2025-01-01',
      retrain_cadence: 'P90D',
    });
    writeSentimentFile(
      tmp,
      'stale.ts',
      `// @model-card: docs/cards/MODEL-CARD-stale.md\nexport function scoreFoo() { return 1; }\n`,
    );
    const findings = runCardChecks(
      makeDeps(tmp, new Date('2026-05-10T00:00:00Z')),
    );
    const stale = findings.filter((f) => f.kind === 'stale-card');
    expect(stale).toHaveLength(1);
    expect(stale[0].card_path).toBe('docs/cards/MODEL-CARD-stale.md');
    expect(stale[0].detail).toMatch(/days old/);
  });

  it('fires placeholder-leak when card body contains <<TODO>>', () => {
    writeCard(tmp, 'MODEL-CARD-leaky.md', {
      last_validated: '2026-05-10',
      body_extra: '\nUnfinished section: <<TODO>>\n',
    });
    writeSentimentFile(
      tmp,
      'leaky.ts',
      `// @model-card: docs/cards/MODEL-CARD-leaky.md\nexport function predictFoo() { return 1; }\n`,
    );
    const findings = runCardChecks(makeDeps(tmp));
    const leaks = findings.filter((f) => f.kind === 'placeholder-leak');
    expect(leaks.length).toBeGreaterThanOrEqual(1);
    expect(leaks[0].card_path).toBe('docs/cards/MODEL-CARD-leaky.md');
  });

  it('fires duplicate-annotation when a file declares two // @model-card: lines', () => {
    writeCard(tmp, 'MODEL-CARD-a.md', { last_validated: '2026-05-10' });
    writeCard(tmp, 'MODEL-CARD-b.md', { last_validated: '2026-05-10' });
    writeSentimentFile(
      tmp,
      'dup.ts',
      `// @model-card: docs/cards/MODEL-CARD-a.md\n// @model-card: docs/cards/MODEL-CARD-b.md\nexport function aggregateDup() { return 1; }\n`,
    );
    const findings = runCardChecks(makeDeps(tmp));
    const dup = findings.filter((f) => f.kind === 'duplicate-annotation');
    expect(dup).toHaveLength(1);
    expect(dup[0].file).toBe('src/lib/sentiment/dup.ts');
  });

  it('respects the exemption list — classifier-shaped export without annotation does NOT fire', () => {
    writeSentimentFile(
      tmp,
      'exempt.ts',
      `export function classifyFoo() { return 1; }\n`,
    );
    const config: CardCheckConfig = {
      ...baseConfig,
      exemptions: [{ file: 'src/lib/sentiment/exempt.ts', reason: 'fixture exemption' }],
    };
    const findings = runCardChecks(makeDeps(tmp, undefined, config));
    expect(findings).toHaveLength(0);
  });
});

describe('parseIsoDurationDays — table cases', () => {
  it('P90D → 90', () => {
    expect(parseIsoDurationDays('P90D')).toBe(90);
  });
  it('P6M → 180 (30-day months)', () => {
    expect(parseIsoDurationDays('P6M')).toBe(180);
  });
  it('P1Y → 365 (365-day years)', () => {
    expect(parseIsoDurationDays('P1Y')).toBe(365);
  });
  it("throws on 'P90' (no unit)", () => {
    expect(() => parseIsoDurationDays('P90')).toThrow();
  });
  it("throws on '90D' (no P prefix)", () => {
    expect(() => parseIsoDurationDays('90D')).toThrow();
  });
  it("throws on '' (empty)", () => {
    expect(() => parseIsoDurationDays('')).toThrow();
  });
});
