# Domain Pitfalls

**Domain:** AI-powered financial ticker research tool
**Researched:** 2026-03-10
**Confidence note:** Web search and WebFetch tools were unavailable during this research session.
All findings are drawn from training data (cutoff August 2025). Confidence levels are assigned
conservatively. HIGH confidence items are based on well-documented, stable patterns.
Items marked LOW require validation against current documentation before acting on them.

---

## Critical Pitfalls

Mistakes that cause rewrites, legal exposure, or complete loss of user trust.

---

### Pitfall 1: LLM Hallucination of Financial Figures

**What goes wrong:** The model generates plausible-sounding but fabricated financial data —
specific revenue numbers, EPS figures, price targets, analyst ratings, or historical price
points — with no source grounding. In a general chatbot this is annoying; in a financial
research tool it is dangerous and liability-creating.

**Why it happens:** LLMs are trained to complete text fluently. When asked about a specific
ticker's fundamentals and no retrieved data is provided, the model fills the gap with
statistically likely-sounding numbers. This is especially common when the ticker is obscure,
when data is stale in training, or when the prompt does not clearly constrain the model to
only use provided sources.

**Consequences:** Users make real financial decisions based on invented data. Trust is
destroyed immediately upon discovery. In some jurisdictions, publishing fabricated financial
data may create legal exposure even without intent.

**Prevention:**
- Claude Code SDK must retrieve all financial figures before passing to the reasoning layer.
  The reasoning layer (NotebookLM or any LLM) must be explicitly instructed: "Only use the
  sources provided. Do not generate financial figures not present in these sources."
- Every numerical claim in the output report must include a source citation.
- Build a validation step: if NotebookLM output contains financial figures with no matching
  source reference, flag the report as requiring manual review.
- Consider adding a post-processing check that scans the report for numbers and verifies
  each has an attributed source.

**Detection:** Watch for: numbers in the report that don't appear in any source document,
analyst price targets with no source citation, EPS/revenue figures that differ from the
retrieved data.

**Phase:** Phase 1 (data gathering) and Phase 2 (NotebookLM integration). Source grounding
must be architected into Phase 1 prompts and enforced in Phase 2 output validation.

**Confidence:** HIGH — this is well-documented behavior of LLMs and a known risk in
financial applications.

---

### Pitfall 2: NotebookLM Has No Public API (As of Training Cutoff)

**What goes wrong:** The architecture assumes NotebookLM can be driven programmatically
via the Claude Code SDK. As of August 2025, NotebookLM did not have a public programmatic
API. Integration required browser automation, manual upload workflows, or Google Workspace
API workarounds — none of which are stable or production-suitable.

**Why it happens:** NotebookLM is a Google product positioned as a consumer/enterprise tool,
not a developer API. The Claude Code SDK "NotebookLM skill" referenced in CLAUDE.md may
refer to an automation layer that wraps the web UI, which is fragile.

**Consequences:** Phase 2 (NotebookLM integration) may be technically blocked if a stable
API doesn't exist. Building on browser automation leads to brittle pipelines that break on
UI updates.

**Prevention:**
- Before Phase 2 begins, verify current NotebookLM API availability. Check:
  https://notebooklm.google.com and the Google Labs developer documentation.
- If no API exists, evaluate whether NotebookLM can be replaced with a direct LLM call
  (Claude, GPT-4o) with explicit source-grounding instructions — this achieves the same
  outcome with a stable API.
- Design Phase 2 so the reasoning layer is swappable. The interface between "sources in"
  and "structured report out" should be an abstraction, not a hard dependency on one tool.

**Detection:** If the Claude Code SDK NotebookLM skill requires screen scraping, Playwright,
or Selenium — this is a red flag that the integration is UI automation, not API integration.

**Phase:** Must be resolved before Phase 2 begins. Architecture risk that should be validated
in Phase 1.

**Confidence:** MEDIUM — NotebookLM had no public API as of my training data. This may
have changed. Requires verification before Phase 2 planning.

---

### Pitfall 3: Missing Regulatory Disclaimers on Financial Output

**What goes wrong:** The tool produces Buy/Hold/Sell assessments and market sentiment
analysis without legal disclaimers. In the US and most jurisdictions, providing investment
advice — even AI-generated — without appropriate disclaimers (and potentially without
registration as an investment advisor) creates legal exposure.

**Why it happens:** Developers focus on the technical product and treat disclaimers as
polish to add later. By the time the tool is deployed, the output format is established and
retrofitting disclaimers feels disruptive.

**Consequences:** Regulatory scrutiny under SEC Rule 15c2-2, FCA rules (UK), or equivalent.
User reliance on unqualified financial advice. Platform liability if deployed as a web app.

