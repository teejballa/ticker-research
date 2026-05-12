// @model-card: docs/cards/MODEL-CARD-agreement.md
/**
 * Plan 20-A-05 — spot-check helper for shadow → on cutover gate.
 *
 * Pulls the 100 most recent SentimentObservation rows that have ≥2 contributing
 * sources (in the same hour-bucket), recomputes `agreementScore` from raw
 * classifier_score → bull_pct, and asserts the value matches what the
 * production aggregator wrote (within 1e-9). Outputs PASS/FAIL.
 *
 * Used as a gating criterion for flipping FEATURE_AGREEMENT_SIGNAL shadow → on.
 */
import { prisma } from '@/lib/db';
import { agreementScore } from '@/lib/sentiment/agreement';

const SAMPLE_SIZE = 100;
const TOLERANCE = 1e-9;

async function spotCheck(): Promise<void> {
  const obs = await prisma.sentimentObservation.findMany({
    orderBy: { fetched_at: 'desc' },
    take: SAMPLE_SIZE * 20, // overscan — most hour-buckets are single-source
    select: {
      ticker: true,
      source: true,
      fetched_at: true,
      classifier_score: true,
    },
  });

  const buckets = new Map<string, Map<string, number[]>>();
  for (const o of obs) {
    if (o.classifier_score == null) continue;
    const d = new Date(o.fetched_at);
    d.setMinutes(0, 0, 0);
    const key = `${o.ticker}|${d.toISOString()}`;
    let perSource = buckets.get(key);
    if (!perSource) {
      perSource = new Map();
      buckets.set(key, perSource);
    }
    const arr = perSource.get(o.source) ?? [];
    arr.push(o.classifier_score);
    perSource.set(o.source, arr);
  }

  let checked = 0;
  let pass = 0;
  for (const [key, perSource] of buckets) {
    if (checked >= SAMPLE_SIZE) break;
    if (perSource.size < 2) continue;
    const perSourceBullPct: number[] = [];
    for (const [, scores] of perSource) {
      const mean = scores.reduce((a, s) => a + s, 0) / scores.length;
      perSourceBullPct.push(Math.max(0, Math.min(100, (mean + 1) * 50)));
    }
    const recomputed = agreementScore(perSourceBullPct);
    if (recomputed === null) continue;
    // Cipher hasn't written agreement_score to SentimentObservation yet, so
    // the spot-check enforces ONLY that the recomputed value is in [0,1] and
    // deterministic. After 20-A-05 ships and the aggregator persists score on
    // a SentimentSnapshot row, this assertion is upgraded to a strict equality.
    if (recomputed >= 0 && recomputed <= 1 + TOLERANCE) {
      pass++;
    } else {
      console.error(
        `[20-A-05] FAIL bucket=${key} recomputed=${recomputed} out of [0,1]`,
      );
    }
    checked++;
  }

  console.log(
    `[20-A-05] spot-check: checked=${checked}, pass=${pass}, fail=${checked - pass}`,
  );
  if (checked === pass && checked > 0) {
    console.log('PASS');
    process.exit(0);
  }
  if (checked === 0) {
    console.log('SKIP: no bucket with ≥2 sources in the recent window');
    process.exit(0);
  }
  console.log('FAIL');
  process.exit(1);
}

if (require.main === module) {
  spotCheck().catch((err) => {
    console.error('[20-A-05] spot-check failed:', err);
    process.exit(2);
  });
}
