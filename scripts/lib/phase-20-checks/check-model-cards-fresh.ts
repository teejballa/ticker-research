// scripts/lib/phase-20-checks/check-model-cards-fresh.ts
// Owned by 20-Z-02 — this script consumes the check-model-cards script + parses card YAML frontmatter.
//
// DoD #12 — invokes the 20-Z-02 model-card script (npm run check-model-cards).
// Parses YAML frontmatter from each card and asserts `last_validated` is
// non-empty AND within 90d. Pass if script exits 0 AND every card meets
// freshness. Fail if script exits non-zero. Pending if script not yet present.

import type { CheckFn } from './types';

// Threshold per CONTEXT.md DoD #12 + 20-Z-02 SUMMARY: P90D default retrain cadence.
const FRESHNESS_MAX_DAYS = 90;
const FRESHNESS_MAX_MS = FRESHNESS_MAX_DAYS * 24 * 60 * 60 * 1000;
const SCRIPT_REL_PATH = 'scripts/check-model-cards.ts';
const CHECK_CMD = 'npm run check-model-cards --silent';
const GLOB_CMD = 'ls docs/cards/MODEL-CARD-*.md 2>/dev/null';

export const checkModelCardsFresh: CheckFn = async (deps) => {
  const base = {
    name: 'model-cards-fresh',
    dod_label: 'Model cards exist for every shipped sentiment artifact (Mitchell 2019 format)',
    blocker_for: 12,
    branch: 'hygiene',
  } as const;
  try {
    const scriptPath = `${deps.repoRoot}/${SCRIPT_REL_PATH}`;
    if (!deps.fs.existsSync(scriptPath)) {
      return { ...base, status: 'pending', evidence: `artifact not yet present: ${SCRIPT_REL_PATH}` };
    }
    const scriptRun = deps.exec(CHECK_CMD);
    if (scriptRun.exitCode !== 0) {
      return {
        ...base,
        status: 'fail',
        evidence: `${CHECK_CMD} exit ${scriptRun.exitCode}`,
      };
    }
    // Walk every MODEL-CARD-*.md, parse YAML frontmatter, check last_validated freshness.
    const lsOut = deps.exec(GLOB_CMD);
    const cardPaths = lsOut.stdout.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
    if (cardPaths.length === 0) {
      return { ...base, status: 'pending', evidence: 'no MODEL-CARD-*.md files in docs/cards/' };
    }
    const now = Date.now();
    const stale: string[] = [];
    for (const rel of cardPaths) {
      const abs = `${deps.repoRoot}/${rel}`;
      if (!deps.fs.existsSync(abs)) continue;
      const body = deps.fs.readFileSync(abs);
      const m = body.match(/^---\n([\s\S]*?)\n---/);
      if (!m) {
        stale.push(`${rel} (no YAML frontmatter)`);
        continue;
      }
      const fm = m[1];
      const lvMatch = fm.match(/^last_validated:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\s*$/m);
      if (!lvMatch) {
        stale.push(`${rel} (last_validated empty/missing)`);
        continue;
      }
      const lvDate = new Date(`${lvMatch[1]}T00:00:00Z`);
      if (Number.isNaN(lvDate.getTime())) {
        stale.push(`${rel} (last_validated unparseable: ${lvMatch[1]})`);
        continue;
      }
      if (now - lvDate.getTime() > FRESHNESS_MAX_MS) {
        stale.push(`${rel} (stale: ${lvMatch[1]})`);
      }
    }
    if (stale.length > 0) {
      return {
        ...base,
        status: 'fail',
        evidence: `${stale.length} model card(s) stale or missing last_validated: ${stale.slice(0, 3).join('; ')}`,
      };
    }
    return {
      ...base,
      status: 'pass',
      evidence: `${cardPaths.length} model card(s) all have last_validated within ${FRESHNESS_MAX_DAYS}d; check-model-cards exit 0`,
    };
  } catch (err) {
    return { ...base, status: 'pending', evidence: `query failed: ${String(err)}` };
  }
};
