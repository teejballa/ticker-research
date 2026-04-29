// src/lib/data/ticker-watchlist.ts
// Tiered, sector-balanced, multi-period rotating watchlist for autonomous
// background sentiment scanning.
//
// The diffusion + technical engines learn by cap class × sector × pattern, so
// the watchlist must:
//   1) Cover every cap bucket (large/mid/small) every cycle.
//   2) Re-scan a stable set of anchors so bellwether series never gap.
//   3) Rotate through a wide universe each day, week, and month so the engine
//      keeps seeing new (sector × cap × pattern) combinations rather than
//      overfitting the same names.
//   4) Round-robin sectors so any single cycle covers a balanced mix —
//      software bias was the gap in the previous flat-pool design.
//
// `WATCHLIST_TICKERS` is recomputed from `getCurrentWatchlist()` at module
// load time. The cron route calls `getCurrentWatchlist()` directly so the
// slice advances every run as date moves forward — no random seeding.

export const ANCHORS: string[] = [
  // Always scanned every cycle — the bellwethers we never want a gap on.
  'AAPL', 'NVDA', 'MSFT', 'SPY', 'QQQ',
];

export type Sector =
  | 'tech_software'
  | 'tech_semis'
  | 'financials'
  | 'healthcare'
  | 'energy_industrials'
  | 'consumer'
  | 'comms'
  | 'crypto_meme'
  | 'biotech_micro'
  | 'ev_mobility'
  | 'space_hardware'
  | 'reit_utilities'
  | 'staples';

// Sector-tagged pools so the rotation can ensure every cycle hits a balanced
// mix of sectors instead of stacking 4 software names on a bad day.
interface SectorPool {
  sector: Sector;
  tickers: string[];
}

export const LARGE_BY_SECTOR: SectorPool[] = [
  { sector: 'tech_software', tickers: ['GOOGL', 'AMZN', 'META', 'ORCL', 'CRM', 'ADBE', 'IBM'] },
  { sector: 'tech_semis',    tickers: ['AMD', 'AVGO', 'INTC', 'TXN', 'QCOM', 'SMCI'] },
  { sector: 'financials',    tickers: ['JPM', 'BAC', 'GS', 'MS', 'V', 'MA', 'AXP', 'BLK'] },
  { sector: 'healthcare',    tickers: ['LLY', 'UNH', 'JNJ', 'PFE', 'MRK', 'ABBV', 'TMO'] },
  { sector: 'energy_industrials', tickers: ['XOM', 'CVX', 'CAT', 'GE', 'BA', 'RTX', 'LMT'] },
  { sector: 'consumer',      tickers: ['WMT', 'COST', 'HD', 'NKE', 'MCD', 'DIS', 'NFLX', 'TSLA'] },
  { sector: 'staples',       tickers: ['KO', 'PEP', 'PG'] },
  { sector: 'comms',         tickers: ['T', 'VZ'] },
  { sector: 'crypto_meme',   tickers: ['PLTR', 'COIN', 'MSTR'] },
];

export const MID_BY_SECTOR: SectorPool[] = [
  { sector: 'tech_software', tickers: ['DDOG', 'NET', 'OKTA', 'TWLO', 'ZS', 'CFLT', 'MNDY', 'S', 'GTLB', 'BILL', 'PATH', 'IOT', 'U'] },
  { sector: 'consumer',      tickers: ['SOFI', 'HOOD', 'RBLX', 'SNAP', 'PINS', 'ETSY', 'CHWY', 'AFRM', 'UPST', 'LULU', 'DECK', 'ANF', 'FIVE', 'CROX', 'BBWI', 'DKNG', 'PENN', 'WYNN', 'CZR'] },
  { sector: 'healthcare',    tickers: ['TDOC', 'EXAS', 'ICLR', 'CRSP'] },
  { sector: 'energy_industrials', tickers: ['FSLR', 'ENPH', 'PWR', 'BWXT'] },
  { sector: 'reit_utilities', tickers: ['VICI', 'WPC', 'EQR', 'AES'] },
  { sector: 'staples',       tickers: ['CELH', 'SAM', 'BYND'] },
  { sector: 'crypto_meme',   tickers: ['MARA', 'RIOT', 'CLSK', 'IREN'] },
];

