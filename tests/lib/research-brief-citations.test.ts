// tests/lib/research-brief-citations.test.ts
//
// Plan 30.1-04 Task 3 (D-24) — unit tests for the Community Intelligence
// markdown rendering with permalink citations.
//
// Asserts:
//  - When highlight has both standout_quote and standout_url, the brief renders
//    `[quote](url)` Markdown link
//  - When standout_url is undefined (firecrawl branch), brief renders plain
//    quoted text (backward compat)
//  - When standout_quote is empty, brief omits the quote line entirely
//  - Markdown special chars in standout_quote are escaped to prevent injection

import { describe, it, expect } from 'vitest';
import {
  renderCommunityHighlights,
  escapeMarkdownLinkText,
} from '@/lib/research-brief';
import type { CommunityHighlight } from '@/lib/types';

const baseHighlight: CommunityHighlight = {
  community_name: 'r/wallstreetbets',
  community_type: 'mainstream',
  audience: 'retail momentum traders',
  standout_quote: 'AAPL puts loaded',
  theme: 'meme + options momentum',
  sentiment: 'neutral',
  engagement_signal: 'high',
};

describe('renderCommunityHighlights — D-24 citation rendering', () => {
  it('emits [quote](url) markdown link when both standout_quote and standout_url present', () => {
    const md = renderCommunityHighlights([
      {
        ...baseHighlight,
        standout_quote: 'AAPL puts loaded',
        standout_url: 'https://www.reddit.com/r/wallstreetbets/comments/1abc/aapl_puts_loaded/',
      },
    ]);
    expect(md).toContain(
      '[AAPL puts loaded](https://www.reddit.com/r/wallstreetbets/comments/1abc/aapl_puts_loaded/)',
    );
  });

  it('renders plain quoted text when standout_url is undefined (backward compat)', () => {
    const md = renderCommunityHighlights([
      { ...baseHighlight, standout_quote: 'AAPL puts loaded' /* no url */ },
    ]);
    // Should NOT contain a markdown link
    expect(md).not.toMatch(/\[.+\]\(.+\)/);
    // Should contain the quote as plain text (with surrounding quotes)
    expect(md).toContain('AAPL puts loaded');
  });

  it('omits the quote line entirely when standout_quote is empty (existing behavior preserved)', () => {
    const md = renderCommunityHighlights([
      { ...baseHighlight, standout_quote: '', standout_url: undefined },
    ]);
    // Community name still rendered
    expect(md).toContain('r/wallstreetbets');
    // But no quote in markdown link form, and no surrounding double quotes
    // for an empty body
    expect(md).not.toMatch(/\[.*\]\(.+\)/);
    expect(md).not.toContain('""');
  });

  it('escapes markdown special chars in standout_quote to prevent link injection', () => {
    const md = renderCommunityHighlights([
      {
        ...baseHighlight,
        standout_quote: 'evil](javascript:alert(1)) hijack [extra',
        standout_url: 'https://www.reddit.com/r/x/comments/1abc/',
      },
    ]);
    // Bracket should be escaped to \[ / \]
    expect(md).toContain('\\]');
    expect(md).toContain('\\[');
    // The unescaped link injection attempt must NOT produce a working markdown
    // link that points anywhere other than the legitimate standout_url
    expect(md).not.toContain('](javascript:alert(1))');
  });

  it('renders multiple highlights as separate lines', () => {
    const md = renderCommunityHighlights([
      {
        ...baseHighlight,
        community_name: 'r/wallstreetbets',
        standout_quote: 'first',
        standout_url: 'https://www.reddit.com/r/wallstreetbets/comments/1a/',
      },
      {
        ...baseHighlight,
        community_name: 'HackerNews',
        community_type: 'middle',
        standout_quote: 'second',
        standout_url: 'https://news.ycombinator.com/item?id=42',
      },
    ]);
    expect(md).toContain('r/wallstreetbets');
    expect(md).toContain('HackerNews');
    expect(md).toContain('[first](https://www.reddit.com/r/wallstreetbets/comments/1a/)');
    expect(md).toContain('[second](https://news.ycombinator.com/item?id=42)');
  });

  it('returns empty string for empty highlights array', () => {
    expect(renderCommunityHighlights([])).toBe('');
  });

  describe('escapeMarkdownLinkText', () => {
    it('escapes [ and ] and \\ characters', () => {
      expect(escapeMarkdownLinkText('foo[bar]baz')).toBe('foo\\[bar\\]baz');
      expect(escapeMarkdownLinkText('a\\b')).toBe('a\\\\b');
    });

    it('leaves normal text untouched', () => {
      expect(escapeMarkdownLinkText('AAPL puts loaded')).toBe('AAPL puts loaded');
    });

    it('handles empty string', () => {
      expect(escapeMarkdownLinkText('')).toBe('');
    });
  });
});
