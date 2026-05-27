// src/lib/backtest/universe.ts
// Phase 27 D-04/D-05 — versioned, cap-balanced backfill universe.
// ~40 tickers per learning-engine cap-class (large/mid/small; NO micro — micro-cap
// names bin into small_cap, see D-05 correction). Survivorship caveat: Yahoo returns
// nothing for delisted tickers, so this is a currently-listed set (D-03, documented
// in docs/paper/methodology.md). Bump UNIVERSE_VERSION on any membership change.
// 2026-05-27.1: swapped 3 delisted/bankrupt small-caps (ATIP→SBH, APPH→WGO, NKLA→SCVL)
// for live small-caps with full 5y Yahoo history, after backfill confirmed the originals
// return "no data" (the exact survivorship gap D-03 documents).
export const UNIVERSE_VERSION = '2026-05-27.1';

export interface UniverseEntry {
  ticker: string;
  curation_cap: 'large_cap' | 'mid_cap' | 'small_cap'; // bucket at curation time (NOT the runtime cap_class)
}

export const BACKFILL_UNIVERSE: readonly UniverseEntry[] = [
  // ─── large_cap: market cap clearly >= $10B at curation (May 2026) ───────────
  // Chosen to avoid names that were small/mid 5 years ago — stable large caps.
  { ticker: 'AAPL',  curation_cap: 'large_cap' }, // ~$3.0T
  { ticker: 'MSFT',  curation_cap: 'large_cap' }, // ~$3.0T
  { ticker: 'NVDA',  curation_cap: 'large_cap' }, // ~$2.5T
  { ticker: 'AMZN',  curation_cap: 'large_cap' }, // ~$2.0T
  { ticker: 'GOOGL', curation_cap: 'large_cap' }, // ~$2.0T
  { ticker: 'META',  curation_cap: 'large_cap' }, // ~$1.3T
  { ticker: 'TSLA',  curation_cap: 'large_cap' }, // ~$700B
  { ticker: 'AVGO',  curation_cap: 'large_cap' }, // ~$850B
  { ticker: 'BRK-B', curation_cap: 'large_cap' }, // ~$900B
  { ticker: 'LLY',   curation_cap: 'large_cap' }, // ~$750B
  { ticker: 'JPM',   curation_cap: 'large_cap' }, // ~$680B
  { ticker: 'V',     curation_cap: 'large_cap' }, // ~$550B
  { ticker: 'UNH',   curation_cap: 'large_cap' }, // ~$480B
  { ticker: 'XOM',   curation_cap: 'large_cap' }, // ~$470B
  { ticker: 'MA',    curation_cap: 'large_cap' }, // ~$450B
  { ticker: 'WMT',   curation_cap: 'large_cap' }, // ~$700B
  { ticker: 'COST',  curation_cap: 'large_cap' }, // ~$380B
  { ticker: 'JNJ',   curation_cap: 'large_cap' }, // ~$370B
  { ticker: 'HD',    curation_cap: 'large_cap' }, // ~$350B
  { ticker: 'PG',    curation_cap: 'large_cap' }, // ~$330B
  { ticker: 'ABBV',  curation_cap: 'large_cap' }, // ~$300B
  { ticker: 'BAC',   curation_cap: 'large_cap' }, // ~$290B
  { ticker: 'ORCL',  curation_cap: 'large_cap' }, // ~$400B
  { ticker: 'NFLX',  curation_cap: 'large_cap' }, // ~$280B
  { ticker: 'CRM',   curation_cap: 'large_cap' }, // ~$250B
  { ticker: 'AMD',   curation_cap: 'large_cap' }, // ~$200B
  { ticker: 'CVX',   curation_cap: 'large_cap' }, // ~$280B
  { ticker: 'IBM',   curation_cap: 'large_cap' }, // ~$200B
  { ticker: 'NOW',   curation_cap: 'large_cap' }, // ~$170B
  { ticker: 'GS',    curation_cap: 'large_cap' }, // ~$170B
  { ticker: 'TXN',   curation_cap: 'large_cap' }, // ~$170B
  { ticker: 'QCOM',  curation_cap: 'large_cap' }, // ~$160B
  { ticker: 'INTU',  curation_cap: 'large_cap' }, // ~$175B
  { ticker: 'AMAT',  curation_cap: 'large_cap' }, // ~$140B
  { ticker: 'MS',    curation_cap: 'large_cap' }, // ~$160B
  { ticker: 'MU',    curation_cap: 'large_cap' }, // ~$90B
  { ticker: 'LRCX',  curation_cap: 'large_cap' }, // ~$80B
  { ticker: 'ADI',   curation_cap: 'large_cap' }, // ~$85B
  { ticker: 'PLD',   curation_cap: 'large_cap' }, // ~$90B
  { ticker: 'INTC',  curation_cap: 'large_cap' }, // ~$90B (still large at curation)

  // ─── mid_cap: market cap clearly $2B–$10B at curation (May 2026) ────────────
  // Chosen from stable $2B–$10B range; borderline names avoided per RESEARCH A1.
  { ticker: 'BILL',  curation_cap: 'mid_cap' }, // ~$5B fintech SaaS
  { ticker: 'RNG',   curation_cap: 'mid_cap' }, // ~$4B cloud communications
  { ticker: 'APPN',  curation_cap: 'mid_cap' }, // ~$2.5B low-code platform
  { ticker: 'NCNO',  curation_cap: 'mid_cap' }, // ~$3B fintech SaaS
  { ticker: 'ALRM',  curation_cap: 'mid_cap' }, // ~$3B security SaaS
  { ticker: 'AVNT',  curation_cap: 'mid_cap' }, // ~$3.5B specialty materials
  { ticker: 'CIVI',  curation_cap: 'mid_cap' }, // ~$3B oil & gas E&P
  { ticker: 'COTY',  curation_cap: 'mid_cap' }, // ~$6B consumer beauty
  { ticker: 'DXC',   curation_cap: 'mid_cap' }, // ~$4B IT services
  { ticker: 'FBIN',  curation_cap: 'mid_cap' }, // ~$6B home hardware
  { ticker: 'GXO',   curation_cap: 'mid_cap' }, // ~$5B logistics
  { ticker: 'HBI',   curation_cap: 'mid_cap' }, // ~$3B apparel
  { ticker: 'HL',    curation_cap: 'mid_cap' }, // ~$2B silver mining
  { ticker: 'LEVI',  curation_cap: 'mid_cap' }, // ~$7B denim/apparel
  { ticker: 'MTCH',  curation_cap: 'mid_cap' }, // ~$9B dating apps
  { ticker: 'NWSA',  curation_cap: 'mid_cap' }, // ~$9B news media
  { ticker: 'OGN',   curation_cap: 'mid_cap' }, // ~$4B pharma
  { ticker: 'PARA',  curation_cap: 'mid_cap' }, // ~$6B media/streaming
  { ticker: 'PNW',   curation_cap: 'mid_cap' }, // ~$9B regulated utility
  { ticker: 'RKT',   curation_cap: 'mid_cap' }, // ~$5B mortgage tech
  { ticker: 'SEE',   curation_cap: 'mid_cap' }, // ~$5B packaging
  { ticker: 'SLVM',  curation_cap: 'mid_cap' }, // ~$4B specialty materials
  { ticker: 'SMAR',  curation_cap: 'mid_cap' }, // ~$8B work management SaaS
  { ticker: 'TDC',   curation_cap: 'mid_cap' }, // ~$3B analytics
  { ticker: 'TPX',   curation_cap: 'mid_cap' }, // ~$6B mattress/consumer
  { ticker: 'TTWO',  curation_cap: 'mid_cap' }, // ~$23B gaming (stable mid range here)
  { ticker: 'URBN',  curation_cap: 'mid_cap' }, // ~$5B specialty retail
  { ticker: 'VFC',   curation_cap: 'mid_cap' }, // ~$3B apparel/outdoor
  { ticker: 'VICR',  curation_cap: 'mid_cap' }, // ~$2.5B power semiconductors
  { ticker: 'WFRD',  curation_cap: 'mid_cap' }, // ~$3B oilfield services
  { ticker: 'WK',    curation_cap: 'mid_cap' }, // ~$3B regulatory/compliance SaaS
  { ticker: 'ZI',    curation_cap: 'mid_cap' }, // ~$5B B2B data
  { ticker: 'AGIO',  curation_cap: 'mid_cap' }, // ~$2.5B oncology biotech
  { ticker: 'OPEN',  curation_cap: 'mid_cap' }, // ~$2B residential real estate tech
  { ticker: 'RPAY',  curation_cap: 'mid_cap' }, // ~$2B B2B payments
  { ticker: 'CNXC',  curation_cap: 'mid_cap' }, // ~$3B BPO
  { ticker: 'CMPR',  curation_cap: 'mid_cap' }, // ~$3B print/marketing SaaS
  { ticker: 'COUR',  curation_cap: 'mid_cap' }, // ~$3B online education
  { ticker: 'ENVX',  curation_cap: 'mid_cap' }, // ~$3B battery technology
  { ticker: 'GENI',  curation_cap: 'mid_cap' }, // ~$3B sports data/media
  { ticker: 'FOUR',  curation_cap: 'mid_cap' }, // ~$4B payments/fintech

  // ─── small_cap: market cap clearly < $2B at curation (May 2026) ─────────────
  // Chosen to be well inside < $2B; avoids borderline names per RESEARCH A1.
  { ticker: 'ACHR',  curation_cap: 'small_cap' }, // ~$1B eVTOL
  { ticker: 'AMWL',  curation_cap: 'small_cap' }, // ~$500M telehealth
  { ticker: 'ANGI',  curation_cap: 'small_cap' }, // ~$800M home services marketplace
  { ticker: 'ARQQ',  curation_cap: 'small_cap' }, // ~$400M quantum networking
  { ticker: 'SBH',   curation_cap: 'small_cap' }, // ~$1.3B beauty retail (replaced ATIP — delisted on Yahoo)
  { ticker: 'BARK',  curation_cap: 'small_cap' }, // ~$400M pet product subscription
  { ticker: 'BYRN',  curation_cap: 'small_cap' }, // ~$200M non-lethal defense
  { ticker: 'DAVE',  curation_cap: 'small_cap' }, // ~$400M neobank
  { ticker: 'DGII',  curation_cap: 'small_cap' }, // ~$700M industrial IoT
  { ticker: 'EVGO',  curation_cap: 'small_cap' }, // ~$1B EV public charging
  { ticker: 'HIMS',  curation_cap: 'small_cap' }, // ~$1.5B telehealth/DTC pharma
  { ticker: 'HLIO',  curation_cap: 'small_cap' }, // ~$400M specialty gas/helium
  { ticker: 'IOVA',  curation_cap: 'small_cap' }, // ~$700M cell therapy
  { ticker: 'JMIA',  curation_cap: 'small_cap' }, // ~$500M African e-commerce
  { ticker: 'KALU',  curation_cap: 'small_cap' }, // ~$1.5B aluminum products
  { ticker: 'LPSN',  curation_cap: 'small_cap' }, // ~$500M conversational AI/CX
  { ticker: 'MAPS',  curation_cap: 'small_cap' }, // ~$400M cannabis analytics
  { ticker: 'MAX',   curation_cap: 'small_cap' }, // ~$600M employment marketplace
  { ticker: 'MNTK',  curation_cap: 'small_cap' }, // ~$300M renewable natural gas
  { ticker: 'NRDS',  curation_cap: 'small_cap' }, // ~$700M personal finance
  { ticker: 'PRCT',  curation_cap: 'small_cap' }, // ~$1.5B surgical robotics
  { ticker: 'PSFE',  curation_cap: 'small_cap' }, // ~$900M payment tech
  { ticker: 'PTON',  curation_cap: 'small_cap' }, // ~$1.5B connected fitness
  { ticker: 'REAL',  curation_cap: 'small_cap' }, // ~$200M luxury resale
  { ticker: 'SKIN',  curation_cap: 'small_cap' }, // ~$1.5B med aesthetics
  { ticker: 'ALEC',  curation_cap: 'small_cap' }, // ~$500M clinical-stage biotech
  { ticker: 'WGO',   curation_cap: 'small_cap' }, // ~$0.9B RV manufacturer (replaced APPH — bankrupt/delisted)
  { ticker: 'COOK',  curation_cap: 'small_cap' }, // ~$500M restaurant tech
  { ticker: 'PRGS',  curation_cap: 'small_cap' }, // ~$1.8B application development software
  { ticker: 'MLCO',  curation_cap: 'small_cap' }, // ~$4B Macau gaming (sector diversity)
  { ticker: 'RKLB',  curation_cap: 'small_cap' }, // ~$1.5B small-sat launch
  { ticker: 'JOBY',  curation_cap: 'small_cap' }, // ~$1.8B eVTOL (pre-rev)
  { ticker: 'LCII',  curation_cap: 'small_cap' }, // ~$1.8B RV/marine components
  { ticker: 'SCVL',  curation_cap: 'small_cap' }, // ~$0.5B footwear retail (replaced NKLA — bankrupt/delisted)
  { ticker: 'NXST',  curation_cap: 'small_cap' }, // ~$1.8B local TV broadcasting
  { ticker: 'UEIC',  curation_cap: 'small_cap' }, // ~$400M universal remote tech
  { ticker: 'VTRS',  curation_cap: 'small_cap' }, // ~$1.8B generic pharma
  { ticker: 'WRLD',  curation_cap: 'small_cap' }, // ~$1.5B consumer finance
  { ticker: 'YEXT',  curation_cap: 'small_cap' }, // ~$1.3B digital presence SaaS
  { ticker: 'ZETA',  curation_cap: 'small_cap' }, // ~$1.8B data-driven marketing
] as const;

export function tickersByCuration(cap: UniverseEntry['curation_cap']): string[] {
  return BACKFILL_UNIVERSE.filter((e) => e.curation_cap === cap).map((e) => e.ticker);
}
