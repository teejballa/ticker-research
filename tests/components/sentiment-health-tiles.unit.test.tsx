// @vitest-environment jsdom
//
// Phase: 30 — Provider Health Hardening
// Phase 30 D-10 + D-19 — integration coverage for the two new tiles on
// /insights/sentiment-health: FallbackHeatmapTile + ActiveAlertsTile.
//
// The page component itself awaits a server-side load() that reads from
// Postgres. To keep this an integration test (rather than a network-bound
// page test), we exercise the tile components directly with seeded inputs
// shaped exactly like the load() output. The page's wiring is independently
// verified by acceptance grep on src/app/insights/sentiment-health/page.tsx.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { FallbackHeatmapTile } from '@/app/insights/sentiment-health/components/FallbackHeatmapTile';
import { ActiveAlertsTile } from '@/app/insights/sentiment-health/components/ActiveAlertsTile';

describe('Phase 30 / D-10 + D-19 / sentiment-health page tiles', () => {
  it('renders ActiveAlertsTile empty state when no alerts seeded', () => {
    render(<ActiveAlertsTile alerts={[]} />);
    expect(screen.getByTestId('active-alerts-tile-empty')).toBeTruthy();
    expect(screen.getByText(/No active alerts/)).toBeTruthy();
  });

  it('renders FallbackHeatmapTile empty state when no rows', () => {
    render(<FallbackHeatmapTile rows={[]} />);
    expect(screen.getByTestId('fallback-heatmap-tile-empty')).toBeTruthy();
  });

  it('renders active alerts with provider_id, error_rate %, count, and dominant_error_class', () => {
    const alerts = [
      {
        id: 'a1',
        provider_id: 'gemini',
        breached_at: new Date(Date.now() - 3 * 3600_000), // 3h ago
        error_rate: 0.15,
        error_count: 30,
        total_count: 200,
        dominant_error_class: 'UPSTREAM_5XX',
      },
    ];
    render(<ActiveAlertsTile alerts={alerts} />);
    const row = screen.getByTestId('alert-row-gemini');
    expect(row).toBeTruthy();
    expect(row.textContent).toContain('gemini');
    expect(row.textContent).toContain('15.0%');
    expect(row.textContent).toContain('(30/200)');
    expect(row.textContent).toContain('UPSTREAM_5XX');
    expect(row.textContent).toMatch(/\d+h ago/);
  });

  it('renders fallback heatmap with rates and sorts visually by descending rate', () => {
    const rows = [
      // Pre-sorted desc, the way load() emits them — yahoo (60%) first.
      { provider_id: 'yahoo', fallback_rate: 0.60, count_24h: 120 },
      { provider_id: 'polygon', fallback_rate: 0.05, count_24h: 80 },
    ];
    render(<FallbackHeatmapTile rows={rows} />);
    expect(screen.getByTestId('fallback-heatmap-tile')).toBeTruthy();
    const yahooCell = screen.getByTestId('fallback-rate-yahoo');
    const polygonCell = screen.getByTestId('fallback-rate-polygon');
    expect(yahooCell.textContent).toContain('60.0%');
    expect(polygonCell.textContent).toContain('5.0%');

    // DOM-order assertion: yahoo (higher rate) renders before polygon.
    const all = screen.getAllByTestId(/^fallback-rate-/);
    expect(all[0].getAttribute('data-testid')).toBe('fallback-rate-yahoo');
    expect(all[1].getAttribute('data-testid')).toBe('fallback-rate-polygon');
  });

  it('FallbackHeatmapTile applies red color class when rate > 20%', () => {
    const rows = [{ provider_id: 'yahoo', fallback_rate: 0.6, count_24h: 100 }];
    render(<FallbackHeatmapTile rows={rows} />);
    const cell = screen.getByTestId('fallback-rate-yahoo');
    expect(cell.className).toContain('text-red');
  });

  it('FallbackHeatmapTile applies amber color class when rate is between 5% and 20%', () => {
    const rows = [{ provider_id: 'finnhub', fallback_rate: 0.1, count_24h: 100 }];
    render(<FallbackHeatmapTile rows={rows} />);
    const cell = screen.getByTestId('fallback-rate-finnhub');
    expect(cell.className).toContain('text-amber');
  });

  it('FallbackHeatmapTile applies emerald color class when rate <= 5%', () => {
    const rows = [{ provider_id: 'polygon', fallback_rate: 0.03, count_24h: 100 }];
    render(<FallbackHeatmapTile rows={rows} />);
    const cell = screen.getByTestId('fallback-rate-polygon');
    expect(cell.className).toContain('text-emerald');
  });

  it('ActiveAlertsTile shows count and renders multiple rows in order', () => {
    const now = Date.now();
    const alerts = [
      {
        id: 'a1',
        provider_id: 'yahoo',
        breached_at: new Date(now - 1 * 3600_000),
        error_rate: 0.22,
        error_count: 50,
        total_count: 200,
        dominant_error_class: 'RATE_LIMITED',
      },
      {
        id: 'a2',
        provider_id: 'finnhub',
        breached_at: new Date(now - 5 * 60_000),
        error_rate: 0.18,
        error_count: 9,
        total_count: 50,
        dominant_error_class: null,
      },
    ];
    render(<ActiveAlertsTile alerts={alerts} />);
    expect(screen.getByTestId('active-alerts-tile')).toBeTruthy();
    expect(screen.getByText(/Active alerts \(2\)/)).toBeTruthy();
    expect(screen.getByTestId('alert-row-yahoo')).toBeTruthy();
    expect(screen.getByTestId('alert-row-finnhub')).toBeTruthy();
  });
});
