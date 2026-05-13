// Family-aggregate engine thesis.
//
// The thesis is an OVERVIEW — how the engine's weights have settled across
// the major signal families (technical analysis, sentiment, smart-money) —
// not a snapshot of the most recent learn cycle. It builds on itself: a new
// thesis row is only persisted when current aggregates diverge materially
// from the last stored one, so the engine's stated belief is stable until
// the data actually disproves it.

import type { LearnedPattern, PrismaClient } from '@prisma/client';
import { posteriorMean } from './learning';

export type SignalClass = 'technical' | 'diffusion' | 'insider' | 'institutional';

export interface ThesisFamilyTopPattern {
  pattern_key: string;
  cap_class: string;
  horizon_days: number;
  mean: number;
  n: number;
}

export interface ThesisFamily {
  signal_class: SignalClass;
  label: string;
  mean: number;            // sample-weighted posterior across cells in family
  n: number;               // total sample size in family
  cells: number;           // count of cells with n>=3
  top_pattern: ThesisFamilyTopPattern | null;
}

export interface EngineThesisSnapshot {
  families: ThesisFamily[];
  top_family: SignalClass | null;
  narrative: string;
  total_cells: number;
  total_n: number;
}

const FAMILY_LABEL: Record<SignalClass, string> = {
  technical: 'Technical analysis',
  diffusion: 'Sentiment & community diffusion',
  insider: 'Insider activity',
  institutional: 'Institutional flow',
};

const MIN_CELL_N = 3;          // a cell needs >=3 outcomes before it joins the aggregate
const MIN_FAMILY_N_FOR_SHIFT = 10; // a family needs >=10 outcomes before its shift counts as material
const MATERIAL_SHIFT = 0.05;   // ±5pp in family posterior counts as a real change

function familyLabel(sc: string): string {
  return FAMILY_LABEL[sc as SignalClass] ?? sc;
}

function pctVerb(mean: number): string {
  if (mean >= 0.58) return 'reliably beats the S&P';
  if (mean >= 0.52) return 'edges out the S&P';
  if (mean >= 0.48) return 'tracks the S&P roughly evenly';
  if (mean >= 0.42) return 'tends to underperform the S&P';
  return 'consistently lags the S&P';
}

export function computeEngineThesis(allCells: LearnedPattern[]): EngineThesisSnapshot {
  // Bucket by signal_class, keeping only cells with enough outcomes to inform a posterior.
  const usable = allCells.filter(c => c.sample_size >= MIN_CELL_N);
  const byClass = new Map<SignalClass, LearnedPattern[]>();
  for (const c of usable) {
    const sc = c.signal_class as SignalClass;
    if (!FAMILY_LABEL[sc]) continue;
    const arr = byClass.get(sc) ?? [];
    arr.push(c);
    byClass.set(sc, arr);
  }

  const families: ThesisFamily[] = [];
  for (const sc of Object.keys(FAMILY_LABEL) as SignalClass[]) {
    const cells = byClass.get(sc) ?? [];
    if (cells.length === 0) continue;

    const totalN = cells.reduce((s, c) => s + c.sample_size, 0);
    const weighted = totalN > 0
      ? cells.reduce((s, c) => s + posteriorMean({ alpha: c.alpha, beta: c.beta }) * c.sample_size, 0) / totalN
      : 0.5;

    // Top pattern within family = highest posterior × log10(n+1) (sample-aware ranking).
    const rankedTop = cells
      .map(c => {
        const m = posteriorMean({ alpha: c.alpha, beta: c.beta });
        return { c, score: m * Math.log10(c.sample_size + 1), m };
      })
      .sort((a, b) => b.score - a.score);
    const topCell = rankedTop[0];
    const top_pattern: ThesisFamilyTopPattern | null = topCell ? {
      pattern_key: topCell.c.pattern_key,
      cap_class: topCell.c.cap_class,
      horizon_days: topCell.c.horizon_days,
      mean: topCell.m,
      n: topCell.c.sample_size,
    } : null;

    families.push({
      signal_class: sc,
      label: FAMILY_LABEL[sc],
      mean: weighted,
      n: totalN,
      cells: cells.length,
      top_pattern,
    });
  }

  families.sort((a, b) => (b.mean - 0.5) * Math.log10(b.n + 1) - (a.mean - 0.5) * Math.log10(a.n + 1));
  const top = families[0] ?? null;

  return {
    families,
    top_family: top ? top.signal_class : null,
    narrative: buildNarrative(families),
    total_cells: usable.length,
    total_n: usable.reduce((s, c) => s + c.sample_size, 0),
  };
}

