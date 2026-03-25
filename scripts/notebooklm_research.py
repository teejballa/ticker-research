#!/usr/bin/env python3
"""
scripts/notebooklm_research.py

Usage: python3 scripts/notebooklm_research.py <source_package_path>

Reads a SourcePackage JSON file, creates a fresh NotebookLM notebook,
adds market data as a text source and news articles as URL sources,
runs 6 structured queries, parses Gemini responses into AnalysisResult,
deletes the notebook, and prints RESULT: <json> to stdout.

Stdout protocol:
  PROGRESS: <message>    — pipeline step updates
  RESULT: <json>         — final AnalysisResult JSON (on success)
  ERROR: <message>       — error description (on failure, then sys.exit(1))
"""

import asyncio
import json
import re
import sys
from datetime import datetime, timezone

try:
    from notebooklm import NotebookLMClient, RPCError
except ImportError:
    # notebooklm-py not installed — argv validation still works;
    # actual research runs require: pip install "notebooklm-py[browser]==0.3.4"
    NotebookLMClient = None  # type: ignore[assignment]
    RPCError = Exception  # type: ignore[assignment,misc]


# ---------------------------------------------------------------------------
# Stdout helpers (flush=True on every print so Node.js readline gets each line)
# ---------------------------------------------------------------------------

def progress(msg: str) -> None:
    print(f"PROGRESS: {msg}", flush=True)


def result(data: dict) -> None:
    print(f"RESULT: {json.dumps(data)}", flush=True)


def error(msg: str) -> None:
    print(f"ERROR: {msg}", flush=True)


# ---------------------------------------------------------------------------
# 6 Question constants — exact text from RESEARCH.md
# ---------------------------------------------------------------------------

Q1 = (
    "Based exclusively on the sources provided, what is the overall market sentiment for "
    "this stock? Classify it as bullish, bearish, or neutral. Explain the primary factors "
    "driving this sentiment, citing specific sources."
)

Q2 = (
    "Identify exactly 3 bullish signals or positive factors for this stock based on the "
    "provided sources. For each signal, state the signal clearly and cite the specific "
    "source that supports it. Format: Signal 1: [signal text] (Source: [source name/URL]). "
    "Signal 2: ... Signal 3: ..."
)

Q3 = (
    "Identify exactly 3 bearish signals or risk factors for this stock based on the "
    "provided sources. For each signal, state the signal clearly and cite the specific "
    "source that supports it. Format: Signal 1: [signal text] (Source: [source name/URL]). "
    "Signal 2: ... Signal 3: ..."
)

Q4 = (
    "Based on all provided sources, give a probability breakdown for this stock: what "
    "percentage likelihood would you assign to Buy, Hold, and Sell recommendations? The "
    "three percentages must sum to 100. Provide a one-sentence rationale for each tier, "
    "citing sources where possible. Format: Buy: X% - [rationale]. Hold: Y% - [rationale]. "
    "Sell: Z% - [rationale]."
)

Q5 = (
    "How confident are you in this overall assessment, on a scale of Low, Medium, or High? "
    "Base this on the quality, quantity, and consistency of the sources provided. Explain "
    "your confidence level in one sentence (e.g., 'High — multiple independent analyst "
    "reports agree on direction' or 'Low — limited data and conflicting signals')."
)

Q6 = (
    "List the key sources that most influenced this analysis and the specific facts from "
    "each that were most important to the assessment. Format as: Source 1: [name/type] — "
    "[key fact used]. Source 2: ..."
)


# ---------------------------------------------------------------------------
# Preambles — prepended to all 6 questions per security type
# Equity type: empty string (no preamble — questions are already equity-focused)
# ---------------------------------------------------------------------------

PREAMBLES = {
    'spac': (
        "Note: this is a pre-merger SPAC (Special Purpose Acquisition Company). "
        "Evaluate this instrument in terms of merger probability, trust value per share, "
        "vote timeline, redemption risk, and deal structure — not operating financials, "
        "revenue growth, or earnings metrics, which are not applicable pre-merger. "
    ),
    'etf': (
        "Note: this is an ETF or fund, not an individual equity. "
        "Focus your analysis on expense ratio, AUM and fund flows, tracking accuracy "
        "vs. its benchmark index, top holdings and sector weights, and creation/redemption "
        "activity — not company-level earnings, revenue, or analyst stock ratings, "
        "which do not apply to ETFs. "
    ),
}


