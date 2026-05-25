// src/components/__tests__/ReportHistory.test.tsx
// Covers the auth-gated dashboard history surfaces that the public Playwright
// run can't reach: the loading skeleton, optimistic delete (row vanishes
// immediately), and revert-on-failure.

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { StoredReport } from '@/lib/types';
import ReportHistory from '@/components/ReportHistory';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), forward: vi.fn() }),
}));

const REPORTS: StoredReport[] = [
  {
    id: 'uuid-aapl',
    ticker: 'AAPL',
    company_name: 'Apple Inc.',
    analyzed_at: '2026-05-20T12:00:00.000Z',
    market_sentiment: 'bullish',
    confidence_level: 'High',
    analysis: {} as StoredReport['analysis'],
  },
  {
    id: 'uuid-tsla',
    ticker: 'TSLA',
    company_name: 'Tesla, Inc.',
    analyzed_at: '2026-05-19T12:00:00.000Z',
    market_sentiment: 'bearish',
    confidence_level: 'Medium',
    analysis: {} as StoredReport['analysis'],
  },
];

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  global.fetch = vi.fn(impl) as unknown as typeof fetch;
}

const jsonRes = (body: unknown, ok = true, status = 200): Response =>
  ({ ok, status, json: async () => body }) as Response;

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('ReportHistory', () => {
  it('shows skeleton rows while loading, then renders report rows', async () => {
    let resolveGet!: (r: Response) => void;
    mockFetch(() => new Promise<Response>((res) => { resolveGet = res; }));

    const { container } = render(<ReportHistory />);

    // During load the panel is aria-busy and shows no real rows yet.
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByText('Apple Inc.')).toBeNull();

    resolveGet(jsonRes({ reports: REPORTS }));

    await screen.findByText('Apple Inc.', undefined, { timeout: 5000 });
    expect(screen.getAllByTestId('history-row')).toHaveLength(2);
  });

  it('optimistically removes a report on delete and calls DELETE with the id', async () => {
    const calls: Array<{ url: string; method?: string }> = [];
    mockFetch((url, init) => {
      calls.push({ url, method: init?.method });
      if (init?.method === 'DELETE') return Promise.resolve(jsonRes({ deleted: true }));
      return Promise.resolve(jsonRes({ reports: REPORTS }));
    });

    render(<ReportHistory />);
    // findBy* retries with a generous timeout — robust under parallel-suite CPU
    // contention where the useTransition flush can exceed waitFor's 1s default.
    const aaplRow = (await screen.findByText('Apple Inc.', undefined, { timeout: 5000 }))
      .closest('[data-testid="history-row"]') as HTMLElement;

    // Arm + confirm delete on the AAPL row (confirm appears after a re-render).
    fireEvent.click(within(aaplRow).getByTestId('history-delete-btn'));
    fireEvent.click(await screen.findByTestId('history-delete-confirm', undefined, { timeout: 5000 }));

    // Row disappears (optimistic) and TSLA remains.
    await waitFor(() => expect(screen.queryByText('Apple Inc.')).toBeNull(), { timeout: 5000 });
    expect(screen.getByText('Tesla, Inc.')).toBeTruthy();

    const del = calls.find((c) => c.method === 'DELETE');
    expect(del?.url).toBe('/api/history/uuid-aapl');
  });

  it('reverts the row and surfaces an error when the delete fails', async () => {
    mockFetch((_url, init) => {
      if (init?.method === 'DELETE') return Promise.resolve(jsonRes({ error: 'nope' }, false, 500));
      return Promise.resolve(jsonRes({ reports: REPORTS }));
    });

    render(<ReportHistory />);
    const aaplRow = (await screen.findByText('Apple Inc.', undefined, { timeout: 5000 }))
      .closest('[data-testid="history-row"]') as HTMLElement;

    fireEvent.click(within(aaplRow).getByTestId('history-delete-btn'));
    fireEvent.click(await screen.findByTestId('history-delete-confirm', undefined, { timeout: 5000 }));

    // After the failed request an alert is shown and the optimistic removal
    // reverts. setError paints a tick before useOptimistic settles the revert,
    // so assert the restored row with findBy* (retries) rather than getBy*.
    expect(await screen.findByRole('alert', undefined, { timeout: 5000 })).toBeTruthy();
    expect(await screen.findByText('Apple Inc.', undefined, { timeout: 5000 })).toBeTruthy();
  });
});
