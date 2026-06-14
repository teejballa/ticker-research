/**
 * Phase 22 Wave 1 — extracted persistence helper for the regime-aware
 * SentimentSnapshot writer.
 *
 * Lives in its own module (not route.ts) because Next.js App Router route
 * files may only export a fixed set of names (GET/POST/runtime/maxDuration/
 * dynamic/...). A bare named export like `classifyRegimeAndPersistForScan`
 * fails the production build with "is not a valid Route export field".
 * Tests import from this file directly.
 *
 * @knowable_at args.scanned_at — `regimeResult` MUST have been classified at
 *   or before scanned_at. Caller responsibility (the GET handler enforces this).
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { RegimeResult } from '@/lib/regime/types';

export async function classifyRegimeAndPersistForScan(args: {
  ticker: string;
  scanned_at: Date;
  price_at_scan: number;
  community_data: Prisma.InputJsonValue;
  technical_data: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  insider_data: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  institutional_data: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  regimeResult: RegimeResult;
}): Promise<void> {
  await prisma.sentimentSnapshot.create({
    data: {
      ticker: args.ticker,
      scanned_at: args.scanned_at,
      price_at_scan: args.price_at_scan,
      community_data: args.community_data,
      technical_data: args.technical_data,
      insider_data: args.insider_data,
      institutional_data: args.institutional_data,
      // Phase 22 — regime + 3 audit columns (D-03 + D-04 + CORE-ML-08).
      // regime column defaults to 'ALL' in the schema; we still pass it explicitly
      // so the train/serve contract is visible at the write site.
      regime: args.regimeResult.regime,
      regime_vix_level: args.regimeResult.vix_level,
      regime_vix_pctile: args.regimeResult.vix_60d_percentile,
      regime_ma_diff: args.regimeResult.spy_ma_50_minus_200,
    },
  });
}
