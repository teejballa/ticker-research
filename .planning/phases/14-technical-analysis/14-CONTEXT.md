# Phase 14 — Technical Analysis Layer

## Goal
Add RSI, MACD, and moving average signals to the research pipeline. Gemini receives
technical context alongside fundamentals, producing a dedicated Technical Assessment
section in the report.

## Motivation
Currently there is zero technical analysis in the pipeline. Institutional research
always includes technical signals. Many traders will not trust a report that ignores
price action, momentum, and trend.

## Planned Approach

### Data
- Extend `src/lib/data/yahoo.ts` to fetch 6-month daily OHLCV (use `yahoo-finance2.chart()`)
- Store in new `ohlcv_history` field on `SourcePackage`

### Computation
- Install `technicalindicators` npm package (MIT, no API dependency)
- Compute in `src/lib/data/technical.ts`:
  - RSI(14) — overbought >70, oversold <30
  - MACD (12/26/9) — signal cross direction
  - SMA(50) and SMA(200) — golden cross / death cross status
  - Current price vs 50-day MA (above = bullish, below = bearish)

### Output
New `technical_analysis` field in `AnalysisResult`:

```typescript
export interface TechnicalAnalysis {
  rsi_14: number | null;
  rsi_signal: 'overbought' | 'neutral' | 'oversold' | null;
  macd_signal: 'bullish_cross' | 'bearish_cross' | 'neutral' | null;
  sma_50: number | null;
  sma_200: number | null;
  golden_cross: boolean | null;
  trend: 'uptrend' | 'downtrend' | 'sideways' | null;
  technical_summary: string;
}
```

### Report UI
New "Technical Signals" section in report: RSI gauge, MACD direction badge, MA status,
trend label.

## Dependencies
- `npm install technicalindicators`
- `@types/technicalindicators` (or manual type declaration)
