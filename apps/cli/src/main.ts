#!/usr/bin/env -S npx tsx
import 'dotenv/config';
import {
  runPipeline,
  loadNiche,
  listNiches,
  checkVideo,
  formatCheckLine,
  type Slot,
  type CheckResult,
} from '@tt/core';

interface Args {
  niche?: string;
  slot?: Slot;
  topic?: string;
  skipRender?: boolean;
  list?: boolean;
  batch?: boolean;
  concurrency?: number;
  check?: boolean;
  date?: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list') out.list = true;
    else if (a === '--batch') out.batch = true;
    else if (a === '--check') out.check = true;
    else if (a === '--niche') out.niche = argv[++i];
    else if (a.startsWith('--niche=')) out.niche = a.slice(8);
    else if (a === '--slot') out.slot = argv[++i] as Slot;
    else if (a.startsWith('--slot=')) out.slot = a.slice(7) as Slot;
    else if (a === '--topic') out.topic = argv[++i];
    else if (a.startsWith('--topic=')) out.topic = a.slice(8);
    else if (a === '--date') out.date = argv[++i];
    else if (a.startsWith('--date=')) out.date = a.slice(7);
    else if (a === '--concurrency') out.concurrency = Number(argv[++i]);
    else if (a.startsWith('--concurrency=')) out.concurrency = Number(a.slice(14));
    else if (a === '--skip-render') out.skipRender = true;
  }
  return out;
}

function usage(): void {
  console.log(`
Usage:
  tt --list
  tt --niche <id> --slot <morning|evening> [--topic "sujet"] [--skip-render]
  tt --batch --slot <morning|evening|all> [--concurrency 3]
  tt --check [--niche <id>] [--slot <morning|evening|all>] [--date YYYY-MM-DD]

Examples:
  tt --niche business-ia --slot morning
  tt --batch --slot all                 # 12 vidéos = 6 niches × {morning, evening}
  tt --check                            # vérifie toutes les vidéos d'aujourd'hui
  tt --check --niche motivation         # vérifie motivation morning + evening
`);
}

async function runOne(nicheId: string, slot: Slot, topic?: string, skipRender?: boolean) {
  const start = Date.now();
  console.log(`▶ [${nicheId}] début (slot=${slot})`);
  const niche = loadNiche(nicheId);
  const result = await runPipeline({ niche, slot, topicHint: topic, skipRender });
  const took = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`✅ [${nicheId}] terminé en ${took}s → ${result.videoPath}`);

  // Auto-check post-génération.
  if (!skipRender) {
    const check = await checkVideo(niche, slot, todayParis());
    console.log('   ' + formatCheckLine(check));
    for (const issue of check.issues) {
      const icon = issue.severity === 'error' ? '   ❌' : '   ⚠️';
      console.log(`${icon} ${issue.code}: ${issue.message}`);
    }
  }
  return { nicheId, ok: true as const, result };
}

function todayParis(): string {
  const fmt = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

async function runCheck(args: Args): Promise<void> {
  const date = args.date ?? todayParis();
  const allNiches = listNiches();
  const niches = args.niche ? [args.niche] : allNiches;
  const slots: Slot[] =
    args.slot === 'morning'
      ? ['morning']
      : args.slot === 'evening'
        ? ['evening']
        : ['morning', 'evening'];

  console.log(`▶ Check qualité — date=${date}, niches=${niches.join(',')}, slots=${slots.join(',')}`);
  console.log('');

  const results: CheckResult[] = [];
  for (const nicheId of niches) {
    let niche;
    try {
      niche = loadNiche(nicheId);
    } catch (err) {
      console.log(`❌ ${nicheId}: ${err instanceof Error ? err.message : err}`);
      continue;
    }
    for (const slot of slots) {
      const r = await checkVideo(niche, slot, date);
      results.push(r);
      console.log(formatCheckLine(r));
      for (const issue of r.issues) {
        const icon = issue.severity === 'error' ? '   ❌' : '   ⚠️';
        console.log(`${icon} ${issue.code}: ${issue.message}`);
      }
    }
  }

  const errors = results.filter((r) => !r.ok);
  console.log('');
  console.log(`═══ ${results.length - errors.length}/${results.length} vidéos OK ═══`);
  if (errors.length > 0) {
    console.log(`❌ Vidéos avec erreurs : ${errors.map((r) => `${r.niche}/${r.slot}`).join(', ')}`);
    process.exitCode = 1;
  }
}

async function runOneSafe(nicheId: string, slot: Slot, skipRender?: boolean) {
  try {
    return await runOne(nicheId, slot, undefined, skipRender);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ [${nicheId}] échec: ${msg}`);
    return { nicheId, ok: false as const, error: msg };
  }
}

/** Limit concurrency: process queue with N workers in parallel. */
async function runBatch(slot: Slot, concurrency: number, skipRender?: boolean) {
  const niches = listNiches();
  console.log(`▶ Batch ${niches.length} niches, slot=${slot}, concurrency=${concurrency}`);
  console.log('');

  const queue = [...niches];
  const results: { nicheId: string; ok: boolean; error?: string }[] = [];

  async function worker() {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) return;
      const r = await runOneSafe(next, slot, skipRender);
      results.push(r);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, niches.length) }, () => worker());
  await Promise.all(workers);

  console.log('');
  console.log('═══ RÉSUMÉ BATCH ═══');
  const ok = results.filter((r) => r.ok);
  const ko = results.filter((r) => !r.ok);
  console.log(`✅ Réussies: ${ok.length}/${results.length}`);
  for (const r of ok) console.log(`   • ${r.nicheId}`);
  if (ko.length > 0) {
    console.log(`❌ Échouées: ${ko.length}/${results.length}`);
    for (const r of ko) console.log(`   • ${r.nicheId}: ${r.error}`);
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.list) {
    const niches = listNiches();
    console.log('Niches disponibles:');
    for (const n of niches) console.log(`  - ${n}`);
    return;
  }

  if (args.check) {
    await runCheck(args);
    return;
  }

  if (args.batch) {
    if (!args.slot) {
      usage();
      process.exit(1);
    }
    const slotArg = args.slot as string;
    if (slotArg !== 'morning' && slotArg !== 'evening' && slotArg !== 'all') {
      console.error(`Slot invalide: ${slotArg}`);
      process.exit(1);
    }
    if (slotArg === 'all') {
      console.log('▶ Batch ALL — morning puis evening');
      await runBatch('morning', args.concurrency ?? 3, args.skipRender);
      console.log('');
      console.log('───────────────────────────');
      console.log('');
      await runBatch('evening', args.concurrency ?? 3, args.skipRender);
    } else {
      await runBatch(slotArg as Slot, args.concurrency ?? 3, args.skipRender);
    }
    return;
  }

  if (!args.niche || !args.slot) {
    usage();
    process.exit(1);
  }
  if (args.slot !== 'morning' && args.slot !== 'evening') {
    console.error(`Slot invalide: ${args.slot} (attendu: morning ou evening)`);
    process.exit(1);
  }

  const r = await runOne(args.niche, args.slot, args.topic, args.skipRender);
  console.log('');
  console.log(`   Caption:  ${r.result.captionPath}`);
  console.log(`   Hashtags: ${r.result.hashtagsPath}`);
  console.log(`   Meta:     ${r.result.metaPath}`);
}

main().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exit(1);
});
