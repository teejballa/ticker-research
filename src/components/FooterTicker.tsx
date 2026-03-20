'use client';

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

const TAPE = [
  { sym: 'AAPL',  price: '189.84', chg: '+0.43%', up: true  },
  { sym: 'TSLA',  price: '177.20', chg: '-2.14%', up: false },
  { sym: 'MSFT',  price: '415.22', chg: '+1.12%', up: true  },
  { sym: 'NVDA',  price: '882.12', chg: '-0.55%', up: false },
  { sym: 'GOOGL', price: '151.46', chg: '+0.81%', up: true  },
  { sym: 'AMZN',  price: '178.22', chg: '+0.25%', up: true  },
  { sym: 'META',  price: '527.93', chg: '+0.65%', up: true  },
  { sym: 'JPM',   price: '224.89', chg: '-0.45%', up: false },
];

export default function FooterTicker() {
  const market = getMarketStatus();

  return (
    <footer className="fixed bottom-0 left-0 w-full z-50 bg-surface-container-low h-[32px] border-t border-surface-container flex items-center overflow-hidden whitespace-nowrap">
      {/* Gradient top accent */}
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-tertiary/40 to-transparent" />

      {/* Scrolling tape */}
      <div className="flex items-center gap-8 px-4 font-mono text-[12px] animate-ticker whitespace-nowrap">
        {[...TAPE, ...TAPE].map((t, i) => (
          <span key={i} className="text-on-surface/80 flex gap-2 shrink-0">
            <span className="text-on-surface-variant">{t.sym}</span>
            <span className={t.up ? 'text-secondary' : 'text-error'}>
              {t.price} {t.chg}
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
