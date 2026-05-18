#!/usr/bin/env -S npx tsx
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {
  runPipeline,
  loadNiche,
  listNiches,
  checkVideo,
  formatCheckLine,
  getAuthorizationUrl,
  exchangeCodeForToken,
  isConnected,
  publishVideo,
  collectAnalytics,
  OUTPUT_DIR,
  type Slot,
  type CheckResult,
  type PrivacyLevel,
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
  tiktokAuth?: boolean;
  tiktokCode?: string;
  publish?: boolean;
  analytics?: boolean;
  privacy?: PrivacyLevel;
  regen?: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list') out.list = true;
    else if (a === '--batch') out.batch = true;
    else if (a === '--check') out.check = true;
    else if (a === '--regen') out.regen = true;
    else if (a === '--tiktok-auth') out.tiktokAuth = true;
    else if (a === '--publish') out.publish = true;
    else if (a === '--analytics') out.analytics = true;
    else if (a === '--niche') out.niche = argv[++i];
    else if (a.startsWith('--niche=')) out.niche = a.slice(8);
    else if (a === '--slot') out.slot = argv[++i] as Slot;
    else if (a.startsWith('--slot=')) out.slot = a.slice(7) as Slot;
    else if (a === '--topic') out.topic = argv[++i];
    else if (a.startsWith('--topic=')) out.topic = a.slice(8);
    else if (a === '--date') out.date = argv[++i];
    else if (a.startsWith('--date=')) out.date = a.slice(7);
    else if (a === '--tiktok-code') out.tiktokCode = argv[++i];
    else if (a.startsWith('--tiktok-code=')) out.tiktokCode = a.slice(14);
    else if (a === '--privacy') out.privacy = argv[++i] as PrivacyLevel;
    else if (a.startsWith('--privacy=')) out.privacy = a.slice(10) as PrivacyLevel;
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
  tt --regen --niche <id> --slot <morning|evening> [--date YYYY-MM-DD]   # régénère sans toucher au state/
  tt --tiktok-auth --niche <id>                      # étape 1 : affiche l'URL d'autorisation
  tt --tiktok-auth --niche <id> --tiktok-code <CODE> # étape 2 : enregistre le token
  tt --publish --niche <id> --slot <morning|evening> [--date ...] [--privacy SELF_ONLY]
  tt --analytics [--niche <id>]                      # récupère les stats TikTok

Examples:
  tt --niche business-ia --slot morning
  tt --batch --slot all                 # 12 vidéos = 6 niches × {morning, evening}
  tt --check                            # vérifie toutes les vidéos d'aujourd'hui
  tt --check --niche motivation         # vérifie motivation morning + evening
`);
}

async function runOne(nicheId: string, slot: Slot, topic?: string, skipRender?: boolean, date?: string) {
  const start = Date.now();
  console.log(`▶ [${nicheId}] début (slot=${slot})`);
  const niche = loadNiche(nicheId);
  const result = await runPipeline({ niche, slot, topicHint: topic, skipRender, date });
  const took = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`✅ [${nicheId}] terminé en ${took}s → ${result.videoPath}`);

  // Auto-check post-génération.
  if (!skipRender) {
    const check = await checkVideo(niche, slot, date ?? todayParis());
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
  // Retry once on transient network errors (fetch failed, timeout, etc.).
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await runOne(nicheId, slot, undefined, skipRender);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient = /fetch failed|ETIMEDOUT|ECONNRESET|ENOTFOUND|socket hang up|network/i.test(msg);
      if (attempt === 1 && isTransient) {
        console.warn(`⚠ [${nicheId}] erreur transitoire: ${msg} — retry dans 30s`);
        await new Promise((r) => setTimeout(r, 30_000));
        continue;
      }
      console.error(`❌ [${nicheId}] échec: ${msg}`);
      return { nicheId, ok: false as const, error: msg };
    }
  }
  return { nicheId, ok: false as const, error: 'unreachable' };
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

async function runTikTokAuth(args: Args): Promise<void> {
  if (!args.niche) {
    console.error('Usage: tt --tiktok-auth --niche <id> [--tiktok-code <CODE>]');
    process.exit(1);
  }
  // Étape 2 : on a le code → on échange contre un token.
  if (args.tiktokCode) {
    console.log(`▶ Échange du code pour [${args.niche}]…`);
    const tokens = await exchangeCodeForToken(args.niche, args.tiktokCode);
    console.log(`✅ [${args.niche}] connecté à TikTok (open_id: ${tokens.open_id})`);
    console.log(`   Scopes: ${tokens.scope}`);
    return;
  }
  // Étape 1 : afficher l'URL d'autorisation.
  const url = getAuthorizationUrl(args.niche);
  console.log('');
  console.log(`▶ Autorisation TikTok pour [${args.niche}]`);
  console.log('');
  console.log('1. Ouvre cette URL dans ton navigateur (connecté au BON compte TikTok) :');
  console.log('');
  console.log(`   ${url}`);
  console.log('');
  console.log('2. Autorise l\'app. Tu seras redirigé vers la page callback.');
  console.log('3. Copie le code affiché, puis lance :');
  console.log('');
  console.log(`   tt --tiktok-auth --niche ${args.niche} --tiktok-code <CODE>`);
  console.log('');
}

async function runPublish(args: Args): Promise<void> {
  if (!args.niche || !args.slot) {
    console.error('Usage: tt --publish --niche <id> --slot <morning|evening> [--date ...] [--privacy SELF_ONLY]');
    process.exit(1);
  }
  if (!isConnected(args.niche)) {
    console.error(`❌ [${args.niche}] non connectée à TikTok. Lance d'abord: tt --tiktok-auth --niche ${args.niche}`);
    process.exit(1);
  }
  const date = args.date ?? todayParis();
  const dayDir = path.join(OUTPUT_DIR, args.niche, date);
  const videoPath = path.join(dayDir, `${args.slot}.mp4`);
  const postPath = path.join(dayDir, `${args.slot}.txt`);
  if (!fs.existsSync(videoPath)) {
    console.error(`❌ Vidéo introuvable: ${videoPath}`);
    process.exit(1);
  }
  const title = fs.existsSync(postPath)
    ? fs.readFileSync(postPath, 'utf-8').trim()
    : `${args.niche} ${args.slot}`;

  console.log(`▶ Publication TikTok [${args.niche}/${args.slot}] (privacy=${args.privacy ?? 'SELF_ONLY'})…`);
  const result = await publishVideo({
    nicheId: args.niche,
    videoPath,
    title,
    privacyLevel: args.privacy ?? 'SELF_ONLY',
  });
  console.log(`✅ Publié — publish_id=${result.publishId}, statut=${result.status}`);
}

