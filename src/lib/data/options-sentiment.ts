// src/lib/data/options-sentiment.ts
// yahoo-finance2 options chain put/call ratio.
// Fetches nearest-expiry options chain (default behavior of .options()).
// Returns nulls gracefully for tickers with no options chains.
// VERIFIED: live test on AAPL returned callOI=27885, putOI=12653, ratio=0.454 (bullish).
//
// Note: Uses the yahoo-finance2 default export directly (not as a constructor) so that
// vitest module mocks can replace it cleanly in tests. In production, yahoo-finance2 v3
// exposes a pre-built singleton as its default export.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import yahooFinance from 'yahoo-finance2';

export interface OptionsSentimentResult {
  put_call_ratio: number | null;
  put_call_interpretation: 'bullish' | 'bearish' | 'neutral' | null;
}

export async function fetchOptionsSentiment(ticker: string): Promise<OptionsSentimentResult> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (yahooFinance as any).options(ticker);
    let totalCallOI = 0;
    let totalPutOI = 0;

    for (const chain of result.options ?? []) {
      for (const c of chain.calls ?? []) totalCallOI += c.openInterest ?? 0;
      for (const p of chain.puts ?? []) totalPutOI += p.openInterest ?? 0;
    }

    if (totalCallOI === 0) {
      return { put_call_ratio: null, put_call_interpretation: null };
    }

    const ratio = totalPutOI / totalCallOI;
    // D-11 thresholds: >1.0 = bearish, <0.5 = bullish, 0.5–1.0 = neutral
    const interpretation: 'bullish' | 'bearish' | 'neutral' =
      ratio > 1.0 ? 'bearish' :
      ratio < 0.5 ? 'bullish' :
      'neutral';

    return {
      put_call_ratio: Math.round(ratio * 1000) / 1000, // 3 decimal places
      put_call_interpretation: interpretation,
    };
  } catch {
    // Options unavailable for this ticker (common for small-caps, ETFs, crypto)
    return { put_call_ratio: null, put_call_interpretation: null };
  }
}
