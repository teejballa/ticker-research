# Phase 15 — Institutional & Insider Intelligence

## Goal
Add insider transaction data (SEC Form 4), short interest, and institutional ownership
percentage to the research pipeline and report.

## Motivation
These are the signals that separate retail research from institutional research.
A report without short interest, insider activity, and institutional ownership is
missing critical context that every Wall Street desk checks.

## Planned Approach

### Insider Transactions (SEC EDGAR — free, no auth)
- SEC EDGAR full-text search API: `https://efts.sec.gov/LATEST/search-index?q=%22{ticker}%22&dateRange=custom&startdt={90daysago}&forms=4`
- Parse Form 4 filings: purchase/sale/disposition, shares, price, insider name/title
- New file: `src/lib/data/sec-insider.ts`
- Surface: last 5 transactions, net buy/sell bias over 90 days

### Short Interest (Finviz scrape via Firecrawl)
- Firecrawl scrape: `https://finviz.com/quote.ashx?t={ticker}`
- Extract: Short Float %, Short Ratio (days to cover), institutional ownership %
- New file: `src/lib/data/finviz.ts`
- Requires Firecrawl API key (already available)

### New SourcePackage section

```typescript
export interface InstitutionalDataSection extends SourceSection {
  short_float_pct: number | null;
  short_ratio: number | null;
  institutional_ownership_pct: number | null;
  insider_transactions: InsiderTransaction[];
  insider_net_bias: 'buying' | 'selling' | 'neutral' | null;
}

export interface InsiderTransaction {
  insider_name: string;
  title: string;
  transaction_type: 'purchase' | 'sale' | 'disposition';
  shares: number;
  price: number | null;
  date: string;
}
```

### Report UI
New "Institutional Intelligence" section in report:
- Short float % with color-coded badge (>20% = high short interest = bearish signal)
- Institutional ownership % bar
- Insider activity timeline (last 5 transactions)

## Dependencies
- Firecrawl API key (already available)
- SEC EDGAR full-text search (free, no key required)
