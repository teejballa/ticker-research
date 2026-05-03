import { prisma } from '../src/lib/db';

async function main() {
  console.log('\n=== WHAT HAS THE ENGINE LEARNED? ===');
  console.log(`As of: ${new Date().toISOString()}\n`);

  // 1. Patterns that have moved off the uniform prior (alpha=1, beta=1)
  const allPatterns = await prisma.learnedPattern.findMany({
    orderBy: [{ signal_class: 'asc' }, { sample_size: 'desc' }],
  });
  const moved = allPatterns.filter(p => p.alpha !== 1 || p.beta !== 1);

  console.log(`📊 LEARNED CELLS (alpha or beta moved off 1)`);
  console.log(`   ${moved.length}/${allPatterns.length} cells have at least one observation\n`);

  if (moved.length > 0) {
    console.log('   By signal class:');
    const groups = moved.reduce((acc, p) => {
      const k = p.signal_class;
      acc[k] = acc[k] || { count: 0, totalSamples: 0, hits: 0 };
      acc[k].count += 1;
      acc[k].totalSamples += p.sample_size;
      acc[k].hits += p.hits;
      return acc;
    }, {} as Record<string, { count: number; totalSamples: number; hits: number }>);
    Object.entries(groups).sort().forEach(([k, v]) => {
      const hitRate = v.totalSamples > 0 ? (100 * v.hits / v.totalSamples).toFixed(0) : 'n/a';
      console.log(`     ${k.padEnd(15)} ${v.count} cells · ${v.totalSamples} observations · hit rate ${hitRate}%`);
    });

    console.log('\n   Top 10 highest-evidence cells:');
    const top = [...moved].sort((a, b) => b.sample_size - a.sample_size).slice(0, 10);
    top.forEach(p => {
      const posterior = p.alpha / (p.alpha + p.beta);
      const ci = Math.sqrt((p.alpha * p.beta) / ((p.alpha + p.beta) ** 2 * (p.alpha + p.beta + 1)));
      console.log(`     ${p.signal_class.padEnd(15)} ${p.pattern_key.padEnd(28)} ${p.cap_class.padEnd(10)} ${p.horizon_days}d  posterior=${(posterior * 100).toFixed(0)}% ±${(ci * 100).toFixed(0)}%  n=${p.sample_size} hits=${p.hits}  status=${p.status}`);
    });
  }

  // 2. ACTIVE cells with brier vs null model
  const active = allPatterns.filter(p => p.status === 'ACTIVE' && p.brier_in_sample !== null);
  console.log(`\n🎯 ACTIVE CELLS WITH BRIER SCORES (engine outperforming the null model)`);
  console.log(`   ${active.length} cell(s) have crossed the activation threshold\n`);
  if (active.length > 0) {
    active.forEach(p => {
      const bIn = p.brier_in_sample!.toFixed(4);
      const bNull = p.brier_null !== null ? p.brier_null.toFixed(4) : 'n/a';
      const lift = p.brier_null !== null ? (((p.brier_null - p.brier_in_sample!) / p.brier_null) * 100).toFixed(1) : 'n/a';
      console.log(`     ${p.signal_class}/${p.pattern_key}/${p.cap_class}/${p.horizon_days}d  brier=${bIn} vs null=${bNull}  lift=${lift}%  n=${p.sample_size}`);
    });
  }

  // 3. Logistic epochs — has the 12-d Bayesian regression trained?
  const epochs = await prisma.logisticEpoch.findMany({
    orderBy: { epoch: 'desc' },
    take: 3,
  });
  const epochTotal = await prisma.logisticEpoch.count();
  console.log(`\n🧮 LOGISTIC EPOCHS (12-d Bayesian regression on 30d outcomes)`);
  console.log(`   total epochs run: ${epochTotal}`);
  if (epochs.length > 0) {
    epochs.forEach(t => {
      console.log(`     epoch=${t.epoch}  ${t.recorded_at.toISOString()}  brier_in=${t.brier_in.toFixed(4)} brier_out=${t.brier_out.toFixed(4)} n=${t.sample_size}`);
    });
  } else {
    console.log(`   (logistic regression has not trained yet — needs 30d outcomes to resolve, ETA ~2026-05-26)`);
  }
  const traceTotal = await prisma.diffusionTrace.count();
  console.log(`   diffusion traces recorded: ${traceTotal}`);

  // 4. Reports generated and how many had calibration
  const reportTotal = await prisma.report.count();
  const recentReports = await prisma.report.findMany({
    orderBy: { analyzed_at: 'desc' },
    take: 10,
    select: { ticker: true, analyzed_at: true, analysis: true },
  });
  console.log(`\n📑 REPORTS GENERATED`);
  console.log(`   total: ${reportTotal}`);
  console.log(`   most recent 10:`);
  recentReports.forEach(r => {
    const analysis = r.analysis as any;
    const calib = analysis?.engine_calibration;
    const hasActive = calib?.diffusion_status === 'ACTIVE' || calib?.technical_status === 'ACTIVE' || (calib?.horizon_calibrations || []).some((h: any) => h.diffusion_status === 'ACTIVE' || h.technical_status === 'ACTIVE');
    const tag = calib ? (hasActive ? '🎯 ACTIVE prior used' : 'NO_DATA prior (still warming)') : '— pre-Phase-15';
    console.log(`     ${r.analyzed_at.toISOString().slice(0, 16)}  ${r.ticker.padEnd(6)}  ${tag}`);
  });

  // 5. How many recent reports had at least one ACTIVE class?
  const reportsWithActive = recentReports.filter(r => {
    const calib = (r.analysis as any)?.engine_calibration;
    if (!calib) return false;
    return calib.diffusion_status === 'ACTIVE' || calib.technical_status === 'ACTIVE' || (calib.horizon_calibrations || []).some((h: any) => h.diffusion_status === 'ACTIVE' || h.technical_status === 'ACTIVE');
  });
  console.log(`\n   Of last 10 reports: ${reportsWithActive.length} used at least one ACTIVE prior in the calibration block`);

  console.log(`\n=== VERDICT ===`);
  console.log(`  Cells learning:           ${moved.length}/${allPatterns.length} have observations`);
  console.log(`  Cells ACTIVE (calibrated): ${active.length}`);
  console.log(`  Reports using ACTIVE prior: ${reportsWithActive.length}/${recentReports.length} of last 10`);
  if (active.length > 0 && reportsWithActive.length > 0) {
    console.log(`  → ✅ Engine is materially affecting reports.`);
  } else if (active.length > 0) {
    console.log(`  → ⏳ Engine has learned but no recent reports have hit a calibrated cell yet.`);
  } else {
    console.log(`  → ⏳ Engine is collecting evidence but no cells have crossed the ACTIVE threshold yet.`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
