/**
 * Plan 20-Z-07 — Lookahead-bias regression test (PIT runtime defense).
 *
 * Captures every Prisma query an async function issues. Used by the
 * regression test to assert no production sentiment query path joins on
 * `published_at` (would inflate backtested IC by 30-100%; phase threat
 * T-28-002).
 *
 * Implementation: Prisma 7 client extension. The legacy event-API
 * approach using "query" listeners is NOT supported when using driver
 * adapters (@prisma/adapter-neon — see src/lib/db.ts). The
 * `$extends({ query: { $allOperations: ... } })` extension API is the
 * supported interception path in Prisma 7+. The extension is applied
 * LOCALLY (returns a new client wrapper) so the singleton `prisma` from
 * `@/lib/db` is unaffected for non-test code paths.
 *
 * Companion: scripts/check-lookahead-static.ts (the static defense-in-depth
 * layer that fast-fails CI on grep before the runtime test ever loads).
 */
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

const BUFFER_MAX = 1000;

export interface CapturedQuery {
  /** Raw SQL string as Prisma issued it (parameterized with $1, $2, ...) — or a
   *  synthesized descriptor `<op> FROM <model> (ORM-synthesized — not raw SQL)`
   *  for ORM operations where Prisma's extension API does not expose the
   *  rendered SQL. */
  sql: string;
  /** Bound parameter values (do NOT log in CI artifacts — may contain user data) */
  params: unknown[];
  /** Wall-clock duration in ms (best-effort; from extension-side timing) */
  duration_ms: number;
  /** Best-guess primary table name from the FROM clause; null if SQL has no FROM */
  target_table: string | null;
  /** Operation: select | insert | update | delete | other */
  operation: 'select' | 'insert' | 'update' | 'delete' | 'other';
}

export interface SqlClauseSplit {
  /** text between SELECT and FROM */
  select_projection: string;
  /** primary FROM table + JOINed tables (best-effort) */
  from_tables: string[];
  /** each "ON ..." clause body, one entry per JOIN */
  join_on_expressions: string[];
  /** body between WHERE and the next clause keyword (or null if no WHERE) */
  where_body: string | null;
  /** body between ORDER BY and the next clause keyword (or null if no ORDER BY) */
  order_by_body: string | null;
}

/**
 * Wrap an async function with a fresh Prisma client whose extension
 * captures every issued query into an in-memory buffer. Caller passes
 * the instrumented client into the function; the fn MUST use the
 * passed-in client (not the global singleton) for queries to be captured.
 *
 * Returns: the original function's result + the captured queries.
 */
export async function withQueryCapture<T>(
  fn: (instrumented: PrismaClient) => Promise<T>,
): Promise<{ result: T; queries: CapturedQuery[] }> {
  const buffer: CapturedQuery[] = [];
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('withQueryCapture: DATABASE_URL must be set (load .env.local in your test setup).');
  }

  const baseClient = new PrismaClient({
    adapter: new PrismaNeon({ connectionString }),
  });

  const instrumented = baseClient.$extends({
    name: 'lookahead-bias-capture',
    query: {
      $allOperations: async ({ args, query, model, operation }) => {
        const start = performance.now();
        try {
          const result = await query(args);
          return result;
        } finally {
          const duration_ms = performance.now() - start;
          if (buffer.length < BUFFER_MAX) {
            // The extension API does NOT expose the rendered SQL for ORM
            // operations (only $queryRaw / $executeRaw expose raw SQL). For
            // ORM operations we synthesize a canonical descriptor
            // `<operation> FROM <model>` so the test can at least verify the
            // table targeted; ORM operations cannot join on published_at
            // unless the model exposes it as a relation (and
            // SentimentObservation does not — it's a scalar column only). The
            // HIGH-RISK path is raw SQL via $queryRaw, which IS captured.
            const isRaw =
              operation === '$queryRaw' ||
              operation === '$executeRaw' ||
              operation === '$queryRawUnsafe' ||
              operation === '$executeRawUnsafe';
            let sql: string;
            let params: unknown[] = [];
            if (isRaw && Array.isArray((args as { values?: unknown[] }).values)) {
              // $queryRaw template-tag form: args = { strings, values }
              const tag = args as { strings?: string[]; values?: unknown[] };
              sql = (tag.strings ?? []).join('?');
              params = tag.values ?? [];
            } else if (isRaw && Array.isArray(args)) {
              // $queryRawUnsafe form: args = [sql, ...params]
              const arr = args as unknown[];
              sql = typeof arr[0] === 'string' ? (arr[0] as string) : String(arr[0]);
              params = arr.slice(1);
            } else if (isRaw && typeof (args as { sql?: string }).sql === 'string') {
              sql = (args as { sql: string; values?: unknown[] }).sql;
              params = (args as { sql: string; values?: unknown[] }).values ?? [];
            } else {
              // ORM op — synthesize descriptor
              const tableName = model ?? 'unknown';
              sql = `${operation} FROM ${tableName} (ORM-synthesized — not raw SQL)`;
            }
            buffer.push({
              sql,
              params,
              duration_ms,
              target_table: extractPrimaryTable(sql) ?? (model ?? null),
              operation: classifyOperation(operation),
            });
          }
        }
      },
    },
  });

  try {
    const result = await fn(instrumented as unknown as PrismaClient);
    return { result, queries: buffer };
  } finally {
    await baseClient.$disconnect();
  }
}

