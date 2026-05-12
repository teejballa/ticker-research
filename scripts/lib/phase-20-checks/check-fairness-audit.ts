// scripts/lib/phase-20-checks/check-fairness-audit.ts
// Owned by 20-C-06 — this script only consumes the audit + scans model cards for known_limitations.
//
// DoD #15 — file existence + content parse: asserts the 20-C-06 audit report
// (docs/audits/phase-20-fairness.md) exists, its YAML frontmatter contains a
// non-empty `segments` array with per-segment Brier+ECE, and at least one
// model card in MODEL-CARD-*.md references a `known_limitations` section.

import type { CheckFn } from './types';

const AUDIT_REL_PATH = 'docs/audits/phase-20-fairness.md';
const CARDS_GLOB_CMD = 'ls docs/cards/MODEL-CARD-*.md 2>/dev/null';

export const checkFairnessAudit: CheckFn = async (deps) => {
  const base = {
    name: 'fairness-audit',
    dod_label: 'Fairness audit committed with documented per-segment Brier + ECE; ≥1 known limitation surfaced in model card',
    blocker_for: 15,
    branch: 'hygiene',
  } as const;
  try {
    const auditPath = `${deps.repoRoot}/${AUDIT_REL_PATH}`;
    if (!deps.fs.existsSync(auditPath)) {
      return { ...base, status: 'pending', evidence: `artifact not yet present: ${AUDIT_REL_PATH}` };
    }
    const body = deps.fs.readFileSync(auditPath);
    const fmMatch = body.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) {
      return { ...base, status: 'fail', evidence: `${AUDIT_REL_PATH} missing YAML frontmatter` };
    }
    const fm = fmMatch[1];
    // Look for a non-empty `segments:` array — either inline-list or hyphen-list shape.
    const segmentsInline = fm.match(/^segments:\s*\[(.+)\]\s*$/m);
    const segmentsList = fm.match(/^segments:\s*\n(\s+-\s.+\n?)+/m);
    const hasSegments =
      (segmentsInline && segmentsInline[1].trim().length > 0) || Boolean(segmentsList);
    if (!hasSegments) {
      return {
        ...base,
        status: 'fail',
        evidence: `${AUDIT_REL_PATH} frontmatter missing non-empty 'segments' array`,
      };
    }
    // Body should mention brier + ECE for at least one segment.
    if (!/brier/i.test(body) || !/ece/i.test(body)) {
      return {
        ...base,
        status: 'fail',
        evidence: `${AUDIT_REL_PATH} body missing per-segment Brier+ECE references`,
      };
    }
    // Scan model cards for known_limitations reference.
    const lsOut = deps.exec(CARDS_GLOB_CMD);
    const cardPaths = lsOut.stdout.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
    let cardWithLimitation: string | null = null;
    for (const rel of cardPaths) {
      const abs = `${deps.repoRoot}/${rel}`;
      if (!deps.fs.existsSync(abs)) continue;
      const cardBody = deps.fs.readFileSync(abs);
      if (/known[_\s-]limitation/i.test(cardBody)) {
        cardWithLimitation = rel;
        break;
      }
    }
    if (!cardWithLimitation) {
      return {
        ...base,
        status: 'fail',
        evidence: `no MODEL-CARD-*.md references known_limitations (${cardPaths.length} cards scanned)`,
      };
    }
    return {
      ...base,
      status: 'pass',
      evidence: `audit at ${AUDIT_REL_PATH} has segments; ${cardWithLimitation} cites known_limitations`,
    };
  } catch (err) {
    return { ...base, status: 'pending', evidence: `query failed: ${String(err)}` };
  }
};
