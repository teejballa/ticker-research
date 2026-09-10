'use client';

// src/app/demo/page.tsx
// Fake report preview for reviewing simplified language changes.
// Not linked in nav — visit /demo directly. Safe to delete after review.

import ResearchReport from '@/components/ResearchReport';
import type { AnalysisResult } from '@/lib/types';

const DEMO_REPORT: AnalysisResult = {
  ticker: 'NVDA',
  company_name: 'NVIDIA Corporation',
  analyzed_at: new Date().toISOString(),
  security_type: 'equity',
  market_sentiment: 'bullish',
  sentiment_reasoning:
    'NVIDIA continues to dominate the AI accelerator market with its H100 and upcoming Blackwell GPU architectures. **Strong earnings beats** for the past three consecutive quarters and record data center revenue signal robust institutional demand. Analyst consensus remains heavily tilted bullish with price target upgrades across major banks following guidance raises.',
  bullish_signals: [
    {
      signal: '**Data center revenue** hit a new all-time high of $22.6B last quarter, up 427% year-over-year, driven entirely by AI infrastructure demand.',
      source_citation: 'NVIDIA Q3 2025 Earnings Release',
    },
    {
      signal: '**Blackwell GPU architecture** is sampling ahead of schedule and seeing massive pre-orders from hyperscalers including Microsoft, Google, and Amazon.',
      source_citation: 'Reuters, Nov 2024',
    },
    {
      signal: '**Gross margins expanded** to 74.6%, well above the industry average, reflecting pricing power in a supply-constrained market.',
      source_citation: 'NVIDIA Q3 2025 10-Q',
    },
    {
      signal: '**Insider buying** from two senior VPs in October signals management confidence ahead of the Blackwell ramp.',
      source_citation: 'SEC Form 4, Oct 2024',
    },
  ],
  bearish_signals: [
    {
      signal: '**Export restrictions** on advanced AI chips to China could remove up to 20% of total addressable market if expanded.',
      source_citation: 'Bloomberg, Oct 2024',
    },
    {
      signal: '**Valuation stretched** at 35x forward sales — any guidance miss could trigger a sharp multiple compression.',
      source_citation: 'FactSet consensus, Nov 2024',
    },
    {
      signal: '**AMD MI300X** is gaining traction at Microsoft and Meta, representing the first credible competitive threat in the data center GPU market.',
      source_citation: 'The Information, Nov 2024',
    },
  ],
  assessment: {
    buy_pct: 72,
    hold_pct: 20,
    sell_pct: 8,
    buy_rationale:
      'The AI infrastructure buildout shows no signs of slowing and NVIDIA holds a dominant supply position through at least 2026 given its CUDA ecosystem moat.',
    hold_rationale:
      'Valuation leaves little room for error. Investors already in the stock may wait for a pullback before adding.',
    sell_rationale:
      'Export risk and competitive pressure from AMD represent tail risks that could compress multiples if either accelerates.',
  },
  confidence_level: 'High',
  confidence_explanation:
    'Strong fundamental data from multiple independent sources, confirmed by both technical and institutional signals pointing in the same direction.',
  price_target: '$165–$185 (12-month consensus)',
  executive_summary:
    'NVIDIA is the defining infrastructure stock of the AI era. Its CUDA software moat, supply chain control, and Blackwell roadmap give it a multi-year competitive advantage that competitors cannot replicate quickly. The primary risk is macro — if AI capex slows, multiples would compress sharply from current levels.',
  business_description:
    'NVIDIA designs GPUs and system-on-chip units for gaming, data centers, automotive, and AI workloads. Its data center segment now accounts for over 80% of revenue and is growing at triple-digit rates year-over-year.',
  financial_analysis:
    'Revenue grew 122% YoY to $35.1B. Operating income margin expanded to 62%. Free cash flow generation is exceptional at $16.8B TTM. Debt is minimal relative to cash position of $34B.',
  competitive_landscape:
    'NVIDIA holds approximately 85% of the AI training GPU market. AMD is the nearest competitor with ~10% share. Intel Gaudi remains niche. The CUDA ecosystem creates high switching costs for existing customers.',
  investment_thesis:
    'AI infrastructure spending is secular, not cyclical. NVIDIA is the primary picks-and-shovels beneficiary with pricing power, margins, and a software moat no competitor has matched.',
  key_risks:
    'Export controls, valuation multiples, and a potential AI spending slowdown are the three key risks. Any of these alone could drive significant multiple compression.',
  valuation_context:
    'Trading at 35x forward sales vs. historical average of 12x. Premium is justified by growth, but leaves no room for misses.',
  catalyst_watch: [
    { event: 'Blackwell GPU mass production ramp', timing: 'Q1 2025', impact: 'positive' },
    { event: 'CES 2025 announcements', timing: 'January 2025', impact: 'positive' },
    { event: 'US export control policy update', timing: 'Q1 2025', impact: 'negative' },
    { event: 'AMD MI400 announcement', timing: 'Mid-2025', impact: 'negative' },
  ],
  future_projection:
    'Over the next 12 months, NVIDIA is positioned to grow revenue another 80–100% if Blackwell ramps as guided. The key watch point is data center capex from hyperscalers — any slowdown there would be the first real headwind the company has faced in three years.',
  sources_used: [
    { name: 'NVIDIA Q3 2025 Earnings Release', key_fact: 'Data center revenue $22.6B, +427% YoY' },
    { name: 'SEC Form 4 — VP Purchases Oct 2024', key_fact: 'Two insider buys totaling $4.2M' },
    { name: 'FactSet Consensus Estimates', key_fact: '45 buy ratings, 5 hold, 0 sell' },
    { name: 'Reuters — Blackwell Ramp Update', key_fact: 'Production ahead of schedule' },
    { name: 'Bloomberg — Export Controls', key_fact: 'China restrictions under review' },
    { name: 'The Information — AMD Update', key_fact: 'MI300X wins at Microsoft, Meta' },
  ],
  source_warnings: [],
  market_snapshot: {
    price: 148.88,
    percent_change_today: 2.14,
    market_cap: 3_650_000_000_000,
    fifty_two_week_high: 152.89,
    fifty_two_week_low: 47.32,
    pe_ratio: 54.2,
    eps: 2.75,
    revenue: 96_000_000_000,
    field_sources: {
      price: 'yahoo',
      percent_change_today: 'yahoo',
      market_cap: 'yahoo',
      fifty_two_week_high: 'yahoo',
      fifty_two_week_low: 'yahoo',
      pe_ratio: 'yahoo',
      eps: 'yahoo',
      revenue: 'yahoo',
    },
  },
  sentiment_intelligence: {
    stocktwits_bull_pct: 78,
    stocktwits_bear_pct: 22,
    stocktwits_message_count: 1842,
    stocktwits_is_trending: true,
    put_call_ratio: 0.68,
    put_call_interpretation: 'bullish',
    aggregated_bull_pct: 74,
    aggregated_bear_pct: 26,
    sentiment_source_count: 3,
    sentiment_components: [
      { source: 'stocktwits', bullish_pct: 78, weight: 1.0, raw_mention_count: 1842 },
      { source: 'swaggystocks', bullish_pct: 71, weight: 0.9, raw_mention_count: 312 },
      { source: 'apewisdom', bullish_pct: 69, weight: 0.85, raw_mention_count: 487 },
    ],
    crowded_consensus: false,
    crowded_consensus_mode: 'off',
  },
  community_highlights: [
    {
      community_name: 'r/investing',
      community_type: 'middle',
      sentiment: 'bullish',
      audience: 'Long-term retail investors',
      theme: 'AI infrastructure',
      engagement_signal: 'high',
      standout_quote: 'The CUDA moat is so deep at this point — AMD would need a 10-year head start to catch up on the software side.',
      analysis_paragraph:
        "The community is overwhelmingly bullish on NVIDIA's long-term thesis. The dominant thread is that Blackwell will create a multi-year upgrade supercycle across hyperscalers. Several commenters with apparent industry knowledge highlighted that the CUDA moat is underappreciated by mainstream analysts.",
      unique_to_community: [
        'Detailed discussion of CUDA switching costs vs AMD ROCm',
        "Multiple threads comparing NVDA's position to INTC in 2012",
      ],
    },
    {
      community_name: 'r/WallStreetBets',
      community_type: 'mainstream',
      sentiment: 'bullish',
      audience: 'Short-term retail traders',
      theme: 'momentum and options flow',
      engagement_signal: 'high',
      standout_quote: "Jensen is printing money, every dip is a gift. $200 by February.",
      analysis_paragraph:
        "Heavily options-focused community is bullish on near-term momentum into the Blackwell ramp. Call options dominate the discussion. The prevailing sentiment is that any dip is a buying opportunity given the AI capex tailwind.",
      unique_to_community: [
        'Aggressive call options discussion on Jan 2025 expiries',
        'Meme-ified Blackwell launch hype',
      ],
    },
    {
      community_name: 'SemiAnalysis Discord',
      community_type: 'niche',
      sentiment: 'bullish',
      audience: 'Semiconductor engineers and analysts',
      theme: 'technical architecture',
      engagement_signal: 'medium',
      standout_quote: "NVLink bandwidth is a full generation ahead of Infinity Fabric at scale — that's not closing in two years.",
      analysis_paragraph:
        "The most technically rigorous community analyzed Blackwell's interconnect architecture and NVLink superiority. The consensus is that AMD's Infinity Fabric cannot match NVLink at scale for transformer training workloads — a 2–3 year technical lead that fundamentally protects NVIDIA's pricing.",
      unique_to_community: [
        'NVLink vs Infinity Fabric bandwidth comparison at scale',
        'Detailed HBM3e supply chain analysis',
        'CoWoS packaging bottleneck discussion',
      ],
    },
  ],
  community_sources_scraped: 3,
  engine_calibration: {
    cycle_count: 47,
    flow_pattern: 'niche_leads',
    cap_class: 'large_cap',
    trace_window_size: 90,
    posterior_mean: 0.71,
    ci_low: 0.63,
    ci_high: 0.79,
    sample_size: 89,
    effective_sample_size: 72,
    status: 'ACTIVE',
    brier_in_sample: 0.18,
    brier_null: 0.26,
    drift_z: 0.42,
    logistic_score: 0.68,
    logistic_ci_low: 0.61,
    logistic_ci_high: 0.75,
    logistic_sample_size: 89,
    logistic_ess: 70,
    predicted_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    engine_alignment:
      "The niche-leads diffusion pattern on a large-cap stock has historically preceded strong 30-day outperformance. The engine's prior aligns with the bullish read — specialist communities are ahead of mainstream sentiment, which is the pattern that most reliably precedes price action.",
    engine_disagreement: null,
    diffusion_sparkline: [
      { niche: 3, middle: 1, mainstream: 0, scanned_at: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString() },
      { niche: 5, middle: 2, mainstream: 1, scanned_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString() },
      { niche: 8, middle: 4, mainstream: 2, scanned_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() },
      { niche: 11, middle: 7, mainstream: 5, scanned_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() },
    ],
    technical_pattern: 'breakout_uptrend',
    technical_posterior_mean: 0.64,
    technical_ci: [0.55, 0.73],
    technical_sample_size: 54,
    technical_ess: 48,
    technical_status: 'ACTIVE',
    technical_alignment:
      "The breakout-uptrend chart pattern on large-cap stocks has beaten the sector ETF in 64% of historical cases. The current setup — clean break above the 52-week high with volume confirmation — matches the engine's highest-conviction technical bucket.",
    technical_disagreement: null,
    combined_logistic_score: 0.72,
    agreement: 'aligned',
    horizon_calibrations: [
      { horizon_days: 7, diffusion_posterior: 0.68, diffusion_ci: [0.59, 0.77], technical_posterior: 0.61, technical_ci: [0.51, 0.71], institutional_posterior: 0.66, institutional_ci: [0.54, 0.78], insider_posterior: 0.73, insider_ci: [0.60, 0.86], sample_size: 89, effective_sample_size: 72, status: 'ACTIVE' },
      { horizon_days: 14, diffusion_posterior: 0.69, diffusion_ci: [0.61, 0.77], technical_posterior: 0.62, technical_ci: [0.52, 0.72], institutional_posterior: 0.67, institutional_ci: [0.55, 0.79], insider_posterior: 0.71, insider_ci: [0.58, 0.84], sample_size: 89, effective_sample_size: 72, status: 'ACTIVE' },
      { horizon_days: 30, diffusion_posterior: 0.71, diffusion_ci: [0.63, 0.79], technical_posterior: 0.64, technical_ci: [0.55, 0.73], institutional_posterior: 0.69, institutional_ci: [0.57, 0.81], insider_posterior: 0.74, insider_ci: [0.62, 0.86], sample_size: 89, effective_sample_size: 72, status: 'ACTIVE' },
      { horizon_days: 60, diffusion_posterior: 0.67, diffusion_ci: [0.58, 0.76], technical_posterior: 0.60, technical_ci: [0.49, 0.71], institutional_posterior: 0.65, institutional_ci: [0.52, 0.78], insider_posterior: 0.68, insider_ci: [0.54, 0.82], sample_size: 67, effective_sample_size: 54, status: 'ACTIVE' },
      { horizon_days: 90, diffusion_posterior: 0.63, diffusion_ci: [0.53, 0.73], technical_posterior: 0.58, technical_ci: [0.46, 0.70], institutional_posterior: 0.61, institutional_ci: [0.48, 0.74], insider_posterior: 0.64, insider_ci: [0.50, 0.78], sample_size: 52, effective_sample_size: 41, status: 'EXPLORATORY' },
    ],
    institutional_pattern: 'net_accumulation',
    institutional_posterior_mean: 0.69,
    institutional_ci: [0.57, 0.81],
    institutional_sample_size: 38,
    institutional_ess: 34,
    institutional_status: 'ACTIVE',
    institutional_alignment:
      "Net accumulation by large funds on a large-cap stock historically precedes 30-day outperformance in 69% of cases. The consistent quarterly 13F buying trend across multiple fund categories reinforces the bullish read.",
    institutional_disagreement: null,
    insider_pattern: 'cluster_buying',
    insider_posterior_mean: 0.74,
    insider_ci: [0.62, 0.86],
    insider_sample_size: 28,
    insider_ess: 24,
    insider_status: 'ACTIVE',
    insider_alignment:
      "Cluster buying by multiple insiders on a large-cap stock has preceded 30-day outperformance in 74% of cases historically. The October VP purchases align with the highest-conviction insider bucket in the engine.",
    insider_disagreement: null,
    conformal_low: 0.61,
    conformal_high: 0.81,
    primary_sector_etf: 'SOXX',
    primary_sector_etf_is_current: false,
    spy_alpha_hit_rate: 0.68,
    engine_signal_strength: 'strong_buy',
    source_mix: {
      regime: 'bull-low-vol',
      top_sources: [
        { source_id: 'news_analyst', weight: 0.38, weight_unconditional: 0.28, weight_drift_30d: [0.25, 0.28, 0.33, 0.38], drift_direction: 'rising', delta_pp_30d: 10, is_cold_start_fallback: false },
        { source_id: 'options_term_structure', weight: 0.27, weight_unconditional: 0.22, weight_drift_30d: [0.20, 0.22, 0.24, 0.27], drift_direction: 'rising', delta_pp_30d: 5, is_cold_start_fallback: false },
        { source_id: 'stocktwits', weight: 0.18, weight_unconditional: 0.20, weight_drift_30d: [0.21, 0.20, 0.19, 0.18], drift_direction: 'falling', delta_pp_30d: -2, is_cold_start_fallback: false },
      ],
    },
  },
  institutional_at_report: {
    institutional_bucket: 'net_accumulation',
    total_institutional_share: 8_420_000_000,
    total_institutional_share_prev: 8_220_000_000,
    net_share_change: 14_200_000,
    net_share_change_pct: 0.017,
    fund_count_current: 142,
    fund_count_prev: 128,
    fund_count_delta: 14,
    top10_concentration_pct: 0.41,
    top10_concentration_pct_prev: 0.39,
    ticker_30d_return_pct: 12.4,
    spy_30d_return_pct: 3.1,
    report_date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    filing_date: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    data_age_days: 45,
    computed_at: new Date().toISOString(),
    data_source: 'finnhub',
  },
  insider_at_report: {
    insider_bucket: 'cluster_buying',
    distinct_buyers: 3,
    distinct_sellers: 0,
    net_buy_share_count: 28_000,
    net_sell_share_count: 0,
    buy_value_usd: 4_200_000,
    sell_value_usd: 0,
    has_ceo_buy: false,
    has_cfo_buy: false,
    has_director_buy: true,
    is_planned_10b5_1: false,
    filings_count: 3,
    earliest_filing_date: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
    latest_filing_date: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString(),
    data_age_days: 18,
    computed_at: new Date().toISOString(),
    data_source: 'finnhub',
    insider_sentiment_mspr: 0.82,
  },
};

export default function DemoPage() {
  return <ResearchReport analysisResult={DEMO_REPORT} ticker="NVDA" />;
}
