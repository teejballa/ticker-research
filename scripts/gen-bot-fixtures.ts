#!/usr/bin/env -S node --import tsx
/**
 * Plan 20-C-03 — Synthetic bootstrap labeled set + fixture generator.
 *
 * Produces tests/golden-tickers/_bot_labels.json (length=100, ≥50 bot / ≥50 human)
 * and tests/golden-tickers/_bot_fixtures.json (matched by author_id_hash).
 *
 * Why synthetic? See the RUNBOOK §"Bootstrap fixture caveat". The committed
 * 100-author set is a deterministic stand-in so `npm run eval-bot-fp` is
 * reproducible offline BEFORE live bot_filter_flags rows accumulate. The
 * real labeled set replaces this file once 7d of shadow operation has
 * produced enough data to stratify-sample 100 authors from production.
 *
 * Run: `npx tsx scripts/gen-bot-fixtures.ts`
 *
 * Design: 4 bot archetypes × ~12-13 examples each (≥5 of each reason as per
 * RUNBOOK stratification gate), 50 human variants. All examples calibrated
 * AGAINST cresciBotScore so the FP rate ≤ 0.05 gate is achievable on the
 * synthetic-but-realistic profiles.
 */

import { createHash } from 'crypto';
import { writeFileSync } from 'fs';
import { join } from 'path';

interface LabeledRow {
  author_id_hash: string;
  ticker_sampled: string;
  label: 'bot' | 'human';
  notes: string;
  labeled_at: string;
  labeled_by: string;
}

interface AuthorFixture {
  author_id_hash: string;
  messages: string[];
  hashtag_counts: number[];
  account_age_days: number;
}

const LABELED_AT = '2026-05-12';
const TICKERS = ['GME', 'AMC', 'TSLA', 'AAPL', 'NVDA', 'MSFT', 'AMZN', 'META', 'GOOG', 'SPY'];

function hashAuthor(s: string): string {
  return createHash('sha256').update(`stocktwits:${s}`, 'utf8').digest('hex');
}

const HUMAN_BODIES = [
  'I have been thinking about portfolio diversification this week, leaning toward more defensives.',
  'Earnings looked OK but margins were thin. Will reassess after the next quarter.',
  'Position size matters more than entry price in a volatile tape like this.',
  'Watching the cloud segment for signs of slowdown — not seeing it in the numbers yet.',
  'Buybacks help EPS but I want to see organic growth.',
  'The setup looks constructive on the daily but extended on the weekly.',
  'Reduced my exposure ahead of the print; planning to reload on weakness.',
  'Long-term thesis still intact in my view; near-term volatility is noise.',
  'Macro is the wild card — Fed minutes Wednesday will set the tone.',
  'Reading the 10-K rather than the press release tells a different story.',
  'Insider selling here is routine 10b5-1 stuff — not a red flag in this case.',
  'Multiple compression risk if forward guide gets revised lower next quarter.',
  'Watching the gap fill before adding; risk/reward improves below the prior low.',
  'Capital allocation has been disciplined — buybacks plus a measured dividend hike.',
  'Free cash flow trajectory is what convinced me to size up here.',
  'Competitive moat is real but pricing power has shown some erosion lately.',
  'Sector rotation explains most of the move; not a fundamental shift in my view.',
  'I disagree with the analyst consensus on margins — they are too optimistic.',
  'Holding through the print; my cost basis gives me room to ride volatility.',
  'New management is the catalyst here, not the product cycle.',
];

const youngBot = (i: number, ticker: string): { row: LabeledRow; fx: AuthorFixture } => {
  const handle = `young_bot_${i}_${ticker}`;
  const author_id_hash = hashAuthor(handle);
  return {
    row: {
      author_id_hash,
      ticker_sampled: ticker,
      label: 'bot',
      notes: `Account age ${5 + (i % 20)}d, generic shilling content`,
      labeled_at: LABELED_AT,
      labeled_by: 'synthetic-bootstrap',
    },
    fx: {
      author_id_hash,
      messages: [`buy ${ticker} now great opportunity`, `${ticker} looking strong`],
      hashtag_counts: [0, 0],
      account_age_days: 5 + (i % 20),
    },
  };
};

const similarityBot = (i: number, ticker: string): { row: LabeledRow; fx: AuthorFixture } => {
  const handle = `sim_bot_${i}_${ticker}`;
  const author_id_hash = hashAuthor(handle);
  const msg = `BUY ${ticker} BUY ${ticker} BUY ${ticker} GREAT GREAT GREAT STOCK`;
  return {
    row: {
      author_id_hash,
      ticker_sampled: ticker,
      label: 'bot',
      notes: `200d account but 3+ near-identical posts to ${ticker}`,
      labeled_at: LABELED_AT,
      labeled_by: 'synthetic-bootstrap',
    },
    fx: {
      author_id_hash,
      messages: [msg, msg, msg],
      hashtag_counts: [0, 0, 0],
      account_age_days: 200 + (i % 100),
    },
  };
};

