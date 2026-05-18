'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { StoredReport } from '@/lib/types';

function formatReportDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

function toFilename(report: StoredReport): string {
  const ts = report.analyzed_at.replace(/:/g, '-').replace(/\.\d+Z$/, 'Z');
  return `${report.ticker}-${ts}.json`;
}

const REC_STYLE: Record<string, { cls: string; label: string }> = {
  bullish: { cls: 'rec-bull', label: '▲ Bull' },
  bearish: { cls: 'rec-bear', label: '▼ Bear' },
  neutral: { cls: 'rec-hold', label: '◆ Hold' },
};

const ROW_COLS = '56px minmax(0,1fr) 70px 84px 88px';

export default function ReportHistory() {
  const router = useRouter();
  const [reports, setReports] = useState<StoredReport[]>([]);
  const [status, setStatus] = useState<'loading' | 'empty' | 'loaded' | 'error'>('loading');

  useEffect(() => {
    fetch('/api/history')
      .then((r) => r.json())
      .then((d: { reports: StoredReport[] }) => {
        setReports(d.reports);
        setStatus(d.reports.length === 0 ? 'empty' : 'loaded');
      })
      .catch(() => setStatus('error'));
  }, []);

  return (
    <div className="panel">
      <h3>
        Recent reports
        <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--ink-3)' }}>
          {status === 'loaded' ? `${reports.length} on file` : ''}
        </span>
      </h3>

      {status === 'loading' && (
        <p style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--ink-3)', letterSpacing: '0.1em' }}>
          Loading history…
        </p>
      )}
      {status === 'error' && (
        <p style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--ink-3)', letterSpacing: '0.1em' }}>
          History unavailable.
        </p>
      )}
      {status === 'empty' && (
        <p style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--ink-3)', letterSpacing: '0.05em' }}>
          No reports yet. Analyze a ticker to get started.
        </p>
      )}

      {status === 'loaded' && reports.map((report) => {
        const rec = REC_STYLE[report.market_sentiment] ?? REC_STYLE.neutral;
        const navKey = report.id ?? toFilename(report);
        return (
          <div
            key={navKey}
            data-testid="history-row"
            className="history-row"
            style={{ gridTemplateColumns: ROW_COLS }}
            onClick={() => router.push(`/research/${report.ticker}?report=${encodeURIComponent(navKey)}`)}
          >
            <span className="sym">{report.ticker}</span>
            <span className="nm">
              {report.company_name}
              <em>{report.confidence_level} confidence · cited memo</em>
            </span>
            <span className="date">{formatReportDate(report.analyzed_at)}</span>
            <span className={`rec ${rec.cls}`}>{rec.label}</span>
            <span style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                data-testid="history-open-btn"
                onClick={(e) => { e.stopPropagation(); router.push(`/research/${report.ticker}?report=${encodeURIComponent(navKey)}`); }}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '0.1em', color: 'var(--indigo)' }}
              >
                OPEN
              </button>
              <button
                data-testid="history-regen-btn"
                onClick={(e) => { e.stopPropagation(); router.push(`/research/${report.ticker}`); }}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '0.1em', color: 'var(--ink-3)' }}
              >
                REGEN
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}
