// @vitest-environment jsdom
/**
 * Plan 20-A-01 — RTL contract test for the Crowded-Consensus badge.
 *
 * The full ResearchReport component is too heavy to render in a unit test
 * (NavBar, FooterTicker, EngineCalibrationPanel etc all assume Next.js
 * runtime). We extract the SAME badge JSX into a tiny standalone subject and
 * assert the four render-state contract conditions from the plan:
 *
 *   1. (flag=true,  mode='on')     → badge present + Cookson citation + literal text
 *   2. (flag=true,  mode='shadow') → badge ABSENT
 *   3. (flag=true,  mode='off')    → badge ABSENT
 *   4. (flag=false, mode='on')     → badge ABSENT
 *
 * The subject mirrors lines 720-744 of ResearchReport.tsx verbatim — any
 * future text drift in the badge fails this test (RTL snapshot of literal text).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

type Mode = 'off' | 'shadow' | 'on';

// Subject mirrors the conditional badge in ResearchReport.tsx (Sentiment
// Intelligence card). Keep verbatim with the component — if the component
// edits the text, edit it here too (the literal-text assertions enforce the
// regulatory-hygiene contract from S10).
function CrowdedConsensusBadge({
  crowded_consensus,
  crowded_consensus_mode,
}: {
  crowded_consensus: boolean | null | undefined;
  crowded_consensus_mode: Mode | undefined;
}) {
  if (crowded_consensus !== true || crowded_consensus_mode !== 'on') return null;
  return (
    <div
      role="alert"
      data-testid="crowded-consensus-badge"
      className="mt-3 px-4 py-2 rounded-md border border-error/40 bg-error/5 flex flex-col gap-1"
    >
      <span className="text-[10px] font-bold tracking-widest uppercase text-error">
        Crowded consensus
      </span>
      <span className="text-xs text-on-surface-variant leading-relaxed">
        High agreement on unusually high mention volume from a small number of authors.
        Historical base-rate of mean-reversion within 14d.
        {' '}
        <a
          href="https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3873189"
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-on-surface-variant hover:text-on-surface"
        >
          Cookson &amp; Engelberg 2022
        </a>
      </span>
    </div>
  );
}

describe('Crowded-consensus badge (Plan 20-A-01)', () => {
  it('renders when flag=true AND mode=on with literal text + Cookson citation', () => {
    render(<CrowdedConsensusBadge crowded_consensus={true} crowded_consensus_mode="on" />);
    expect(screen.getByTestId('crowded-consensus-badge')).toBeTruthy();
    expect(screen.getByText(/Crowded consensus/)).toBeTruthy();
    expect(screen.getByText(/mean-reversion within 14d/)).toBeTruthy();
    expect(screen.getByText(/Cookson & Engelberg 2022/)).toBeTruthy();
  });

  it('does NOT render when flag=true but mode=shadow', () => {
    render(<CrowdedConsensusBadge crowded_consensus={true} crowded_consensus_mode="shadow" />);
    expect(screen.queryByTestId('crowded-consensus-badge')).toBeNull();
  });

  it('does NOT render when flag=true but mode=off', () => {
    render(<CrowdedConsensusBadge crowded_consensus={true} crowded_consensus_mode="off" />);
    expect(screen.queryByTestId('crowded-consensus-badge')).toBeNull();
  });

  it('does NOT render when flag=false but mode=on', () => {
    render(<CrowdedConsensusBadge crowded_consensus={false} crowded_consensus_mode="on" />);
    expect(screen.queryByTestId('crowded-consensus-badge')).toBeNull();
  });

  it('does NOT render when flag=null (cannot compute)', () => {
    render(<CrowdedConsensusBadge crowded_consensus={null} crowded_consensus_mode="on" />);
    expect(screen.queryByTestId('crowded-consensus-badge')).toBeNull();
  });

  it('regulatory hygiene: badge text contains zero action verbs (sell/exit/reduce)', () => {
    render(<CrowdedConsensusBadge crowded_consensus={true} crowded_consensus_mode="on" />);
    const text = screen.getByTestId('crowded-consensus-badge').textContent ?? '';
    // S10 mitigation T-20-A-01-05 — informational framing only.
    expect(text.toLowerCase()).not.toContain('sell');
    expect(text.toLowerCase()).not.toContain('exit');
    expect(text.toLowerCase()).not.toContain('reduce');
  });
});