**Prevention:**
- Every report output must include a standardized disclaimer block stating: "This is not
  investment advice. This report is generated by an AI system and is for informational
  purposes only. Past performance does not guarantee future results. Consult a licensed
  financial advisor before making investment decisions."
- The disclaimer must be non-removable and included in the output format specification
  from Phase 1 — not added later.
- Buy/Hold/Sell labels should be explicitly labeled as "AI-generated assessment, not a
  recommendation."
- For web deployment (Phase 4), consult legal counsel before launch.

**Detection:** If the output format spec in CLAUDE.md doesn't include a disclaimer section,
that's the first warning sign. The defined output format (Ticker Overview through Sources Used)
currently has no disclaimer step.

**Phase:** Phase 1 (output format must include disclaimer from the start) and Phase 4
(legal review before web deployment).

**Confidence:** HIGH — disclaimer requirements for AI financial tools are well-established
and consistent across jurisdictions.

---

### Pitfall 4: Treating Stale Data as Current

**What goes wrong:** The system retrieves news and financial data, caches or processes it,
then presents a report that reflects data from hours or days ago as if it is current. A user
researches a ticker during earnings season; the report references pre-earnings data because
the news retrieval hit a cache or the API returned stale results.

**Why it happens:** Developers add caching for performance and cost reasons (justified) but
don't timestamp the data in the output. The report reads as authoritative and present-tense
without indicating when the data was collected.

**Consequences:** Users act on outdated information. A "Hold" recommendation generated the
morning before bad earnings news becomes misleading. Confidence in the tool collapses.

**Prevention:**
- Every piece of retrieved data must carry a timestamp at collection time.
- The report output must include a "Data as of: [timestamp]" field prominently.
- Set aggressive TTL policies for market data caches: price data should not be cached more
  than 15 minutes during market hours; news should not be cached more than 1 hour.
- The report format should prominently show the data collection time, not the report
  generation time (these can differ).

**Detection:** If the data pipeline doesn't record collection timestamps, or if the output
format has no "data freshness" indicator, this pitfall is present.

**Phase:** Phase 1 (data collection must capture timestamps). Phase 2 (report output must
surface timestamps).

**Confidence:** HIGH — timestamp requirements for financial data are standard practice.

---

### Pitfall 5: Financial Data API Rate Limits and Cost Overruns

**What goes wrong:** The research pipeline makes multiple API calls per ticker — price data,
fundamentals, news, analyst ratings. Free tier APIs (Alpha Vantage free tier: 5 calls/min,
500/day; Yahoo Finance unofficial: rate-limited and unreliable; Polygon.io free tier:
limited endpoints) are quickly exhausted. Premium tier costs are not accounted for in the
product design, leading to budget shock at scale.

**Why it happens:** Prototypes are built on free tiers. When the system starts making 10-15
API calls per research request (across multiple data sources) and multiple users submit
requests concurrently, free tier limits are hit within the first hour of real use.

**Consequences:** Research requests fail silently or with confusing errors. The system
falls back to incomplete data without notifying the user. At scale, API costs become the
dominant operating expense.

**Prevention:**
- In Phase 1, audit every API call made per research request. Document: which API, which
  endpoint, expected call count per request, free tier limit, paid tier cost.
- Design for graceful degradation: if a non-critical data source fails (e.g., analyst
  ratings API), the report should note the gap rather than fail entirely.
- Build a request budget per ticker research job: maximum X API calls per request.
- For web deployment, implement per-user rate limiting before exposing to external traffic.
- Consider yfinance (Yahoo Finance Python library) for fundamentals — it's free and
  widely used, but treat it as unofficial and expect it to break periodically.

**Detection:** A research request that makes no attempt to count or limit API calls is a
warning sign. Missing error handling on API responses is a second warning sign.

**Phase:** Phase 1 (API call budget design). Phase 4 (cost modeling before web deployment).

**Confidence:** HIGH — API rate limit patterns are well-documented across all major
financial data providers.

---

## Moderate Pitfalls

### Pitfall 1: NotebookLM Source Count and Size Limits

**What goes wrong:** NotebookLM has limits on sources per notebook (as of training data:
approximately 50 sources per notebook, with per-source size limits). A research pipeline
that feeds 20-30 news articles plus financial filings per ticker may hit these limits,
causing sources to be silently dropped or the notebook creation to fail.

**Prevention:**
- Validate source limits against current NotebookLM documentation before Phase 2.
- Design the source selection step in Phase 1 to prioritize and trim sources to fit within
  documented limits. Quality over quantity: 10 high-signal sources are better than 40
  low-signal ones.
- If source limits are restrictive, pre-summarize long documents before submission to
  reduce token/character footprint.

