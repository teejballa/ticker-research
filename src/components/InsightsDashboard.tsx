'use client';

import { useEffect, useState } from 'react';

interface InsightsData {
  total_data_points: number;
  watchlist_size?: number;
  resolved_outcomes: number;
  thesis: {
    statement: string;
    high_gap_resolved: number;
    pct: number | null;
    top_cell: {
      signal: string;
      pattern: string;
      cap: string;
      horizon: number;
      mean: number;
      n: number;
      hits: number;
    } | null;
    families?: Array<{
      signal_class: 'technical' | 'diffusion' | 'insider' | 'institutional';
      label: string;
      mean: number;
      n: number;
      cells: number;
      top_pattern: {
        pattern_key: string;
        cap_class: string;
        horizon_days: number;
        mean: number;
        n: number;
      } | null;
    }>;
    top_family?: 'technical' | 'diffusion' | 'insider' | 'institutional' | null;
    recorded_at?: string;
    total_cells?: number;
    total_n?: number;
  };
  engine_changes?: Array<{
    signal_class: string;
    pattern_key: string;
    cap_class: string;
    horizon_days: number;
    all_time_mean: number;
    recent_30d_mean: number;
    delta: number;
    sample_size: number;
    status: string;
    last_updated: string;
  }>;
  diffusion_signals: Array<{
    ticker: string;
    diffusion_gap: number;
    direction: number;
    tier_breakdown: { mainstream: number; middle: number; niche: number };
    recorded_at: string;
  }>;
  outcome_log: Array<{
    ticker: string;
    diffusion_gap: number;
    direction: number;
    price_change_3d: number | null;
    price_change_7d: number | null;
    recorded_at: string;
  }>;
  signal_correlation: Record<
    string,
    { signal_positive_pct: number; avg_7d_return: number; sample_size: number }
  >;
  // Learning-engine fields (additive — may be absent in older deployments)
  market_state?: { open: boolean; label: string };
  pattern_library?: PatternCellData[];
  live_diffusion_map?: DiffusionMapEntry[];
  engine_memory?: MemoryEntry[];
  concept_drift?: { worst_z: number; status: 'NORMAL' | 'WARNING' | 'ALERT' };
  null_check?: { p_value: number; real_brier: number; null_brier: number } | null;
  logistic_epoch?: {
    epoch: number;
    coefficients: Record<string, { mu: number; sigma: number }>;
    intercept: number;
    brier_in: number;
    brier_out: number;
    sample_size: number;
    recorded_at: string;
  } | null;
  // Phase 16-05: 8 TechPatterns × 3 cap_classes × 6 horizons = 144 cells
  technical_pattern_library?: TechnicalPatternCell[];
}

// ── Phase 16-05: Technical Pattern Library types ─────────────────────────
interface TechnicalPatternCell {
  signal_class: 'technical';
  pattern_key: string; // one of the 8 TechPattern literals
  cap_class: 'large_cap' | 'mid_cap' | 'small_cap';
  horizon_days: number; // 3 | 7 | 14 | 30 | 60 | 90
  posterior_mean: number | null;
  ci: [number, number] | null;
  sample_size: number;
  status: 'ACTIVE' | 'EXPLORATORY' | 'DEPRECATED' | 'NO_DATA';
}

interface HorizonBrierData {
  series: Array<{
    pattern_key: string;
    points: Array<{
      horizon_days: number;
      brier_in_sample: number | null;
      status: 'ACTIVE' | 'EXPLORATORY' | 'DEPRECATED' | 'NO_DATA';
    }>;
  }>;
  brier_null: number;
}

// 7-tab structure on /insights — post-19 adds Overview as the landing tab.
// Phase 16 tabs (technical-library, horizon-brier) flipped to isNew: false.
const TABS = [
  { id: 'overview', label: 'Overview', isNew: true },
  { id: 'diffusion-library', label: 'Diffusion Library', isNew: false },
  { id: 'live-map', label: 'Live Diffusion Map', isNew: false },
  { id: 'technical-library', label: 'Technical Pattern Library', isNew: false },
  { id: 'horizon-brier', label: 'Horizon Brier', isNew: false },
  { id: 'institutional-library', label: 'Institutional Pattern Library', isNew: false },
  { id: 'insider-library', label: 'Insider Pattern Library', isNew: false },
] as const;
type TabId = typeof TABS[number]['id'];

// 8 TechPatterns — locked order matches plan 16-05 §interfaces.
const TECH_PATTERNS = [
  'breakout_uptrend',
  'overbought_uptrend',
  'pullback_in_uptrend',
  'consolidation',
  'breakdown',
  'oversold_downtrend',
  'death_cross',
  'golden_cross',
] as const;

// Display labels — UI-SPEC "TechPattern labels" (verbatim).
const TECH_PATTERN_LABEL: Record<string, string> = {
  breakout_uptrend: 'BREAKOUT UPTREND',
  overbought_uptrend: 'OVERBOUGHT UPTREND',
  pullback_in_uptrend: 'PULLBACK IN UPTREND',
  consolidation: 'CONSOLIDATION',
  breakdown: 'BREAKDOWN',
  oversold_downtrend: 'OVERSOLD DOWNTREND',
  death_cross: 'DEATH CROSS',
  golden_cross: 'GOLDEN CROSS',
};

// 3 cap_classes — locked to classifyCapClass()'s union (no mega_cap).
const TECH_CAP_COL_ORDER = ['large_cap', 'mid_cap', 'small_cap'] as const;

// 6 horizons — primary horizon is 30, marked with ★ in the segmented control.
const HORIZONS = [3, 7, 14, 30, 60, 90] as const;
const PRIMARY_HORIZON = 30;

interface PatternCellData {
  flow_pattern: string;
  cap_class: string;
  alpha: number;
  beta: number;
  posterior_mean: number;
  ci_low: number;
  ci_high: number;
  ci_30d_mean: number;
  sample_size: number;
  hits: number;
  brier_in: number | null;
  brier_out: number | null;
  brier_null: number | null;
  drift_z: number;
  status: 'ACTIVE' | 'EXPLORATORY' | 'DEPRECATED' | string;
  week_delta: number;
  last_updated: string;
}

interface DiffusionMapEntry {
  ticker: string;
  cap_class: string;
  flow_pattern: string;
  sparkline: Array<{ niche: number; middle: number; mainstream: number; scanned_at: string }>;
  logistic_score: number | null;
  logistic_ci_low: number | null;
  logistic_ci_high: number | null;
  end_at: string;
}

interface MemoryEntry {
  occurred_at: string;
  event_type: string;
  ticker: string | null;
  flow_pattern: string | null;
  cap_class: string | null;
  message: string;
}

const FLOW_PATTERN_ROW_ORDER = ['niche_leads', 'simultaneous', 'mainstream_first', 'flat'];
const CAP_CLASS_COL_ORDER = ['large_cap', 'mid_cap', 'small_cap'];

const FLOW_PATTERN_LABEL: Record<string, string> = {
  niche_leads: 'Niche Leads',
  simultaneous: 'Simultaneous',
  mainstream_first: 'Mainstream First',
  flat: 'Flat',
};

const CAP_CLASS_LABEL: Record<string, string> = {
  large_cap: 'Large Cap',
  mid_cap: 'Mid Cap',
  small_cap: 'Small Cap',
  unknown: 'Unknown',
};

const OVERVIEW_TAB_HINT: Record<string, string> = {
  'diffusion-library': 'Community chatter',
  'live-map': 'Community chatter',
  'technical-library': 'Chart patterns',
  'horizon-brier': 'Chart patterns',
  'institutional-library': 'Big-fund moves',
  'insider-library': 'Insider trades',
};

const OVERVIEW_TAB_FRIENDLY_TITLE: Record<string, string> = {
  'diffusion-library': 'Online community patterns',
  'live-map': 'Live community pickups',
  'technical-library': 'Chart-pattern library',
  'horizon-brier': 'How chart patterns hold up over time',
  'institutional-library': 'Big-fund position flows',
  'insider-library': 'Insider buying & selling',
};

const OVERVIEW_TAB_BLURB: Record<string, string> = {
  'diffusion-library': 'How often a story catching fire in a niche corner of the internet before the mainstream sees it has actually predicted a price move.',
  'live-map': 'Tickers right now where niche communities are talking before the mainstream — Cipher will grade these once the next week of price action lands.',
  'technical-library': 'Every chart pattern Cipher tracks (breakouts, pullbacks, golden crosses, etc.) and how often each one has worked.',
  'horizon-brier': 'How accurate the chart-pattern calls are at 3, 7, 14, 30, 60, and 90 days out — a way to see if Cipher is better at short or long forecasts.',
  'institutional-library': 'When the largest funds buy or sell, what tends to happen to the stock afterward — broken down by ticker size.',
  'insider-library': 'When company insiders (executives, directors) trade their own stock, what the price typically does over the next few weeks.',
};

const SIGNAL_LABELS: Record<string, string> = {
  diffusion_gap: 'Diffusion Gap',
  direction: 'Direction',
  quality: 'Quality',
  quantity: 'Quantity',
};

const SIGNAL_DESCRIPTIONS: Record<string, string> = {
  diffusion_gap: 'Niche-vs-mainstream activity ratio',
  direction: 'Bullish weighting across communities',
  quality: 'Analytical-tier engagement share',
  quantity: 'Total cross-community volume',
};