# ---------------------------------------------------------------------------
# Research brief formatter — pure Python equivalent of TypeScript formatResearchBrief
# ---------------------------------------------------------------------------

def _fmt(val) -> str:
    """Null-safe value formatter. Returns 'N/A' for None."""
    if val is None:
        return 'N/A'
    return str(val)


def _fmt_dollar(val) -> str:
    """Format a dollar amount. Returns 'N/A' for None."""
    if val is None:
        return 'N/A'
    return f'${float(val):.2f}'


def _fmt_large_num(val) -> str:
    """Format a large number (market cap, revenue) in human-readable shorthand."""
    if val is None:
        return 'N/A'
    n = float(val)
    T = 1_000_000_000_000
    B = 1_000_000_000
    M = 1_000_000
    if abs(n) >= T:
        return f'${n / T:.2f}T'
    if abs(n) >= B:
        return f'${n / B:.2f}B'
    if abs(n) >= M:
        return f'${n / M:.2f}M'
    return f'${n:.2f}'


def _fmt_pct(val) -> str:
    """Format a percentage with explicit sign and 2 decimal places."""
    if val is None:
        return 'N/A'
    v = float(val)
    sign = '+' if v >= 0 else ''
    return f'{sign}{v:.2f}%'


def _fmt_pct_plain(val) -> str:
    """Format a plain percentage (no sign) with 2 decimal places."""
    if val is None:
        return 'N/A'
    return f'{float(val):.2f}%'


def _fmt_num(val) -> str:
    """Format a number with no special treatment. Returns 'N/A' for None."""
    if val is None:
        return 'N/A'
    return str(val)


def format_research_brief(pkg: dict) -> str:
    """
    Formats a SourcePackage dict into a structured plain-text research brief string.
    Sections: header, MARKET DATA, FUNDAMENTALS, ANALYST SENTIMENT,
              SEC FILINGS, SOCIAL SENTIMENT, COLLECTION NOTES
    """
    lines = []

    ticker = pkg.get('ticker', 'UNKNOWN').upper()

    # Header
    lines.append(f"=== TICKER RESEARCH BRIEF: {ticker} ===")
    lines.append(f"Company: {_fmt(pkg.get('company_name'))}")
    lines.append(f"Exchange: {_fmt(pkg.get('exchange'))}")
    lines.append(f"Data Assembled: {_fmt(pkg.get('assembled_at'))}")
    lines.append('')

    # Market Data
    md = pkg.get('market_data', {})
    lines.append('--- MARKET DATA ---')
    lines.append(f"Current Price: {_fmt_dollar(md.get('price'))}")
    lines.append(f"Market Cap: {_fmt_large_num(md.get('market_cap'))}")
    lines.append(f"52-Week High: {_fmt_dollar(md.get('fifty_two_week_high'))}")
    lines.append(f"52-Week Low: {_fmt_dollar(md.get('fifty_two_week_low'))}")
    lines.append(f"% Change Today: {_fmt_pct(md.get('percent_change_today'))}")
    lines.append(f"Volume: {_fmt_num(md.get('volume'))}")
    lines.append('')

    # Fundamentals
    fund = pkg.get('fundamentals', {})
    lines.append('--- FUNDAMENTALS ---')
    lines.append(f"P/E Ratio: {_fmt_num(fund.get('pe_ratio'))}")
    lines.append(f"EPS: {_fmt_dollar(fund.get('eps'))}")
    lines.append(f"Revenue: {_fmt_large_num(fund.get('revenue'))}")
    lines.append(f"Debt/Equity: {_fmt_num(fund.get('debt_to_equity'))}")
    lines.append(f"Profit Margin: {_fmt_pct_plain(fund.get('profit_margin'))}")
    lines.append('')

    # Analyst Sentiment
    analyst = pkg.get('analyst_sentiment', {})
    lines.append('--- ANALYST SENTIMENT ---')

    # Check if this is an ETF (sentinel error present from fetchAnalystSentiment)
    analyst_error = analyst.get('error', '')
    if analyst_error and 'not applicable' in analyst_error.lower():
        lines.append('Consensus: Not applicable (ETF — no stock analyst ratings exist for this fund)')
        lines.append('Note: For ETFs, evaluate expense ratio, fund flows, and index tracking instead.')
    else:
        lines.append(f"Consensus: {_fmt(analyst.get('consensus'))}")
        lines.append(f"Avg Price Target: {_fmt_dollar(analyst.get('avg_price_target'))}")
        lines.append(f"Analyst Count: {_fmt_num(analyst.get('analyst_count'))}")
        recent_changes = analyst.get('recent_changes', [])
        if recent_changes:
            lines.append('Recent Changes:')
            for change in recent_changes:
                analyst_name = change.get('analyst', '')
                firm = change.get('firm', '')
                action = change.get('action', '')
                date = change.get('date', '')
                lines.append(f"  - {analyst_name} at {firm} ({action}, {date})")
    lines.append('')

    # SEC Filings
    sec = pkg.get('sec_filing_summary', {})
    lines.append('--- SEC FILINGS ---')
    lines.append(f"Most Recent 10-K: {_fmt(sec.get('most_recent_10k'))}")
    lines.append(f"Most Recent 10-Q: {_fmt(sec.get('most_recent_10q'))}")
    lines.append('')

    # Social Sentiment
    social = pkg.get('social_sentiment', {})
    lines.append('--- SOCIAL SENTIMENT ---')
    lines.append(f"Overall Tone: {_fmt(social.get('overall_tone'))}")
    signals = social.get('signals', [])
    if signals:
        lines.append('Signals:')
        for signal in signals:
            lines.append(f"  - {signal}")
    lines.append('')

    # Collection Notes
    lines.append('--- COLLECTION NOTES ---')
    lines.append(f"Data collected: {_fmt(pkg.get('assembled_at'))}")
    for err in pkg.get('collection_errors', []):
        lines.append(f"Warning: {err}")

    return '\n'.join(lines)