async function runAnalytics(args: Args): Promise<void> {
  const niches = args.niche ? [args.niche] : listNiches();
  console.log(`▶ Collecte analytics TikTok — ${niches.join(', ')}`);
  console.log('');
  for (const nicheId of niches) {
    if (!isConnected(nicheId)) {
      console.log(`⏭  ${nicheId.padEnd(13)} non connectée — skip`);
      continue;
    }
    try {
      const { account, videos } = await collectAnalytics(nicheId);
      console.log(
        `📊 ${nicheId.padEnd(13)} ${account.follower_count} abonnés · ${account.likes_count} likes · ${account.video_count} vidéos`
      );
      const top = [...videos].sort((a, b) => b.view_count - a.view_count)[0];
      if (top) {
        console.log(`   top vidéo: ${top.view_count} vues — "${top.title.slice(0, 50)}"`);
      }
    } catch (err) {
      console.log(`❌ ${nicheId.padEnd(13)} ${err instanceof Error ? err.message : err}`);
    }
  }
}

/**
 * Régénération chirurgicale d'une vidéo : supprime UNIQUEMENT les fichiers du
 * slot (.mp4/.txt/.meta.json + .tmp/<slot>) et NE TOUCHE JAMAIS au dossier
 * state/ (topic-history + used-clips). Garde l'anti-doublon intact.
 */
async function runRegen(args: Args): Promise<void> {
  if (!args.niche || !args.slot || (args.slot !== 'morning' && args.slot !== 'evening')) {
    console.error('Usage: tt --regen --niche <id> --slot <morning|evening> [--date YYYY-MM-DD]');
    process.exit(1);
  }
  const date = args.date ?? todayParis();
  const dayDir = path.join(OUTPUT_DIR, args.niche, date);

  // Nettoyage chirurgical — fichiers du slot uniquement, jamais state/.
  let removed = 0;
  for (const ext of ['mp4', 'txt', 'meta.json', 'caption.txt', 'hashtags.txt']) {
    const f = path.join(dayDir, `${args.slot}.${ext}`);
    if (fs.existsSync(f)) {
      fs.rmSync(f);
      removed++;
    }
  }
  const tmp = path.join(dayDir, '.tmp', args.slot);
  if (fs.existsSync(tmp)) {
    fs.rmSync(tmp, { recursive: true, force: true });
    removed++;
  }
  console.log(`▶ Régénération [${args.niche}/${args.slot}] date=${date} — ${removed} élément(s) nettoyé(s), state/ préservé`);
  await runOne(args.niche, args.slot, args.topic, args.skipRender, date);
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

  if (args.regen) {
    await runRegen(args);
    return;
  }

  if (args.tiktokAuth) {
    await runTikTokAuth(args);
    return;
  }

  if (args.publish) {
    await runPublish(args);
    return;
  }

  if (args.analytics) {
    await runAnalytics(args);
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
  console.log(`   Post:     ${r.result.postPath}`);
  console.log(`   Meta:     ${r.result.metaPath}`);
}

main().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exit(1);
});
