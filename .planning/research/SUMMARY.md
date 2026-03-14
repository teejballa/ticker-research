# Research Summary: Ticker Research Assistant

**Domain:** AI-powered financial ticker research tool
**Researched:** 2026-03-10
**Overall confidence:** MEDIUM
**Note:** External search and fetch tools were unavailable during this session. All findings are based on training data through August 2025. Confidence levels reflect this constraint. Items flagged LOW confidence must be verified before implementation begins.

---

## Executive Summary

The Ticker Research Assistant is a well-scoped product in an established domain. The core value proposition — structured, source-backed research reports from a ticker symbol — maps cleanly to existing tools (financial data APIs, news APIs, charting libraries) that are mature and widely used. The primary technical risk is not in data collection or the web framework, but in the NotebookLM integration layer.

As of August 2025, Google had not released a public programmatic API for NotebookLM. The CLAUDE.md references a "Claude Code SDK NotebookLM skill," which implies Anthropic may have built an integration layer. This is unverified and must be confirmed at docs.anthropic.com before Phase 2 begins. The entire Phase 2 architecture depends on this single capability being available. If it is not, the fallback is the Anthropic Messages API with source documents passed as context — which is fully programmable but loses the "user-owned reasoning" property.

The data collection layer (Phase 1) is lower risk. Yahoo Finance via the `yahoo-finance2` npm package provides comprehensive free data sufficient for a working prototype. Finnhub's free tier (60 calls/minute) covers news aggregation. SEC EDGAR is a free official source for filings. Together these cover the full data requirements without any API cost during development.

The web framework choice is straightforward: Next.js with TypeScript, deployed on Vercel. This is the standard 2025 pattern for this type of tool. It handles both local development (`next dev`) and production deployment with minimal configuration, eliminating the need for a separate backend during early phases.

---

## Key Findings

**Stack:** Next.js + TypeScript + yahoo-finance2 + Finnhub + SEC EDGAR for data; NotebookLM (via Claude Code SDK skill) for reasoning; Vercel for deployment
**Architecture:** Two-layer pipeline: Claude Code SDK orchestrates data collection → structured sources fed to NotebookLM → formatted report returned to user
**Critical pitfall:** NotebookLM has no confirmed public API as of August 2025 — this must be verified before Phase 2 begins, or the reasoning layer must be redesigned around the Anthropic API

---

## Implications for Roadmap

Based on research, the 4-phase structure in CLAUDE.md is sound. Recommended phase structure with rationale:

1. **Phase 1 — Research Pipeline Prototype**
   - Build the data collection pipeline: price data, fundamentals, news, filings
   - Implement the ticker confirmation step (chart preview using yahoo-finance2 OHLCV + Lightweight Charts)
   - Structure data into a clean, formatted "source package" ready for reasoning layer
   - Technology: yahoo-finance2, Finnhub, SEC EDGAR, Next.js scaffolding
   - Avoids: NotebookLM dependency (which is unverified); keeps Phase 1 fully unblocked

2. **Phase 2 — NotebookLM Research Integration**
   - **Pre-condition: Verify NotebookLM API availability first (see Pitfalls)**
   - Feed structured source package into NotebookLM via Claude Code SDK skill
   - Define output schema: sentiment, bullish signals, bearish signals, Buy/Hold/Sell, confidence
   - Render formatted report from NotebookLM output
   - Fallback path: Use Anthropic Messages API if NotebookLM API unavailable
   - This phase is HIGH risk due to external API dependency uncertainty

3. **Phase 3 — User Environment Integration**
   - Google OAuth so users connect their own NotebookLM account
   - Research reasoning runs in user's Google environment, not a shared service account
   - Technology: NextAuth.js with Google provider
   - Only build this if NotebookLM API integration from Phase 2 is stable

4. **Phase 4 — Deployment & Packaging**
   - Daytona development environment
   - Vercel production deployment with environment variable management
   - Documentation for local execution setup
   - Consider: separate backend (Express/Fastify) only if Next.js API routes become insufficient

**Phase ordering rationale:**
- Phase 1 before Phase 2: Data pipeline must exist before reasoning layer can receive inputs
- Phase 2 before Phase 3: Centralized NotebookLM integration must work before handing it off to user accounts
- Phase 4 last: Packaging happens after the product is proven

**Research flags for phases:**
- Phase 2: MUST verify NotebookLM API availability — if unavailable, entire reasoning layer strategy changes
- Phase 2: Verify Claude Code SDK "NotebookLM skill" at docs.anthropic.com — may not exist as a standalone capability
- Phase 3: Verify Google OAuth scopes required to access NotebookLM on behalf of a user
- Phase 1: Verify yahoo-finance2 maintenance status (unofficial API; check npm page for recent activity)

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Framework and data API choices are well-established; NotebookLM integration is LOW confidence |
| Features | HIGH | Feature requirements are clearly defined in PROJECT.md; standard financial research tool patterns |
| Architecture | MEDIUM | Two-layer pipeline is sound; implementation feasibility depends on NotebookLM API status |
| Pitfalls | MEDIUM | Common pitfalls in this domain are well-known; NotebookLM-specific risks require live verification |

---

## Gaps to Address

- **NotebookLM API status** — Must be resolved before Phase 2 begins. Check notebooklm.google.com, Google Cloud AI, and docs.anthropic.com for the NotebookLM skill.
- **Claude Code SDK package name and capabilities** — Verify exact npm package name and what the "NotebookLM skill" entails at docs.anthropic.com/en/docs/claude-code/sdk
- **yahoo-finance2 reliability** — Unofficial API; check npm download trends and recent GitHub issues before committing to it for production
- **Real-time vs delayed data** — The project scope says no real-time data, but Phase 3+ may need real-time quotes; Polygon.io Starter tier should be evaluated at that point
- **SEC EDGAR rate limits** — Confirm current rate limits (historically 10 requests/second) before designing the data collection loop
