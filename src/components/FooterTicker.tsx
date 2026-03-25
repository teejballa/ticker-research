'use client';

import { useState, useEffect } from 'react';

interface TapeItem {
  sym: string;
  price: string | null;
  chg: string | null;
  up: boolean;
}

function getMarketStatus(): { open: boolean; label: string } {
  const ny   = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day  = ny.getDay();
  const mins = ny.getHours() * 60 + ny.getMinutes();
  const isWeekday = day >= 1 && day <= 5;
  if (!isWeekday) return { open: false, label: 'WEEKEND' };
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return { open: true,  label: 'REGULAR SESSION' };
  if (mins >= 4 * 60        && mins < 9 * 60 + 30) return { open: true,  label: 'PRE-MARKET' };
  if (mins >= 16 * 60       && mins < 20 * 60) return { open: true,  label: 'AFTER-HOURS' };
  return { open: false, label: 'CLOSED' };
}

const FALLBACK_TAPE: TapeItem[] = [
  { sym: 'AAPL',  price: null, chg: null, up: true  },
  { sym: 'TSLA',  price: null, chg: null, up: true  },
  { sym: 'MSFT',  price: null, chg: null, up: true  },
  { sym: 'NVDA',  price: null, chg: null, up: true  },
  { sym: 'GOOGL', price: null, chg: null, up: true  },
  { sym: 'AMZN',  price: null, chg: null, up: true  },
  { sym: 'META',  price: null, chg: null, up: true  },
  { sym: 'JPM',   price: null, chg: null, up: true  },
];

export default function FooterTicker() {
  const [tape, setTape] = useState<TapeItem[]>(FALLBACK_TAPE);
  const market = getMarketStatus();

  useEffect(() => {
    async function fetchTape() {
      try {
        const res = await fetch('/api/market-snapshot');
        if (!res.ok) return;
        const data = await res.json();
        if (data.items) setTape(data.items);
      } catch {
        // keep fallback
      }
    }

    fetchTape();
    const interval = setInterval(fetchTape, 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <footer className="fixed bottom-0 left-0 w-full z-50 bg-surface-container-low h-[32px] border-t border-surface-container flex items-center overflow-hidden whitespace-nowrap">
      {/* Gradient top accent */}
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-tertiary/40 to-transparent" />

      {/* Scrolling tape */}
      <div className="flex items-center gap-8 px-4 font-mono text-[12px] animate-ticker whitespace-nowrap">
        {[...tape, ...tape].map((t, i) => (
          <span key={i} className="text-on-surface/80 flex gap-2 shrink-0">
            <span className="text-on-surface-variant">{t.sym}</span>
            <span className={t.up ? 'text-secondary' : 'text-error'}>
              {t.price != null ? `${t.price} ${t.chg}` : '—'}
            </span>
          </span>
        ))}
      </div>

      {/* Market status pill */}
      <div className="ml-auto bg-surface-container-low px-4 h-full flex items-center gap-2 border-l border-surface-container relative z-10 shrink-0">
        <span
          className={`material-symbols-outlined text-[10px] ${market.open ? 'text-secondary' : 'text-outline-variant'}`}
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          fiber_manual_record
        </span>
        <span className="text-on-surface/60 font-medium text-[10px] tracking-widest uppercase">
          {market.label}
        </span>
      </div>
    </footer>
  );
}
