/**
 * Phase 21 — Sector-Relative Outcome Labels
 *
 * Maps a ticker (with optional as-of-date for backfill) to its SPDR sector
 * ETF. Used by /api/cron/relabel and /api/cron/price-followup to compute
 * sector-relative forward returns, replacing alpha-vs-SPY as the primary
 * outcome label.
 *
 * Snapshot discipline: when called from price-followup at outcome creation
 * time, the resolved ETF is persisted to PriceOutcome.sector_etf — never
 * re-resolved later. This protects against sector-reconstitution drift
 * (META moved from XLK to XLC on 2018-09-28; AMZN moved XLY → XLY-stays
 * but communications constituents shuffled).
 *
 * Fallback: any ticker whose Yahoo `quoteSummary.sector` is null,
 * unrecognized, or whose lookup fails returns 'SPY' so the engine still
 * grades the outcome (just against the broad market) rather than throwing.
 *
 * Implementation lands in 21-1-03. This file is the type contract +
 * red-phase stub created by 21-0-01.
 */

export type SectorETF =
  | 'XLK'   // Technology Select Sector SPDR
  | 'XLF'   // Financial Select Sector SPDR
  | 'XLE'   // Energy Select Sector SPDR
  | 'XLV'   // Health Care Select Sector SPDR
  | 'XLY'   // Consumer Discretionary Select Sector SPDR
  | 'XLP'   // Consumer Staples Select Sector SPDR
  | 'XLI'   // Industrial Select Sector SPDR
  | 'XLU'   // Utilities Select Sector SPDR
  | 'XLB'   // Materials Select Sector SPDR
  | 'XLRE'  // Real Estate Select Sector SPDR
  | 'XLC'   // Communication Services Select Sector SPDR
  | 'SPY';  // Fallback (no sector data, sentinel for unmapped)

export interface GetSectorETFArgs {
  ticker: string;
  /** For backfill: snapshot the sector as it would have been knowable at this date. Omitted → uses today. */
  asOfDate?: Date;
}

export async function getSectorETF(_args: GetSectorETFArgs): Promise<SectorETF> {
  throw new Error('Not implemented — 21-1-03 will implement getSectorETF');
}