**Phase:** Phase 1 (source selection and pruning) and Phase 2 (limit validation).

**Confidence:** LOW — NotebookLM limits as of training data may have changed. Requires
verification before Phase 2.

---

### Pitfall 2: Ticker Symbol Ambiguity

**What goes wrong:** The user inputs "AAPL" and means Apple Inc. on NASDAQ. But the system
queries an API that returns multiple matches (e.g., different exchanges, ADRs, ETFs with
similar symbols). The research pipeline silently uses the wrong instrument.

**Why it happens:** Global markets have thousands of tickers. Many symbols are reused across
exchanges. APIs differ in how they handle symbol resolution.

**Prevention:**
- The chart confirmation step already in the project design (user confirms correct stock
  via chart preview) is the right mitigation. It must happen before any expensive data
  gathering begins.
- When resolving a ticker, always include: company name, exchange, market cap, and a
  chart thumbnail in the confirmation step. Don't just show the symbol back to the user.
- Store the confirmed instrument identifier (e.g., ISIN or exchange-specific symbol) and
  use that for all subsequent API calls, not the raw user-input symbol.

**Phase:** Phase 1 (ticker confirmation must be the first step before any research begins).

**Confidence:** HIGH — ticker ambiguity is a well-known issue in financial data systems.

---

### Pitfall 3: Report Quality vs. Speed Tradeoff Not Explicitly Managed

**What goes wrong:** The pipeline is optimized for speed during development. Developers
reduce the number of sources, truncate document inputs to fit token limits, and cache
aggressively. By the time the product is user-facing, the "fast" path produces shallow
reports while the "thorough" path is too slow for practical use.

**Prevention:**
- Define two explicit modes early: a "quick" mode (fewer sources, faster, lower cost) and
  a "deep" mode (comprehensive sources, slower, higher cost). Let the user choose.
- Establish quality baselines in Phase 2: what does a good report look like for a large-cap
  ticker? For a small-cap? For an ETF? Use these as test cases.
- Measure report generation time from Phase 1 and set a target SLA (e.g., under 60 seconds
  for quick mode). If it exceeds the target, trace which step is the bottleneck before
  optimizing anything.

**Phase:** Phase 2 (quality baseline establishment). Phase 4 (performance tuning for
web deployment).

**Confidence:** HIGH — speed/quality tradeoffs in LLM pipelines are universally observed.

---

### Pitfall 4: Conflating News Sentiment with Price Prediction

**What goes wrong:** The system aggregates recent news, determines sentiment is "bullish,"
and presents this as evidence supporting a "Buy" recommendation. News sentiment and forward
price performance have weak correlation, especially over short time horizons.

**Why it happens:** Sentiment analysis is easy to implement and produces confident-sounding
output. It feels like research. But news sentiment can be systematically misleading:
positive news during market tops, negative news at bottoms.

**Consequences:** The model produces confident-sounding analysis built on a weak signal.
Users trust the analysis more than is warranted.

**Prevention:**
- Explicitly label sentiment analysis as "recent news tone" not "forward price indicator."
- The reasoning prompt for NotebookLM should instruct: "Identify what the sources say about
  recent developments. Do not extrapolate future price movement from sentiment alone."
- The Bullish/Bearish factors section should distinguish between: fundamental factors
  (earnings, revenue, margins), technical factors (price trend, volume), and sentiment
  factors (news tone, analyst commentary) — with explicit acknowledgment that sentiment is
  the weakest predictor.

**Phase:** Phase 2 (reasoning prompt design and output format).

**Confidence:** HIGH — the weak correlation between news sentiment and forward returns is
well-established in financial research literature.

---

### Pitfall 5: Local Execution Model Breaks for Web Deployment

**What goes wrong:** Phase 1-3 are built local-first. The Claude Code SDK runs on the
user's machine. When Phase 4 attempts to deploy as a web app, the architecture doesn't
translate: the SDK was never designed to run as a backend service, credentials are
machine-local, and the NotebookLM integration assumes the user's browser session.

**Prevention:**
- Design the data collection layer (Claude Code SDK) with explicit interface boundaries
  from Phase 1: inputs, outputs, and side effects should be clearly defined.
- Even when running locally, structure the pipeline so it could be invoked as a function
  with clean inputs/outputs — not as a script with hard-coded paths or local credentials.
- Document the "web deployment gap" explicitly during Phase 3 so Phase 4 knows what needs
  to be re-architected vs. what transfers cleanly.

**Phase:** Phase 1 (interface design). Phase 3 (gap documentation). Phase 4 (re-architecture).

**Confidence:** HIGH — local-to-web translation is a common source of re-architecture work.

---

## Minor Pitfalls

### Pitfall 1: Over-Engineering the Output Format Early