function formatPct(n: number | null): string {
  if (n == null) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

function directionLabel(d: number): { label: string; tone: 'bull' | 'bear' | 'neutral' } {
  if (d > 0.6) return { label: 'BULLISH', tone: 'bull' };
  if (d < 0.4) return { label: 'BEARISH', tone: 'bear' };
  return { label: 'NEUTRAL', tone: 'neutral' };
}

// ── Plain-language translations ──────────────────────────────────────────
// The engine speaks in (signal × pattern × cap × horizon) cells. Most
// readers don't. Each phrase below is a clause that slots into "When ___,"
// so sentences read naturally regardless of which signal class fires.
const PATTERN_PHRASE: Record<string, string> = {
  // diffusion (community-discussion patterns)
  niche_leads: 'a niche community catches a story before the mainstream',
  simultaneous: 'every community picks up a story at once',
  mainstream_first: 'the mainstream catches a story before niche communities',
  flat: 'no community shows clear discussion lift',
  // technical (chart patterns)
  breakout_uptrend: 'a stock breaks out during an uptrend',
  overbought_uptrend: 'a stock looks overbought during an uptrend',
  pullback_in_uptrend: 'a stock pulls back during an uptrend',
  consolidation: 'a stock consolidates in a tight range',
  breakdown: 'a stock breaks down out of a range',
  oversold_downtrend: 'a stock looks oversold during a downtrend',
  death_cross: 'a stock prints a death cross',
  golden_cross: 'a stock prints a golden cross',
  // institutional (13F flows)
  net_accumulation: 'institutions are net buyers',
  net_distribution: 'institutions are net sellers',
  new_initiation: 'a brand-new institutional position opens',
  complete_exit: 'an institution closes its entire position',
  smart_money_concentration: 'smart-money funds pile in together',
  smart_money_dispersion: 'smart-money funds split — some buy, some sell',
  contrarian_inflow: 'institutions buy while the crowd sells',
  contrarian_outflow: 'institutions sell while the crowd buys',
  // insider (Form 4 filings)
  cluster_buying: 'a cluster of insiders buys shares',
  lone_buy: 'a single insider buys shares',
  ceo_buy: 'the CEO buys shares',
  cfo_buy: 'the CFO buys shares',
  director_buy: 'a director buys shares',
  cluster_selling: 'a cluster of insiders sells shares',
  planned_sell_10b5_1: 'an insider sells under a pre-scheduled 10b5-1 plan',
  lone_sell: 'a single insider sells shares',
};
const CAP_PHRASE: Record<string, string> = {
  large_cap: 'large-cap stocks',
  mid_cap: 'mid-cap stocks',
  small_cap: 'small-cap stocks',
  unknown: 'stocks',
};
function humanizePattern(p: string): string {
  return PATTERN_PHRASE[p] ?? p.replace(/_/g, ' ');
}
function humanizeCap(c: string): string {
  return CAP_PHRASE[c] ?? c.replace(/_/g, ' ');
}
function humanizeHorizon(d: number): string {
  if (d <= 3) return 'three days';
  if (d <= 7) return 'one week';
  if (d <= 14) return 'two weeks';
  if (d <= 30) return 'one month';
  if (d <= 60) return 'two months';
  return 'three months';
}
type EngineChange = NonNullable<InsightsData['engine_changes']>[number];
type ThesisFamily = NonNullable<InsightsData['thesis']['families']>[number];

const FRIENDLY_FAMILY_LABEL: Record<string, string> = {
  technical: 'Chart patterns',
  diffusion: 'Online community chatter',
  insider: 'Insider trades',
  institutional: 'Big-fund position changes',
};

function friendlyFamilyLabel(sc: string): string {
  return FRIENDLY_FAMILY_LABEL[sc] ?? sc;
}

function buildOverviewHeadline(top: ThesisFamily | null, families: ThesisFamily[]): string {
  if (!top) {
    return 'Cipher is still gathering enough graded predictions to call a winner. Check back as the engine records more outcomes.';
  }
  const topPct = Math.round(top.mean * 100);
  const topName = friendlyFamilyLabel(top.signal_class).toLowerCase();
  let verdict: string;
  if (topPct >= 58) verdict = 'reliably beat the S&P 500';
  else if (topPct >= 52) verdict = 'slightly edged out the S&P 500';
  else if (topPct >= 48) verdict = 'roughly matched the S&P 500';
  else if (topPct >= 42) verdict = 'tended to trail the S&P 500';
  else verdict = 'consistently lagged the S&P 500';
  const totalN = families.reduce((s, f) => s + f.n, 0);
  return `After watching ${totalN.toLocaleString()} predictions play out, the strongest signal Cipher has found is ${topName} — those calls have ${verdict} about ${topPct}% of the time.`;
}
function buildPlainChange(c: EngineChange): string {
  const isUp = c.delta > 0;
  const adverb = Math.abs(c.delta) >= 0.1 ? 'sharply' : 'gradually';
  const verb = isUp ? 'gained' : 'lost';
  return `When ${humanizePattern(c.pattern_key)}, Cipher ${adverb} ${verb} confidence in ${humanizeCap(c.cap_class)} over ${humanizeHorizon(c.horizon_days)}.`;
}

export function InsightsDashboard() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(new Date());
  // Phase 16-05: 4-tab structure with hash-routing. Lazy initializer reads
  // window.location synchronously on first render — avoids the cascading
  // setState-in-effect anti-pattern flagged by react-hooks/set-state-in-effect.
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    if (typeof window === 'undefined') return 'overview';
    const hash = window.location.hash.slice(1);
    return TABS.some((t) => t.id === hash) ? (hash as TabId) : 'overview';
  });
  // Phase 16-05: Technical Pattern Library horizon selector — default 30d★.
  const [selectedHorizon, setSelectedHorizon] = useState<number>(() => {
    if (typeof window === 'undefined') return PRIMARY_HORIZON;
    const params = new URLSearchParams(window.location.search);
    const h = parseInt(params.get('h') ?? '', 10);
    return HORIZONS.includes(h as typeof HORIZONS[number]) ? h : PRIMARY_HORIZON;
  });
  // Phase 16-05: Horizon Brier chart data (separate endpoint).
  const [brierData, setBrierData] = useState<HorizonBrierData | null>(null);

  useEffect(() => {
    fetch('/api/insights')
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setError('Failed to load insights'); setLoading(false); });
    // Fetch horizon-brier in parallel — tolerate 404 on older deployments.
    fetch('/api/insights/horizon-brier')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: HorizonBrierData | null) => { if (d) setBrierData(d); })
      .catch(() => { /* ignore — chart shows empty state */ });
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Phase 16-05: hash-change listener — keep state in sync if user uses
  // browser back/forward across tabs. Does not setState on mount (lazy init
  // already did that synchronously) — only on hashchange events.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (TABS.some((t) => t.id === hash)) {
        setActiveTab(hash as TabId);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="border border-outline-variant/30 bg-surface-container-low/40 p-12 text-center">
          <div className="text-[10px] tracking-[0.4em] text-outline uppercase font-mono mb-3">
            Initializing Research Layer
          </div>
          <div className="text-on-surface-variant text-sm font-mono animate-pulse">
            Loading sentiment cohort data…
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="border border-error/30 bg-error/5 p-6 text-error text-sm font-mono">
          {error ?? 'No data available'}
        </div>
      </div>
    );
  }

  const utcStamp = now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  // Find the most "heroic" anchor stat to feature in the hero
  const niceCells = (data.pattern_library ?? []).filter(c => c.flow_pattern === 'niche_leads' && c.sample_size >= 5);
  const headlineCell = niceCells.sort((a, b) => b.posterior_mean - a.posterior_mean)[0];
  const headlinePct = headlineCell ? Math.round(headlineCell.posterior_mean * 100) : null;

  return (
    <div className="pb-24">
      {/* ─────────────────────── Cinematic Hero ─────────────────────── */}
      <section className="relative overflow-hidden border-b border-outline-variant/20">
        {/* Dot-grid backdrop */}
        <div className="absolute inset-0 dot-grid pointer-events-none opacity-40" />
        {/* Ambient glow */}
        <div
          className="absolute pointer-events-none"
          style={{
            width: '900px',
            height: '500px',
            top: '40%',
            left: '20%',
            transform: 'translate(-50%, -50%)',
            background: 'radial-gradient(ellipse at center, rgba(102,217,204,0.08) 0%, transparent 70%)',
          }}
          aria-hidden="true"
        />
        <div
          className="absolute pointer-events-none"
          style={{
            width: '700px',
            height: '500px',
            top: '60%',
            right: '0%',
            background: 'radial-gradient(ellipse at center, rgba(182,196,255,0.08) 0%, transparent 70%)',
          }}
          aria-hidden="true"
        />

        <div className="max-w-7xl mx-auto px-6 pt-14 pb-12 relative z-10">
          {/* Top status bar */}
          <div className="flex items-center justify-between flex-wrap gap-3 mb-12">
            <div className="flex items-center gap-3">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-secondary" />
              </span>
              <span className="text-[10px] tracking-[0.4em] text-secondary font-mono uppercase font-bold">
                Engine Live
              </span>
              <span className="text-[10px] tracking-[0.3em] text-outline font-mono uppercase border-l border-outline-variant/30 pl-3">
                Self-Updating · No Human Intervention
              </span>
            </div>
            <div className="flex items-center gap-4 text-[10px] tracking-[0.3em] text-outline font-mono uppercase">
              {data.market_state && (
                <span
                  className={
                    data.market_state.open
                      ? 'text-secondary border border-secondary/40 bg-secondary/10 px-2 py-0.5'
                      : 'text-outline border border-outline-variant/30 bg-surface-container-low px-2 py-0.5'
                  }
                >
                  NYSE · {data.market_state.label}
                </span>
              )}
              <span className="hidden sm:inline">Cycle 3D · Watchlist {data.watchlist_size ?? '—'}</span>
              <span className="hidden md:inline">{utcStamp}</span>
            </div>
          </div>

          {/* Hero grid */}
          <div className="grid lg:grid-cols-[1.4fr_1fr] gap-12 items-center">
            {/* Left — copy */}
            <div>
              <div className="text-[10px] tracking-[0.5em] text-primary/70 font-mono uppercase mb-5 font-bold">
                Cipher Research · Behavioral Finance
              </div>
              <h1 className="font-black text-on-surface tracking-tight leading-[0.92] mb-6"
                  style={{ fontSize: 'clamp(2.5rem, 6.5vw, 5.25rem)' }}>
                Sentiment travels.
                <span className="block text-primary-fixed">We watch it move.</span>
              </h1>
              <p className="text-on-surface-variant text-base md:text-lg max-w-2xl leading-relaxed mb-8">
                Investment ideas often start in <span className="text-secondary font-semibold">niche communities</span> —
                a sub-Reddit dedicated to one ticker, an obscure StockTwits thread.
                Days later they reach <span className="text-tertiary font-semibold">middle</span> communities,
                then <span className="text-error/90 font-semibold">mainstream</span>.
                By the time mainstream notices, the price has often already moved.
                Cipher tracks that journey across <strong className="text-on-surface">{data.watchlist_size ?? data.total_data_points} tickers</strong>,
                checks the price 3, 7, and 14 days later, and quietly updates its own beliefs about
                which patterns actually predict.
              </p>

              {/* Method chips */}
              <div className="flex flex-wrap gap-2 text-[10px] tracking-[0.3em] font-mono uppercase">
                <span className="border border-outline-variant/40 bg-surface-container-low/50 px-2 py-1 text-on-surface-variant">
                  Bayesian posteriors
                </span>
                <span className="border border-outline-variant/40 bg-surface-container-low/50 px-2 py-1 text-on-surface-variant">
                  SPY-relative outcomes
                </span>
                <span className="border border-outline-variant/40 bg-surface-container-low/50 px-2 py-1 text-on-surface-variant">
                  Adversarial null test
                </span>
                <span className="border border-outline-variant/40 bg-surface-container-low/50 px-2 py-1 text-on-surface-variant">
                  Drift detection
                </span>
              </div>
            </div>

            {/* Right — animated diffusion + anchor stat */}
            <div className="flex flex-col items-center lg:items-end gap-6">
              <DiffusionVisual />
              <div className="border border-outline-variant/40 bg-surface-container-low/40 backdrop-blur p-5 w-full max-w-sm">
                <div className="text-[10px] tracking-[0.4em] text-primary/70 font-mono uppercase mb-2">
                  Headline finding
                </div>
                {headlinePct != null && headlineCell ? (
                  <>
                    <div className="font-mono font-black text-secondary text-5xl tabular-nums leading-none mb-2">
                      {headlinePct}<span className="text-2xl text-secondary/70">%</span>
                    </div>
                    <div className="text-on-surface text-sm leading-snug mb-2">
                      of <span className="text-on-surface-variant">niche-leads</span> patterns
                      in <span className="text-on-surface-variant">{CAP_CLASS_LABEL[headlineCell.cap_class] ?? headlineCell.cap_class}</span>
                      {' '}beat SPY by &gt;1% over 7d
                    </div>
                    <div className="text-[10px] font-mono text-outline tracking-widest uppercase">
                      n={headlineCell.sample_size} · {Math.round(headlineCell.ci_low * 100)}–{Math.round(headlineCell.ci_high * 100)}% credible interval
                    </div>
                  </>
                ) : (
                  <>
                    <div className="font-mono font-black text-on-surface text-4xl tabular-nums leading-none mb-2">
                      Cycle <span className="text-primary-fixed">{(data.logistic_epoch?.epoch ?? 0)}</span>
                    </div>
                    <div className="text-on-surface text-sm leading-snug mb-2">
                      Engine is collecting evidence. The first learned probabilities appear
                      after the first 7-day outcomes resolve.
                    </div>
                    <div className="text-[10px] font-mono text-outline tracking-widest uppercase">
                      Currently watching {data.total_data_points} sentiment data points
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────── Phase 16-05: 4-Tab Strip ─────────────────────── */}
      <div className="sticky top-[44px] z-10 bg-surface-container/95 backdrop-blur border-b border-outline-variant/30">
        <div className="max-w-7xl mx-auto flex gap-8 px-6 py-3 overflow-x-auto" role="tablist" aria-label="Insights views">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => {
                setActiveTab(t.id);
                if (typeof window !== 'undefined') window.location.hash = t.id;
              }}
              className={`text-xs uppercase tracking-widest font-mono whitespace-nowrap transition-colors pb-1 ${
                activeTab === t.id
                  ? 'text-on-surface border-b-2 border-primary -mb-px'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {t.label}
              {t.isNew && <span className="ml-2 text-[9px] text-primary">· NEW</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6">

      {/* Tabs 1 + 2 share the existing scroll layout (Diffusion Library = stat strip
          + thesis + tiers + diffusion tracker + outcome log; Live Diffusion Map =
          live-map + engine memory). Tabs 3 + 4 swap in new content. */}

      {/* ─────────────────────── Tab 3: Technical Pattern Library ─────────────────────── */}
      {activeTab === 'technical-library' && (
        <TechnicalPatternLibrarySection
          cells={data.technical_pattern_library ?? []}
          selectedHorizon={selectedHorizon}
          onHorizonChange={(h) => {
            setSelectedHorizon(h);
            if (typeof window !== 'undefined') {
              const url = new URL(window.location.href);
              url.searchParams.set('h', String(h));
              window.history.replaceState({}, '', url.toString());
            }
          }}
        />
      )}

      {/* ─────────────────────── Tab 4: Horizon Brier ─────────────────────── */}
      {activeTab === 'horizon-brier' && (
        <HorizonBrierSection data={brierData} />
      )}

      {/* ─────────────────────── Tab 5: Institutional Pattern Library ─────────────────────── */}
      {activeTab === 'institutional-library' && (
        <SmartMoneyPatternLibrarySection
          fetchUrl="/api/insights/institutional-library"
          title="Institutional Pattern Library"
          subtitle="13F + ownership flows. Primary horizon: 30 days."
          selectedHorizon={selectedHorizon}
          onHorizonChange={(h) => {
            setSelectedHorizon(h);
            if (typeof window !== 'undefined') {
              const url = new URL(window.location.href);
              url.searchParams.set('h', String(h));
              window.history.replaceState({}, '', url.toString());
            }
          }}
        />
      )}

      {/* ─────────────────────── Tab 6: Insider Pattern Library ─────────────────────── */}
      {activeTab === 'insider-library' && (
        <SmartMoneyPatternLibrarySection
          fetchUrl="/api/insights/insider-library"
          title="Insider Pattern Library"
          subtitle="Form 4 transactions. Primary horizon: 30 days."
          selectedHorizon={selectedHorizon}
          onHorizonChange={(h) => {
            setSelectedHorizon(h);
            if (typeof window !== 'undefined') {
              const url = new URL(window.location.href);
              url.searchParams.set('h', String(h));
              window.history.replaceState({}, '', url.toString());
            }
          }}
        />
      )}

      {/* ─────────────────────── Overview tab ─────────────────────── */}
      {activeTab === 'overview' && (() => {
        const families = data.thesis.families ?? [];
        const topFam = families.find(f => f.signal_class === data.thesis.top_family) ?? null;
        const headline = buildOverviewHeadline(topFam, families);
        return <>
          {/* Plain-English intro — the page leads with what this thing actually is */}
          <section className="mb-12 max-w-3xl">
            <h1 className="text-on-surface text-3xl md:text-4xl font-black tracking-tight mb-4">
              What Cipher has learned so far
            </h1>
            <p className="text-on-surface-variant text-base md:text-lg leading-relaxed">
              Cipher is a research engine that watches the stock market and grades its own predictions. Every time it scores a ticker, it later checks whether the call was right. The numbers below come from those real, recorded outcomes — not anyone&apos;s opinion.
            </p>
          </section>

          {/* Simple stat strip — 4 cards, no jargon */}
          <section
            className="grid grid-cols-2 md:grid-cols-4 gap-px bg-outline-variant/30 border border-outline-variant/30 mb-12 overflow-hidden"
            aria-label="Headline numbers"
          >
            <Stat
              label="Stocks tracked"
              value={data.total_data_points.toLocaleString()}
              sublabel="Snapshots collected"
              accent="primary"
            />
            <Stat
              label="Predictions graded"
              value={data.resolved_outcomes.toLocaleString()}
              sublabel="Where the price has played out"
              accent="default"
            />
            <Stat
              label="Best signal hit rate"
              value={data.thesis.pct !== null ? `${data.thesis.pct}%` : '—'}
              sublabel={topFam ? `${friendlyFamilyLabel(topFam.signal_class)} · ${topFam.n} calls` : 'Still gathering'}
              accent={data.thesis.pct !== null ? 'tertiary' : 'default'}
            />
            <Stat
              label="Patterns learned"
              value={(data.thesis.total_cells ?? 0).toLocaleString()}
              sublabel={data.thesis.recorded_at ? `Updated ${new Date(data.thesis.recorded_at).toLocaleDateString()}` : 'Not yet'}
              accent="secondary"
            />
          </section>

          {/* Plain-English thesis */}
          <section className="mb-12 border border-outline-variant/30 bg-gradient-to-br from-primary-container/[0.08] to-transparent p-8 md:p-12">
            <div className="text-[10px] tracking-[0.4em] text-primary/70 font-mono uppercase mb-5">
              What Cipher has learned
            </div>

            {families.length > 0 ? (
              <>
                <p className="text-on-surface text-2xl md:text-[1.7rem] leading-tight font-light tracking-tight max-w-3xl">
                  {headline}
                </p>

                <div className="mt-8 grid sm:grid-cols-2 gap-x-8 gap-y-3 max-w-3xl">
                  {families.map(f => {
                    const isTop = f.signal_class === data.thesis.top_family;
                    const pct = Math.round(f.mean * 100);
                    return (
                      <div
                        key={f.signal_class}
                        className={`flex items-baseline justify-between py-3 border-b border-outline-variant/20 ${
                          isTop ? 'text-on-surface' : 'text-on-surface-variant'
                        }`}
                      >
                        <div className="text-sm md:text-base font-medium tracking-tight flex items-center gap-2">
                          {isTop && <span className="text-primary text-[10px] font-mono tracking-[0.3em] uppercase">Top</span>}
                          {friendlyFamilyLabel(f.signal_class)}
                        </div>
                        <div className="flex items-baseline gap-3">
                          <div className="font-mono tabular-nums text-xl font-black text-on-surface">
                            {pct}<span className="text-xs text-outline ml-0.5">%</span>
                          </div>
                          <div className="font-mono text-[10px] text-outline tabular-nums whitespace-nowrap">
                            {f.n} call{f.n === 1 ? '' : 's'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <p className="text-on-surface-variant text-sm mt-6 leading-relaxed max-w-2xl">
                  Each percentage is how often that kind of signal beat the S&amp;P 500 over the next week. Cipher only updates this view when the numbers really move — so what you&apos;re reading reflects a settled judgement, not a single noisy day.
                </p>
              </>
            ) : (
              <p className="text-on-surface text-2xl leading-snug font-light tracking-tight max-w-3xl">
                Cipher is still gathering outcomes. After watching <span className="tabular-nums">{data.total_data_points.toLocaleString()}</span> ticker snapshots, <span className="tabular-nums">{data.resolved_outcomes}</span> have played out. Once each kind of signal has at least three completed trades, you&apos;ll see what Cipher has learned right here.
              </p>
            )}
          </section>

          {/* Explore deeper — pointer cards into the per-family tabs */}
          <section className="mb-16" aria-label="Drill into each section">
            <div className="mb-6 max-w-3xl">
              <h2 className="text-on-surface text-2xl md:text-3xl font-black tracking-tight mb-3">
                Want to see how it actually works?
              </h2>
              <p className="text-on-surface-variant text-sm leading-relaxed">
                Each tab below opens one of the signals Cipher tracks and shows every individual pattern it has learned — what the pattern is, how often it&apos;s been right, and how many real trades back that number up.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-outline-variant/30 border border-outline-variant/30">
              {TABS.filter(t => t.id !== 'overview').map(t => (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveTab(t.id);
                    if (typeof window !== 'undefined') window.location.hash = t.id;
                  }}
                  className="bg-surface p-6 hover:bg-surface-container-low/40 transition-colors text-left flex flex-col gap-2"
                >
                  <div className="text-[10px] tracking-[0.3em] text-outline font-mono uppercase">
                    {OVERVIEW_TAB_HINT[t.id] ?? 'Detail'}
                  </div>
                  <div className="text-on-surface text-base font-bold tracking-tight">
                    {OVERVIEW_TAB_FRIENDLY_TITLE[t.id] ?? t.label}
                  </div>
                  <div className="text-on-surface-variant text-xs leading-relaxed">
                    {OVERVIEW_TAB_BLURB[t.id] ?? 'Explore the patterns.'}
                  </div>
                  <div className="text-primary text-xs font-mono tracking-widest uppercase mt-1">
                    Open →
                  </div>
                </button>
              ))}
            </div>
          </section>
        </>;
      })()}

      {/* ─────────────────────── Tabs 1 + 2: existing scroll layout ─────────────────────── */}
      {(activeTab === 'diffusion-library' || activeTab === 'live-map') && <>

      {/* ─────────────────────── What changed this month ─────────────────────── */}
      {data.engine_changes && data.engine_changes.length > 0 && (
        <section className="mb-14" aria-label="Engine changes this month">
          <div className="mb-8 max-w-3xl">
            <div className="text-[10px] tracking-[0.4em] text-primary/70 font-mono uppercase mb-2">
              What changed this month
            </div>
            <h2 className="text-on-surface text-2xl md:text-3xl font-black tracking-tight mb-3">
              Cipher updated its mind on{' '}
              <span className="text-primary tabular-nums">{data.engine_changes.length}</span>{' '}
              {data.engine_changes.length === 1 ? 'pattern' : 'patterns'}
            </h2>
            <p className="text-on-surface-variant text-sm leading-relaxed">
              Each card is a real shift in how the engine reads the market. Green means it grew more confident a pattern works; red means less. Every shift comes from outcomes Cipher watched play out — never from anyone tweaking it by hand.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-outline-variant/30 border border-outline-variant/30">
            {data.engine_changes.map((c, i) => {
              const dpct = c.delta * 100;
              const isUp = dpct > 0;
              return (
                <article
                  key={i}
                  className="bg-surface p-6 hover:bg-surface-container-low/40 transition-colors flex flex-col"
                >
                  <div className="flex items-start justify-between gap-3 mb-5">
                    <div
                      className={`text-[10px] tracking-[0.3em] font-mono uppercase ${
                        isUp ? 'text-secondary' : 'text-error'
                      }`}
                    >
                      {isUp ? '↑ More confident' : '↓ Less confident'}
                    </div>
                    <div
                      className={`font-mono tabular-nums text-2xl font-black leading-none ${
                        isUp ? 'text-secondary' : 'text-error'
                      }`}
                    >
                      {isUp ? '+' : ''}
                      {dpct.toFixed(1)}
                      <span className="text-xs text-outline ml-0.5">pp</span>
                    </div>
                  </div>

                  <p className="text-on-surface text-base leading-snug font-medium tracking-tight flex-1">
                    {buildPlainChange(c)}
                  </p>

                  <div className="mt-5 pt-4 border-t border-outline-variant/20 flex items-baseline justify-between text-xs">
                    <div className="text-on-surface-variant">
                      Wins{' '}
                      <span className="text-on-surface font-bold tabular-nums">
                        {(c.recent_30d_mean * 100).toFixed(0)}%
                      </span>{' '}
                      now · was{' '}
                      <span className="tabular-nums">
                        {(c.all_time_mean * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="text-outline font-mono tabular-nums">
                      {c.sample_size} trades
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* ─────────────────────── Three Tiers explainer ─────────────────────── */}
      <section className="mb-12" aria-label="Three community tiers">
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="text-[10px] tracking-[0.4em] text-primary/70 font-mono uppercase mb-1">
              The three tiers
            </div>
            <h2 className="text-on-surface text-2xl md:text-3xl font-black tracking-tight">
              Where investment ideas live online
            </h2>
          </div>
          <span className="hidden md:inline text-[10px] tracking-[0.3em] text-outline font-mono uppercase">
            scanned every 3 days
          </span>
        </div>

        <div className="grid md:grid-cols-3 gap-px bg-outline-variant/30 border border-outline-variant/30">
          <TierCard
            tone="secondary"
            label="Niche"
            symbol="🌱"
            example="r/PLTR · r/AMD · r/SOFI"
            audience="Dedicated holders. Often small in number, deep in conviction."
            why="The earliest signal. Often weeks ahead of the news cycle."
          />
          <TierCard
            tone="tertiary"
            label="Middle"
            symbol="🔄"
            example="r/investing · r/stocks · SeekingAlpha"
            audience="Engaged retail investors with long-term horizons."
            why="The relay. Where ideas get debated and shaped before going wide."
          />
          <TierCard
            tone="error"
            label="Mainstream"
            symbol="📣"
            example="r/wallstreetbets · CNBC · Twitter"
            audience="Broad retail and momentum traders. Highest volume by far."
            why="When sentiment lands here, the price has often already moved."
          />
        </div>
      </section>

      {/* ─────────────────────── How Cipher Learns ─────────────────────── */}
      <section className="mb-14" aria-label="How Cipher learns">
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="text-[10px] tracking-[0.4em] text-primary/70 font-mono uppercase mb-1">
              The feedback loop
            </div>
            <h2 className="text-on-surface text-2xl md:text-3xl font-black tracking-tight">
              How Cipher learns — every cycle, automatically
            </h2>
            <p className="text-on-surface-variant text-sm mt-2 max-w-3xl leading-relaxed">
              No human writes the rules. The engine watches, predicts, verifies, and updates its
              own beliefs. That loop runs whether or not anyone is using the app.
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-px bg-outline-variant/30 border border-outline-variant/30">
          <StepCard
            n="01"
            title="Scan"
            body="Every 3 days, pull discussion from each ticker's niche, middle, and mainstream community plus StockTwits."
            tone="primary"
          />
          <StepCard
            n="02"
            title="Trace"
            body="Compute engagement velocity per tier and detect the diffusion pattern: niche-leads, simultaneous, mainstream-first, or flat."
            tone="secondary"
          />
          <StepCard
            n="03"
            title="Verify"
            body="3, 7, and 14 days later, fetch the actual price. Compare to SPY. Was the prediction right or wrong?"
            tone="tertiary"
          />
          <StepCard
            n="04"
            title="Update"
            body="Bayesian posterior shifts. Logistic-regression coefficients shift. A new entry appears in the engine's memory."
            tone="primary-fixed"
          />
        </div>
      </section>

      {/* ─────────────────────── Pattern Library (NEW) ─────────────────────── */}
      {data.pattern_library && data.pattern_library.length > 0 && (
        <section className="mb-12 border border-outline-variant/30" aria-label="Pattern Library">
          <div className="flex items-end justify-between p-6 md:p-8 border-b border-outline-variant/20">
            <div>
              <div className="text-[10px] tracking-[0.4em] text-primary/70 font-mono uppercase mb-1">
                Pattern Library
              </div>
              <h2 className="text-on-surface text-lg font-bold tracking-tight">
                Learned probabilities · updated daily
              </h2>
              <p className="text-on-surface-variant text-xs mt-2 max-w-2xl leading-relaxed">
                Each cell shows the engine&apos;s posterior probability that a given diffusion pattern
                produces &gt;1% excess return vs SPY over 7 days, conditioned on the ticker&apos;s
                market-cap class. Updated automatically every cycle.
              </p>
            </div>
            <span className="hidden sm:block text-[10px] tracking-[0.3em] text-outline font-mono uppercase">
              Beta-Bernoulli · 95% CI
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] tracking-[0.3em] text-outline font-mono uppercase border-b border-outline-variant/30">
                  <th className="text-left font-medium px-6 py-3">Pattern</th>
                  {CAP_CLASS_COL_ORDER.map(cc => (
                    <th key={cc} className="text-left font-medium px-3 py-3">
                      {CAP_CLASS_LABEL[cc]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FLOW_PATTERN_ROW_ORDER.filter(fp => fp !== 'flat').map(fp => (
                  <tr key={fp} className="border-b border-outline-variant/10">
                    <td className="px-6 py-4 font-bold text-on-surface tracking-tight align-top">
                      <div>{FLOW_PATTERN_LABEL[fp]}</div>
                      <div className="text-[10px] text-outline font-mono tracking-widest uppercase mt-0.5">
                        {fp === 'niche_leads' && 'Smart-money first'}
                        {fp === 'simultaneous' && 'News-driven'}
                        {fp === 'mainstream_first' && 'Late retail'}
                      </div>
                    </td>
                    {CAP_CLASS_COL_ORDER.map(cc => {
                      const cell = data.pattern_library!.find(c => c.flow_pattern === fp && c.cap_class === cc);
                      return (
                        <td key={cc} className="px-3 py-4 align-top">
                          <PatternCell cell={cell} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ─────────────────────── Live Diffusion Map (NEW) ─────────────────────── */}
      {data.live_diffusion_map && data.live_diffusion_map.length > 0 && (
        <section className="mb-12 border border-outline-variant/30" aria-label="Live Diffusion Map">
          <div className="flex items-end justify-between p-6 md:p-8 border-b border-outline-variant/20">
            <div>
              <div className="text-[10px] tracking-[0.4em] text-primary/70 font-mono uppercase mb-1">
                Live Diffusion Map
              </div>
              <h2 className="text-on-surface text-lg font-bold tracking-tight">
                Tickers exhibiting niche-leads pattern right now
              </h2>
              <p className="text-on-surface-variant text-xs mt-2 max-w-2xl leading-relaxed">
                Each card shows engagement velocity across niche / middle / mainstream
                communities over the last four 3-day cycles. The logistic score is the engine&apos;s
                continuous edge estimate with 95% credible interval.
              </p>
            </div>
            <span className="hidden sm:block text-[10px] tracking-[0.3em] text-outline font-mono uppercase">
              Showing {data.live_diffusion_map.length}
            </span>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-outline-variant/20">
            {data.live_diffusion_map.slice(0, 6).map((d, i) => (
              <DiffusionMapCard key={`${d.ticker}-${i}`} entry={d} />
            ))}
          </div>
        </section>
      )}

      {/* ─────────────────────── Engine Memory (NEW) ─────────────────────── */}
      {data.engine_memory && data.engine_memory.length > 0 && (
        <section className="mb-12 border border-outline-variant/30" aria-label="Engine Memory">
          <div className="flex items-end justify-between p-6 md:p-8 border-b border-outline-variant/20">
            <div>
              <div className="text-[10px] tracking-[0.4em] text-primary/70 font-mono uppercase mb-1">
                Engine Memory
              </div>
              <h2 className="text-on-surface text-lg font-bold tracking-tight">
                Auto-updating research log
              </h2>
              <p className="text-on-surface-variant text-xs mt-2 max-w-2xl leading-relaxed">
                Every belief update, drift alert, and cycle summary as it happens. No human
                writes these — the engine narrates its own learning.
              </p>
            </div>
            <span className="hidden sm:block text-[10px] tracking-[0.3em] text-outline font-mono uppercase">
              Last {data.engine_memory.length}
            </span>
          </div>

          <div className="divide-y divide-outline-variant/10 font-mono text-xs">
            {data.engine_memory.map((e, i) => (
              <MemoryFeedItem key={`${e.occurred_at}-${i}`} entry={e} />
            ))}
          </div>
        </section>
      )}

      {/* ─────────────────────── Two-col: Diffusion + Signal Quality ─────────────────────── */}
      <div className="grid lg:grid-cols-5 gap-px bg-outline-variant/30 border border-outline-variant/30 mb-12">
        {/* Diffusion Tracker */}
        <section className="bg-surface lg:col-span-3 p-6 md:p-8" aria-label="Diffusion Tracker">
          <div className="flex items-end justify-between mb-6 pb-4 border-b border-outline-variant/20">
            <div>
              <div className="text-[10px] tracking-[0.4em] text-primary/70 font-mono uppercase mb-1">
                Diffusion Tracker
              </div>
              <h2 className="text-on-surface text-lg font-bold tracking-tight">
                Niche active before mainstream
              </h2>
            </div>
            <span className="text-[10px] tracking-[0.3em] text-outline font-mono uppercase">
              Top 10 · Live
            </span>
          </div>

          {data.diffusion_signals.length === 0 ? (
            <EmptyState
              icon="radar"
              title="No early signals detected"
              body="A new scan completes every 3 days. Diffusion signals will appear when niche-tier engagement exceeds 2.5× mainstream activity."
            />
          ) : (
            <div className="divide-y divide-outline-variant/20">
              {data.diffusion_signals.map((s, i) => {
                const total = s.tier_breakdown.mainstream + s.tier_breakdown.middle + s.tier_breakdown.niche;
                const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
                const dir = directionLabel(s.direction);
                return (
                  <div key={i} className="py-4 grid grid-cols-[64px_1fr_auto] gap-4 items-center group hover:bg-surface-container-low/40 -mx-3 px-3 transition-colors">
                    <div className="font-mono font-black text-on-surface tracking-tighter text-base">
                      {s.ticker}
                    </div>

                    {/* Stacked bar */}
                    <div>
                      <div className="flex h-2 w-full overflow-hidden rounded-sm bg-surface-container-low">
                        <div
                          className="bg-secondary"
                          style={{ width: `${pct(s.tier_breakdown.niche)}%` }}
                          title={`Niche · ${s.tier_breakdown.niche}`}
                        />
                        <div
                          className="bg-tertiary"
                          style={{ width: `${pct(s.tier_breakdown.middle)}%` }}
                          title={`Middle · ${s.tier_breakdown.middle}`}
                        />
                        <div
                          className="bg-error/70"
                          style={{ width: `${pct(s.tier_breakdown.mainstream)}%` }}
                          title={`Mainstream · ${s.tier_breakdown.mainstream}`}
                        />
                      </div>
                      <div className="flex gap-4 mt-1.5 text-[10px] font-mono tracking-wide text-outline">
                        <span><span className="text-secondary">●</span> N {s.tier_breakdown.niche}</span>
                        <span><span className="text-tertiary">●</span> M {s.tier_breakdown.middle}</span>
                        <span><span className="text-error/80">●</span> S {s.tier_breakdown.mainstream}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-right">
                      <span className="font-mono text-tertiary text-sm font-bold tabular-nums">
                        {s.diffusion_gap.toFixed(1)}×
                      </span>
                      <DirectionPill tone={dir.tone} label={dir.label} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Signal Quality */}
        <section className="bg-surface lg:col-span-2 p-6 md:p-8" aria-label="Signal Correlation">
          <div className="flex items-end justify-between mb-6 pb-4 border-b border-outline-variant/20">
            <div>
              <div className="text-[10px] tracking-[0.4em] text-primary/70 font-mono uppercase mb-1">
                Signal Quality
              </div>
              <h2 className="text-on-surface text-lg font-bold tracking-tight">
                Which dimension predicts best?
              </h2>
            </div>
          </div>

          <div className="space-y-5">
            {Object.entries(data.signal_correlation).map(([key, val]) => (
              <SignalRow key={key} signal={key} val={val} />
            ))}
          </div>
        </section>
      </div>

      {/* ─────────────────────── Outcome Log ─────────────────────── */}
      <section className="border border-outline-variant/30" aria-label="Outcome log">
        <div className="flex items-end justify-between p-6 md:p-8 border-b border-outline-variant/20">
          <div>
            <div className="text-[10px] tracking-[0.4em] text-primary/70 font-mono uppercase mb-1">
              Outcome Log
            </div>
            <h2 className="text-on-surface text-lg font-bold tracking-tight">
              Every prediction, checked against price
            </h2>
            <p className="text-on-surface-variant text-xs mt-2 max-w-xl leading-relaxed">
              Every report and scan is auto-verified at 3, 7, and 14 days. The
              &ldquo;Mood&rdquo; column is the measured community-sentiment direction at scan
              time, not the engine&apos;s directional call — green/red %s show how that
              measurement actually played out.
            </p>
          </div>
          <span className="hidden sm:block text-[10px] tracking-[0.3em] text-outline font-mono uppercase">
            Showing {data.outcome_log.length}
          </span>
        </div>

        {data.outcome_log.length === 0 ? (
          <div className="p-12">
            <EmptyState
              icon="schedule"
              title="Outcomes appear after 3 days"
              body="The first scan ran today. Once 3-day price outcomes resolve, predictions will start appearing here. The dataset grows continuously without user input."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] tracking-[0.3em] text-outline font-mono uppercase border-b border-outline-variant/30">
                  <th className="text-left font-medium px-6 py-3">Ticker</th>
                  <th className="text-right font-medium px-3 py-3">Gap</th>
                  <th className="text-right font-medium px-3 py-3" title="Measured community sentiment direction at scan time — not the engine's directional call.">Mood</th>
                  <th className="text-right font-medium px-3 py-3">3d</th>
                  <th className="text-right font-medium px-3 py-3">7d</th>
                  <th className="text-right font-medium px-6 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.outcome_log.map((row, i) => {
                  const dir = directionLabel(row.direction);
                  const c3 = (row.price_change_3d ?? 0);
                  const c7 = (row.price_change_7d ?? 0);
                  return (
                    <tr
                      key={i}
                      className="border-b border-outline-variant/10 hover:bg-surface-container-low/40 transition-colors"
                    >
                      <td className="px-6 py-3 font-mono font-black text-on-surface tracking-tighter">
                        {row.ticker}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-tertiary">
                        {row.diffusion_gap.toFixed(1)}×
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span
                          className={
                            dir.tone === 'bull'
                              ? 'text-secondary'
                              : dir.tone === 'bear'
                                ? 'text-error'
                                : 'text-on-surface-variant'
                          }
                        >
                          <span className="font-mono tabular-nums mr-1">
                            {(row.direction * 100).toFixed(0)}
                          </span>
                          <span className="text-[10px] tracking-widest uppercase font-mono opacity-70">
                            {dir.label}
                          </span>
                        </span>
                      </td>
                      <td
                        className={`px-3 py-3 text-right font-mono tabular-nums font-bold ${
                          row.price_change_3d == null
                            ? 'text-outline'
                            : c3 > 0
                              ? 'text-secondary'
                              : 'text-error'
                        }`}
                      >
                        {formatPct(row.price_change_3d)}
                      </td>
                      <td
                        className={`px-3 py-3 text-right font-mono tabular-nums font-bold ${
                          row.price_change_7d == null
                            ? 'text-outline'
                            : c7 > 0
                              ? 'text-secondary'
                              : 'text-error'
                        }`}
                      >
                        {formatPct(row.price_change_7d)}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-[11px] text-outline">
                        {new Date(row.recorded_at).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ─────────────────────── Why this matters ─────────────────────── */}
      <section className="mt-16 mb-6 border border-primary/20 bg-gradient-to-br from-primary-container/[0.04] to-transparent p-8 md:p-10">
        <div className="text-[10px] tracking-[0.5em] text-primary-fixed font-mono uppercase mb-3 font-bold">
          Why this matters
        </div>
        <p className="text-on-surface text-base md:text-lg leading-relaxed max-w-3xl">
          Most retail finance dashboards stop at &quot;here&apos;s what people are saying.&quot;
          Cipher goes one step further: it watches what happens next, then updates its beliefs.
          Every prediction is logged, verified against the price, and either reinforces or weakens
          the engine&apos;s confidence — automatically, every day.
          <span className="block mt-3 text-on-surface-variant">
            That feedback loop is the difference between an opinion and a model.
          </span>
        </p>
      </section>

      </>}{/* end tabs 1 + 2 */}

      {/* ─────────────────────── Footer rule ─────────────────────── */}
      <footer className="mt-10 pt-6 border-t border-outline-variant/30 flex flex-wrap items-center gap-4 text-[10px] tracking-[0.3em] text-outline font-mono uppercase">
        <span>Cipher Engine</span>
        <span>·</span>
        <span>Sentiment scan every 3d</span>
        <span>·</span>
        <span>Outcome verification daily</span>
        <span>·</span>
        <span>Beliefs updated daily</span>
        <span>·</span>
        <span className="text-on-surface-variant">Research-only, not investment advice</span>
      </footer>
      </div>
    </div>
  );
}

/* ───────────────────────── Subcomponents ───────────────────────── */

function Stat({
  label,
  value,
  sublabel,
  accent,
}: {
  label: string;
  value: string;
  sublabel: string;
  accent: 'primary' | 'secondary' | 'tertiary' | 'error' | 'default';
}) {
  const accentClass =
    accent === 'primary'
      ? 'text-primary'
      : accent === 'secondary'
        ? 'text-secondary'
        : accent === 'tertiary'
          ? 'text-tertiary'
          : accent === 'error'
            ? 'text-error'
            : 'text-on-surface';

  return (
    <div className="bg-surface px-5 py-5 md:px-6 md:py-6 group hover:bg-surface-container-low/40 transition-colors">
      <div className="text-[10px] tracking-[0.4em] text-outline font-mono uppercase mb-2">
        {label}
      </div>
      <div className={`font-mono text-3xl md:text-4xl font-black tabular-nums leading-none ${accentClass}`}>
        {value}
      </div>
      <div className="text-[11px] text-on-surface-variant mt-2 font-mono">
        {sublabel}
      </div>
    </div>
  );
}

function DirectionPill({ tone, label }: { tone: 'bull' | 'bear' | 'neutral'; label: string }) {
  const cls =
    tone === 'bull'
      ? 'text-secondary border-secondary/40 bg-secondary/10'
      : tone === 'bear'
        ? 'text-error border-error/40 bg-error/10'
        : 'text-on-surface-variant border-outline-variant/40 bg-surface-container-low';
  return (
    <span
      className={`text-[10px] font-bold tracking-widest uppercase font-mono px-2 py-0.5 border ${cls}`}
    >
      {label}
    </span>
  );
}

function SignalRow({
  signal,
  val,
}: {
  signal: string;
  val: { signal_positive_pct: number; avg_7d_return: number; sample_size: number };
}) {
  const label = SIGNAL_LABELS[signal] ?? signal;
  const desc = SIGNAL_DESCRIPTIONS[signal] ?? '';
  const positiveTone = val.signal_positive_pct >= 60 ? 'text-secondary' : val.signal_positive_pct >= 40 ? 'text-on-surface' : 'text-error';
  const returnTone = val.avg_7d_return > 0 ? 'text-secondary' : val.avg_7d_return < 0 ? 'text-error' : 'text-outline';

  return (
    <div className="group">
      <div className="flex items-center justify-between mb-1.5">
        <div>
          <div className="text-on-surface text-sm font-bold tracking-tight">{label}</div>
          <div className="text-[10px] text-outline font-mono uppercase tracking-widest mt-0.5">
            {desc}
          </div>
        </div>
        <div className="text-right">
          <div className={`font-mono font-black text-xl tabular-nums ${positiveTone}`}>
            {val.signal_positive_pct}%
          </div>
          <div className="text-[10px] text-outline font-mono tracking-widest uppercase">
            n={val.sample_size}
          </div>
        </div>
      </div>
      <div className="h-1 bg-surface-container-low overflow-hidden">
        <div
          className={
            val.signal_positive_pct >= 60
              ? 'h-full bg-secondary'
              : val.signal_positive_pct >= 40
                ? 'h-full bg-primary'
                : 'h-full bg-error'
          }
          style={{ width: `${Math.max(2, val.signal_positive_pct)}%` }}
        />
      </div>
      <div className={`text-[11px] font-mono mt-1 ${returnTone}`}>
        avg 7d return · {val.avg_7d_return > 0 ? '+' : ''}{val.avg_7d_return}%
      </div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-6">
      <span
        className="material-symbols-outlined text-outline mb-3"
        style={{ fontSize: '32px' }}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="text-on-surface-variant text-sm font-medium mb-2">{title}</div>
      <p className="text-outline text-xs max-w-md leading-relaxed">{body}</p>
    </div>
  );
}

function PatternCell({ cell }: { cell: PatternCellData | undefined }) {
  if (!cell || cell.sample_size === 0) {
    return (
      <div className="text-[10px] font-mono tracking-widest uppercase text-outline">
        no data
      </div>
    );
  }

  const meanPct = (cell.posterior_mean * 100).toFixed(0);
  const meanPctNum = cell.posterior_mean * 100;
  const ciLowPct = (cell.ci_low * 100).toFixed(0);
  const ciHighPct = (cell.ci_high * 100).toFixed(0);
  const isExploratory = cell.status === 'EXPLORATORY';
  const isDeprecated = cell.status === 'DEPRECATED';

  const meanColor =
    isDeprecated
      ? 'text-error'
      : isExploratory
        ? 'text-on-surface-variant'
        : meanPctNum >= 60
          ? 'text-secondary'
          : meanPctNum >= 40
            ? 'text-on-surface'
            : 'text-error';

  const statusBadgeClass =
    cell.status === 'ACTIVE'
      ? 'text-secondary border-secondary/40 bg-secondary/10'
      : cell.status === 'DEPRECATED'
        ? 'text-error border-error/40 bg-error/10'
        : 'text-outline border-outline-variant/40 bg-surface-container-low';

  // delta arrow
  const deltaPctPts = cell.week_delta * 100;
  const deltaArrow = deltaPctPts > 1 ? '▲' : deltaPctPts < -1 ? '▼' : '—';
  const deltaColor = deltaPctPts > 1 ? 'text-secondary' : deltaPctPts < -1 ? 'text-error' : 'text-outline';

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className={`font-mono font-black text-2xl tabular-nums leading-none ${meanColor}`}>
          {meanPct}
        </span>
        <span className={`text-sm ${meanColor} opacity-70`}>%</span>
        <span className={`text-[10px] font-mono tracking-widest uppercase ${deltaColor} ml-auto`}>
          {deltaArrow} {Math.abs(deltaPctPts).toFixed(1)}
        </span>
      </div>

      <div className="h-[3px] bg-surface-container-low overflow-hidden mb-2 relative">
        <div
          className={
            cell.status === 'ACTIVE'
              ? 'absolute h-full bg-secondary/40'
              : cell.status === 'DEPRECATED'
                ? 'absolute h-full bg-error/40'
                : 'absolute h-full bg-outline/30'
          }
          style={{
            left: `${Math.max(0, cell.ci_low * 100)}%`,
            width: `${Math.max(2, (cell.ci_high - cell.ci_low) * 100)}%`,
          }}
        />
        <div
          className={
            cell.status === 'ACTIVE'
              ? 'absolute h-full w-[2px] bg-secondary'
              : cell.status === 'DEPRECATED'
                ? 'absolute h-full w-[2px] bg-error'
                : 'absolute h-full w-[2px] bg-on-surface'
          }
          style={{ left: `calc(${cell.posterior_mean * 100}% - 1px)` }}
        />
      </div>

      <div className="flex items-center justify-between text-[10px] font-mono tracking-wide text-outline mb-1.5">
        <span>{ciLowPct}–{ciHighPct}%</span>
        <span>n={cell.sample_size}</span>
      </div>

      <span className={`text-[9px] font-mono tracking-widest uppercase px-1.5 py-0.5 border ${statusBadgeClass}`}>
        {cell.status}
      </span>
    </div>
  );
}

function DiffusionMapCard({ entry }: { entry: DiffusionMapEntry }) {
  const { ticker, cap_class, sparkline, logistic_score, logistic_ci_low, logistic_ci_high } = entry;

  // Compute max for sparkline normalization
  const allValues = sparkline.flatMap(p => [p.niche, p.middle, p.mainstream]);
  const maxValue = Math.max(1, ...allValues);
  const w = 200;
  const h = 60;
  const xStep = sparkline.length > 1 ? w / (sparkline.length - 1) : w;

  const linePath = (key: 'niche' | 'middle' | 'mainstream') =>
    sparkline
      .map((p, i) => {
        const x = i * xStep;
        const y = h - (p[key] / maxValue) * h;
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');

  const scorePct = logistic_score != null ? (logistic_score * 100).toFixed(0) : '—';
  const scoreCI =
    logistic_ci_low != null && logistic_ci_high != null
      ? `${(logistic_ci_low * 100).toFixed(0)}–${(logistic_ci_high * 100).toFixed(0)}`
      : null;

  return (
    <div className="bg-surface p-5">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="font-mono font-black text-on-surface tracking-tighter text-base leading-none">
            {ticker}
          </div>
          <div className="text-[9px] tracking-widest uppercase text-outline font-mono mt-1">
            {CAP_CLASS_LABEL[cap_class] ?? cap_class} · niche leads
          </div>
        </div>
        {logistic_score != null && (
          <div className="text-right">
            <div className="text-[9px] tracking-widest uppercase text-outline font-mono">edge</div>
            <div className="font-mono font-bold text-secondary text-lg tabular-nums leading-none">
              {scorePct}<span className="text-xs opacity-70">%</span>
            </div>
            {scoreCI && (
              <div className="text-[9px] font-mono text-outline tabular-nums">
                CI {scoreCI}
              </div>
            )}
          </div>
        )}
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-14 overflow-visible" preserveAspectRatio="none">
        {/* niche — secondary */}
        <path d={linePath('niche')} fill="none" stroke="currentColor" className="text-secondary" strokeWidth="1.5" />
        {/* middle — tertiary */}
        <path d={linePath('middle')} fill="none" stroke="currentColor" className="text-tertiary" strokeWidth="1.5" />
        {/* mainstream — error */}
        <path d={linePath('mainstream')} fill="none" stroke="currentColor" className="text-error/70" strokeWidth="1.5" />
      </svg>

      <div className="flex gap-3 mt-2 text-[9px] font-mono tracking-wide text-outline">
        <span><span className="text-secondary">●</span> niche</span>
        <span><span className="text-tertiary">●</span> middle</span>
        <span><span className="text-error/80">●</span> mainstream</span>
      </div>
    </div>
  );
}

function DiffusionVisual() {
  // Three concentric rings (niche / middle / mainstream) with dots flowing outward.
  // Pure CSS keyframes — no library, no JS animation loops.
  return (
    <div
      className="relative w-[260px] h-[260px] sm:w-[300px] sm:h-[300px] flex items-center justify-center select-none"
      aria-hidden="true"
    >
      <style>{`
        @keyframes diffusion-flow-1 {
          0%   { transform: rotate(0deg)   translate(50px) scale(1); opacity: 1; }
          50%  { transform: rotate(180deg) translate(95px) scale(0.85); opacity: 0.85; }
          100% { transform: rotate(360deg) translate(140px) scale(0.65); opacity: 0; }
        }
        @keyframes diffusion-flow-2 {
          0%   { transform: rotate(60deg)  translate(50px) scale(1); opacity: 1; }
          50%  { transform: rotate(240deg) translate(95px) scale(0.85); opacity: 0.85; }
          100% { transform: rotate(420deg) translate(140px) scale(0.65); opacity: 0; }
        }
        @keyframes diffusion-flow-3 {
          0%   { transform: rotate(180deg) translate(50px) scale(1); opacity: 1; }
          50%  { transform: rotate(360deg) translate(95px) scale(0.85); opacity: 0.85; }
          100% { transform: rotate(540deg) translate(140px) scale(0.65); opacity: 0; }
        }
        @keyframes diffusion-flow-4 {
          0%   { transform: rotate(270deg) translate(50px) scale(1); opacity: 1; }
          50%  { transform: rotate(450deg) translate(95px) scale(0.85); opacity: 0.85; }
          100% { transform: rotate(630deg) translate(140px) scale(0.65); opacity: 0; }
        }
        @keyframes diffusion-pulse {
          0%, 100% { opacity: 0.25; transform: scale(1); }
          50%      { opacity: 0.45; transform: scale(1.05); }
        }
      `}</style>

      {/* Outer ring — mainstream */}
      <div
        className="absolute rounded-full border border-error/30"
        style={{
          width: 280,
          height: 280,
          animation: 'diffusion-pulse 4.2s ease-in-out infinite',
        }}
      />
      {/* Middle ring */}
      <div
        className="absolute rounded-full border border-tertiary/40"
        style={{
          width: 190,
          height: 190,
          animation: 'diffusion-pulse 3.6s ease-in-out infinite',
          animationDelay: '0.5s',
        }}
      />
      {/* Inner ring — niche */}
      <div
        className="absolute rounded-full border border-secondary/60"
        style={{
          width: 100,
          height: 100,
          animation: 'diffusion-pulse 3.0s ease-in-out infinite',
          animationDelay: '1s',
        }}
      />

      {/* Niche pulse core */}
      <div className="absolute w-3 h-3 rounded-full bg-secondary shadow-[0_0_20px_rgba(102,217,204,0.7)]" />

      {/* Flowing particles (4 staggered) */}
      {[
        { anim: 'diffusion-flow-1 5.4s ease-out infinite',         color: 'bg-secondary' },
        { anim: 'diffusion-flow-2 5.4s ease-out infinite 1.35s',    color: 'bg-tertiary' },
        { anim: 'diffusion-flow-3 5.4s ease-out infinite 2.7s',     color: 'bg-error/80' },
        { anim: 'diffusion-flow-4 5.4s ease-out infinite 4.05s',    color: 'bg-secondary/80' },
      ].map((p, i) => (
        <div
          key={i}
          className={`absolute w-2 h-2 rounded-full ${p.color}`}
          style={{ animation: p.anim }}
        />
      ))}

      {/* Tier labels */}
      <div className="absolute top-1 right-1 text-[9px] tracking-[0.3em] text-error/70 font-mono uppercase">
        mainstream
      </div>
      <div className="absolute top-1/2 -translate-y-1/2 right-[42%] text-[9px] tracking-[0.3em] text-tertiary font-mono uppercase">
        middle
      </div>
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[9px] tracking-[0.3em] text-secondary font-mono uppercase">
        niche →
      </div>
    </div>
  );
}

function TierCard({
  tone,
  label,
  symbol,
  example,
  audience,
  why,
}: {
  tone: 'secondary' | 'tertiary' | 'error';
  label: string;
  symbol: string;
  example: string;
  audience: string;
  why: string;
}) {
  const accent =
    tone === 'secondary'
      ? 'text-secondary'
      : tone === 'tertiary'
        ? 'text-tertiary'
        : 'text-error/90';

  return (
    <div className="bg-surface p-6 md:p-7 hover:bg-surface-container-low/40 transition-colors">
      <div className="flex items-baseline justify-between mb-4">
        <div className={`text-[10px] tracking-[0.4em] font-mono uppercase font-bold ${accent}`}>
          {label}
        </div>
        <span className="text-2xl opacity-80">{symbol}</span>
      </div>
      <div className="text-on-surface text-base font-bold mb-2">
        {example}
      </div>
      <p className="text-on-surface-variant text-sm leading-relaxed mb-3">
        {audience}
      </p>
      <p className={`text-xs leading-relaxed ${accent} opacity-90`}>
        {why}
      </p>
    </div>
  );
}

function StepCard({
  n,
  title,
  body,
  tone,
}: {
  n: string;
  title: string;
  body: string;
  tone: 'primary' | 'secondary' | 'tertiary' | 'primary-fixed';
}) {
  const accent =
    tone === 'primary'
      ? 'text-primary'
      : tone === 'secondary'
        ? 'text-secondary'
        : tone === 'tertiary'
          ? 'text-tertiary'
          : 'text-primary-fixed';

  return (
    <div className="bg-surface p-6 md:p-7 hover:bg-surface-container-low/40 transition-colors flex flex-col">
      <div className={`font-mono font-black text-3xl tabular-nums leading-none mb-3 ${accent}`}>
        {n}
      </div>
      <div className="text-on-surface text-base font-bold mb-2">
        {title}
      </div>
      <p className="text-on-surface-variant text-sm leading-relaxed">
        {body}
      </p>
    </div>
  );
}

function MemoryFeedItem({ entry }: { entry: MemoryEntry }) {
  const tagClass =
    entry.event_type === 'drift_alert'
      ? 'text-error border-error/40 bg-error/10'
      : entry.event_type === 'cycle_summary'
        ? 'text-tertiary border-tertiary/40 bg-tertiary/10'
        : 'text-secondary border-secondary/40 bg-secondary/10';

  const ts = new Date(entry.occurred_at);
  const tsLabel =
    ts.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

  return (
    <div className="px-6 py-3 hover:bg-surface-container-low/30 transition-colors flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-4">
      <span className="text-[10px] tracking-widest text-outline tabular-nums shrink-0">
        {tsLabel}
      </span>
      <span className={`text-[9px] tracking-widest uppercase px-1.5 py-0.5 border self-start shrink-0 ${tagClass}`}>
        {entry.event_type.replace('_', ' ')}
      </span>
      {entry.ticker && (
        <span className="text-on-surface font-bold tabular-nums shrink-0">
          {entry.ticker}
        </span>
      )}
      <span className="text-on-surface-variant leading-relaxed">
        {entry.message}
      </span>
    </div>
  );
}

/* ───────────────────────── Phase 16-05: Technical Pattern Library ───────────────────────── */

const TECH_CAP_LABEL: Record<string, string> = {
  large_cap: 'Large Cap',
  mid_cap: 'Mid Cap',
  small_cap: 'Small Cap',
};

function TechnicalPatternLibrarySection({
  cells,
  selectedHorizon,
  onHorizonChange,
}: {
  cells: TechnicalPatternCell[];
  selectedHorizon: number;
  onHorizonChange: (h: number) => void;
}) {
  const filtered = cells.filter((c) => c.horizon_days === selectedHorizon);

  return (
    <section className="my-12 border border-outline-variant/30" aria-label="Technical Pattern Library">
      <div className="p-6 md:p-8 border-b border-outline-variant/20">
        <div className="text-[10px] tracking-[0.4em] text-primary/70 font-mono uppercase mb-1">
          Technical Pattern Library
        </div>
        <h2 className="text-on-surface text-base font-bold tracking-tight">
          Technical Pattern Library — {selectedHorizon}d horizon
        </h2>
        <p className="text-on-surface-variant text-xs mt-2 max-w-3xl leading-relaxed">
          Each cell shows the engine&apos;s posterior probability that a given technical pattern
          produces &gt;1% excess return vs SPY at the selected horizon, conditioned on the ticker&apos;s
          market-cap class. 8 TechPatterns × 3 cap_classes × 6 horizons = 144 cells.
        </p>
        <p className="text-on-surface-variant text-xs mt-3 max-w-3xl leading-relaxed">
          Technical priors mature in ~30–60 days post-launch. Most cells will read EXPLORATORY until then — that is the engine learning, not a bug.
        </p>

        {/* Horizon selector — segmented control */}
        <div className="mt-5 inline-flex gap-px bg-outline-variant/30 border border-outline-variant/30 p-px" role="tablist" aria-label="Horizon">
          {HORIZONS.map((h) => {
            const active = h === selectedHorizon;
            const isPrimary = h === PRIMARY_HORIZON;
            return (
              <button
                key={h}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onHorizonChange(h)}
                className={`text-xs font-mono tracking-widest uppercase px-3 py-1.5 transition-colors ${
                  active
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {h}d{isPrimary ? '★' : ''}
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] tracking-[0.3em] text-outline font-mono uppercase border-b border-outline-variant/30">
              <th className="text-left font-medium px-6 py-3">Pattern</th>
              {TECH_CAP_COL_ORDER.map((cc) => (
                <th key={cc} className="text-left font-medium px-3 py-3">
                  {TECH_CAP_LABEL[cc]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TECH_PATTERNS.map((pk) => (
              <tr
                key={pk}
                className={`border-b border-outline-variant/10 ${
                  selectedHorizon === PRIMARY_HORIZON ? 'border-l-2 border-l-primary' : ''
                }`}
              >
                <td className="px-6 py-4 font-bold text-on-surface tracking-tight align-top">
                  <div>{TECH_PATTERN_LABEL[pk]}</div>
                  <div className="text-[10px] text-outline font-mono tracking-widest uppercase mt-0.5">
                    {pk}
                  </div>
                </td>
                {TECH_CAP_COL_ORDER.map((cc) => {
                  const cell = filtered.find((c) => c.pattern_key === pk && c.cap_class === cc);
                  return (
                    <td key={cc} className="px-3 py-4 align-top">
                      <TechnicalPatternCellView cell={cell} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TechnicalPatternCellView({ cell }: { cell: TechnicalPatternCell | undefined }) {
  if (!cell || cell.sample_size === 0) {
    return (
      <div className="text-[10px] font-mono tracking-widest uppercase text-outline opacity-30">
        — no data —
      </div>
    );
  }
  const meanPct = cell.posterior_mean != null ? (cell.posterior_mean * 100).toFixed(0) : '—';
  const ciLow = cell.ci != null ? (cell.ci[0] * 100).toFixed(0) : '—';
  const ciHigh = cell.ci != null ? (cell.ci[1] * 100).toFixed(0) : '—';

  const statusBadgeClass =
    cell.status === 'ACTIVE'
      ? 'text-secondary border-secondary/40 bg-secondary/10'
      : cell.status === 'DEPRECATED'
        ? 'text-error border-error/40 bg-error/10'
        : cell.status === 'NO_DATA'
          ? 'text-outline border-outline-variant/40 bg-surface-container-low opacity-30'
          : 'text-outline border-outline-variant/40 bg-surface-container-low border-dashed';

  const containerClass =
    cell.status === 'EXPLORATORY'
      ? 'opacity-60'
      : cell.status === 'NO_DATA'
        ? 'opacity-30'
        : '';

  return (
    <div className={containerClass}>
      <div className="font-mono font-black text-on-surface text-base tabular-nums leading-none mb-1">
        {meanPct}<span className="text-xs opacity-70">%</span>
      </div>
      <div className="text-[11px] font-mono tracking-wide text-outline mb-1">
        [{ciLow}–{ciHigh}%]
      </div>
      <div className="text-[10px] font-mono text-outline mb-1">
        n={cell.sample_size}
      </div>
      <span className={`text-[9px] font-mono tracking-widest uppercase px-1.5 py-0.5 border ${statusBadgeClass}`}>
        {cell.status}
      </span>
    </div>
  );
}

/* ───────────────────────── Phase 17-05: Smart Money Pattern Library ───────────────────────── */

interface SmartMoneyCell {
  pattern_key: string;
  cap_class: string;
  horizon_days: number;
  status: string;
  posterior_mean: number | null;
  sample_size: number;
  brier_in_sample: number | null;
  brier_out_sample: number | null;
}

const SMART_MONEY_CAP_COL_ORDER = ['large_cap', 'mid_cap', 'small_cap'] as const;

const SMART_MONEY_CAP_LABEL: Record<string, string> = {
  large_cap: 'Large Cap',
  mid_cap: 'Mid Cap',
  small_cap: 'Small Cap',
};

function SmartMoneyPatternCellView({ cell }: { cell: SmartMoneyCell | undefined }) {
  if (!cell || cell.sample_size === 0) {
    return (
      <div className="text-[10px] font-mono tracking-widest uppercase text-outline opacity-30">
        — no data —
      </div>
    );
  }

  const meanPct = cell.posterior_mean != null ? (cell.posterior_mean * 100).toFixed(0) : '—';

  const statusBadgeClass =
    cell.status === 'ACTIVE'
      ? 'text-secondary border-secondary/40 bg-secondary/10'
      : cell.status === 'DEPRECATED'
        ? 'text-error border-error/40 bg-error/10'
        : cell.status === 'NO_DATA'
          ? 'text-outline border-outline-variant/40 bg-surface-container-low opacity-30'
          : 'text-outline border-outline-variant/40 bg-surface-container-low border-dashed';

  const containerClass =
    cell.status === 'EXPLORATORY'
      ? 'opacity-60'
      : cell.status === 'NO_DATA'
        ? 'opacity-30'
        : '';

  return (
    <div className={containerClass}>
      <div className="font-mono font-black text-on-surface text-base tabular-nums leading-none mb-1">
        {meanPct}<span className="text-xs opacity-70">%</span>
      </div>
      <div className="text-[10px] font-mono text-outline mb-1">
        n={cell.sample_size}
      </div>
      {cell.brier_in_sample != null && (
        <div className="text-[10px] font-mono text-outline mb-1">
          Brier {cell.brier_in_sample.toFixed(3)}
        </div>
      )}
      <span className={`text-[9px] font-mono tracking-widest uppercase px-1.5 py-0.5 border ${statusBadgeClass}`}>
        {cell.status}
      </span>
    </div>
  );
}

function SmartMoneyPatternLibrarySection({
  fetchUrl,
  title,
  subtitle,
  selectedHorizon,
  onHorizonChange,
}: {
  fetchUrl: string;
  title: string;
  subtitle: string;
  selectedHorizon: number;
  onHorizonChange: (h: number) => void;
}) {
  const [cells, setCells] = useState<SmartMoneyCell[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(fetchUrl)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setCells(data.cells ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [fetchUrl]);

  // Derive distinct bucket keys from returned cells (sorted alphabetically for stable grid).
  const bucketKeys = Array.from(new Set(cells.map((c) => c.pattern_key))).sort();
  const filtered = cells.filter((c) => c.horizon_days === selectedHorizon);

  return (
    <section className="my-12 border border-outline-variant/30" aria-label={title}>
      <div className="p-6 md:p-8 border-b border-outline-variant/20">
        <div className="text-[10px] tracking-[0.4em] text-primary/70 font-mono uppercase mb-1">
          {title}
        </div>
        <h2 className="text-on-surface text-base font-bold tracking-tight">
          {title} — {selectedHorizon}d horizon{selectedHorizon === PRIMARY_HORIZON && <span className="ml-1 text-primary" aria-label="Primary horizon">★</span>}
        </h2>
        <p className="text-on-surface-variant text-xs mt-2 max-w-3xl leading-relaxed">
          {subtitle} Each cell shows the engine&apos;s posterior probability that the pattern
          produces &gt;1% excess return vs SPY at the selected horizon, conditioned on market-cap class.
          8 buckets × 3 cap_classes × 6 horizons = 144 cells.
        </p>
        <p className="text-on-surface-variant text-xs mt-3 max-w-3xl leading-relaxed">
          Smart money priors mature after backfill + recompute. Most cells read EXPLORATORY until then — that is the engine learning, not a bug.
        </p>

        {/* Horizon selector — segmented control */}
        <div className="mt-5 inline-flex gap-px bg-outline-variant/30 border border-outline-variant/30 p-px" role="tablist" aria-label="Horizon">
          {HORIZONS.map((h) => {
            const active = h === selectedHorizon;
            const isPrimary = h === PRIMARY_HORIZON;
            return (
              <button
                key={h}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onHorizonChange(h)}
                className={`text-xs font-mono tracking-widest uppercase px-3 py-1.5 transition-colors ${
                  active
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {h}d{isPrimary ? '★' : ''}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-on-surface-variant text-sm font-mono animate-pulse">
          Loading…
        </div>
      ) : cells.length === 0 ? (
        <div className="p-12 text-center text-on-surface-variant text-sm">
          No patterns yet — backfill is still running.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="smart-money-grid">
            <thead>
              <tr className="text-[10px] tracking-[0.3em] text-outline font-mono uppercase border-b border-outline-variant/30">
                <th className="text-left font-medium px-6 py-3">Pattern</th>
                {SMART_MONEY_CAP_COL_ORDER.map((cc) => (
                  <th key={cc} className="text-left font-medium px-3 py-3">
                    {SMART_MONEY_CAP_LABEL[cc]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bucketKeys.map((pk) => (
                <tr
                  key={pk}
                  className={`border-b border-outline-variant/10 ${
                    selectedHorizon === PRIMARY_HORIZON ? 'border-l-2 border-l-primary' : ''
                  }`}
                >
                  <td className="px-6 py-4 font-bold text-on-surface tracking-tight align-top">
                    <div className="uppercase">{pk.replace(/_/g, ' ')}</div>
                    <div className="text-[10px] text-outline font-mono tracking-widest uppercase mt-0.5">
                      {pk}
                    </div>
                  </td>
                  {SMART_MONEY_CAP_COL_ORDER.map((cc) => {
                    const cell = filtered.find((c) => c.pattern_key === pk && c.cap_class === cc);
                    return (
                      <td key={cc} className="px-3 py-4 align-top">
                        <SmartMoneyPatternCellView cell={cell} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ───────────────────────── Phase 16-05: Horizon Brier ───────────────────────── */

function HorizonBrierSection({ data }: { data: HorizonBrierData | null }) {
  // Only show ACTIVE patterns in the chart (any horizon ACTIVE qualifies the series).
  const activeSeries = (data?.series ?? []).filter((s) =>
    s.points.some((p) => p.status === 'ACTIVE'),
  );

  return (
    <section className="my-12 border border-outline-variant/30" aria-label="Horizon Brier">
      <div className="p-6 md:p-8 border-b border-outline-variant/20">
        <div className="text-[10px] tracking-[0.4em] text-primary/70 font-mono uppercase mb-1">
          Horizon Brier
        </div>
        <h2 className="text-on-surface text-base font-bold tracking-tight">
          Brier score per ACTIVE TechPattern across horizons
        </h2>
        <p className="text-on-surface-variant text-xs mt-2 max-w-3xl leading-relaxed">
          Lower Brier = better calibrated. Dashed reference at 0.25 = chance baseline.
          x-axis: 3d, 7d, 14d, 30d★, 60d, 90d. Each line is one ACTIVE TechPattern.
        </p>
      </div>

      {activeSeries.length === 0 ? (
        <div className="p-12 text-center text-on-surface-variant text-sm">
          No ACTIVE technical patterns yet. Engine needs ~30–60 days of post-Phase-16 data to mark cells ACTIVE. Until then, the diffusion library is the primary signal.
        </div>
      ) : (
        <HorizonBrierChart series={activeSeries} brierNull={data?.brier_null ?? 0.25} />
      )}
    </section>
  );
}

function HorizonBrierChart({
  series,
  brierNull,
}: {
  series: HorizonBrierData['series'];
  brierNull: number;
}) {
  // Pure SVG line chart — no extra deps. x = log-of-horizon for visual spacing.
  const W = 720;
  const H = 320;
  const PAD_L = 56;
  const PAD_R = 24;
  const PAD_T = 24;
  const PAD_B = 48;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  // y range 0..0.5 inverted (0 top, 0.5 bottom).
  const Y_MAX = 0.5;
  const yPos = (b: number) => PAD_T + (Math.min(Math.max(b, 0), Y_MAX) / Y_MAX) * innerH;

  // x positions — even spacing across the 6 horizons.
  const xPos = (i: number) => PAD_L + (i / (HORIZONS.length - 1)) * innerW;

  // Color rotation through CSS theme tokens.
  const COLORS = [
    'var(--color-primary, #66d9cc)',
    'var(--color-secondary, #66d9cc)',
    'var(--color-tertiary, #b6c4ff)',
    'var(--color-error, #f87171)',
    'var(--color-on-surface, #e6e6e6)',
    '#f59e0b',
    '#a78bfa',
    '#34d399',
  ];

  return (
    <div className="overflow-x-auto p-6">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-label="Brier score by horizon">
        {/* y-axis */}
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="currentColor" className="text-outline-variant" strokeWidth="1" />
        {/* x-axis */}
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="currentColor" className="text-outline-variant" strokeWidth="1" />

        {/* y ticks at 0, 0.1, 0.2, 0.3, 0.4, 0.5 */}
        {[0, 0.1, 0.2, 0.3, 0.4, 0.5].map((b) => (
          <g key={b}>
            <line x1={PAD_L - 4} y1={yPos(b)} x2={PAD_L} y2={yPos(b)} stroke="currentColor" className="text-outline-variant" />
            <text x={PAD_L - 8} y={yPos(b) + 4} textAnchor="end" className="text-[10px] fill-outline font-mono">{b.toFixed(2)}</text>
          </g>
        ))}

        {/* x ticks — 30d gets ★ */}
        {HORIZONS.map((h, i) => (
          <g key={h}>
            <line x1={xPos(i)} y1={H - PAD_B} x2={xPos(i)} y2={H - PAD_B + 4} stroke="currentColor" className="text-outline-variant" />
            <text
              x={xPos(i)}
              y={H - PAD_B + 18}
              textAnchor="middle"
              className={`text-[10px] font-mono ${h === PRIMARY_HORIZON ? 'fill-primary font-bold' : 'fill-outline'}`}
            >
              {h}d{h === PRIMARY_HORIZON ? '★' : ''}
            </text>
          </g>
        ))}

        {/* Adversarial null reference line */}
        <line
          x1={PAD_L}
          y1={yPos(brierNull)}
          x2={W - PAD_R}
          y2={yPos(brierNull)}
          stroke="currentColor"
          className="text-outline"
          strokeDasharray="4 4"
          strokeWidth="1"
        />
        <text x={W - PAD_R - 4} y={yPos(brierNull) - 4} textAnchor="end" className="text-[10px] fill-outline font-mono">
          null = {brierNull.toFixed(2)}
        </text>

        {/* Series */}
        {series.map((s, idx) => {
          const validPoints = s.points
            .map((p, i) => ({ p, i }))
            .filter(({ p }) => p.brier_in_sample != null);
          if (validPoints.length === 0) return null;
          const path = validPoints
            .map(({ p, i }, j) => {
              const x = xPos(i);
              const y = yPos(p.brier_in_sample!);
              return `${j === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
            })
            .join(' ');
          const color = COLORS[idx % COLORS.length];
          return (
            <g key={s.pattern_key}>
              <path d={path} fill="none" stroke={color} strokeWidth="1.5" />
              {validPoints.map(({ p, i }) => (
                <circle
                  key={`${s.pattern_key}-${i}`}
                  cx={xPos(i)}
                  cy={yPos(p.brier_in_sample!)}
                  r="2.5"
                  fill={color}
                />
              ))}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-4 text-[10px] font-mono tracking-wide text-on-surface-variant">
        {series.map((s, idx) => {
          const color = COLORS[idx % COLORS.length];
          return (
            <div key={s.pattern_key} className="flex items-center gap-1.5">
              <span style={{ width: 10, height: 2, background: color, display: 'inline-block' }} aria-hidden />
              <span className="uppercase tracking-widest">{TECH_PATTERN_LABEL[s.pattern_key] ?? s.pattern_key}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
