// src/lib/sentiment/ticker-metadata.ts
//
// Plan 20-C-06 — Ticker metadata cache with 30-day TTL + Yahoo refresh.
//
// Why a JSON manifest and not a Ticker Prisma table?
// (Documented in 20-C-06-PLAN.md universal_preamble Scope rationale.)
//   1. The codebase has NO Ticker model today (grep prisma/schema.prisma).
//      Adding one purely for this audit forces a migration outside scope.
//   2. The audit runs monthly + on-retrain — refresh cost is negligible.
//   3. Yahoo Finance is already a primary data source (src/lib/data/yahoo.ts);
//      no new external dependency or telemetry surface.
//   4. The manifest is small (≤10KB even at 1000 tickers).
//
// On cache hit (entry < 30 days old): returns cached entry. On miss/stale:
// fetches fresh fields from yahoo-finance2 (wrapped in withTelemetry per S6),
// writes back to data/ticker-metadata.json atomically (tempfile + rename),
// then returns. On Yahoo failure: returns stale cache if present (degraded
// mode); otherwise returns an 'Unknown'-stuffed shell + logs a warning.
//
// PIT discipline (S2): writes `fetched_at`, never claims an upstream listing-
// date-revision date.
//
// References:
//   • CLAUDE.md "Data Collection Layer" — yahoo-finance2 is primary.
//   • src/lib/data/yahoo.ts — existing instantiation + withTelemetry pattern.

import * as fs from 'node:fs';
import * as path from 'node:path';
import YahooFinance from 'yahoo-finance2';

import { withTelemetry } from '@/lib/telemetry/withTelemetry';
import type {
  CapClass,
  GICSSector,
  TickerMetadata,
} from './fairness-types';
import { GICS_SECTORS } from './fairness-types';

// Reuse yahoo-finance2 pattern from src/lib/data/yahoo.ts (single instance).
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const CACHE_FILE = path.resolve(process.cwd(), 'data/ticker-metadata.json');
const CACHE_TTL_DAYS = 30;
const CACHE_TTL_MS = CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;

// Cap-class thresholds — mirrors the diffusion-engine convention (src/lib/
// learning.ts). Mega: $200B+; large: $10B–$200B; mid: $2B–$10B;
// small: $300M–$2B; micro: < $300M.
const MEGA_CAP_USD = 200_000_000_000;
const LARGE_CAP_USD = 10_000_000_000;
const MID_CAP_USD = 2_000_000_000;
const SMALL_CAP_USD = 300_000_000;

export function deriveCapClass(marketCapUsd: number | null | undefined): CapClass {
  if (marketCapUsd == null || !Number.isFinite(marketCapUsd) || marketCapUsd <= 0) {
    return 'micro'; // unknown → conservative
  }
  if (marketCapUsd >= MEGA_CAP_USD) return 'mega';
  if (marketCapUsd >= LARGE_CAP_USD) return 'large';
  if (marketCapUsd >= MID_CAP_USD) return 'mid';
  if (marketCapUsd >= SMALL_CAP_USD) return 'small';
  return 'micro';
}

// Yahoo's sector strings map mostly 1:1 to GICS-1 with minor renames.
// Unmapped → 'Unknown' (tracked under separate bucket, excluded from headline).
const YAHOO_SECTOR_TO_GICS: Record<string, GICSSector> = {
  Energy: 'Energy',
  Materials: 'Materials',
  'Basic Materials': 'Materials',
  Industrials: 'Industrials',
  'Consumer Cyclical': 'Consumer Discretionary',
  'Consumer Discretionary': 'Consumer Discretionary',
  'Consumer Defensive': 'Consumer Staples',
  'Consumer Staples': 'Consumer Staples',
  Healthcare: 'Health Care',
  'Health Care': 'Health Care',
  'Financial Services': 'Financials',
  Financials: 'Financials',
  Technology: 'Information Technology',
  'Information Technology': 'Information Technology',
  'Communication Services': 'Communication Services',
  Utilities: 'Utilities',
  'Real Estate': 'Real Estate',
};

export function mapYahooSector(yahooSector: string | null | undefined): GICSSector | 'Unknown' {
  if (!yahooSector) return 'Unknown';
  const trimmed = yahooSector.trim();
  const mapped = YAHOO_SECTOR_TO_GICS[trimmed];
  if (mapped) return mapped;
  // Direct match against the literal 11-sector union (just in case).
  if ((GICS_SECTORS as readonly string[]).includes(trimmed)) {
    return trimmed as GICSSector;
  }
  return 'Unknown';
}

