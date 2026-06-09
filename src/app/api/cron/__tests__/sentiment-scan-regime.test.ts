/**
 * PHASE 22 Wave 0 RED stub — Wave 1 delivers GREEN.
 * Covers: CORE-ML-08 (sentiment-scan writes regime at scan time)
 *         per 22-VALIDATION.md §Wave 0 Gaps.
 *
 * Intentionally imports the Wave 1 helper `classifyRegimeAndPersist` (or the
 * equivalent extension point that wraps the SentimentSnapshot insert in
 * `src/app/api/cron/sentiment-scan/route`). Since that wiring does NOT exist
 * yet, the import fails → RED.
 *
 * Reference implementation contract (22-RESEARCH.md §C):
 *   In the sentiment-scan loop, BEFORE `prisma.sentimentSnapshot.create(...)`:
 *     const regime = await classifyRegimeAt({ asOf: new Date(scanned_at) });
 *     // populate snapshot.regime + regime_vix_level + regime_vix_pctile + regime_ma_diff
 *
 * Idempotent: re-running on the same scanned_at overwrites (unique key unchanged).
 * @knowable_at scanned_at — never uses post-scan data.
 */

import { describe, it } from 'vitest';
// Intentionally imports the Wave 1 helper that sentiment-scan must call before insert.
import { classifyRegimeAndPersistForScan } from '@/app/api/cron/sentiment-scan/route';

describe('/api/cron/sentiment-scan regime write — Wave 1 contract (CORE-ML-08)', () => {
  it.todo('writes regime + regime_vix_level + regime_vix_pctile + regime_ma_diff to SentimentSnapshot');
  it.todo('calls classifyRegimeAt({ asOf: scanned_at }) — NOT classifyRegimeAt({ asOf: new Date() })');
  it.todo('regime defaults to "ALL" when classifier returns cold-start (D-09 step 3)');
  it.todo('does NOT change @@unique([ticker, scanned_at]) semantics — re-scan overwrites in place');
  it.todo('SentimentSnapshot row regime is a member of the 5-value RegimeLabel union');
  it.todo('PIT-correct: regime stored on the row reflects ONLY VIX/SPY data knowable at scanned_at');
});

void classifyRegimeAndPersistForScan;