export const SMALL_BY_SECTOR: SectorPool[] = [
  { sector: 'tech_software', tickers: ['SOUN', 'BBAI'] },
  { sector: 'tech_semis',    tickers: ['RGTI', 'IONQ', 'QUBT', 'ARQQ'] },
  { sector: 'biotech_micro', tickers: ['AVDL', 'OCGN', 'IBRX', 'AVTX', 'KPTI', 'NVAX'] },
  { sector: 'ev_mobility',   tickers: ['NKLA', 'WKHS', 'FFIE', 'MULN', 'GOEV', 'GP'] },
  { sector: 'crypto_meme',   tickers: ['GME', 'AMC', 'BARK', 'FUBO', 'CLOV', 'RDDT'] },
  { sector: 'space_hardware', tickers: ['ASTS', 'RKLB', 'JOBY', 'ACHR'] },
  { sector: 'consumer',      tickers: ['OPEN', 'LMND', 'ATER'] },
  { sector: 'energy_industrials', tickers: ['VLN', 'NRGV', 'BLNK'] },
  { sector: 'reit_utilities', tickers: ['NYMT', 'CIM'] },
];

const ROTATION = {
  // Per-cycle pull counts (in addition to ANCHORS).
  large: 5,
  mid: 5,
  small: 4,
};

function dayOfYear(d: Date = new Date()): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86_400_000);
}

function weekOfYear(d: Date = new Date()): number {
  return Math.floor(dayOfYear(d) / 7);
}

function monthOfYear(d: Date = new Date()): number {
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

function flattenPools(pools: SectorPool[]): string[] {
  const out: string[] = [];
  for (const p of pools) out.push(...p.tickers);
  return out;
}

/**
 * Pick `take` names round-robin across sectors so each cycle is sector-balanced.
 * Three rotation seeds compose:
 *   - day  → which sector to start from
 *   - week → which ticker offset inside each sector
 *   - month → secondary stride that varies the per-day pattern across months
 */
function pickBalanced(pools: SectorPool[], take: number, day: number, week: number, month: number): string[] {
  if (pools.length === 0) return [];
  const sectorStart = day % pools.length;
  const monthStride = 1 + (month % Math.max(1, pools.length - 1));
  const out: string[] = [];
  let i = 0;
  // Up to 2× passes over the sector list to fill the slot count when some
  // sectors have a single ticker; pickBalanced still respects the take cap.
  while (out.length < take && i < take * 4) {
    const sectorIdx = (sectorStart + i * monthStride) % pools.length;
    const sector = pools[sectorIdx];
    if (sector.tickers.length > 0) {
      const tickerIdx = (week + Math.floor(i / pools.length)) % sector.tickers.length;
      const t = sector.tickers[tickerIdx];
      if (!out.includes(t)) out.push(t);
    }
    i++;
  }
  return out;
}

export function getCurrentWatchlist(now: Date = new Date()): string[] {
  const day = dayOfYear(now);
  const week = weekOfYear(now);
  const month = monthOfYear(now);

  const picks = [
    ...ANCHORS,
    ...pickBalanced(LARGE_BY_SECTOR, ROTATION.large, day, week, month),
    ...pickBalanced(MID_BY_SECTOR,   ROTATION.mid,   day, week, month),
    ...pickBalanced(SMALL_BY_SECTOR, ROTATION.small, day, week, month),
  ];
  return [...new Set(picks)];
}

// Backwards-compatibility flat exports — anything that imported these by name
// (tests, manual scripts) keeps working after the sector-tagged refactor.
export const LARGE_POOL: string[] = flattenPools(LARGE_BY_SECTOR);
export const MID_POOL: string[]   = flattenPools(MID_BY_SECTOR);
export const SMALL_POOL: string[] = flattenPools(SMALL_BY_SECTOR);

export const WATCHLIST_TICKERS: string[] = getCurrentWatchlist();
