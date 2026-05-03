import { prisma } from '../src/lib/db';

async function main() {
  const now = Date.now();
  const hours = (d: Date) => Math.floor((now - d.getTime()) / 3_600_000);

  console.log('\n=== CRON HEALTH CHECK ===');
  console.log(`Now: ${new Date().toISOString()}\n`);

  const latestSnap = await prisma.sentimentSnapshot.findFirst({
    orderBy: { scanned_at: 'desc' },
    select: { scanned_at: true, ticker: true },
  });
  const snapTotal = await prisma.sentimentSnapshot.count();
  const snapWithInst = await prisma.sentimentSnapshot.count({
    where: { institutional_data: { not: { equals: null } } },
  });
  const snapWithIns = await prisma.sentimentSnapshot.count({
    where: { insider_data: { not: { equals: null } } },
  });
  const snapWithTech = await prisma.sentimentSnapshot.count({
    where: { technical_data: { not: { equals: null } } },
  });
  console.log('— sentiment-scan (writes SentimentSnapshot rows; sched: 0 8 */3 * *)');
  console.log(`  total snapshots: ${snapTotal}`);
  if (latestSnap) {
    console.log(`  latest: ${latestSnap.scanned_at.toISOString()} (${hours(latestSnap.scanned_at)}h ago) — ${latestSnap.ticker}`);
  }
  console.log(`  snapshots with technical_data: ${snapWithTech}/${snapTotal} (${snapTotal ? Math.round(100 * snapWithTech / snapTotal) : 0}%)`);
  console.log(`  snapshots with institutional_data: ${snapWithInst}/${snapTotal} (${snapTotal ? Math.round(100 * snapWithInst / snapTotal) : 0}%)`);
  console.log(`  snapshots with insider_data: ${snapWithIns}/${snapTotal} (${snapTotal ? Math.round(100 * snapWithIns / snapTotal) : 0}%)`);

  const outcomeTotal = await prisma.priceOutcome.count();
  const outcomeByDays = await prisma.priceOutcome.groupBy({
    by: ['days_after'],
    _count: true,
    orderBy: { days_after: 'asc' },
  });
  const latestOutcome = await prisma.priceOutcome.findFirst({
    orderBy: { recorded_at: 'desc' },
    select: { recorded_at: true, days_after: true, pct_change: true, snapshot: { select: { ticker: true } } },
  });
  console.log('\n— price-followup (resolves outcomes at 3/7/14/30/60/90d; sched: 0 6 * * *)');
  console.log(`  total PriceOutcome rows: ${outcomeTotal}`);
  console.log(`  by horizon:`);
  outcomeByDays.forEach(o => console.log(`    ${o.days_after}d: ${o._count}`));
  if (latestOutcome) {
    console.log(`  latest: ${latestOutcome.recorded_at.toISOString()} (${hours(latestOutcome.recorded_at)}h ago) — ${latestOutcome.snapshot?.ticker} ${latestOutcome.days_after}d pct=${latestOutcome.pct_change.toFixed(3)}`);
  }

  const patterns = await prisma.learnedPattern.findMany({
    select: { signal_class: true, status: true, last_updated: true, brier_in_sample: true },
  });
  const byClassStatus = patterns.reduce((acc, p) => {
    const k = `${p.signal_class}:${p.status}`;
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const latestPattern = patterns.sort((a, b) => b.last_updated.getTime() - a.last_updated.getTime())[0];
  const activeWithBrier = patterns.filter(p => p.status === 'ACTIVE' && p.brier_in_sample !== null);
  console.log('\n— learn (Bayesian update of LearnedPattern; sched: 30 7 * * *)');
  console.log(`  total LearnedPattern rows: ${patterns.length}`);
  console.log(`  by signal_class:status:`);
  Object.entries(byClassStatus).sort().forEach(([k, v]) => console.log(`    ${k}: ${v}`));
  console.log(`  ACTIVE cells with brier_in_sample: ${activeWithBrier.length}`);
  if (latestPattern) {
    console.log(`  latest update: ${latestPattern.last_updated.toISOString()} (${hours(latestPattern.last_updated)}h ago)`);
  }

  const events = await prisma.learningEvent.findMany({
    orderBy: { occurred_at: 'desc' },
    take: 6,
    select: { signal_class: true, event_type: true, occurred_at: true, message: true },
  });
  const evByClass = await prisma.learningEvent.groupBy({
    by: ['signal_class'],
    _count: true,
  });
  console.log('\n— LearningEvent audit trail');
  console.log(`  total events by signal_class:`);
  evByClass.forEach(e => console.log(`    ${e.signal_class || '(null)'}: ${e._count}`));
  console.log(`  last 6 events:`);
  events.forEach(e => console.log(`    ${e.occurred_at.toISOString()}  ${e.signal_class || '-'}/${e.event_type}  ${e.message?.slice(0, 60) || ''}`));

  console.log('\n=== HEALTH VERDICT ===');
  const sentimentFresh = latestSnap && hours(latestSnap.scanned_at) < 24 * 4;
  const learnFresh = latestPattern && hours(latestPattern.last_updated) < 30;
  console.log(`  sentiment-scan: ${sentimentFresh ? '✅ healthy (latest snap within last 4 days)' : '❌ stale (latest snap > 4 days old)'}`);
  console.log(`  price-followup: ${outcomeTotal > 0 ? `✅ resolving outcomes (${outcomeTotal} total, latest ${latestOutcome ? hours(latestOutcome.recorded_at) + 'h ago' : 'n/a'})` : '⏳ waiting (no outcomes yet)'}`);
  console.log(`  learn: ${learnFresh ? '✅ healthy (LearnedPattern updated within last 30h)' : '⚠️ stale or no updates yet'}`);
  console.log(`  end-to-end loop: ${activeWithBrier.length > 0 ? `✅ FULL LOOP CLOSED — ${activeWithBrier.length} ACTIVE cells with brier scores` : '⏳ loop not yet closed (need 30d outcomes to resolve)'}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
