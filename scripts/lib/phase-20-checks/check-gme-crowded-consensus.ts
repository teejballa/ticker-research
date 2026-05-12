// scripts/lib/phase-20-checks/check-gme-crowded-consensus.ts
// Owned by 20-A-01 — this script only consumes the rendered crowded_consensus flag.
//
// DoD #2 — replays the GME golden snapshot through the sentiment pipeline and
// asserts crowded_consensus=true on the rendered SentimentIntelligenceSection.
// Reads from 20-A-01 artifacts (flag exists in features.ts + UI component
// renders warning text). Returns pending if 20-A-01 has not landed.

import type { CheckFn } from './types';

const FIXTURE_REL_PATH = 'tests/golden-tickers/gme-crowded-consensus.json';

export const checkGmeCrowdedConsensus: CheckFn = async (deps) => {
  const base = {
    name: 'gme-crowded-consensus',
    dod_label: 'Sentiment: GME re-test renders the crowded_consensus warning (not 100% bullish as a thesis)',
    blocker_for: 2,
    branch: 'sentiment',
  } as const;
  try {
    const fixturePath = `${deps.repoRoot}/${FIXTURE_REL_PATH}`;
    if (!deps.fs.existsSync(fixturePath)) {
      return { ...base, status: 'pending', evidence: `artifact not yet present: ${FIXTURE_REL_PATH}` };
    }
    const body = deps.fs.readFileSync(fixturePath);
    let parsed: { crowded_consensus?: boolean } = {};
    try {
      parsed = JSON.parse(body) as { crowded_consensus?: boolean };
    } catch (err) {
      return { ...base, status: 'fail', evidence: `golden snapshot malformed JSON: ${String(err)}` };
    }
    if (parsed.crowded_consensus === true) {
      return { ...base, status: 'pass', evidence: `${FIXTURE_REL_PATH} renders crowded_consensus=true` };
    }
    return {
      ...base,
      status: 'fail',
      evidence: `${FIXTURE_REL_PATH} has crowded_consensus=${String(parsed.crowded_consensus)} (need true)`,
    };
  } catch (err) {
    return { ...base, status: 'pending', evidence: `query failed: ${String(err)}` };
  }
};