# ---------------------------------------------------------------------------
# URL extractor
# ---------------------------------------------------------------------------

def extract_news_urls(pkg: dict) -> list:
    """
    Extracts deduplicated news URLs from pkg['news']['items'], capped at 15.
    Filters None and empty/whitespace-only URLs.
    """
    news = pkg.get('news', {})
    items = news.get('items', [])
    seen = {}  # dict.fromkeys preserves insertion order
    result_urls = []

    for item in items:
        url = item.get('url')
        if not url or not url.strip():
            continue
        if url in seen:
            continue
        seen[url] = True
        result_urls.append(url)
        if len(result_urls) >= 15:
            break

    return result_urls


# ---------------------------------------------------------------------------
# Answer parser — converts 6 NotebookLM answers into AnalysisResult dict
# ---------------------------------------------------------------------------

def parse_answers(answers: list, pkg: dict, source_warnings: list) -> dict:
    """
    Parses the 6 NotebookLM free-text answers into a typed AnalysisResult dict.
    Best-effort parsing — each function defaults gracefully on parse failure.
    """
    ticker = pkg.get('ticker', 'UNKNOWN')
    company_name = pkg.get('company_name', 'Unknown Company')

    # Q1: sentiment classification
    a0 = answers[0] if len(answers) > 0 else ''
    sentiment = 'neutral'
    lower_a0 = a0.lower()
    if 'bullish' in lower_a0:
        sentiment = 'bullish'
    elif 'bearish' in lower_a0:
        sentiment = 'bearish'
    sentiment_reasoning = a0

    # Q2: bullish signals
    a1 = answers[1] if len(answers) > 1 else ''
    bullish_signals = _parse_signals(a1)

    # Q3: bearish signals
    a2 = answers[2] if len(answers) > 2 else ''
    bearish_signals = _parse_signals(a2)

    # Q4: Buy/Hold/Sell assessment
    a3 = answers[3] if len(answers) > 3 else ''
    assessment = _parse_assessment(a3)

    # Q5: confidence level
    a4 = answers[4] if len(answers) > 4 else ''
    confidence_level, confidence_explanation = _parse_confidence(a4)

    # Q6: sources used
    a5 = answers[5] if len(answers) > 5 else ''
    sources_used = _parse_sources(a5)

    # Extract market snapshot from source package for report stats header
    md = pkg.get('market_data', {})
    fund = pkg.get('fundamentals', {})
    market_snapshot = {
        'price': md.get('price'),
        'percent_change_today': md.get('percent_change_today'),
        'market_cap': md.get('market_cap'),
        'fifty_two_week_high': md.get('fifty_two_week_high'),
        'fifty_two_week_low': md.get('fifty_two_week_low'),
        'pe_ratio': fund.get('pe_ratio'),
        'eps': fund.get('eps'),
        'revenue': fund.get('revenue'),
    }

    return {
        'ticker': ticker,
        'company_name': company_name,
        'analyzed_at': datetime.now(timezone.utc).isoformat(),
        'market_sentiment': sentiment,
        'sentiment_reasoning': sentiment_reasoning,
        'bullish_signals': bullish_signals,
        'bearish_signals': bearish_signals,
        'assessment': assessment,
        'confidence_level': confidence_level,
        'confidence_explanation': confidence_explanation,
        'sources_used': sources_used,
        'source_warnings': source_warnings,
        'security_type': pkg.get('security_type', 'equity'),   # propagated to AnalysisResult
        'market_snapshot': market_snapshot,
    }


