// tests/prompts/byte-equality.unit.test.ts
// Plan 20-Z-04 Task 3 precondition — assert that each v1 prompt body, when
// rendered via the registry, is BYTE-IDENTICAL to the legacy inline string in
// the source. This is the structural guarantee that the upcoming migration
// preserves semantics: if `SYSTEM_PROMPT === renderPrompt('gemini-research-brief-system', {})`
// holds, then replacing the inline literal with a renderPrompt() call cannot
// change behavior.

import { describe, it, expect, vi } from 'vitest';

// Mock Prisma (gemini-analysis transitively imports it via engine-context).
vi.mock('@/lib/db', () => ({
  prisma: {
    sentimentSnapshot: { findMany: vi.fn(), create: vi.fn() },
    learnedPattern: { findUnique: vi.fn(), findFirst: vi.fn() },
    logisticEpoch: { findFirst: vi.fn() },
    learningEvent: { findFirst: vi.fn() },
  },
}));

import { renderPrompt } from '@/lib/prompts/render';
import {
  SYSTEM_PROMPT,
  buildEngineContextBlock,
  buildTechnicalContextBlock,
  buildSmartMoneyContextBlock,
  buildUserPrompt,
} from '@/lib/gemini-analysis';
import { renderCitationsSection } from '@/lib/research-brief';
import type { EngineContext } from '@/lib/engine-context';

// Legacy reference implementation of buildUserPrompt — copied verbatim from
// gemini-analysis.ts at git revision 6464235 (pre-Task-3 migration). Used to
// assert that the refactored buildUserPrompt yields byte-identical output.
function buildUserPromptLegacy(
  brief: string,
  newsUrls: string[],
  communityContent: string,
  sentimentIntelligence?: {
    stocktwits_bull_pct: number | null;
    stocktwits_bear_pct: number | null;
    stocktwits_message_count: number | null;
    stocktwits_is_trending: boolean | null;
    put_call_ratio?: number | null;
    put_call_interpretation?: 'bullish' | 'bearish' | 'neutral' | null;
  },
  communityHighlights?: import('@/lib/types').CommunityHighlight[],
  newsItems?: import('@/lib/types').NewsItem[],
): string {
  let prompt = brief + '\n\n';
  if (newsItems && newsItems.length > 0) {
    prompt += '=== NEWS SOURCES ===\n';
    for (const item of newsItems.slice(0, 15)) {
      prompt += `[${item.published_date}] ${item.headline} (${item.source})\n`;
      prompt += `  URL: ${item.url}\n`;
    }
    prompt += '\n';
  } else if (newsUrls.length > 0) {
    prompt += '=== NEWS SOURCES ===\n';
    prompt += newsUrls.map(url => `- ${url}`).join('\n');
    prompt += '\n\n';
  }
  if (communityContent) {
    prompt += '=== COMMUNITY SENTIMENT ===\n';
    prompt += communityContent;
    prompt += '\n\n';
  }
  if (sentimentIntelligence) {
    const si = sentimentIntelligence;
    prompt += '=== SENTIMENT INTELLIGENCE ===\n';
    prompt += `StockTwits Bullish: ${si.stocktwits_bull_pct != null ? si.stocktwits_bull_pct + '%' : 'N/A'}\n`;
    prompt += `StockTwits Bearish: ${si.stocktwits_bear_pct != null ? si.stocktwits_bear_pct + '%' : 'N/A'}\n`;
    prompt += `StockTwits Messages: ${si.stocktwits_message_count ?? 'N/A'}\n`;
    prompt += `StockTwits Trending: ${si.stocktwits_is_trending != null ? si.stocktwits_is_trending : 'N/A'}\n`;
    prompt += `Options Put/Call Ratio: ${si.put_call_ratio != null ? si.put_call_ratio.toFixed(3) : 'N/A'}\n`;
    prompt += `Options Interpretation: ${si.put_call_interpretation ?? 'N/A'}\n`;
    prompt += '\n';
  }
  if (communityHighlights && communityHighlights.length > 0) {
    prompt += `\n\n=== COMMUNITY INTELLIGENCE ===\n`;
    prompt += `Structured findings extracted from ${communityHighlights.length} community source${communityHighlights.length !== 1 ? 's' : ''}:\n\n`;
    for (const h of communityHighlights) {
      prompt += `Community: ${h.community_name} (${h.community_type}, audience: ${h.audience})\n`;
      prompt += `Sentiment: ${h.sentiment} | Engagement: ${h.engagement_signal}\n`;
      prompt += `Primary theme: ${h.theme}\n`;
      if (h.quotes && h.quotes.length > 0) {
        prompt += `Direct user quotes (verbatim):\n`;
        h.quotes.forEach(q => { prompt += `  - "${q}"\n`; });
      } else {
        prompt += `Standout quote: "${h.standout_quote}"\n`;
      }
      if (h.recurring_themes && h.recurring_themes.length > 0) {
        prompt += `Recurring themes (mentioned by multiple users): ${h.recurring_themes.join('; ')}\n`;
      }
      if (h.unique_to_community && h.unique_to_community.length > 0) {
        prompt += `Unique to this community (not in mainstream financial news): ${h.unique_to_community.join('; ')}\n`;
      }
      prompt += '\n';
    }
  }
  prompt += 'Analyze the ticker based on all research data above. Return the structured analysis.';
  return prompt;
}