function classifyOperation(op: string): CapturedQuery['operation'] {
  const lc = op.toLowerCase();
  if (lc.startsWith('find') || lc.includes('queryraw') || lc.includes('aggregate') || lc === 'count') return 'select';
  if (lc.startsWith('create') || lc.includes('insert')) return 'insert';
  if (lc.startsWith('update') || lc.startsWith('upsert')) return 'update';
  if (lc.startsWith('delete')) return 'delete';
  return 'other';
}

function extractPrimaryTable(sql: string): string | null {
  const m = /\bFROM\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/i.exec(sql);
  return m ? m[1] : null;
}

/**
 * Best-effort regex SQL splitter — NOT a full tokenizer. Sufficient for
 * the lookahead-bias matcher because we only need to know whether a
 * column reference appears in WHERE / JOIN ON / ORDER BY (which is
 * answerable via clause-text inspection without a full parse).
 */
export function splitSqlClauses(sql: string): SqlClauseSplit {
  const selectMatch = /\bSELECT\b([\s\S]*?)\bFROM\b/i.exec(sql);
  const fromMatch = /\bFROM\b\s+([\s\S]*?)(?=\bWHERE\b|\bORDER\s+BY\b|\bGROUP\s+BY\b|\bLIMIT\b|;|$)/i.exec(sql);
  const whereMatch = /\bWHERE\b([\s\S]*?)(?=\bORDER\s+BY\b|\bGROUP\s+BY\b|\bLIMIT\b|;|$)/i.exec(sql);
  const orderMatch = /\bORDER\s+BY\b([\s\S]*?)(?=\bLIMIT\b|;|$)/i.exec(sql);

  const fromBody = fromMatch ? fromMatch[1] : '';
  const fromTables: string[] = [];
  const tableRegex = /"?([a-zA-Z_][a-zA-Z0-9_]*)"?/g;
  let tm: RegExpExecArray | null;
  while ((tm = tableRegex.exec(fromBody)) !== null) {
    const candidate = tm[1].toLowerCase();
    if (
      candidate !== 'as' &&
      candidate !== 'on' &&
      candidate !== 'inner' &&
      candidate !== 'outer' &&
      candidate !== 'left' &&
      candidate !== 'right' &&
      candidate !== 'full' &&
      candidate !== 'cross' &&
      candidate !== 'join'
    ) {
      fromTables.push(tm[1]);
    }
  }

  const joinOnRegex = /\bJOIN\b[^()]+?\bON\b\s+([\s\S]*?)(?=\bJOIN\b|\bWHERE\b|\bORDER\s+BY\b|\bGROUP\s+BY\b|\bLIMIT\b|;|$)/gi;
  const joinOnExpressions: string[] = [];
  let jm: RegExpExecArray | null;
  const joinCarrier = fromBody + ' ' + (whereMatch?.[0] ?? '');
  while ((jm = joinOnRegex.exec(joinCarrier)) !== null) {
    joinOnExpressions.push(jm[1].trim());
  }

  return {
    select_projection: selectMatch ? selectMatch[1].trim() : '',
    from_tables: fromTables,
    join_on_expressions: joinOnExpressions,
    where_body: whereMatch ? whereMatch[1].trim() : null,
    order_by_body: orderMatch ? orderMatch[1].trim() : null,
  };
}

/**
 * Word-boundary match — `unpublished_at` does NOT match `published_at`.
 * Used by the regression test to detect lookahead-bias column references
 * in non-projection SQL clauses.
 */
export function clauseReferencesPublishedAt(clauseText: string | null): boolean {
  if (!clauseText) return false;
  // LOOKAHEAD-OK: regex literal — this is the matcher itself; it is intentionally the one place in src/ that mentions the column name outside the DAO/cron writer allowlist (see scripts/check-lookahead-static.ts allowlist mechanism)
  return /\bpublished_at\b/.test(clauseText);
}
