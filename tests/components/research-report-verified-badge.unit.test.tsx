// @vitest-environment jsdom
/**
 * Plan 20-D-03 — RTL contract test for the per-claim CoVe (?) badge in the
 * Bull Case + Bear Case blocks of ResearchReport.
 *
 * Mirrors the 20-C-03 bot-filter precedent: ResearchReport is too heavy for a
 * unit test, so the badge JSX is extracted verbatim into a standalone subject.
 *
 * Gate contract:
 *   1. flag='on'  + verified='false' → badge renders, aria-label = "Source data contradicts this claim"
 *   2. flag='on'  + verified='null'  → badge renders, aria-label = "Insufficient source data to verify"
 *   3. flag='on'  + verified='true'  → NO badge (clean default — absence is the success signal)
 *   4. flag='on'  + verified=undef   → NO badge (backward compat — pre-plan reports identical)
 *   5. flag='off' + verified='false' → NO badge (feature-flag gate trumps verdict)
 *   6. Bull/bear parity — same gates fire on bearish signals.
 *
 * T-20-D-03-03 mitigation: clean default. The absence of a badge IS the
 * success signal — a badge per signal would train users to ignore it.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

type Verdict = 'true' | 'false' | 'null' | undefined;
type Flag = 'on' | 'shadow' | 'off';

// Subject mirrors the (?) badge inline JSX in ResearchReport.tsx (Bull Case
// + Bear Case blocks at lines ~937 and ~956).
function VerifiedBadge({
  flag,
  verified,
}: {
  flag: Flag;
  verified: Verdict;
}) {
  if (flag !== 'on') return null;
  if (verified === undefined) return null;
  if (verified === 'true') return null;
  const tooltip =
    verified === 'false'
      ? 'Source data contradicts this claim'
      : 'Insufficient source data to verify';
  return (
    <span
      data-testid="per-claim-verified-badge"
      role="img"
      aria-label={tooltip}
      title={tooltip}
      className="inline-flex items-center justify-center w-4 h-4 ml-1 text-[10px] font-bold text-on-surface-variant bg-surface-container-high rounded-full cursor-help"
    >
      ?
    </span>
  );
}

// Tiny wrapper modeling a signal row (mirrors the structure inside the
// bullish_signals.map / bearish_signals.map blocks in ResearchReport.tsx).
function SignalRow({
  signal,
  source_citation,
  verified,
  flag,
  kind,
}: {
  signal: string;
  source_citation?: string;
  verified: Verdict;
  flag: Flag;
  kind: 'bullish' | 'bearish';
}) {
  return (
    <div data-testid={`${kind}-row`} className="flex items-start">
      <span>{signal}</span>
      {source_citation && (
        <span className="block text-[10px]" data-testid="citation">
          [{source_citation}]
        </span>
      )}
      <VerifiedBadge flag={flag} verified={verified} />
    </div>
  );
}

describe('20-D-03 per-claim (?) badge — render gates', () => {
  it("flag='on' + verified='false' → badge renders with contradiction tooltip", () => {
    render(<VerifiedBadge flag="on" verified="false" />);
    const badge = screen.getByTestId('per-claim-verified-badge');
    expect(badge).toBeTruthy();
    expect(badge.getAttribute('aria-label')).toBe('Source data contradicts this claim');
    expect(badge.getAttribute('title')).toBe('Source data contradicts this claim');
    expect(badge.textContent).toBe('?');
  });

  it("flag='on' + verified='null' → badge renders with insufficient-data tooltip", () => {
    render(<VerifiedBadge flag="on" verified="null" />);
    const badge = screen.getByTestId('per-claim-verified-badge');
    expect(badge).toBeTruthy();
    expect(badge.getAttribute('aria-label')).toBe('Insufficient source data to verify');
    expect(badge.getAttribute('title')).toBe('Insufficient source data to verify');
  });

  it("flag='on' + verified='true' → NO badge (clean default — T-20-D-03-03)", () => {
    render(<VerifiedBadge flag="on" verified="true" />);
    expect(screen.queryByTestId('per-claim-verified-badge')).toBeNull();
  });

  it("flag='on' + verified=undefined → NO badge (backward compat — pre-plan reports identical)", () => {
    render(<VerifiedBadge flag="on" verified={undefined} />);
    expect(screen.queryByTestId('per-claim-verified-badge')).toBeNull();
  });

  it("flag='off' + verified='false' → NO badge (feature-flag gate trumps verdict)", () => {
    render(<VerifiedBadge flag="off" verified="false" />);
    expect(screen.queryByTestId('per-claim-verified-badge')).toBeNull();
  });

  it("flag='shadow' + verified='false' → NO badge (shadow keeps UI hidden)", () => {
    render(<VerifiedBadge flag="shadow" verified="false" />);
    expect(screen.queryByTestId('per-claim-verified-badge')).toBeNull();
  });

  it("bull/bear parity — bearish signal badge fires under same gates", () => {
    render(
      <>
        <SignalRow kind="bullish" signal="growth A" verified="false" flag="on" source_citation="src1" />
        <SignalRow kind="bearish" signal="risk B"   verified="null"  flag="on" source_citation="src2" />
        <SignalRow kind="bullish" signal="growth C" verified="true"  flag="on" source_citation="src3" />
      </>,
    );
    // Two badges expected (false + null); the verified=true row gets none.
    const badges = screen.getAllByTestId('per-claim-verified-badge');
    expect(badges).toHaveLength(2);
    expect(badges[0].getAttribute('aria-label')).toBe('Source data contradicts this claim');
    expect(badges[1].getAttribute('aria-label')).toBe('Insufficient source data to verify');
  });

  it("S10 regulatory hygiene — tooltip text uses factual-contradiction language NOT investment-advice language", () => {
    render(<VerifiedBadge flag="on" verified="false" />);
    const badge = screen.getByTestId('per-claim-verified-badge');
    const label = badge.getAttribute('aria-label') ?? '';
    // MUST NOT contain advice / accusation language
    expect(label).not.toMatch(/sell|buy|wrong|false claim|hallucinat|lie/i);
    // MUST contain the factual contradiction framing
    expect(label).toMatch(/contradict/i);
  });
});
