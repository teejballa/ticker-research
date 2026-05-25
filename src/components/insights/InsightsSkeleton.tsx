import NavBar from '@/components/NavBar';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Route-level loading skeleton for the /insights/* pages. These pages are
 * force-dynamic and read Postgres on every request, so there is a real wait on
 * navigation — this mirrors the page's hero → stat-row → tabs → card-grid shape
 * so the layout doesn't jump when the data arrives.
 */
export default function InsightsSkeleton({ eyebrow = 'Research dashboard' }: { eyebrow?: string }) {
  return (
    <>
      <div className="paper-grain" />
      <NavBar />
      <main className="page skeleton-screen" aria-busy="true" aria-label={`Loading ${eyebrow}`}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '40px 24px' }}>
          {/* Hero */}
          <Skeleton width={140} height={11} style={{ marginBottom: 18 }} />
          <Skeleton width="58%" height={40} radius={6} style={{ marginBottom: 14 }} />
          <Skeleton width="80%" height={16} style={{ marginBottom: 4 }} />
          <Skeleton width="46%" height={16} style={{ marginBottom: 36 }} />

          {/* Stat row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 16,
              marginBottom: 40,
            }}
          >
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                style={{
                  border: '1px solid var(--rule)',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--surface)',
                  padding: '18px 20px',
                }}
              >
                <Skeleton width="55%" height={10} style={{ marginBottom: 14 }} />
                <Skeleton width="72%" height={26} radius={4} />
              </div>
            ))}
          </div>

          {/* Tab strip */}
          <div style={{ display: 'flex', gap: 22, borderBottom: '1px solid var(--rule)', paddingBottom: 14, marginBottom: 28 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} width={96} height={12} />
            ))}
          </div>

          {/* Card grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                style={{
                  border: '1px solid var(--rule)',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--surface)',
                  padding: '22px 24px',
                }}
              >
                <Skeleton width="40%" height={11} style={{ marginBottom: 18 }} />
                <Skeleton width="85%" height={22} radius={4} style={{ marginBottom: 18 }} />
                <Skeleton height={6} radius={3} style={{ marginBottom: 10 }} />
                <Skeleton width="70%" height={12} />
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
