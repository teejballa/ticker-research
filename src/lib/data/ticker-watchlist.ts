// src/lib/data/ticker-watchlist.ts
// Tiered, rotating watchlist for autonomous background sentiment scanning.
//
// The diffusion engine learns which sentiment patterns matter by cap class.
// To learn faster, the watchlist needs three things:
//   1) Coverage of every cap bucket the engine knows about (large/mid/small).
//   2) Continuous re-scanning of a small set of anchors so we always have
//      fresh time series on bellwether names.
//   3) Rotation through a wide pool so the engine sees new patterns over
//      time instead of overfitting to the same 25 tickers forever.
//
// `WATCHLIST_TICKERS` (the export the sentiment-scan cron consumes) is
// computed from `getCurrentWatchlist()` at module load time and rotates
// deterministically based on the day-of-year, so successive cron runs cover
// different slices of the universe without anything random in the loop.

export const ANCHORS: string[] = [
  // Always scanned every cycle — the bellwethers we never want a gap on.
  'AAPL', 'NVDA', 'MSFT', 'SPY', 'QQQ',
];

// Pool of large-cap names ($10B+). Mag-7 + sector leaders + meme-large.
export const LARGE_POOL: string[] = [
  // Mag-7 (the rest)
  'GOOGL', 'AMZN', 'META', 'TSLA',
  // Software / semis
  'AMD', 'AVGO', 'ORCL', 'CRM', 'ADBE', 'CSCO', 'INTC', 'TXN', 'QCOM', 'IBM',
  // Financials
  'JPM', 'BAC', 'GS', 'MS', 'V', 'MA', 'AXP', 'BLK',
  // Healthcare
  'LLY', 'UNH', 'JNJ', 'PFE', 'MRK', 'ABBV', 'TMO',
  // Energy + industrials
  'XOM', 'CVX', 'CAT', 'GE', 'BA', 'RTX', 'LMT',
  // Consumer
  'WMT', 'COST', 'HD', 'KO', 'PEP', 'PG', 'NKE', 'MCD', 'DIS', 'NFLX',
  // Comms
  'T', 'VZ',
  // Meme-large + community-heavy
  'PLTR', 'COIN', 'MSTR', 'SMCI',
];

// Pool of mid-cap names (~$2B-$10B). These migrate over time; classifyCapClass
// at scan time is the source of truth — the bucketing here is just a hint.
export const MID_POOL: string[] = [
  // Community-heavy mid caps
  'SOFI', 'HOOD', 'RBLX', 'SNAP', 'PINS', 'ETSY', 'CHWY', 'AFRM', 'UPST',
  // Software mids
  'DDOG', 'NET', 'OKTA', 'TWLO', 'ZS', 'CFLT', 'MNDY', 'S', 'GTLB', 'BILL',
  // Consumer / specialty retail
  'LULU', 'DECK', 'ANF', 'FIVE', 'CROX', 'BBWI',
  // Crypto-adjacent
  'MARA', 'RIOT', 'CLSK', 'IREN',
  // Other mids
  'IOT', 'U', 'PATH', 'TDOC', 'DKNG', 'PENN', 'WYNN', 'CZR',
];

// Pool of small-cap names (<$2B). Higher noise, but where the engine can find
// niche-leads patterns the mainstream tier never sees.
export const SMALL_POOL: string[] = [
  // AI / quantum micro
  'SOUN', 'BBAI', 'RGTI', 'IONQ', 'QUBT', 'ARQQ',
  // Biotech micro
  'AVDL', 'OCGN', 'IBRX', 'AVTX', 'KPTI', 'NVAX',
  // EV / mobility micro
  'NKLA', 'WKHS', 'FFIE', 'MULN', 'GOEV', 'GP',
  // Spec / meme micro
  'GME', 'AMC', 'BARK', 'FUBO', 'CLOV', 'RDDT',
  // Space / hardware micro
  'ASTS', 'RKLB', 'JOBY', 'ACHR',
  // Other small
  'OPEN', 'LMND', 'ATER',
];

const ROTATION = {
  // Per-cycle pull counts. Each cron run scans 5 anchors + this much else.
  large: 5,
  mid: 5,
  small: 4,
};

// Deterministic rotation using day-of-year. Same day → same slice, so
// repeated cron runs in a single day stay idempotent against the snapshot
// cache, but the slice advances on the next day.
function dayOfYear(d: Date = new Date()): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86_400_000);
}

function rotate<T>(pool: T[], take: number, offset: number): T[] {
  if (pool.length === 0) return [];
  const out: T[] = [];
  for (let i = 0; i < take && i < pool.length; i++) {
    out.push(pool[(offset + i) % pool.length]);
  }
  return out;
}

export function getCurrentWatchlist(now: Date = new Date()): string[] {
  const day = dayOfYear(now);
  // Different stride per pool so the buckets don't all advance in lockstep —
  // the engine sees more pattern combinations across runs.
  const largeOffset = (day * ROTATION.large) % Math.max(1, LARGE_POOL.length);
  const midOffset   = (day * ROTATION.mid)   % Math.max(1, MID_POOL.length);
  const smallOffset = (day * ROTATION.small) % Math.max(1, SMALL_POOL.length);

  const picks = [
    ...ANCHORS,
    ...rotate(LARGE_POOL, ROTATION.large, largeOffset),
    ...rotate(MID_POOL,   ROTATION.mid,   midOffset),
    ...rotate(SMALL_POOL, ROTATION.small, smallOffset),
  ];
  // Dedup while preserving order (an anchor may appear in a pool too).
  return [...new Set(picks)];
}

export const WATCHLIST_TICKERS: string[] = getCurrentWatchlist();
