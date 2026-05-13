# Runbook: Growing the Aspect-Label Fixture

**Plan:** 20-B-05
**Owner:** Cipher sentiment-layer
**Last updated:** 2026-05-13

## Purpose

The aspect-κ monthly cron (`/api/cron/aspect-kappa-monitor`) measures Cohen's κ between the `gemini-per-doc-v1` aspect tags and a hand-labeled fixture at `tests/golden-tickers/_aspect_labels.json`. The fixture ships with 10 seed docs covering all 7 aspects + an off-topic guard. It must grow to ≥50 docs before the first formal κ ≥ 0.6 ship-gate evaluation.

## Target Sample Composition

| Slice | Target n | Notes |
|---|---|---|
| Single-aspect — earnings | 6–8 | Mix beats, misses, in-lines |
| Single-aspect — guidance | 4–6 | Raises, cuts, reaffirmations |
| Single-aspect — regulatory | 4–6 | SEC filings, antitrust, FDA |
| Single-aspect — M&A | 4–6 | Announcements, terminations, regulatory holds |
| Single-aspect — macro | 4–6 | Fed, CPI, jobs, geopolitics |
| Single-aspect — product | 4–6 | Launches, recalls, roadmap |
| Single-aspect — management | 4–6 | C-suite changes, board actions |
| Multi-aspect | 6–10 | M&A + regulatory; earnings + guidance; product + management |
| Off-topic guard | 2–4 | Weather, sports, unrelated geopolitics |
| **Total** | **≥50** | |

## Labeling Procedure

1. **Source pool:** prefer news articles + filings from tickers in `golden-tickers` so the fixture composition mirrors the live data distribution. Community/retail items are welcome but should be a minority slice — the model card lists news as the primary distribution.
2. **One labeler per doc** is sufficient for the v1 fixture; multi-labeler agreement is a v2 enhancement. Label your own confidence honestly — if you can't decide between two aspects, include BOTH (inter-aspect overlap is intentional per CONTEXT.md line 113).
3. **Avoid synthesizing text** — copy the real headline + first 2–3 paragraphs verbatim. Synthetic text inflates κ because the model recognizes its own training distribution.
4. **Off-topic docs MUST be genuinely off-topic** (weather, unrelated sports). The classifier's OFF-TOPIC CLAUSE handles these; off-topic docs should produce `aspects: []` from both human and model.
5. **doc_id must be stable** — use a deterministic prefix like `seed-NNN-<ticker>-<one-word-hint>`. Never reuse a doc_id across labels.
6. **Add a `notes` field** when the label decision is non-obvious. Future labelers (and the κ post-mortem) will thank you.

## Fixture Schema

```json
{
  "doc_id": "string (stable, unique)",
  "source": "news" | "community" (defaults to news),
  "text": "string (real headline + 2-3 paragraphs)",
  "human_aspects": ["earnings" | "guidance" | "regulatory" | "M&A" | "macro" | "product" | "management"],
  "notes": "string (optional — rationale for non-obvious labels)"
}
```

## Validation Before Merging

```bash
# 1. JSON parse + schema check (no field missing, all aspects ∈ ASPECT_TAGS)
npx tsx -e "const f=JSON.parse(require('fs').readFileSync('tests/golden-tickers/_aspect_labels.json','utf8')); const T=['earnings','guidance','regulatory','M&A','macro','product','management']; for (const d of f) { if (!d.doc_id||!d.text||!Array.isArray(d.human_aspects)) throw new Error('schema: '+JSON.stringify(d)); for (const a of d.human_aspects) if (!T.includes(a)) throw new Error('bad aspect: '+a); } console.log('OK', f.length, 'docs')"

# 2. Run the κ eval locally (requires CRON_SECRET-equivalent Gemini routing; defer if no live key)
npx tsx scripts/eval-aspect-kappa.ts
```

The κ ≥ 0.6 ship gate is in `HYPERPARAMETERS.md` and the model card — the eval script reports κ but does NOT assert it (S1 single-source-of-truth).

## Cadence

- **Quarterly:** review the fixture for distribution drift (new aspects? new ticker classes?).
- **Ad-hoc:** add docs when κ for a specific aspect drops below 0.6 for two consecutive monthly cron runs — diagnostic enrichment.
- **Never:** delete labeled docs. The fixture is append-only (S2 immutability — historical κ runs reference these doc_ids).

## Links

- Model card: `docs/cards/MODEL-CARD-per-aspect-aggregate.md`
- Plan: `.planning/phases/20-real-sentiment-analysis/20-B-05-PLAN.md`
- Fixture: `tests/golden-tickers/_aspect_labels.json`
- Cron: `src/app/api/cron/aspect-kappa-monitor/route.ts`
- Eval harness: `scripts/eval-aspect-kappa.ts`
