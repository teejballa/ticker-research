'use client';

import { useState, useEffect } from 'react';

interface TapeItem {
  sym: string;
  price: string | null;
  chg: string | null;
  up: boolean;
}

const FALLBACK_TAPE: TapeItem[] = [
  { sym: 'AAPL',  price: null, chg: null, up: true  },
  { sym: 'MSFT',  price: null, chg: null, up: true  },
  { sym: 'NVDA',  price: null, chg: null, up: true  },
  { sym: 'GOOGL', price: null, chg: null, up: true  },
  { sym: 'AMZN',  price: null, chg: null, up: true  },
  { sym: 'TSLA',  price: null, chg: null, up: false },
  { sym: 'META',  price: null, chg: null, up: true  },
  { sym: 'JPM',   price: null, chg: null, up: true  },
];

export default function FooterTicker() {
  const [tape, setTape] = useState<TapeItem[]>(FALLBACK_TAPE);

  useEffect(() => {
    async function fetchTape() {
      try {
        const res = await fetch('/api/market-snapshot');
        if (!res.ok) return;
        const data = await res.json();
        if (data.items) setTape(data.items);
      } catch {
        /* keep fallback */
      }
    }
    fetchTape();
    const interval = setInterval(fetchTape, 60_000);
    return () => clearInterval(interval);
  }, []);

  const doubled = [...tape, ...tape];

  return (
    <div className="footer-tape">
      <div className="tape-track">
        {doubled.map((t, i) => (
          <span key={i} className="tape-item">
            <span className="sym">{t.sym}</span>
            <span className="px">{t.price != null ? `$${t.price}` : '—'}</span>
            <span className={`ch ${t.up ? 'up' : 'down'}`}>{t.chg ?? '·'}</span>
            <span className="tape-divider">·</span>
          </span>
        ))}
      </div>
    </div>
  );
}