**What goes wrong:** The team spends Phase 1 building a polished report renderer with
charts, tables, and formatted sections. The underlying data quality is poor, but the
presentation looks good. This masks quality issues until much later.

**Prevention:** In Phase 1, use plaintext or minimal markdown output. Validate data quality
first. Invest in presentation only after the research pipeline produces reliable, accurate
content.

**Phase:** Phase 1 (deliberately defer polish).

**Confidence:** HIGH.

---

### Pitfall 2: Storing Sensitive API Keys in Source Files

**What goes wrong:** Financial data API keys, Google OAuth credentials, or other secrets
are committed to the repository. This is already partially addressed by the project constraint
("never commit research artifacts") but API keys are a separate risk.

**Prevention:** All credentials via environment variables or a secrets manager from day one.
No hardcoded keys in any file committed to git. Add `.env` to `.gitignore` before the first
commit.

**Phase:** Phase 1 (must be enforced before any API integrations are built).

**Confidence:** HIGH.

---

### Pitfall 3: Undefined Behavior on Market Closure or Weekend Research

**What goes wrong:** User researches a ticker on a weekend. Market data APIs return stale
or incomplete data. Some APIs return last-known price; others return errors. The report
presents weekend data as if it is current without indicating the market is closed.

**Prevention:** Check market status (open/closed/pre-market/after-hours) at the start of
each research request and include market status in the report header. Adjust the freshness
language accordingly: "Markets are currently closed. Data reflects last trading session
close: [date]."

**Phase:** Phase 1 (market status check in data collection).

**Confidence:** HIGH.

---

### Pitfall 4: ETF and Index Tickers Produce Low-Quality Reports

**What goes wrong:** The research pipeline is designed around individual equities: company
news, management commentary, earnings reports. When a user inputs an ETF ticker (SPY, QQQ,
ARKK), the pipeline fetches news about the ETF itself (mostly flows and NAV data) instead
of the underlying holdings, producing a shallow, unhelpful report.

**Prevention:** Detect whether the ticker is an equity, ETF, or index at the confirmation
step. For ETFs, adapt the data collection strategy: gather holdings data, sector exposure,
and macro/thematic news rather than individual company fundamentals.

**Phase:** Phase 1 (instrument type detection and strategy branching).

**Confidence:** MEDIUM — based on general understanding of ETF data structures. Specific
API behavior for ETF data varies by provider.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| Phase 1: Ticker input | Ambiguous symbol resolution | Chart confirmation before research begins |
| Phase 1: Data collection | API rate limits exceeded | Audit call count per request; implement graceful degradation |
| Phase 1: Data collection | No timestamps on retrieved data | Capture collection timestamp for every source |
| Phase 1: Output format | Missing disclaimer section | Embed disclaimer in output format spec from day one |
| Phase 2: NotebookLM integration | No public API exists | Validate API availability before planning Phase 2 work |
| Phase 2: NotebookLM integration | Source count/size limits hit | Audit limits; build source pruning in Phase 1 |
| Phase 2: Reasoning quality | LLM generates hallucinated figures | Strict source-grounding instructions; output validation step |
| Phase 2: Report design | News sentiment conflated with price prediction | Explicit labeling; distinguish fundamental vs. sentiment factors |
| Phase 3: User auth | NotebookLM account linking complexity | Research OAuth flow for Google Workspace before starting Phase 3 |
| Phase 4: Web deployment | Local architecture doesn't translate to server | Interface boundaries designed in Phase 1; gap documented in Phase 3 |
| Phase 4: Legal | No disclaimers on public web deployment | Legal review before launch; disclaimers in report format from Phase 1 |

---

## Sources

**Note:** Web search and WebFetch were unavailable during this research session. All findings
are from training data (cutoff August 2025). The following sources should be consulted to
verify claims marked MEDIUM or LOW confidence before acting on them:

- NotebookLM current API status and source limits: https://notebooklm.google.com
- Polygon.io rate limits and pricing: https://polygon.io/docs/stocks/getting-started
- Alpha Vantage API tiers: https://www.alphavantage.co/premium/
- SEC guidance on AI investment tools: https://www.sec.gov/investor/alerts/ai-investment-tools
- FINRA investor alerts on AI tools: https://www.finra.org/investors/alerts
- yfinance library current status: https://github.com/ranaroussi/yfinance

**Training data confidence summary:**
- LLM hallucination risk in financial context: HIGH (well-documented, stable knowledge)
- Disclaimer/regulatory requirements: HIGH (stable legal landscape)
- API rate limit patterns: HIGH (well-documented by providers)
- NotebookLM API availability: MEDIUM (may have changed since training cutoff)
- NotebookLM source limits: LOW (specific numbers require current documentation verification)
