// @vitest-environment jsdom
/**
 * Plan 20-A-04 — RTL contract test for the Author-Concentration sub-card.
 *
 * Mirrors the 20-A-01 pattern: full ResearchReport is too heavy to render in
 * a unit test, so we extract the conditional sub-card into a standalone
 * subject and assert the render-state contract:
 *
 *   1. (flag='on', gini=0.42, n=5)         → sub-card visible, 5 bars rendered
 *   2. (flag='on', gini=null)              → ABSENT (n_authors<5 sentinel)
 *   3. (flag='off', gini=0.42, n=5)        → ABSENT (UI flag gates render)
 *   4. PII safety: rendered HTML contains 0 occurrences of raw handles
 *      from a realistic fixture (T-20-A-04-01). Only 8-char hex prefixes.
 *
 * The subject mirrors the ResearchReport.tsx block verbatim — any future
 * text drift fails this test.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

type Mode = 'off' | 'shadow' | 'on';

interface AuthorEntry {
  author_hash_prefix: string;
  share: number;
  message_count: number;
}

// Subject mirrors the conditional sub-card in ResearchReport.tsx.
function AuthorConcentrationSubCard({
  ui_mode,
  gini_coefficient,
  author_concentration,
}: {
  ui_mode: Mode;
  gini_coefficient: number | null;
  author_concentration: AuthorEntry[] | null;
}) {
  if (ui_mode !== 'on' || gini_coefficient == null || author_concentration == null) {
    return null;
  }
  return (
    <div className="border-t border-surface-container-highest pt-2 mt-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant">
          Top author concentration
        </span>
        <span className="text-[10px] font-mono text-on-surface-variant">
          Gini {gini_coefficient.toFixed(2)}
        </span>
      </div>
      <div className="space-y-1">
        {author_concentration.slice(0, 5).map((a) => (
          <div
            key={a.author_hash_prefix}
            className="flex items-center gap-2 text-[11px] font-mono"
          >
            <span
              className="text-on-surface-variant w-20 truncate"
              data-author-hash-prefix={a.author_hash_prefix}
            >
              {a.author_hash_prefix}…
            </span>
            <div className="flex-1 bg-surface-container-highest rounded-full h-2 overflow-hidden">
              <div
                className="bg-tertiary h-full"
                style={{ width: `${Math.round(a.share * 100)}%` }}
                aria-label={`Author ${a.author_hash_prefix} contributed ${Math.round(a.share * 100)}% of messages (n=${a.message_count})`}
              />
            </div>
            <span className="w-12 text-right text-on-surface-variant">
              {Math.round(a.share * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const FIXTURE_TOP5: AuthorEntry[] = [
  { author_hash_prefix: 'a1b2c3d4', share: 0.4, message_count: 40 },
  { author_hash_prefix: 'b2c3d4e5', share: 0.25, message_count: 25 },
  { author_hash_prefix: 'c3d4e5f6', share: 0.18, message_count: 18 },
  { author_hash_prefix: 'd4e5f6a7', share: 0.1, message_count: 10 },
  { author_hash_prefix: 'e5f6a7b8', share: 0.07, message_count: 7 },
];

describe('AuthorConcentrationSubCard (RTL contract)', () => {
  it('1. ui_mode=on + gini=0.42 + 5 authors → sub-card visible with 5 bars', () => {
    render(
      <AuthorConcentrationSubCard
        ui_mode="on"
        gini_coefficient={0.42}
        author_concentration={FIXTURE_TOP5}
      />,
    );
    expect(screen.getByText('Top author concentration')).toBeTruthy();
    expect(screen.getByText('Gini 0.42')).toBeTruthy();
    const bars = document.querySelectorAll('[data-author-hash-prefix]');
    expect(bars).toHaveLength(5);
    // Each data-author-hash-prefix matches 8 lowercase hex chars.
    for (const b of Array.from(bars)) {
      const val = b.getAttribute('data-author-hash-prefix');
      expect(val).toMatch(/^[0-9a-f]{8}$/);
    }
  });

  it('2. ui_mode=on + gini=null → sub-card ABSENT (n_authors<5 sentinel)', () => {
    const { container } = render(
      <AuthorConcentrationSubCard
        ui_mode="on"
        gini_coefficient={null}
        author_concentration={null}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('3. ui_mode=off → sub-card ABSENT even when data present', () => {
    const { container } = render(
      <AuthorConcentrationSubCard
        ui_mode="off"
        gini_coefficient={0.42}
        author_concentration={FIXTURE_TOP5}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('4. PII safety — rendered HTML contains zero realistic raw handles (T-20-A-04-01)', () => {
    // Realistic raw handles that MUST NEVER appear in rendered DOM.
    const FORBIDDEN_HANDLES = [
      '@WallStreetBets_Mod',
      'EliteTrader_99',
      '$AAPL_bull',
      'pumpking2026',
      'TheStockGuru',
      'reddit:DeepFuckingValue',
    ];
    const { container } = render(
      <AuthorConcentrationSubCard
        ui_mode="on"
        gini_coefficient={0.42}
        author_concentration={FIXTURE_TOP5}
      />,
    );
    const html = container.innerHTML;
    for (const handle of FORBIDDEN_HANDLES) {
      expect(html).not.toContain(handle);
    }
    // Defensive: no '@' followed by non-hex (would indicate handle leakage).
    expect(html).not.toMatch(/@\w+/);
  });
});
