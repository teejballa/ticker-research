// src/lib/data/ticker-watchlist.ts
// Curated tickers for autonomous background sentiment scanning.
export const WATCHLIST_TICKERS: string[] = [
  // Mega-cap
  'AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA',
  // High community signal
  'AMD', 'PLTR', 'SOFI', 'HOOD', 'COIN', 'RBLX', 'SNAP',
  // Sector leaders
  'JPM', 'BAC', 'XOM', 'LLY', 'UNH',
  // High volatility / speculative
  'GME', 'AMC', 'MSTR', 'SMCI',
  // Index proxies
  'SPY', 'QQQ', 'IWM',
];