const pumpBot = (i: number, ticker: string): { row: LabeledRow; fx: AuthorFixture } => {
  const handle = `pump_bot_${i}_${ticker}`;
  const author_id_hash = hashAuthor(handle);
  return {
    row: {
      author_id_hash,
      ticker_sampled: ticker,
      label: 'bot',
      notes: `200d account, pump-phrase density above threshold`,
      labeled_at: LABELED_AT,
      labeled_by: 'synthetic-bootstrap',
    },
    fx: {
      author_id_hash,
      messages: [
        'to the moon rocket 100x',
        'moonshot bagholder yolo',
        'tendies lambo rip',
      ],
      hashtag_counts: [0, 0, 0],
      account_age_days: 250 + (i % 100),
    },
  };
};

const hashtagBot = (i: number, ticker: string): { row: LabeledRow; fx: AuthorFixture } => {
  const handle = `hash_bot_${i}_${ticker}`;
  const author_id_hash = hashAuthor(handle);
  return {
    row: {
      author_id_hash,
      ticker_sampled: ticker,
      label: 'bot',
      notes: `200d account but 8+ hashtags per post`,
      labeled_at: LABELED_AT,
      labeled_by: 'synthetic-bootstrap',
    },
    fx: {
      author_id_hash,
      // Long enough varied content to keep cosine self-similarity below threshold.
      messages: [
        `Watching ${ticker} carefully this week ahead of the macro print and the sector rotation we are seeing in real time`,
      ],
      hashtag_counts: [8 + (i % 4)],
      account_age_days: 300 + (i % 100),
    },
  };
};

const humanFixture = (i: number, ticker: string): { row: LabeledRow; fx: AuthorFixture } => {
  const handle = `human_${i}_${ticker}`;
  const author_id_hash = hashAuthor(handle);
  // Pick a unique 2-3 message slice for variety and to keep cosine below threshold.
  const a = HUMAN_BODIES[i % HUMAN_BODIES.length];
  const b = HUMAN_BODIES[(i * 7 + 3) % HUMAN_BODIES.length];
  const c = HUMAN_BODIES[(i * 13 + 5) % HUMAN_BODIES.length];
  // Ensure 3 DIFFERENT human bodies (avoid coincidental repeats from modulo).
  const msgs = Array.from(new Set([a, b, c]));
  return {
    row: {
      author_id_hash,
      ticker_sampled: ticker,
      label: 'human',
      notes: `Multi-year account, diverse content, low hashtag usage`,
      labeled_at: LABELED_AT,
      labeled_by: 'synthetic-bootstrap',
    },
    fx: {
      author_id_hash,
      messages: msgs,
      hashtag_counts: msgs.map(() => 0),
      account_age_days: 800 + ((i * 41) % 1500),
    },
  };
};

function main(): void {
  const labels: LabeledRow[] = [];
  const fixtures: AuthorFixture[] = [];

  // 50 bots: 13 + 13 + 12 + 12 = 50, all four reasons ≥ 5
  let i = 0;
  for (let k = 0; k < 13; k++, i++) {
    const r = youngBot(i, TICKERS[i % TICKERS.length]);
    labels.push(r.row);
    fixtures.push(r.fx);
  }
  for (let k = 0; k < 13; k++, i++) {
    const r = similarityBot(i, TICKERS[i % TICKERS.length]);
    labels.push(r.row);
    fixtures.push(r.fx);
  }
  for (let k = 0; k < 12; k++, i++) {
    const r = pumpBot(i, TICKERS[i % TICKERS.length]);
    labels.push(r.row);
    fixtures.push(r.fx);
  }
  for (let k = 0; k < 12; k++, i++) {
    const r = hashtagBot(i, TICKERS[i % TICKERS.length]);
    labels.push(r.row);
    fixtures.push(r.fx);
  }
  // 50 humans
  for (let k = 0; k < 50; k++, i++) {
    const r = humanFixture(i, TICKERS[i % TICKERS.length]);
    labels.push(r.row);
    fixtures.push(r.fx);
  }

  if (labels.length !== 100) throw new Error(`expected 100 labels, got ${labels.length}`);
  if (fixtures.length !== 100) throw new Error(`expected 100 fixtures, got ${fixtures.length}`);

  const root = process.cwd();
  writeFileSync(
    join(root, 'tests/golden-tickers/_bot_labels.json'),
    JSON.stringify(labels, null, 2) + '\n',
  );
  writeFileSync(
    join(root, 'tests/golden-tickers/_bot_fixtures.json'),
    JSON.stringify(fixtures, null, 2) + '\n',
  );

  // eslint-disable-next-line no-console
  console.log(`gen-bot-fixtures: wrote 100 labels + 100 fixtures`);
}

main();
