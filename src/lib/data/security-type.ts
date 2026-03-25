// src/lib/data/security-type.ts
// Security type detection for adaptive prompt branching.
// Tier 1: Yahoo Finance quoteType field (ETF, MUTUALFUND, CRYPTOCURRENCY)
// Tier 2: Company name heuristics (SPAC, ADR, preferred)
// Tier 3: Anthropic web search fallback for SPAC detection (max_uses: 1)
// Non-fatal: any failure returns 'equity' to keep pipeline running.
// Server-only — never import from client components.

import Anthropic from '@anthropic-ai/sdk';
import type { SecurityType } from '@/lib/types';

const client = new Anthropic();
// SDK reads ANTHROPIC_API_KEY from process.env automatically.

function extractTextContent(response: Anthropic.Message): string {
  const textBlock = response.content
    .filter((block) => block.type === 'text')
    .pop();
  return textBlock && textBlock.type === 'text' ? textBlock.text : '';
}

function classifyByQuoteType(quoteType: string | undefined): SecurityType | null {
  if (!quoteType) return null;
  // CRITICAL: quoteType from yahoo-finance2 v3 is uppercase ('ETF', 'EQUITY', etc.)
  // typeDisp is lowercase ('equity') — do NOT confuse these two fields.
  const qt = quoteType.toUpperCase();
  if (qt === 'ETF') return 'etf';
  if (qt === 'MUTUALFUND') return 'etf';        // treat mutual funds like ETFs for prompt purposes
  if (qt === 'CRYPTOCURRENCY') return 'crypto';
  // ADR and preferred are sub-types of EQUITY — quoteType alone cannot distinguish them
  return null;
}

function classifyByName(longName: string | undefined): SecurityType | null {
  if (!longName) return null;
  const lower = longName.toLowerCase();
  if (lower.includes('acquisition') || lower.includes('blank check')) return 'spac';
  if (lower.includes(' adr') || lower.includes('american depositary')) return 'adr';
  if (lower.includes('preferred')) return 'preferred';
  return null;
}

export async function detectSecurityType(
  ticker: string,
  quoteType: string | undefined,
  longName: string | undefined,
): Promise<SecurityType> {
  // Tier 1: quoteType-based classification (no API call)
  const fromQuoteType = classifyByQuoteType(quoteType);
  if (fromQuoteType !== null) return fromQuoteType;

  // Tier 2: Name-based heuristics (no API call)
  const fromName = classifyByName(longName);
  if (fromName !== null) return fromName;

  // Tier 3: News-based SPAC detection (1 Anthropic web search, max_uses: 1)
  // Only fires for EQUITY-typed tickers that passed name-based checks.
  // max_uses: 1 keeps cost low — single search to confirm or deny SPAC status.
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      tools: [{ type: 'web_search_20250305' as const, name: 'web_search', max_uses: 1 }],
      messages: [{
        role: 'user',
        content: `Is ${ticker} a SPAC (Special Purpose Acquisition Company) or blank-check company that has not yet completed its merger? Answer with only "yes" or "no".`,
      }],
    });
    const text = extractTextContent(response).toLowerCase().trim();
    if (text.startsWith('yes')) return 'spac';
  } catch {
    // Detection failure is non-fatal — fall through to default
  }

  // Default: unclassified EQUITY-typed ticker
  return 'equity';
}
