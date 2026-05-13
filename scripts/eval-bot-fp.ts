#!/usr/bin/env -S node --import tsx
/**
 * Plan 20-C-03 — FP evaluation script.
 *
 * Reads the 100-author labeled set + matched fixtures, replays
 * cresciBotScore against each author's recent message bag, and reports:
 *   - confusion matrix {tp, fp, tn, fn}
 *   - precision, recall, fp_rate
 *   - per-reason FP/TP breakdown
 *
 * Exits NON-ZERO when fp_rate > 0.05 — this is the FP gate (CONTEXT.md
 * line 126; CI gate; cutover criterion).
 *
 * Updates the spot-check log section of docs/cards/MODEL-CARD-bot-filter.md
 * with the latest run's numbers + timestamp.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { cresciBotScore, type CresciReason } from '../src/lib/sentiment/bot-filter';

interface LabeledRow {
  author_id_hash: string;
  ticker_sampled: string;
  label: 'bot' | 'human';
  notes?: string;
  labeled_at: string;
  labeled_by: string;
}

interface AuthorFixture {
  author_id_hash: string;
  messages: string[];
  hashtag_counts: number[];
  account_age_days: number;
}

const FP_GATE = 0.05;

function loadLabels(): LabeledRow[] {
  const p = join(process.cwd(), 'tests/golden-tickers/_bot_labels.json');
  const data = JSON.parse(readFileSync(p, 'utf8'));
  if (!Array.isArray(data) || data.length !== 100) {
    console.error(
      `eval-bot-fp: labeled set must have exactly 100 entries, got ${
        Array.isArray(data) ? data.length : 'non-array'
      }`,
    );
    process.exit(2);
  }
  return data as LabeledRow[];
}

function loadFixtures(): Map<string, AuthorFixture> {
  const p = join(process.cwd(), 'tests/golden-tickers/_bot_fixtures.json');
  if (!existsSync(p)) {
    console.error(
      `eval-bot-fp: fixture file ${p} missing — operator must build it alongside the labeled set`,
    );
    process.exit(3);
  }
  const arr = JSON.parse(readFileSync(p, 'utf8')) as AuthorFixture[];
  return new Map(arr.map((f) => [f.author_id_hash, f]));
}

function main(): void {
  const labels = loadLabels();
  const fixtures = loadFixtures();

  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  const byReason: Record<CresciReason, { fp: number; tp: number }> = {
    young_account: { fp: 0, tp: 0 },
    high_self_similarity: { fp: 0, tp: 0 },
    pump_density: { fp: 0, tp: 0 },
    hashtag_spam: { fp: 0, tp: 0 },
    clean: { fp: 0, tp: 0 },
  };

  for (const row of labels) {
    const fx = fixtures.get(row.author_id_hash);
    if (!fx) {
      console.error(
        `eval-bot-fp: no fixture for ${row.author_id_hash} — fixture file out of sync with label file`,
      );
      process.exit(4);
    }
    const result = cresciBotScore({
      account_age_days: fx.account_age_days,
      messages: fx.messages,
      hashtag_counts: fx.hashtag_counts,
    });
    const predicted_bot = result.is_bot;
    const actual_bot = row.label === 'bot';
    if (predicted_bot && actual_bot) {
      tp++;
      byReason[result.reason].tp++;
    } else if (predicted_bot && !actual_bot) {
      fp++;
      byReason[result.reason].fp++;
    } else if (!predicted_bot && !actual_bot) {
      tn++;
    } else {
      fn++;
    }
  }

  const n_human = tn + fp;
  const fp_rate = n_human === 0 ? 0 : fp / n_human;
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);

  const summary = `## eval-bot-fp run @ ${new Date().toISOString()}

| metric | value |
|---|---|
| tp | ${tp} |
| fp | ${fp} |
| tn | ${tn} |
| fn | ${fn} |
| fp_rate | ${fp_rate.toFixed(4)} |
| precision | ${precision.toFixed(4)} |
| recall | ${recall.toFixed(4)} |

FP by reason: ${JSON.stringify(byReason)}

Gate: fp_rate ≤ ${FP_GATE} → ${fp_rate <= FP_GATE ? 'PASS' : 'FAIL'}
`;

  console.log(summary);

  // Append to the model card spot-check log section.
  const cardPath = join(process.cwd(), 'docs/cards/MODEL-CARD-bot-filter.md');
  if (existsSync(cardPath)) {
    const card = readFileSync(cardPath, 'utf8');
    const marker = '<!-- SPOT-CHECK-LOG -->';
    if (card.includes(marker)) {
      const updated = card.replace(marker, `${marker}\n\n${summary}\n`);
      writeFileSync(cardPath, updated, 'utf8');
    }
  }

  if (fp_rate > FP_GATE) {
    console.error(`eval-bot-fp: FAIL — fp_rate=${fp_rate.toFixed(4)} > ${FP_GATE}`);
    process.exit(1);
  }
  console.log('eval-bot-fp: PASS');
}

main();
