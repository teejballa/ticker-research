'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { StoredReport } from '@/lib/types';

function formatReportDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

function toFilename(report: StoredReport): string {
  const ts = report.analyzed_at.replace(/:/g, '-').replace(/\.\d+Z$/, 'Z');
  return `${report.ticker}-${ts}.json`;
}

const SENTIMENT_STYLE: Record<string, { color: string; bg: string }> = {
  bullish: { color: '#10b981', bg: '#064e3b' },
  bearish: { color: '#ef4444', bg: '#2d0a0a' },
  neutral: { color: '#3d5e7a', bg: '#0a1520' },
};

export default function ReportHistory() {
  const router = useRouter();
  const [reports, setReports] = useState<StoredReport[]>([]);
  const [status, setStatus] = useState<'loading' | 'empty' | 'loaded' | 'error'>('loading');

  useEffect(() => {
    fetch('/api/history')
      .then(r => r.json())
      .then((d: { reports: StoredReport[] }) => {
        setReports(d.reports);
        setStatus(d.reports.length === 0 ? 'empty' : 'loaded');
      })
      .catch(() => setStatus('error'));
  }, []);

  const GRID_COLS = 'grid-cols-[72px_minmax(0,1fr)_110px_104px_96px_60px_72px]';

  return (
    <section className="mt-8 fade-in">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[#f59e0b]/70 text-[10px]">&#9654;</span>
        <span className="text-[#4d6f8a] text-[10px] font-bold tracking-[0.4em]">RESEARCH HISTORY</span>
      </div>

      <div className="panel">
        {/* Column headers */}
        <div className={`grid ${GRID_COLS} gap-x-4 px-4 py-2 border-b border-[#1a2d42]`}>
          {['SYMBOL', 'COMPANY', 'DATE', 'SENTIMENT', 'CONFIDENCE', '', ''].map((h, i) => (
            <span key={i} className="text-[#2a4560] text-[10px] tracking-[0.25em] select-none">{h}</span>
          ))}
        </div>

        {/* Loading */}
        {status === 'loading' && (
          <div className="px-4 py-3">
            <div className={`grid ${GRID_COLS} gap-x-4 items-center opacity-30`} style={{ height: '40px' }}>
              <span className="text-[#2a4560] text-[10px] tracking-[0.3em] col-span-7">LOADING HISTORY...</span>
            </div>
            <div className={`grid ${GRID_COLS} gap-x-4 items-center opacity-30`} style={{ height: '40px' }}>
              <span className="col-span-7 h-px bg-[#1a2d42]" />
            </div>
            <div className={`grid ${GRID_COLS} gap-x-4 items-center opacity-30`} style={{ height: '40px' }}>
              <span className="col-span-7 h-px bg-[#1a2d42]" />
            </div>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="px-4 py-3">
            <span className="text-[#2a4560] text-[10px] tracking-[0.3em]">HISTORY UNAVAILABLE</span>
          </div>
        )}

        {/* Empty state */}
        {status === 'empty' && (
          <div className="px-4 py-3">
            <span className="text-[#3a5070] text-[10px] tracking-[0.2em]">
              No reports yet. Analyze a ticker to get started.
            </span>
          </div>
        )}

        {/* Report rows */}
        {status === 'loaded' && reports.map((report) => {
          const sentStyle = SENTIMENT_STYLE[report.market_sentiment] ?? SENTIMENT_STYLE.neutral;
          const navKey = report.id ?? toFilename(report);
          return (
            <div
              key={navKey}
              data-testid="history-row"
              className={`grid ${GRID_COLS} gap-x-4 px-4 items-center border-b border-[#0f1a27] last:border-b-0`}
              style={{ height: '40px', transition: 'background 0.12s', cursor: 'default' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#0d1420')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              <span className="text-[#f59e0b] text-[11px] font-bold tracking-[0.1em]">{report.ticker}</span>
              <span className="text-[#4a6a8a] text-[11px] overflow-hidden text-ellipsis whitespace-nowrap pr-2">{report.company_name}</span>
              <span className="text-[#3d5e7a] text-[10px] tabular-nums">{formatReportDate(report.analyzed_at)}</span>
              <span
                className="text-[9px] uppercase font-bold tracking-[0.1em] px-2 py-[3px] justify-self-start"
                style={{ color: sentStyle.color, background: sentStyle.bg }}
              >
                {report.market_sentiment}
              </span>
              <span className="text-[#3d5e7a] text-[9px] uppercase tracking-[0.15em]">{report.confidence_level}</span>
              <button
                data-testid="history-open-btn"
                className="text-[#f59e0b] text-[9px] tracking-[0.1em] bg-transparent border-none cursor-pointer hover:text-[#fbbf24] transition-colors"
                onClick={() => router.push(`/research/${report.ticker}?report=${encodeURIComponent(navKey)}`)}
              >
                [OPEN]
              </button>
              <button
                data-testid="history-regen-btn"
                className="text-[#3a5a78] text-[9px] tracking-[0.1em] bg-transparent border-none cursor-pointer hover:text-[#6b8fa8] transition-colors"
                onClick={() => router.push(`/research/${report.ticker}`)}
              >
                [REGEN]
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
