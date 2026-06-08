'use client';
// src/app/insights/baselines/components/HorizonTabStrip.tsx
// Phase 21.1 Wave 5 — Surface 1: Horizon tab strip for /insights/baselines.
//
// Client component (uses useSearchParams for URL-driven horizon selection).
// 4 tabs: 3d / 7d / 14d / 30d — default 7d per UI-SPEC §"Primary CTA".
//
// Selected tab gets indigo underline border — the ONLY indigo pixel on the
// tab strip per UI-SPEC §Color "Accent reserved for" item 2.
//
// Accessibility:
//   - role="tablist" + role="tab" + aria-selected per UI-SPEC §Surface 1
//   - Tab navigation via keyboard (handled by browser tabIndex)

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

const HORIZONS = ['3d', '7d', '14d', '30d'] as const;
type Horizon = (typeof HORIZONS)[number];

const DEFAULT_HORIZON: Horizon = '7d';

function isHorizon(v: string | null): v is Horizon {
  return HORIZONS.includes(v as Horizon);
}

export function HorizonTabStrip() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const raw = searchParams.get('horizon');
  const active: Horizon = isHorizon(raw) ? raw : DEFAULT_HORIZON;

  const select = useCallback(
    (h: Horizon) => {
      const params = new URLSearchParams(searchParams.toString());
      if (h === DEFAULT_HORIZON) {
        params.delete('horizon');
      } else {
        params.set('horizon', h);
      }
      const qs = params.toString();
      router.push(`/insights/baselines${qs ? `?${qs}` : ''}`);
    },
    [router, searchParams],
  );

  return (
    <nav
      role="tablist"
      aria-label="Forecast horizon"
      className="mt-8 flex gap-1 border-b border-outline-variant/30"
    >
      {HORIZONS.map((h) => {
        const isActive = h === active;
        return (
          <button
            key={h}
            role="tab"
            aria-selected={isActive}
            onClick={() => select(h)}
            className={[
              'px-3 py-2 text-[10px] tracking-[0.3em] font-mono uppercase transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary',
              isActive
                ? 'border-b-2 border-primary text-primary -mb-px'
                : 'text-outline hover:text-on-surface',
            ].join(' ')}
          >
            {h}
          </button>
        );
      })}
    </nav>
  );
}
