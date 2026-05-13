#!/usr/bin/env tsx
// scripts/check-finbert-sha.ts
//
// Plan 20-B-02 threat T-20-B-02-05 mitigation: monthly SHA-rot guard.
// GETs https://huggingface.co/api/models/ProsusAI/finbert and asserts the
// currently-served `sha` still matches FINBERT_PINNED_SHA8. Exits 0 healthy
// / 1 stale.
//
// Run via:  npm run check-finbert-sha
//
// Wire to a monthly Vercel cron in vercel.json (deferred to a future plan —
// for now this is operator-run on demand or via CI nightly).

import { FINBERT_PINNED_SHA8 } from '../src/lib/sentiment/finsentllm';

async function main() {
  const res = await fetch('https://huggingface.co/api/models/ProsusAI/finbert');
  if (!res.ok) {
    console.error(`HF API returned ${res.status}; cannot verify SHA pin`);
    process.exit(1);
  }
  const model = (await res.json()) as { sha?: string };
  if (!model.sha) {
    console.error('HF API response missing `sha` field');
    process.exit(1);
  }
  const currentSha8 = model.sha.substring(0, 8);
  if (currentSha8 !== FINBERT_PINNED_SHA8) {
    console.error(
      `SHA DRIFT: pinned ${FINBERT_PINNED_SHA8}, current main ${currentSha8} (full: ${model.sha}).\n` +
        `If this is intentional (vendor re-pin), bump FINBERT_PINNED_SHA8 in src/lib/sentiment/finsentllm.ts ` +
        `AND bump MODEL_VERSION suffix in src/lib/sentiment/per-message-pass.ts from -v1 to -v2.`,
    );
    process.exit(1);
  }
  console.log(`OK: pinned SHA ${FINBERT_PINNED_SHA8} matches HF main (full: ${model.sha})`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