function buildEngineCtx(overrides: Partial<EngineContext> = {}): EngineContext {
  return {
    cycle_count: 42,
    flow_pattern: 'symmetric_warm',
    cap_class: 'large',
    posterior_mean: 0.62,
    ci_low: 0.55,
    ci_high: 0.69,
    sample_size: 25,
    status: 'ACTIVE',
    logistic_score: 0.58,
    logistic_ci_low: 0.50,
    logistic_ci_high: 0.66,
    logistic_sample_size: 100,
    brier_in_sample: 0.22,
    brier_null: 0.25,
    drift_z: 0.5,
    trace_window_size: 12,
    predicted_at: new Date('2026-05-11T00:00:00Z'),
    diffusion_sparkline: [0.5, 0.55, 0.6, 0.62],
    technical_pattern: 'oversold_bullish',
    technical_posterior_mean: 0.65,
    technical_ci: [0.58, 0.72],
    technical_sample_size: 50,
    technical_status: 'ACTIVE',
    combined_logistic_score: 0.6,
    agreement: 'ALIGNED',
    horizon_calibrations: [
      { horizon_days: 7, sample_size: 30, diffusion_posterior: 0.6, diffusion_ci: [0.5, 0.7], technical_posterior: 0.62, technical_ci: [0.55, 0.7], institutional_posterior: 0.7, institutional_ci: [0.6, 0.8], insider_posterior: 0.65, insider_ci: [0.55, 0.75], status: 'ACTIVE' },
      { horizon_days: 14, sample_size: 28, diffusion_posterior: 0.58, diffusion_ci: [0.5, 0.66], technical_posterior: 0.6, technical_ci: [0.55, 0.65], institutional_posterior: 0.68, institutional_ci: [0.6, 0.76], insider_posterior: 0.62, insider_ci: [0.55, 0.7], status: 'ACTIVE' },
      { horizon_days: 30, sample_size: 25, diffusion_posterior: 0.62, diffusion_ci: [0.55, 0.69], technical_posterior: 0.65, technical_ci: [0.58, 0.72], institutional_posterior: 0.7, institutional_ci: [0.62, 0.78], insider_posterior: 0.65, insider_ci: [0.55, 0.75], status: 'ACTIVE' },
    ],
    institutional_pattern: 'net_accumulation',
    institutional_posterior_mean: 0.7,
    institutional_ci: [0.62, 0.78],
    institutional_sample_size: 30,
    institutional_status: 'ACTIVE',
    institutional_data_age_days: 25,
    insider_pattern: 'cluster_buying',
    insider_posterior_mean: 0.65,
    insider_ci: [0.55, 0.75],
    insider_sample_size: 18,
    insider_status: 'ACTIVE',
    insider_data_age_days: 12,
    ...overrides,
  } as EngineContext;
}

