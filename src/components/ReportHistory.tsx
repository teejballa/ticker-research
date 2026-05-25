'use client';

import { useEffect, useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { StoredReport } from '@/lib/types';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tooltip } from '@/components/ui/Tooltip';

function formatReportDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

function toFilename(report: StoredReport): string {
  const ts = report.analyzed_at.replace(/:/g, '-').replace(/\.\d+Z$/, 'Z');
  return `${report.ticker}-${ts}.json`;
}

/** Stable key used for navigation + delete: UUID in web mode, filename locally. */
function keyOf(report: StoredReport): string {
  return report.id ?? toFilename(report);
}

const REC_STYLE: Record<string, { cls: string; label: string }> = {
  bullish: { cls: 'rec-bull', label: '▲ Bull' },
  bearish: { cls: 'rec-bear', label: '▼ Bear' },
  neutral: { cls: 'rec-hold', label: '◆ Hold' },
};

const ROW_COLS = '56px minmax(0,1fr) 70px 84px 116px';

const actionBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer',
  fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '0.1em',
};

export default function ReportHistory() {
  const router = useRouter();
  const [reports, setReports] = useState<StoredReport[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Optimistic view: the deleted row disappears instantly. If the request
  // fails we never commit to `reports`, so React reverts the optimistic value
  // back to the real list and the row reappears.
  const [optimisticReports, applyOptimistic] = useOptimistic(
    reports,
    (current: StoredReport[], removedKey: string) =>
      current.filter((r) => keyOf(r) !== removedKey),
  );

  useEffect(() => {
    fetch('/api/history')
      .then((r) => r.json())
      .then((d: { reports: StoredReport[] }) => {
        setReports(d.reports ?? []);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, []);

  // Auto-disarm the delete confirm after a few seconds of inaction.
  useEffect(() => {
    if (!armedKey) return;
    const t = setTimeout(() => setArmedKey(null), 4000);
    return () => clearTimeout(t);
  }, [armedKey]);

  function handleDelete(report: StoredReport) {
    const key = keyOf(report);
    setArmedKey(null);
    setError(null);
    startTransition(async () => {
      applyOptimistic(key);
      try {
        const res = await fetch(`/api/history/${encodeURIComponent(key)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`delete failed (${res.status})`);
        setReports((prev) => prev.filter((r) => keyOf(r) !== key));
      } catch {
        setError('Could not delete that report — it has been restored. Please try again.');
      }
    });
  }

  const ready = status === 'ready';
  const isEmpty = ready && optimisticReports.length === 0;

  return (
    <div className="panel" aria-busy={status === 'loading' || isPending}>
      <h3>
        Recent reports
        <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--ink-3)' }}>
          {ready && !isEmpty ? `${optimisticReports.length} on file` : ''}
        </span>
      </h3>

      {status === 'loading' &&
        Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="history-row"
            style={{ gridTemplateColumns: ROW_COLS, cursor: 'default' }}
          >
            <Skeleton width={36} height={12} />
            <span style={{ display: 'block' }}>
              <Skeleton width="70%" height={12} style={{ marginBottom: 6 }} />
              <Skeleton width="45%" height={9} />
            </span>
            <Skeleton width={34} height={10} />
            <Skeleton width={48} height={14} radius={3} />
            <Skeleton width={70} height={10} style={{ justifySelf: 'end' }} />
          </div>
        ))}

      {status === 'error' && (
        <p style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--ink-3)', letterSpacing: '0.1em' }}>
          History unavailable.
        </p>
      )}

      {isEmpty && (
        <p style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--ink-3)', letterSpacing: '0.05em' }}>
          No reports yet. Analyze a ticker to get started.
        </p>
      )}

      {error && (
        <p role="alert" style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--rose)', letterSpacing: '0.04em', margin: '4px 0 10px' }}>
          {error}
        </p>
      )}

      {ready && optimisticReports.map((report) => {
        const rec = REC_STYLE[report.market_sentiment] ?? REC_STYLE.neutral;
        const navKey = keyOf(report);
        const armed = armedKey === navKey;
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
            <span style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
              {armed ? (
                <>
                  <button
                    data-testid="history-delete-confirm"
                    onClick={(e) => { e.stopPropagation(); handleDelete(report); }}
                    style={{ ...actionBtn, color: 'var(--rose)', fontWeight: 700 }}
                  >
                    DELETE
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setArmedKey(null); }}
                    style={{ ...actionBtn, color: 'var(--ink-3)' }}
                  >
                    CANCEL
                  </button>
                </>
              ) : (
                <>
                  <button
                    data-testid="history-open-btn"
                    onClick={(e) => { e.stopPropagation(); router.push(`/research/${report.ticker}?report=${encodeURIComponent(navKey)}`); }}
                    style={{ ...actionBtn, color: 'var(--indigo)' }}
                  >
                    OPEN
                  </button>
                  <button
                    data-testid="history-regen-btn"
                    onClick={(e) => { e.stopPropagation(); router.push(`/research/${report.ticker}`); }}
                    style={{ ...actionBtn, color: 'var(--ink-3)' }}
                  >
                    REGEN
                  </button>
                  <Tooltip label="Delete this report" placement="top">
                    <button
                      data-testid="history-delete-btn"
                      aria-label={`Delete the ${report.ticker} report`}
                      onClick={(e) => { e.stopPropagation(); setArmedKey(navKey); }}
                      style={{ ...actionBtn, color: 'var(--ink-3)', display: 'inline-flex', alignItems: 'center' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>delete</span>
                    </button>
                  </Tooltip>
                </>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
