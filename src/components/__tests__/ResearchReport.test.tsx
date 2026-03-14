// src/components/__tests__/ResearchReport.test.tsx
// Wave 0 test stubs for the ResearchReport component.
// These stubs verify module export shape at runtime — they fail with "module not found"
// until ResearchReport.tsx is created in Plan 02 (Wave 1).
// Pattern matches established Wave 0 approach in this project.

import { describe, it, expect } from 'vitest';

describe('ResearchReport', () => {
  it('renders without crashing given valid AnalysisResult', async () => {
    const mod = await import('../ResearchReport');
    expect(mod.default ?? (mod as Record<string, unknown>).ResearchReport).toBeDefined();
  });

  it('handleDownloadPDF sets document.title to TICKER-YYYY-MM-DD format', async () => {
    const mod = await import('../ResearchReport');
    expect(mod.default ?? (mod as Record<string, unknown>).ResearchReport).toBeDefined();
  });

  it('renders sections in order: Ticker Overview, Market Sentiment, Bullish, Bearish, Assessment, Confidence, Sources', async () => {
    const mod = await import('../ResearchReport');
    expect(mod.default ?? (mod as Record<string, unknown>).ResearchReport).toBeDefined();
  });

  it('renders disclaimer text containing not financial advice', async () => {
    const mod = await import('../ResearchReport');
    expect(mod.default ?? (mod as Record<string, unknown>).ResearchReport).toBeDefined();
  });

  it('renders all sources_used entries in Sources section', async () => {
    const mod = await import('../ResearchReport');
    expect(mod.default ?? (mod as Record<string, unknown>).ResearchReport).toBeDefined();
  });

  it('shows source_warnings note when source_warnings array is non-empty', async () => {
    const mod = await import('../ResearchReport');
    expect(mod.default ?? (mod as Record<string, unknown>).ResearchReport).toBeDefined();
  });
});