def _parse_signals(text: str) -> list:
    """
    Parses "Signal N: [text] (Source: [source])" patterns from text.
    Returns exactly 3 AnalysisSignal dicts, padding with defaults if fewer found.
    """
    pattern = re.compile(
        r'Signal\s+\d+:\s*(.+?)\s*\(Source:\s*([^)]+)\)',
        re.IGNORECASE | re.DOTALL
    )
    matches = pattern.findall(text)

    signals = []
    for signal_text, source_citation in matches[:3]:
        signals.append({
            'signal': signal_text.strip(),
            'source_citation': source_citation.strip(),
        })

    # Pad to exactly 3
    while len(signals) < 3:
        signals.append({
            'signal': 'See full analysis',
            'source_citation': 'NotebookLM analysis',
        })

    return signals


def _parse_assessment(text: str) -> dict:
    """
    Parses "Buy: X% - [rationale]. Hold: Y% - [rationale]. Sell: Z% - [rationale]."
    Defaults to Buy:34/Hold:33/Sell:33 if parsing fails.
    Clamps each to 0-100 and normalizes so they sum to 100.
    """
    pattern = re.compile(
        r'(Buy|Hold|Sell):\s*(\d+)%\s*-\s*([^.]+)',
        re.IGNORECASE
    )
    matches = pattern.findall(text)

    buy_pct = 34
    hold_pct = 33
    sell_pct = 33
    buy_rationale = ''
    hold_rationale = ''
    sell_rationale = ''

    for label, pct_str, rationale in matches:
        label_lower = label.lower()
        pct = int(pct_str)
        rationale = rationale.strip()
        if label_lower == 'buy':
            buy_pct = pct
            buy_rationale = rationale
        elif label_lower == 'hold':
            hold_pct = pct
            hold_rationale = rationale
        elif label_lower == 'sell':
            sell_pct = pct
            sell_rationale = rationale

    # Clamp to 0-100
    buy_pct = max(0, min(100, buy_pct))
    hold_pct = max(0, min(100, hold_pct))
    sell_pct = max(0, min(100, sell_pct))

    # Normalize so they sum to 100
    total = buy_pct + hold_pct + sell_pct
    if total != 100 and total > 0:
        buy_pct = round(buy_pct * 100 / total)
        hold_pct = round(hold_pct * 100 / total)
        sell_pct = 100 - buy_pct - hold_pct
    elif total == 0:
        buy_pct, hold_pct, sell_pct = 34, 33, 33

    return {
        'buy_pct': buy_pct,
        'hold_pct': hold_pct,
        'sell_pct': sell_pct,
        'buy_rationale': buy_rationale,
        'hold_rationale': hold_rationale,
        'sell_rationale': sell_rationale,
    }


def _parse_confidence(text: str) -> tuple:
    """
    Extracts confidence level (Low/Medium/High) and explanation from answer text.
    Returns ('Medium', full_text) if no level found.
    """
    # Exact word match (case-sensitive) for Low, Medium, High
    match = re.search(r'\b(Low|Medium|High)\b', text)
    if match:
        level = match.group(1)
        # Try to extract the sentence or explanation following the level
        rest = text[match.end():].strip()
        # Strip leading punctuation like ' — ' or ': '
        rest = re.sub(r'^[\s\—\-:]+', '', rest).strip()
        explanation = rest if rest else text
    else:
        level = 'Medium'
        explanation = text

    return level, explanation


