// tests/unit/reports-db.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma client before importing reports-db
const mockCreate = vi.fn();
const mockFindMany = vi.fn();
const mockFindFirst = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    report: {
      create: mockCreate,
      findMany: mockFindMany,
      findFirst: mockFindFirst,
    },
  },
}));

// Must be imported AFTER mock setup
const { writeReportToDb, listReportsFromDb, readReportFromDb } = await import('@/lib/reports-db');

const mockResult = {
  ticker: 'AAPL',
  company_name: 'Apple Inc.',
  analyzed_at: '2026-03-20T10:00:00.000Z',
  market_sentiment: 'bullish' as const,
  confidence_level: 'High' as const,
  sentiment_reasoning: 'Strong fundamentals',
  bullish_signals: [],
  bearish_signals: [],
  assessment: { buy_pct: 60, hold_pct: 30, sell_pct: 10, buy_rationale: '', hold_rationale: '', sell_rationale: '' },
  confidence_explanation: '',
  sources_used: [],
  source_warnings: [],
};

describe('writeReportToDb (WEB-03)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls prisma.report.create with correct fields including user_id', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'test-uuid-123' });
    const id = await writeReportToDb(mockResult, 'user@example.com');
    expect(mockCreate).toHaveBeenCalledOnce();
    const { data } = mockCreate.mock.calls[0][0];
    expect(data.user_id).toBe('user@example.com');
    expect(data.ticker).toBe('AAPL');
    expect(data.company_name).toBe('Apple Inc.');
    expect(data.market_sentiment).toBe('bullish');
    expect(data.confidence_level).toBe('High');
    expect(id).toBe('test-uuid-123');
  });
});

describe('listReportsFromDb (WEB-04)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries only reports for the given user_id', async () => {
    mockFindMany.mockResolvedValueOnce([]);
    await listReportsFromDb('user@example.com');
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { user_id: 'user@example.com' },
    }));
  });

  it('maps DB rows to StoredReport shape with ISO analyzed_at', async () => {
    const dbRow = {
      id: 'uuid-1',
      user_id: 'user@example.com',
      ticker: 'AAPL',
      company_name: 'Apple Inc.',
      analyzed_at: new Date('2026-03-20T10:00:00.000Z'),
      market_sentiment: 'bullish',
      confidence_level: 'High',
      analysis: mockResult,
    };
    mockFindMany.mockResolvedValueOnce([dbRow]);
    const reports = await listReportsFromDb('user@example.com');
    expect(reports).toHaveLength(1);
    expect(reports[0].ticker).toBe('AAPL');
    expect(reports[0].analyzed_at).toBe('2026-03-20T10:00:00.000Z');
    expect(reports[0].market_sentiment).toBe('bullish');
    expect(reports[0].analysis).toEqual(mockResult);
  });

  it('returns empty array when no reports exist for user', async () => {
    mockFindMany.mockResolvedValueOnce([]);
    const reports = await listReportsFromDb('other@example.com');
    expect(reports).toHaveLength(0);
  });

  it('includes id field from DB row in returned StoredReport', async () => {
    const dbRow = {
      id: 'uuid-phase14-test',
      user_id: 'user@example.com',
      ticker: 'AAPL',
      company_name: 'Apple Inc.',
      analyzed_at: new Date('2026-03-20T10:00:00.000Z'),
      market_sentiment: 'bullish',
      confidence_level: 'High',
      analysis: mockResult,
    };
    mockFindMany.mockResolvedValueOnce([dbRow]);
    const reports = await listReportsFromDb('user@example.com');
    expect(reports[0].id).toBe('uuid-phase14-test');
  });
});

describe('readReportFromDb (WEB-04 single report)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries by id AND user_id together (user_id scoping)', async () => {
    const dbRow = {
      id: 'uuid-1',
      user_id: 'user@example.com',
      ticker: 'AAPL',
      company_name: 'Apple Inc.',
      analyzed_at: new Date('2026-03-20T10:00:00.000Z'),
      market_sentiment: 'bullish',
      confidence_level: 'High',
      analysis: mockResult,
    };
    mockFindFirst.mockResolvedValueOnce(dbRow);
    const report = await readReportFromDb('uuid-1', 'user@example.com');
    expect(mockFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'uuid-1', user_id: 'user@example.com' },
    }));
    expect(report.ticker).toBe('AAPL');
    expect(report.analyzed_at).toBe('2026-03-20T10:00:00.000Z');
  });

  it('throws when report not found (user_id mismatch treated as not found)', async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    await expect(readReportFromDb('uuid-1', 'attacker@example.com')).rejects.toThrow();
  });

  it('includes id field from DB row in returned StoredReport', async () => {
    const dbRow = {
      id: 'uuid-read-test',
      user_id: 'user@example.com',
      ticker: 'AAPL',
      company_name: 'Apple Inc.',
      analyzed_at: new Date('2026-03-20T10:00:00.000Z'),
      market_sentiment: 'bullish',
      confidence_level: 'High',
      analysis: mockResult,
    };
    mockFindFirst.mockResolvedValueOnce(dbRow);
    const report = await readReportFromDb('uuid-read-test', 'user@example.com');
    expect(report.id).toBe('uuid-read-test');
  });

  it('round-trips all Phase 12/13 fields through analysis JSON column', async () => {
    const phase13Result = {
      ...mockResult,
      price_target: '$195-$210',
      future_projection: 'Strong growth outlook for next 12 months.',
      sentiment_intelligence: {
        stocktwits_bull_pct: 72,
        stocktwits_bear_pct: 28,
        stocktwits_message_count: 1500,
        stocktwits_is_trending: true,
        put_call_ratio: 0.85,
        put_call_interpretation: 'bullish' as const,
      },
      community_highlights: [{
        community_name: 'r/stocks',
        theme: 'earnings',
        sentiment: 'bullish' as const,
        community_type: 'mainstream' as const,
        audience: 'retail',
        standout_quote: 'AAPL is solid.',
        engagement_signal: 'high' as const,
      }],
    };
    const dbRow = {
      id: 'uuid-phase13',
      user_id: 'user@example.com',
      ticker: 'AAPL',
      company_name: 'Apple Inc.',
      analyzed_at: new Date('2026-04-20T10:00:00.000Z'),
      market_sentiment: 'bullish',
      confidence_level: 'High',
      analysis: phase13Result,
    };
    mockFindFirst.mockResolvedValueOnce(dbRow);
    const report = await readReportFromDb('uuid-phase13', 'user@example.com');
    expect(report.id).toBe('uuid-phase13');
    expect(report.analysis.price_target).toBe('$195-$210');
    expect(report.analysis.future_projection).toBeDefined();
    expect(report.analysis.sentiment_intelligence?.stocktwits_bull_pct).toBe(72);
    expect(report.analysis.community_highlights).toHaveLength(1);
  });
});
