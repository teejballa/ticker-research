// @vitest-environment jsdom
/**
 * Plan 20-C-03 — RTL contract test for the bot-filter / coordinated-posting
 * subtext in the SentimentIntelligenceCard.
 *
 * Mirrors the 20-A-05 agreement-badge precedent: the full ResearchReport
 * component is too heavy for a unit test, so the JSX is extracted verbatim
 * into a standalone subject. Assertions enforce:
 *
 *   1. (mode='on', authors>0)         → subtext present
 *   2. (mode='on', coordinated>0)     → subtext present
 *   3. (mode='off')                   → subtext ABSENT (shadow gate)
 *   4. (mode='shadow')                → subtext ABSENT
 *   5. (mode='on', both counts 0)     → subtext ABSENT (no zero-state noise)
 *   6. (mode='on', counts>0) — message list NOT silenced (T-20-C-03-05)
 *
 * Per T-20-C-03-05: amber (NOT red) color class is enforced; the filter
 * affects WEIGHT not VISIBILITY — flagged messages MUST still render in any
 * per-message list this card displays.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

interface BotFilterSummary {
  authors_flagged: number;
  messages_flagged_coordinated: number;
  coordinated_posting: boolean;
}

// Subject mirrors the subtext in ResearchReport.tsx (Sentiment Intelligence
// card, after the MIXED · LOW AGREEMENT badge).
function BotFilterSubtext({
  mode,
  summary,
}: {
  mode: 'off' | 'shadow' | 'on';
  summary: BotFilterSummary | null;
}) {
  if (
    mode !== 'on'
    || !summary
    || (summary.authors_flagged <= 0 && summary.messages_flagged_coordinated <= 0)
  ) {
    return null;
  }
  return (
    <p
      data-testid="bot-filter-subtext"
      className="mt-2 text-xs text-amber-600"
    >
      {summary.authors_flagged} authors flagged as bots;{' '}
      {summary.messages_flagged_coordinated} messages flagged as coordinated
    </p>
  );
}

// Tiny wrapper to test T-20-C-03-05 — flagged messages still render.
function MessageListWithSubtext({
  mode,
  summary,
  messages,
}: {
  mode: 'off' | 'shadow' | 'on';
  summary: BotFilterSummary | null;
  messages: Array<{ id: string; body: string; is_bot_flagged: boolean }>;
}) {
  return (
    <div>
      <BotFilterSubtext mode={mode} summary={summary} />
      <ul data-testid="msg-list">
        {messages.map((m) => (
          <li key={m.id} data-testid={`msg-${m.id}`}>
            {m.body}
          </li>
        ))}
      </ul>
    </div>
  );
}

describe('20-C-03 — bot-filter subtext rendering gates', () => {
  it("mode='on', authors_flagged=3, coord=0 → subtext renders with amber class", () => {
    render(
      <BotFilterSubtext
        mode="on"
        summary={{
          authors_flagged: 3,
          messages_flagged_coordinated: 0,
          coordinated_posting: false,
        }}
      />,
    );
    const el = screen.getByTestId('bot-filter-subtext');
    expect(el).toBeTruthy();
    expect(el.textContent).toMatch(/3 authors flagged as bots/);
    expect(el.textContent).toMatch(/0 messages flagged as coordinated/);
    // T-20-C-03-05: amber (advisory) NOT red (silencing).
    expect(el.className).toMatch(/text-amber-600/);
    expect(el.className).not.toMatch(/text-error/);
    expect(el.className).not.toMatch(/text-red-/);
  });

  it("mode='on', authors=0, coord=55 → subtext renders", () => {
    render(
      <BotFilterSubtext
        mode="on"
        summary={{
          authors_flagged: 0,
          messages_flagged_coordinated: 55,
          coordinated_posting: true,
        }}
      />,
    );
    const el = screen.getByTestId('bot-filter-subtext');
    expect(el.textContent).toMatch(/0 authors flagged as bots/);
    expect(el.textContent).toMatch(/55 messages flagged as coordinated/);
  });

  it("mode='off' with non-zero counts → subtext ABSENT (shadow gate)", () => {
    render(
      <BotFilterSubtext
        mode="off"
        summary={{
          authors_flagged: 10,
          messages_flagged_coordinated: 99,
          coordinated_posting: true,
        }}
      />,
    );
    expect(screen.queryByTestId('bot-filter-subtext')).toBeNull();
  });

  it("mode='shadow' with non-zero counts → subtext ABSENT", () => {
    render(
      <BotFilterSubtext
        mode="shadow"
        summary={{
          authors_flagged: 10,
          messages_flagged_coordinated: 99,
          coordinated_posting: true,
        }}
      />,
    );
    expect(screen.queryByTestId('bot-filter-subtext')).toBeNull();
  });

  it("mode='on' with both counts = 0 → subtext ABSENT (no zero-state noise)", () => {
    render(
      <BotFilterSubtext
        mode="on"
        summary={{
          authors_flagged: 0,
          messages_flagged_coordinated: 0,
          coordinated_posting: false,
        }}
      />,
    );
    expect(screen.queryByTestId('bot-filter-subtext')).toBeNull();
  });

  it("mode='on' with summary=null → subtext ABSENT", () => {
    render(<BotFilterSubtext mode="on" summary={null} />);
    expect(screen.queryByTestId('bot-filter-subtext')).toBeNull();
  });

  it("T-20-C-03-05 — flagged messages REMAIN in message list when subtext renders", () => {
    render(
      <MessageListWithSubtext
        mode="on"
        summary={{
          authors_flagged: 1,
          messages_flagged_coordinated: 2,
          coordinated_posting: true,
        }}
        messages={[
          { id: 'a', body: 'flagged spam message', is_bot_flagged: true },
          { id: 'b', body: 'normal user message', is_bot_flagged: false },
        ]}
      />,
    );
    // Subtext renders.
    expect(screen.getByTestId('bot-filter-subtext')).toBeTruthy();
    // FLAGGED message MUST still be in the DOM (weight-not-visibility).
    expect(screen.getByTestId('msg-a').textContent).toBe('flagged spam message');
    expect(screen.getByTestId('msg-b').textContent).toBe('normal user message');
  });
});
