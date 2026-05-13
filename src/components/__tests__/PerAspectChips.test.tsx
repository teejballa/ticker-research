// src/components/__tests__/PerAspectChips.test.tsx
// Plan 20-B-05 — RTL contract tests on the four golden tickers
// (AAPL / GME / SPY / TSM). Locks: '—' for null bull_pct (T-20-B-05-03),
// no '0%' literal in empty-aspect rendering, all 7 chips remain in DOM on
// mobile (T-20-B-05-04).

// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PerAspectChips } from '../PerAspectChips';
import type { PerAspectSentimentEntry } from '@/lib/types';

// Build a 7-entry fixture in the fixed ASPECT_TAXONOMY order.
function fix(partial: Partial<Record<string, PerAspectSentimentEntry>>): PerAspectSentimentEntry[] {
  const defaults: PerAspectSentimentEntry[] = [
    { aspect: 'earnings',   bull_pct: null, n_docs: 0, confidence_mean: 0 },
    { aspect: 'guidance',   bull_pct: null, n_docs: 0, confidence_mean: 0 },
    { aspect: 'regulatory', bull_pct: null, n_docs: 0, confidence_mean: 0 },
    { aspect: 'M&A',        bull_pct: null, n_docs: 0, confidence_mean: 0 },
    { aspect: 'macro',      bull_pct: null, n_docs: 0, confidence_mean: 0 },
    { aspect: 'product',    bull_pct: null, n_docs: 0, confidence_mean: 0 },
    { aspect: 'management', bull_pct: null, n_docs: 0, confidence_mean: 0 },
  ];
  return defaults.map((d) => partial[d.aspect] ?? d);
}

const AAPL: PerAspectSentimentEntry[] = fix({
  earnings: { aspect: 'earnings', bull_pct: 78, n_docs: 12, confidence_mean: 0.85 },
  guidance: { aspect: 'guidance', bull_pct: 62, n_docs: 6,  confidence_mean: 0.78 },
  product:  { aspect: 'product',  bull_pct: 71, n_docs: 5,  confidence_mean: 0.8 },
});

const GME: PerAspectSentimentEntry[] = fix({
  earnings: { aspect: 'earnings', bull_pct: 55, n_docs: 4, confidence_mean: 0.6 },
  macro:    { aspect: 'macro',    bull_pct: 40, n_docs: 3, confidence_mean: 0.55 },
});

const SPY: PerAspectSentimentEntry[] = fix({
  macro:    { aspect: 'macro',    bull_pct: 50, n_docs: 8, confidence_mean: 0.7 },
});

const TSM: PerAspectSentimentEntry[] = fix({
  earnings: { aspect: 'earnings', bull_pct: 70, n_docs: 5, confidence_mean: 0.8 },
  product:  { aspect: 'product',  bull_pct: 80, n_docs: 4, confidence_mean: 0.85 },
});

describe('PerAspectChips — render contract', () => {
  it('AAPL: earnings + guidance + product render bull%; regulatory/M&A/macro/management render —', () => {
    render(<PerAspectChips entries={AAPL} />);
    const stack = screen.getByTestId('per-aspect-chips');
    expect(within(stack).getByText(/earnings: 78%/)).toBeTruthy();
    expect(within(stack).getByText(/guidance: 62%/)).toBeTruthy();
    expect(within(stack).getByText(/product: 71%/)).toBeTruthy();
    // T-20-B-05-03 — empty aspects render '—', NOT '0%'.
    expect(within(stack).queryByText('0%')).toBeNull();
    // At least one em-dash chip present.
    const emDashChips = within(stack).getAllByText(/—/);
    expect(emDashChips.length).toBeGreaterThan(0);
  });

  it('GME: mixed bull% AND ≥1 — aspect (meme/echo-chamber fixture)', () => {
    render(<PerAspectChips entries={GME} />);
    const stack = screen.getByTestId('per-aspect-chips');
    expect(within(stack).queryByText('0%')).toBeNull();
    expect(within(stack).getByText(/earnings: 55%/)).toBeTruthy();
    expect(within(stack).getByText(/macro: 40%/)).toBeTruthy();
    // ≥1 em-dash for empty aspects.
    expect(within(stack).getAllByText(/—/).length).toBeGreaterThanOrEqual(1);
  });

  it('SPY (ETF): MOST aspects render — (low single-stock coverage)', () => {
    render(<PerAspectChips entries={SPY} />);
    const stack = screen.getByTestId('per-aspect-chips');
    expect(within(stack).queryByText('0%')).toBeNull();
    // ≥3 em-dash literals across the chip stack.
    expect(within(stack).getAllByText(/—/).length).toBeGreaterThanOrEqual(3);
  });

  it('TSM: earnings + product render bull%; others — (ADR)', () => {
    render(<PerAspectChips entries={TSM} />);
    const stack = screen.getByTestId('per-aspect-chips');
    expect(within(stack).getByText(/earnings: 70%/)).toBeTruthy();
    expect(within(stack).getByText(/product: 80%/)).toBeTruthy();
    expect(within(stack).queryByText('0%')).toBeNull();
  });

  it('empty entries → component returns null (no DOM)', () => {
    const { container } = render(<PerAspectChips entries={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('undefined/null entries → component returns null', () => {
    const { container: c1 } = render(<PerAspectChips entries={undefined} />);
    expect(c1.firstChild).toBeNull();
    const { container: c2 } = render(<PerAspectChips entries={null} />);
    expect(c2.firstChild).toBeNull();
  });

  it('full 7-chip stack remains in DOM (mobile-width assertion — T-20-B-05-04 flex-wrap, not clip)', () => {
    // Simulate 320px viewport — DOM count assertion is the contract; the
    // visual wrap is enforced by `flex flex-wrap` Tailwind classes.
    Object.defineProperty(window, 'innerWidth', { value: 320, configurable: true });
    render(<PerAspectChips entries={AAPL} />);
    const stack = screen.getByTestId('per-aspect-chips');
    // 7 chips in the fixed taxonomy → 7 span children.
    expect(stack.children.length).toBe(7);
  });

  it('data-bullpct=null sentinel set on empty-aspect chips', () => {
    render(<PerAspectChips entries={AAPL} />);
    const stack = screen.getByTestId('per-aspect-chips');
    const regulatoryChip = stack.querySelector('[data-aspect="regulatory"]');
    expect(regulatoryChip).not.toBeNull();
    expect(regulatoryChip!.getAttribute('data-bullpct')).toBe('null');
    expect(regulatoryChip!.textContent).toContain('—');
    expect(regulatoryChip!.textContent).not.toContain('0%');
  });
});