interface JsonCacheEntry {
  cap_class: CapClass;
  sector: GICSSector | 'Unknown';
  country: string | 'Unknown';
  listing_date: string | null; // ISO
  fetched_at: string; // ISO
}
type JsonCache = Record<string, JsonCacheEntry>;

function readCache(): JsonCache {
  try {
    if (!fs.existsSync(CACHE_FILE)) return {};
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    return JSON.parse(raw) as JsonCache;
  } catch (e) {
    console.warn('[ticker-metadata] cache read failed', { error: String(e) });
    return {};
  }
}

function writeCache(cache: JsonCache): void {
  // Atomic write: write to tempfile, then rename. Prevents corruption mid-run.
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${CACHE_FILE}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2) + '\n', 'utf-8');
    fs.renameSync(tmp, CACHE_FILE);
  } catch (e) {
    console.warn('[ticker-metadata] cache write failed', { error: String(e) });
  }
}

function entryToMetadata(entry: JsonCacheEntry): TickerMetadata {
  return {
    cap_class: entry.cap_class,
    sector: entry.sector,
    country: entry.country,
    listing_date: entry.listing_date ? new Date(entry.listing_date) : null,
    fetched_at: new Date(entry.fetched_at),
  };
}

function metadataToEntry(meta: TickerMetadata): JsonCacheEntry {
  return {
    cap_class: meta.cap_class,
    sector: meta.sector,
    country: meta.country,
    listing_date: meta.listing_date ? meta.listing_date.toISOString() : null,
    fetched_at: meta.fetched_at.toISOString(),
  };
}

function isStale(entry: JsonCacheEntry, now: Date = new Date()): boolean {
  const fetched = new Date(entry.fetched_at).getTime();
  return now.getTime() - fetched > CACHE_TTL_MS;
}

async function fetchFromYahoo(ticker: string): Promise<TickerMetadata | null> {
  try {
    const result = await withTelemetry(
      'yahoo',
      () =>
        yahooFinance.quoteSummary(ticker, {
          modules: ['assetProfile', 'price', 'summaryDetail'],
        }),
      { ticker },
    );
    // assetProfile fields
    const assetProfile = (result?.assetProfile ?? {}) as Record<string, unknown>;
    const country = (assetProfile.country as string | undefined) ?? 'Unknown';
    const sector = mapYahooSector(assetProfile.sector as string | undefined);
    // market cap
    const marketCap = ((result?.price as Record<string, unknown> | undefined)
      ?.marketCap as number | undefined) ?? null;
    const cap_class = deriveCapClass(marketCap);
    // listing date — yahoo exposes firstTradeDateEpochUtc on summaryDetail
    const firstTrade = (result?.summaryDetail as Record<string, unknown> | undefined)
      ?.firstTradeDateEpochUtc as Date | number | undefined;
    let listing_date: Date | null = null;
    if (firstTrade instanceof Date) listing_date = firstTrade;
    else if (typeof firstTrade === 'number') listing_date = new Date(firstTrade * 1000);
    return {
      cap_class,
      sector,
      country,
      listing_date,
      fetched_at: new Date(),
    };
  } catch (e) {
    console.warn('[ticker-metadata] yahoo fetch failed', {
      ticker,
      error: String(e),
    });
    return null;
  }
}

/**
 * Returns ticker metadata for stratification. Cache-first with 30-day TTL.
 * On stale/miss, fetches from yahoo-finance2 and writes back atomically.
 * On Yahoo failure: returns stale entry if any, otherwise an Unknown shell.
 */
export async function getTickerMetadata(ticker: string): Promise<TickerMetadata> {
  const cache = readCache();
  const cached = cache[ticker];
  const now = new Date();
  if (cached && !isStale(cached, now)) {
    return entryToMetadata(cached);
  }
  // Cache miss or stale — try Yahoo.
  const fresh = await fetchFromYahoo(ticker);
  if (fresh) {
    cache[ticker] = metadataToEntry(fresh);
    writeCache(cache);
    return fresh;
  }
  // Yahoo failed — degraded mode.
  if (cached) {
    console.warn('[ticker-metadata] degraded mode, returning stale entry', { ticker });
    return entryToMetadata(cached);
  }
  // No cache, no Yahoo — Unknown shell.
  return {
    cap_class: 'micro',
    sector: 'Unknown',
    country: 'Unknown',
    listing_date: null,
    fetched_at: now,
  };
}

/** Test helper: returns the cache filename (for fixtures). */
export function _cacheFilePathForTests(): string {
  return CACHE_FILE;
}