export function buildNarrative(families: ThesisFamily[]): string {
  if (families.length === 0) {
    return 'Cipher is still gathering outcomes. No signal family has reached the three-trade minimum yet.';
  }
  // Fixed reading order so sentiment leads and every family gets a clause.
  const order: Record<SignalClass, number> = {
    diffusion: 0, technical: 1, institutional: 2, insider: 3,
  };
  const sorted = [...families].sort((a, b) => order[a.signal_class] - order[b.signal_class]);
  const totalN = families.reduce((s, f) => s + f.n, 0);
  const ranked = [...families].sort((a, b) =>
    (b.mean - 0.5) * Math.log10(b.n + 1) - (a.mean - 0.5) * Math.log10(a.n + 1),
  );
  const top = ranked[0];
  const clauses = sorted.map(
    f => `${f.label.toLowerCase()} at ${Math.round(f.mean * 100)}% over ${f.n}`,
  );
  const list = clauses.length === 1
    ? clauses[0]
    : `${clauses.slice(0, -1).join(', ')}, and ${clauses[clauses.length - 1]}`;
  return `Across ${totalN} resolved outcomes, ${list}. ${top.label} ${pctVerb(top.mean)} most reliably — Cipher revises this view only when a family's posterior moves 5+ points on ten new outcomes.`;
}

function findFamily(snap: EngineThesisSnapshot, sc: SignalClass): ThesisFamily | undefined {
  return snap.families.find(f => f.signal_class === sc);
}

// Returns true iff the current aggregate has diverged enough from the prior
// that the thesis should be re-stamped.
export function materiallyDiverges(current: EngineThesisSnapshot, prior: EngineThesisSnapshot | null): boolean {
  if (!prior) return true;
  if (current.top_family !== prior.top_family) {
    const curTop = current.top_family ? findFamily(current, current.top_family) : null;
    if (curTop && curTop.n >= MIN_FAMILY_N_FOR_SHIFT) return true;
  }
  for (const cur of current.families) {
    const prev = findFamily(prior, cur.signal_class);
    if (!prev) {
      if (cur.n >= MIN_FAMILY_N_FOR_SHIFT) return true;
      continue;
    }
    if (Math.abs(cur.mean - prev.mean) >= MATERIAL_SHIFT && cur.n >= MIN_FAMILY_N_FOR_SHIFT) {
      return true;
    }
  }
  return false;
}

// Reads the latest persisted thesis; computes the current aggregate; persists
// a new row only when it materially diverges from the prior. Returns the
// thesis the UI should render (either prior or freshly minted).
export async function ensureLatestThesis(
  prisma: PrismaClient,
  allCells: LearnedPattern[],
): Promise<EngineThesisSnapshot & { recorded_at: string }> {
  const current = computeEngineThesis(allCells);
  const last = await prisma.engineThesis.findFirst({ orderBy: { recorded_at: 'desc' } });
  const priorSnap: EngineThesisSnapshot | null = last ? {
    families: last.families as unknown as ThesisFamily[],
    top_family: last.top_family as SignalClass,
    narrative: last.narrative,
    total_cells: last.total_cells,
    total_n: last.total_n,
  } : null;

  if (materiallyDiverges(current, priorSnap)) {
    const row = await prisma.engineThesis.create({
      data: {
        families: current.families as unknown as object,
        top_family: current.top_family ?? 'diffusion',
        narrative: current.narrative,
        total_cells: current.total_cells,
        total_n: current.total_n,
      },
    });
    return { ...current, recorded_at: row.recorded_at.toISOString() };
  }
  // Keep the prior story intact — that's the "build on itself" property.
  return {
    ...priorSnap!,
    recorded_at: last!.recorded_at.toISOString(),
  };
}

export { familyLabel };
