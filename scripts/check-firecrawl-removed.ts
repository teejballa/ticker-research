/**
 * Phase 30.1 Task 5 — Permanent CI guard against Firecrawl re-introduction (D-26, T-30.1-05-01).
 *
 * Scans `src/`, `tests/`, and `scripts/` for any reference to
 * `firecrawl`, `FIRECRAWL`, or `@mendable/firecrawl-js`. Exits 1 on any hit
 * outside the allowlist (this script + its unit test).
 *
 * History references under `.planning/` are intentionally NOT scanned — phase
 * docs may legitimately reference Firecrawl in retrospectives.
 *
 * Usage: `npm run check-firecrawl-removed` or `npx tsx scripts/check-firecrawl-removed.ts`
 */
import { execSync } from 'child_process';
import * as path from 'path';

const PATTERNS = ['firecrawl', 'FIRECRAWL', '@mendable/firecrawl-js'];
const SCAN_DIRS = ['src', 'tests', 'scripts'];
const ALLOWLIST = new Set<string>([
  path.normalize('scripts/check-firecrawl-removed.ts'),
  path.normalize('scripts/migrations/30.1-resolve-firecrawl-alert.ts'),
  path.normalize('tests/scripts/check-firecrawl-removed.unit.test.ts'),
  path.normalize('tests/scripts/resolve-firecrawl-alert.unit.test.ts'),
]);

interface Hit {
  path: string;
  line: number;
  match: string;
}

function scan(): Hit[] {
  const hits: Hit[] = [];
  const seen = new Set<string>();
  for (const dir of SCAN_DIRS) {
    for (const pat of PATTERNS) {
      let out = '';
      try {
        out = execSync(
          `git grep -n -i -F "${pat}" -- "${dir}/" || true`,
          { encoding: 'utf8' },
        );
      } catch {
        continue;
      }
      for (const line of out.split('\n')) {
        if (!line) continue;
        const sepIdx = line.indexOf(':');
        if (sepIdx < 0) continue;
        const filePath = line.slice(0, sepIdx);
        const rest = line.slice(sepIdx + 1);
        const sepIdx2 = rest.indexOf(':');
        if (sepIdx2 < 0) continue;
        const lineNoStr = rest.slice(0, sepIdx2);
        const text = rest.slice(sepIdx2 + 1);
        const normalized = path.normalize(filePath);
        if (ALLOWLIST.has(normalized)) continue;
        const key = `${normalized}:${lineNoStr}:${pat}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push({ path: normalized, line: Number(lineNoStr), match: text });
      }
    }
  }
  return hits;
}

function main(): void {
  const hits = scan();
  if (hits.length === 0) {
    console.log(
      `[check-firecrawl-removed] PASS — no Firecrawl references in ${SCAN_DIRS.join(', ')}/`,
    );
    process.exit(0);
  }
  console.error(`[check-firecrawl-removed] FAIL — found ${hits.length} reference(s):`);
  for (const h of hits) {
    console.error(`  ${h.path}:${h.line} — ${h.match.trim()}`);
  }
  console.error('');
  console.error(
    'Phase 30.1 D-26 removed Firecrawl entirely; do not re-introduce. ' +
      'If a legitimate retrospective reference is needed, place it under .planning/ ' +
      '(not scanned) or extend the ALLOWLIST in scripts/check-firecrawl-removed.ts.',
  );
  process.exit(1);
}

main();