def _parse_sources(text: str) -> list:
    """
    Parses "Source N: [name] — [key fact]" lines from text.
    Returns list of AnalysisSource dicts.
    """
    pattern = re.compile(
        r'Source\s+\d+:\s*(.+?)\s+[\u2014\-]{1,3}\s*(.+?)(?=Source\s+\d+:|$)',
        re.IGNORECASE | re.DOTALL
    )
    matches = pattern.findall(text)

    sources = []
    for name, key_fact in matches:
        name = name.strip()
        key_fact = key_fact.strip()
        if name:
            sources.append({
                'name': name,
                'key_fact': key_fact,
            })

    return sources


# ---------------------------------------------------------------------------
# Main async pipeline
# ---------------------------------------------------------------------------

async def main() -> None:
    if len(sys.argv) < 2:
        error("No source package path provided")
        sys.exit(1)

    file_path = sys.argv[1]

    # Load source package
    try:
        with open(file_path, 'r') as f:
            pkg = json.load(f)
    except FileNotFoundError:
        error(f"Source package file not found: {file_path}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        error(f"Invalid JSON in source package: {e}")
        sys.exit(1)

    if NotebookLMClient is None:
        error(
            "notebooklm-py is not installed. "
            "Run: pip install \"notebooklm-py[browser]==0.3.4\" && playwright install chromium"
        )
        sys.exit(1)

    notebook_id = None

    try:
        async with await NotebookLMClient.from_storage() as client:

            # 1. Create notebook
            progress("Creating notebook...")
            ticker = pkg.get('ticker', 'UNKNOWN')
            ts = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
            nb = await client.notebooks.create(f"{ticker} Research — {ts}")
            notebook_id = nb.id

            # 2. Add market data as text source (formatted research brief)
            progress("Adding market data source...")
            brief = format_research_brief(pkg)
            await client.sources.add_text(nb.id, f"{ticker} Market Data", brief)

            # Wait for text source to index
            await asyncio.sleep(15)

            # 3. Add news URLs (per-URL error handling — never aborts pipeline)
            news_urls = extract_news_urls(pkg)
            source_warnings = []
            progress(f"Adding news sources ({len(news_urls)} URLs)...")
            for url in news_urls:
                try:
                    await asyncio.wait_for(
                        client.sources.add_url(nb.id, url),
                        timeout=120.0
                    )
                except (asyncio.TimeoutError, RPCError, Exception) as e:
                    source_warnings.append(f"Failed to load: {url} ({e})")

            # Wait for URL sources to index
            if news_urls:
                await asyncio.sleep(20)

            # 4. Run 6 structured queries with conversation threading
            # Select preamble based on security type — empty string for equity/unknown/adr/preferred/crypto
            security_type = pkg.get('security_type', 'equity')
            preamble = PREAMBLES.get(security_type, '')
            QUESTIONS = [preamble + q for q in [Q1, Q2, Q3, Q4, Q5, Q6]]
            labels = [
                "sentiment (1/6)",
                "bullish signals (2/6)",
                "bearish signals (3/6)",
                "assessment (4/6)",
                "confidence (5/6)",
                "sources (6/6)",
            ]

            conversation_id = None
            answers = []
            for i, (q, label) in enumerate(zip(QUESTIONS, labels)):
                progress(f"Querying {label}...")
                r = await client.chat.ask(
                    nb.id,
                    q,
                    conversation_id=conversation_id,
                )
                answers.append(r.answer)
                if i == 0:
                    conversation_id = r.conversation_id

            # 5. Parse answers into AnalysisResult
            analysis = parse_answers(answers, pkg, source_warnings)

            # 6. Cleanup
            progress("Cleaning up notebook...")
            await client.notebooks.delete(nb.id)
            notebook_id = None

            result(analysis)

    except RPCError as e:
        # Attempt cleanup even on error
        if notebook_id:
            try:
                async with await NotebookLMClient.from_storage() as c2:
                    await c2.notebooks.delete(notebook_id)
            except Exception:
                pass
        error_msg = str(e).lower()
        if 'rate' in error_msg or 'quota' in error_msg or 'limit' in error_msg:
            error("NotebookLM daily limit reached. Resets at midnight PST — try again tomorrow.")
        else:
            error(f"NotebookLM error: {e}")
        sys.exit(1)

    except Exception as e:
        # Attempt cleanup even on error
        if notebook_id:
            try:
                async with await NotebookLMClient.from_storage() as c2:
                    await c2.notebooks.delete(notebook_id)
            except Exception:
                pass
        error(f"Script failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
