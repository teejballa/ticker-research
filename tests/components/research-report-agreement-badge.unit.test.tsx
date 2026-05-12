// @vitest-environment jsdom
/**
 * Plan 20-A-05 — RTL contract test for the MIXED · LOW AGREEMENT amber badge.
 *
 * Mirrors the 20-A-01 crowded-consensus precedent: the full ResearchReport
 * component is too heavy for a unit test, so the badge JSX is extracted
 * verbatim into a standalone subject. Assertions enforce:
 *
 *   1. (low_agreement_warning=true,  uiFlag='on')  → badge present + Cookson tooltip + amber class
 *   2. (low_agreement_warning=true,  uiFlag='off') → badge ABSENT (shadow gate)
 *   3. (low_agreement_warning=false, uiFlag='on')  → badge ABSENT
 *   4. (low_agreement_warning=undefined, uiFlag='on') → badge ABSENT
 *
 * Per T-20-A-05-05: amber (NOT red) color class is enforced; tooltip MUST
 * contain "Cookson" citation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Subject mirrors the badge in ResearchReport.tsx (Sentiment Intelligence
// card header, alongside TRENDING).
function AgreementBadge({
  low_agreement_warning,
  uiFlag,
}: {
  low_agreement_warning: boolean | undefined;
  uiFlag: 'off' | 'on' | undefined;
}) {
  if (low_agreement_warning !== true || uiFlag !== 'on') return null;
  return (
    <span
      data-testid="agreement-low-badge"
      className="text-[10px] font-bold tracking-widest uppercase text-amber-600 bg-amber-50 px-2 py-0.5 rounded"
      title="Cross-platform sources disagree; per Cookson & Engelberg historically predicts higher subsequent volatility, NOT a directional signal."
    >
      MIXED · LOW AGREEMENT
    </span>
  );
}

describe('20-A-05 — MIXED · LOW AGREEMENT badge', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.NEXT_PUBLIC_FEATURE_AGREEMENT_SIGNAL_UI;
  });
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.NEXT_PUBLIC_FEATURE_AGREEMENT_SIGNAL_UI;
    else process.env.NEXT_PUBLIC_FEATURE_AGREEMENT_SIGNAL_UI = originalEnv;
  });

  it('renders badge with Cookson tooltip + amber class when warning=true and uiFlag=on', () => {
    render(<AgreementBadge low_agreement_warning={true} uiFlag="on" />);
    const badge = screen.getByTestId('agreement-low-badge');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toBe('MIXED · LOW AGREEMENT');
    // T-20-A-05-05: amber (warning) NOT red (action).
    expect(badge.className).toMatch(/text-amber-600/);
    expect(badge.className).toMatch(/bg-amber-50/);
    expect(badge.className).not.toMatch(/text-error/);
    expect(badge.className).not.toMatch(/bg-error/);
    expect(badge.className).not.toMatch(/text-red-/);
    // Tooltip MUST cite Cookson.
    expect(badge.getAttribute('title')).toMatch(/Cookson/);
    expect(badge.getAttribute('title')).toMatch(/NOT a directional signal/);
  });

  it('omits badge when warning=true but uiFlag=off (shadow lifecycle gate)', () => {
    render(<AgreementBadge low_agreement_warning={true} uiFlag="off" />);
    expect(screen.queryByTestId('agreement-low-badge')).toBeNull();
  });

  it('omits badge when warning=false', () => {
    render(<AgreementBadge low_agreement_warning={false} uiFlag="on" />);
    expect(screen.queryByTestId('agreement-low-badge')).toBeNull();
  });

  it('omits badge when warning is undefined (e.g. legacy SourcePackage)', () => {
    render(<AgreementBadge low_agreement_warning={undefined} uiFlag="on" />);
    expect(screen.queryByTestId('agreement-low-badge')).toBeNull();
  });
});
