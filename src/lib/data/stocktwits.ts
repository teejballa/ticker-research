// src/lib/data/stocktwits.ts
// StockTwits public API wrapper — bull/bear sentiment from recent messages.
// API: GET https://api.stocktwits.com/api/2/streams/symbol/{TICKER}.json
// No auth required (public endpoint). Rate limits unspecified — treat as best-effort.
// VERIFIED: live API test against GME (2026-04-18) — entities.sentiment per-message,
//           no is_trending flag, symbol.sentiment_change used as proxy.

// Response types (verified from live API):
interface StockTwitsMessage {
  id: number;
  body: string;
  created_at: string;
  entities?: {
    sentiment: { basic: 'Bullish' | 'Bearish' } | null;
  };
}

interface StockTwitsResponse {
  response: { status: number };
  symbol?: {
    symbol: string;
    sentiment_change?: number; // float delta — proxy for trending intensity (no is_trending flag)
  };
  messages?: StockTwitsMessage[];
}

export interface StockTwitsResult {
  collected_at: string;
  stocktwits_bull_pct: number | null;
  stocktwits_bear_pct: number | null;
  stocktwits_message_count: number | null;
  stocktwits_is_trending: boolean | null;
  error?: string;
}

export async function fetchStockTwitsSentiment(ticker: string): Promise<StockTwitsResult> {
  const collected_at = new Date().toISOString();
  const empty = (error?: string): StockTwitsResult => ({
    collected_at,
    stocktwits_bull_pct: null,
    stocktwits_bear_pct: null,
    stocktwits_message_count: null,
    stocktwits_is_trending: null,
    ...(error ? { error } : {}),
  });

  try {
    const res = await fetch(
      `https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(ticker)}.json`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return empty(`StockTwits API error: ${res.status} ${res.statusText}`);

    const data = await res.json() as StockTwitsResponse;
    const messages = data.messages ?? [];

    // Compute bull/bear from per-message sentiment labels (not aggregate).
    // Returns null (not 0) when no messages are labeled — null signals "no data".
    const labeled = messages.filter(m => m.entities?.sentiment != null);
    const bullish = labeled.filter(m => m.entities!.sentiment!.basic === 'Bullish').length;
    const total = labeled.length;

    const bull_pct = total > 0 ? Math.round((bullish / total) * 100) : null;
    const bear_pct = total > 0 ? 100 - bull_pct! : null;

    // is_trending: no API flag — derive from sentiment_change magnitude
    const sentiment_change = data.symbol?.sentiment_change ?? 0;
    const is_trending = Math.abs(sentiment_change) > 0.5;

    return {
      collected_at,
      stocktwits_bull_pct: bull_pct,
      stocktwits_bear_pct: bear_pct,
      stocktwits_message_count: messages.length,
      stocktwits_is_trending: is_trending,
    };
  } catch {
    return empty('StockTwits fetch failed');
  }
}