describe('byte-equality — registry render matches legacy inline string', () => {
  it('renderPrompt("gemini-research-brief-system", {}) === SYSTEM_PROMPT', () => {
    const rendered = renderPrompt('gemini-research-brief-system', {});
    expect(rendered).toBe(SYSTEM_PROMPT);
  });

  it('renderPrompt cycle-summary template (substituted) matches the cron/learn inline literal shape', () => {
    const stats = { outcomes_processed: 12, hits: 5, drift_alerts: 2, cells_active: 17 };
    const rendered = renderPrompt('gemini-cycle-summary', {
      outcomes_processed: String(stats.outcomes_processed),
      hits: String(stats.hits),
      drift_alerts: String(stats.drift_alerts),
      cells_active: String(stats.cells_active),
    });
    const legacy = `Write a single-sentence research-log entry summarizing today's diffusion engine cycle. Do not use bullet points. Stats: ${stats.outcomes_processed} new outcomes resolved across all horizons, ${stats.hits} were hits (>1% excess vs SPY), ${stats.drift_alerts} drift alerts triggered, ${stats.cells_active} pattern cells currently ACTIVE. Keep under 30 words. Plain text, no quotes.`;
    expect(rendered).toBe(legacy);
  });

  it('renderPrompt cove-pass1-instruction v1 matches the legacy inline concatenated string', () => {
    const legacy =
      '\n=== CHAIN-OF-VERIFICATION (Pass 1) ===\n' +
      'In addition to your structured analysis, emit a `verification_claims` ' +
      'array of EXACTLY 3 short, factual, checkable claims drawn from your ' +
      'analysis. Each claim must be a single sentence (≤30 words) that can ' +
      'be verified directly against the research data above. Examples of ' +
      'good claims: "Q1 revenue grew >10% YoY" or "Analyst consensus is ' +
      'Buy with target of $X". Avoid speculative or directional claims ' +
      'like "stock will outperform". These claims will be NLI-verified ' +
      'against the SourcePackage as a hallucination check.\n';
    expect(renderPrompt('gemini-cove-pass1-instruction', {}, 'v1')).toBe(legacy);
  });

  it('renderCitationsSection byte-identical to legacy lines.join("\\n") form', () => {
    // Legacy reference: lines = [
    //   '=== CITATIONS ===',
    //   'Available citations (N). You MUST select... DO NOT invent URLs that are not in this list.',
    //   '',
    //   JSON.stringify(payload, null, 2),
    //   '',
    // ]; return lines.join('\n');
    const citations = [
      { source: 'news' as const, url: 'https://reuters.com/a', confidence: 0.9, date_retrieved: '2026-05-10T00:00:00Z' },
      { source: 'social' as const, url: 'https://finance.yahoo.com/b', confidence: 0.8, date_retrieved: '2026-05-09T00:00:00Z' },
    ] as Parameters<typeof renderCitationsSection>[0];
    const payload = citations.map((c) => ({
      source: c.source,
      url: c.url,
      confidence: c.confidence,
      date_retrieved: c.date_retrieved,
    }));
    const legacyLines: string[] = [
      '=== CITATIONS ===',
      `Available citations (${citations.length}). You MUST select WHICH of these support each claim by populating citations_v2 on your output. DO NOT invent URLs that are not in this list.`,
      '',
      JSON.stringify(payload, null, 2),
      '',
    ];
    const legacy = legacyLines.join('\n');
    expect(renderCitationsSection(citations)).toBe(legacy);
  });

  it('renderCitationsSection returns "" on empty input — refactor preserves', () => {
    expect(renderCitationsSection([])).toBe('');
  });

  it('buildEngineContextBlock(ACTIVE) currently contains the canonical header — locks pre-migration shape', () => {
    const block = buildEngineContextBlock(buildEngineCtx());
    expect(block).toContain('═══ ENGINE CALIBRATION CONTEXT ═══');
    expect(block).toContain('symmetric_warm');
    expect(block).toContain('large');
    expect(block).toContain('n=25');
  });

  it('buildEngineContextBlock(NO_DATA) currently contains the canonical no-data sentence', () => {
    const block = buildEngineContextBlock({ ...buildEngineCtx(), status: 'NO_DATA' });
    expect(block).toContain('═══ ENGINE CALIBRATION CONTEXT ═══');
    expect(block).toContain('no historical data');
    expect(block).toContain('cycle 42');
  });

  it('buildTechnicalContextBlock currently contains the canonical header', () => {
    const block = buildTechnicalContextBlock(buildEngineCtx());
    expect(block).toContain('═══ TECHNICAL CALIBRATION CONTEXT ═══');
    expect(block).toContain('oversold_bullish');
    expect(block).toContain('Combined 12-d logistic');
  });

  it('buildSmartMoneyContextBlock currently contains the canonical header', () => {
    const block = buildSmartMoneyContextBlock(buildEngineCtx());
    expect(block).toContain('═══ SMART MONEY CALIBRATION CONTEXT ═══');
    expect(block).toContain('net_accumulation');
    expect(block).toContain('cluster_buying');
    expect(block).toContain('N-WAY AGREEMENT: ALIGNED');
  });

  // ── buildUserPrompt byte-equality across 6 combinatoric scenarios ──────
  // The legacy reference impl above is a verbatim copy of pre-Task-3 logic.
  // The refactored buildUserPrompt composes via renderPrompt(...). The two
  // MUST yield byte-identical output for every input shape.

  const sampleNewsUrls = ['https://reuters.com/a', 'https://wsj.com/b'];
  const sampleNewsItems: import('@/lib/types').NewsItem[] = [
    { published_date: '2026-05-10', headline: 'Q1 beat', source: 'Reuters', url: 'https://reuters.com/a' },
    { published_date: '2026-05-09', headline: 'Upgrade to Buy', source: 'WSJ', url: 'https://wsj.com/b' },
  ];
  const sampleSI = {
    stocktwits_bull_pct: 67,
    stocktwits_bear_pct: 23,
    stocktwits_message_count: 412,
    stocktwits_is_trending: true,
    put_call_ratio: 0.823,
    put_call_interpretation: 'bullish' as const,
  };
  const sampleHL: import('@/lib/types').CommunityHighlight[] = [
    {
      community_name: 'r/investing',
      community_type: 'mainstream',
      audience: 'retail',
      standout_quote: 'Earnings looked solid',
      sentiment: 'bullish',
      engagement_signal: 'high',
      theme: 'Q1 beat',
      quotes: ['Solid quarter', 'Margins expanding'],
      recurring_themes: ['margin expansion', 'guidance raise'],
      unique_to_community: ['CEO twitter activity'],
    },
  ];

  const scenarios: Array<{ name: string; args: Parameters<typeof buildUserPrompt> }> = [
    { name: 'minimal — brief only', args: ['BRIEF', [], ''] },
    { name: 'newsUrls only (no newsItems)', args: ['BRIEF', sampleNewsUrls, ''] },
    { name: 'newsItems present (overrides newsUrls)', args: ['BRIEF', sampleNewsUrls, '', undefined, undefined, sampleNewsItems] },
    { name: 'communityContent present', args: ['BRIEF', [], 'COMMUNITY_RAW'] },
    { name: 'sentimentIntelligence present', args: ['BRIEF', [], '', sampleSI] },
    { name: 'communityHighlights present', args: ['BRIEF', [], '', undefined, sampleHL] },
    { name: 'ALL sections present', args: ['BRIEF', sampleNewsUrls, 'COMMUNITY_RAW', sampleSI, sampleHL, sampleNewsItems] },
  ];

  for (const sc of scenarios) {
    it(`buildUserPrompt — byte-identical refactor — scenario: ${sc.name}`, () => {
      const refactored = buildUserPrompt(...sc.args);
      const legacy = buildUserPromptLegacy(...sc.args);
      expect(refactored).toBe(legacy);
    });
  }

  // ── Context-block byte-equality against pre-Task-3 inline references ───
  // Legacy reference implementations copied verbatim from git revision 6464235.

  function buildEngineContextBlockLegacy(ctx: EngineContext): string {
    if (ctx.status === 'NO_DATA') {
      return `

═══ ENGINE CALIBRATION CONTEXT ═══

The Cipher learning engine has no historical data for this ticker's
current diffusion regime yet (status: NO_DATA, cycle ${ctx.cycle_count}).
Your qualitative read is the only signal. In the engine_calibration
object, set engine_alignment to null and write engine_disagreement
explaining that the engine has no prior to defer to (≤300 chars).
`;
    }
    const pct = (n: number | null) => (n != null ? (n * 100).toFixed(0) + '%' : '—');
    const fix = (n: number | null) => (n != null ? n.toFixed(2) : '—');
    return `

═══ ENGINE CALIBRATION CONTEXT ═══

Cipher's self-supervised learning engine has accumulated ${ctx.cycle_count}
cycles of evidence about how sentiment-diffusion patterns predict 7-day
returns vs SPY (excess > +1%). For this ticker right now:

  Pattern detected:    ${ctx.flow_pattern} × ${ctx.cap_class}
  Engine prior:        ${pct(ctx.posterior_mean)} [CI ${pct(ctx.ci_low)}–${pct(ctx.ci_high)}]
                       n=${ctx.sample_size}, status: ${ctx.status}
  Logistic score:      ${pct(ctx.logistic_score)} [CI ${pct(ctx.logistic_ci_low)}–${pct(ctx.logistic_ci_high)}]
                       (engine has trained on ${ctx.logistic_sample_size} resolved outcomes)
  Adversarial null:    real Brier ${fix(ctx.brier_in_sample)}
                       null Brier ${fix(ctx.brier_null)}
  Concept drift:       z = ${ctx.drift_z.toFixed(2)} (>2σ = drifting)

INSTRUCTIONS for engine_calibration:
1. Treat these numbers as CALIBRATED PRIORS. Do not invent numbers; the
   numeric fields will be overwritten post-generation regardless of what
   you output.
2. In engine_alignment (string, ≤300 chars):
   - If the engine prior is HIGH (>60%) and your qualitative read is bullish,
     OR the engine prior is LOW (<40%) and your read is bearish: write a
     single sentence affirming alignment, naming the pattern, and noting
     the sample size.
   - Otherwise, leave engine_alignment as null.
3. In engine_disagreement (string, ≤500 chars):
   - If your qualitative read CONTRADICTS a high-confidence prior
     (sample_size ≥ 10 AND status = ACTIVE), write a single paragraph
     explaining specifically WHY you disagree. Cite specific community
     evidence that overrides the prior.
   - If status is DEPRECATED (drift detected), explicitly note that the
     pattern has drifted and you are NOT deferring to the historical prior.
   - Otherwise, leave engine_disagreement as null.
4. Your investment_thesis, key_risks, and confidence_level MUST be
   consistent with the engine prior unless you have explicitly populated
   engine_disagreement above.
5. If status is EXPLORATORY (n < 10), treat the prior as weak and weight
   your qualitative read more heavily.
`;
  }

  function buildTechnicalContextBlockLegacy(ctx: EngineContext): string {
    if (!ctx.horizon_calibrations || ctx.horizon_calibrations.length === 0) {
      return '';
    }
    const pct = (n: number | null): string => (n == null ? '—' : `${(n * 100).toFixed(0)}%`);
    const horizonRows = ctx.horizon_calibrations
      .filter((h) => h.horizon_days !== 3)
      .map((h) => {
        const marker = h.horizon_days === 30 ? '★' : ' ';
        const label30 = h.horizon_days === 30 ? '  ← primary, drives logistic' : '';
        return `    ${h.horizon_days}d${marker}  diffusion ${pct(h.diffusion_posterior).padEnd(4)}  technical ${pct(h.technical_posterior).padEnd(4)}  ${h.status}${label30}`;
      })
      .join('\n');
    const techCi = ctx.technical_ci
      ? `[CI ${pct(ctx.technical_ci[0])}–${pct(ctx.technical_ci[1])}]`
      : '';
    return `

═══ TECHNICAL CALIBRATION CONTEXT ═══

Cipher's technical learning engine has accumulated ${ctx.technical_sample_size ?? 0} resolved 30d outcomes
for technical regimes (RSI/MACD/MA/ATR/volume → 8 buckets × 4 cap classes).
For this ticker right now:

  Technical pattern detected:    ${ctx.technical_pattern ?? '—'} × ${ctx.cap_class}
  Technical prior (30d):         ${pct(ctx.technical_posterior_mean ?? null)} ${techCi}
                                 n=${ctx.technical_sample_size ?? 0}, status: ${ctx.technical_status ?? 'NO_DATA'}
  Horizon table (Beta cells):
${horizonRows}
  Combined 12-d logistic (30d): ${pct(ctx.combined_logistic_score ?? null)}
  Agreement (Q1 vs Q2):  ${ctx.agreement ?? 'unknown'}

INSTRUCTIONS:
- 30d is the primary horizon. Your future_projection MUST mention 30d.
- Cite at least one technical pattern by name in your buy_rationale or sell_rationale.
- For technical_alignment / technical_disagreement: same rules as engine_alignment/disagreement
  but applied to the technical_posterior. Numeric values will be overwritten post-generation.
`;
  }

  function buildSmartMoneyContextBlockLegacy(ctx: EngineContext): string {
    const hasInstitutional = ctx.institutional_status !== 'NO_DATA' || ctx.institutional_pattern != null;
    const hasInsider        = ctx.insider_status !== 'NO_DATA'        || ctx.insider_pattern != null;
    if (!hasInstitutional && !hasInsider) return '';
    const pct = (n: number | null | undefined): string => (n != null ? `${(n * 100).toFixed(0)}%` : '—');
    const ci  = (c: [number, number] | null | undefined): string =>
      c ? `[CI ${pct(c[0])}–${pct(c[1])}]` : '';
    const row30 = ctx.horizon_calibrations?.find(h => h.horizon_days === 30);
    return `

═══ SMART MONEY CALIBRATION CONTEXT ═══

INSTITUTIONAL PATTERN: ${ctx.institutional_pattern ?? 'NO PATTERN'} × ${ctx.cap_class}
  Posterior:      ${pct(ctx.institutional_posterior_mean)} ${ci(ctx.institutional_ci)}
  Sample size:    n=${ctx.institutional_sample_size ?? 0}
  Status:         ${ctx.institutional_status ?? 'NO_DATA'}
  Data age:       ${ctx.institutional_data_age_days != null ? `${ctx.institutional_data_age_days} days since latest 13F` : 'unknown'}

INSIDER PATTERN: ${ctx.insider_pattern ?? 'NO PATTERN'} × ${ctx.cap_class}
  Posterior:      ${pct(ctx.insider_posterior_mean)} ${ci(ctx.insider_ci)}
  Sample size:    n=${ctx.insider_sample_size ?? 0}
  Status:         ${ctx.insider_status ?? 'NO_DATA'}
  Data age:       ${ctx.insider_data_age_days != null ? `${ctx.insider_data_age_days} days since latest Form 4` : 'unknown'}

4-CLASS HORIZON TABLE AT 30d:
  Diffusion:     ${pct(row30?.diffusion_posterior)} ${ci(row30?.diffusion_ci)}
  Technical:     ${pct(row30?.technical_posterior)} ${ci(row30?.technical_ci)}
  Institutional: ${pct(row30?.institutional_posterior)} ${ci(row30?.institutional_ci)}
  Insider:       ${pct(row30?.insider_posterior)} ${ci(row30?.insider_ci)}

N-WAY AGREEMENT: ${ctx.agreement?.toUpperCase() ?? 'UNKNOWN'}

INSTRUCTIONS for institutional/insider fields (D-04 trust boundary):
- When the institutional or insider class shows status=ACTIVE at 30d, your buy_rationale or sell_rationale MUST cite the calibrating bucket by its exact name (one of: cluster_buying, lone_buy, ceo_buy, cfo_buy, director_buy, cluster_selling, planned_sell_10b5_1, lone_sell, net_accumulation, net_distribution, new_initiation, complete_exit, smart_money_concentration, smart_money_dispersion, contrarian_inflow, contrarian_outflow). Do not paraphrase the bucket name.
- You may write 4 prose strings under engine_calibration: institutional_alignment, institutional_disagreement, insider_alignment, insider_disagreement. These are the ONLY institutional/insider fields you may populate. All numeric and categorical fields under engine_calibration are written by the engine and any value you supply for them will be discarded.
`;
  }

  it('buildEngineContextBlock(NO_DATA) byte-identical refactor', () => {
    const ctx = { ...buildEngineCtx(), status: 'NO_DATA' as const };
    expect(buildEngineContextBlock(ctx)).toBe(buildEngineContextBlockLegacy(ctx));
  });

  it('buildEngineContextBlock(ACTIVE) byte-identical refactor', () => {
    const ctx = buildEngineCtx();
    expect(buildEngineContextBlock(ctx)).toBe(buildEngineContextBlockLegacy(ctx));
  });

  it('buildEngineContextBlock with all numeric fields null byte-identical', () => {
    const ctx = buildEngineCtx({
      status: 'EXPLORATORY',
      posterior_mean: null,
      ci_low: null,
      ci_high: null,
      logistic_score: null,
      logistic_ci_low: null,
      logistic_ci_high: null,
      brier_in_sample: null,
      brier_null: null,
    });
    expect(buildEngineContextBlock(ctx)).toBe(buildEngineContextBlockLegacy(ctx));
  });

  it('buildTechnicalContextBlock byte-identical refactor (ACTIVE)', () => {
    const ctx = buildEngineCtx();
    expect(buildTechnicalContextBlock(ctx)).toBe(buildTechnicalContextBlockLegacy(ctx));
  });

  it('buildTechnicalContextBlock byte-identical refactor (empty horizon_calibrations)', () => {
    const ctx = { ...buildEngineCtx(), horizon_calibrations: [] };
    expect(buildTechnicalContextBlock(ctx)).toBe(buildTechnicalContextBlockLegacy(ctx));
  });

  it('buildTechnicalContextBlock with null fields + 3d horizon (filtered)', () => {
    const ctx = buildEngineCtx({
      technical_pattern: null,
      technical_posterior_mean: null,
      technical_ci: null,
      // technical_sample_size is `number` not nullable per EngineContext; the
      // pre-Task-3 code uses `?? 0` defensively — feed 0 here directly.
      technical_sample_size: 0,
      technical_status: 'NO_DATA',
      combined_logistic_score: null,
      agreement: 'unknown',
      horizon_calibrations: [
        { horizon_days: 3, sample_size: 5, diffusion_posterior: 0.5, diffusion_ci: [0.4, 0.6], technical_posterior: null, technical_ci: null, institutional_posterior: null, institutional_ci: null, insider_posterior: null, insider_ci: null, status: 'EXPLORATORY' },
        { horizon_days: 7, sample_size: 12, diffusion_posterior: 0.6, diffusion_ci: [0.5, 0.7], technical_posterior: 0.62, technical_ci: [0.55, 0.7], institutional_posterior: null, institutional_ci: null, insider_posterior: null, insider_ci: null, status: 'ACTIVE' },
        { horizon_days: 30, sample_size: 0, diffusion_posterior: null, diffusion_ci: null, technical_posterior: null, technical_ci: null, institutional_posterior: null, institutional_ci: null, insider_posterior: null, insider_ci: null, status: 'NO_DATA' },
      ],
    });
    expect(buildTechnicalContextBlock(ctx)).toBe(buildTechnicalContextBlockLegacy(ctx));
  });

  it('buildSmartMoneyContextBlock byte-identical refactor (full data)', () => {
    const ctx = buildEngineCtx();
    expect(buildSmartMoneyContextBlock(ctx)).toBe(buildSmartMoneyContextBlockLegacy(ctx));
  });

  it('buildSmartMoneyContextBlock byte-identical refactor (institutional only)', () => {
    const ctx = buildEngineCtx({
      insider_status: 'NO_DATA',
      insider_pattern: null,
    });
    expect(buildSmartMoneyContextBlock(ctx)).toBe(buildSmartMoneyContextBlockLegacy(ctx));
  });

  it('buildSmartMoneyContextBlock byte-identical refactor (insider only, agreement undefined)', () => {
    const ctx = buildEngineCtx({
      institutional_status: 'NO_DATA',
      institutional_pattern: null,
      agreement: undefined as unknown as EngineContext['agreement'],
    });
    expect(buildSmartMoneyContextBlock(ctx)).toBe(buildSmartMoneyContextBlockLegacy(ctx));
  });

  it('buildSmartMoneyContextBlock both NO_DATA → empty string (refactor preserves)', () => {
    const ctx = buildEngineCtx({
      institutional_status: 'NO_DATA',
      institutional_pattern: null,
      insider_status: 'NO_DATA',
      insider_pattern: null,
    });
    expect(buildSmartMoneyContextBlock(ctx)).toBe('');
    expect(buildSmartMoneyContextBlockLegacy(ctx)).toBe('');
  });
});
