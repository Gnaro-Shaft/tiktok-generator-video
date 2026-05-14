import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { env, NICHES_DIR } from './config.js';
import type { NicheStock, StockClip } from '../types/index.js';

/**
 * Mots-clés bloqués au niveau requête : peut récupérer du contenu suggestif/sexualisé,
 * inapproprié pour TikTok automation. La liste est volontairement large par précaution.
 */
const KEYWORD_BLOCKLIST = [
  // Suggestif / sexualisé
  'lingerie', 'underwear', 'bra', 'bikini', 'swimsuit', 'nude', 'naked', 'topless',
  'undress', 'undressing', 'stripping', 'sexy', 'seductive', 'erotic', 'sensual',
  'bedroom', 'bed sheets', 'shower', 'bath', 'bathing', 'spa massage', 'massage',
  'pole dance', 'twerk', 'dance club', 'nightclub', 'cleavage', 'thigh',
  'kissing', 'romance couple bed', 'intimate',
  // Greenscreen / chroma key — produit des écrans verts ou bleus dans la vidéo finale
  'green screen', 'greenscreen', 'chroma key', 'chromakey', 'blue screen', 'bluescreen',
];

/** Days of history during which a clip is considered "recently used" and avoided. */
const USED_CLIPS_RECENT_DAYS = 30;
/** How many candidates we ask each provider to maximize variety. */
const PROVIDER_PER_PAGE = 30;
/** Random page (1..MAX_PAGE) selected for each query — extends discovery beyond top 30. */
const MAX_RANDOM_PAGE = 3;

function isKeywordSafe(kw: string): boolean {
  const lower = kw.toLowerCase();
  return !KEYWORD_BLOCKLIST.some((b) => lower.includes(b));
}

function clipKey(clip: StockClip): string {
  return `${clip.source}:${clip.id}`;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomPage(): number {
  return Math.floor(Math.random() * MAX_RANDOM_PAGE) + 1;
}

function usedClipsFile(nicheId: string): string {
  return path.join(NICHES_DIR, nicheId, 'state', 'used-clips.jsonl');
}

function loadRecentlyUsedClips(nicheId: string): Set<string> {
  const file = usedClipsFile(nicheId);
  if (!fs.existsSync(file)) return new Set();
  const cutoff = Date.now() - USED_CLIPS_RECENT_DAYS * 24 * 60 * 60 * 1000;
  const ids = new Set<string>();
  for (const line of fs.readFileSync(file, 'utf-8').trim().split('\n')) {
    if (!line) continue;
    try {
      const entry = JSON.parse(line) as { ts: string; key: string };
      if (new Date(entry.ts).getTime() > cutoff) {
        ids.add(entry.key);
      }
    } catch {
      /* ignore */
    }
  }
  return ids;
}

function saveUsedClips(nicheId: string, keys: string[]): void {
  if (keys.length === 0) return;
  const file = usedClipsFile(nicheId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const ts = new Date().toISOString();
  const lines = keys.map((key) => JSON.stringify({ ts, key }));
  fs.appendFileSync(file, lines.join('\n') + '\n');
}

export async function searchStock(
  keywords: string[],
  cfg: NicheStock,
  outDir: string,
  nicheId?: string
): Promise<StockClip[]> {
  fs.mkdirSync(outDir, { recursive: true });
  const clips: StockClip[] = [];
  const sessionUsed = new Set<string>(); // clips already picked in this run (avoid duplicates within the same video)
  const recentlyUsed = nicheId ? loadRecentlyUsedClips(nicheId) : new Set<string>();
  if (recentlyUsed.size > 0) {
    console.log(`        [stock] ${recentlyUsed.size} clip(s) déjà utilisé(s) < ${USED_CLIPS_RECENT_DAYS}j → exclusion`);
  }

  const safeKeywords = keywords.filter((kw) => {
    const ok = isKeywordSafe(kw);
    if (!ok) console.log(`        [stock] keyword bloqué (safesearch) : "${kw}"`);
    return ok;
  });

  for (const kw of safeKeywords) {
    // Randomly alternate primary provider for additional diversity.
    const primary = Math.random() < 0.5 ? cfg.primary : (cfg.primary === 'pexels' ? 'pixabay' : 'pexels');
    let found = await searchProvider(kw, cfg, primary);
    if (found.length === 0) {
      const fallback = primary === 'pexels' ? 'pixabay' : 'pexels';
      found = await searchProvider(kw, cfg, fallback);
    }

    // Filter out recently-used + same-session-used clips, then shuffle.
    const fresh = found.filter((c) => {
      const k = clipKey(c);
      return !recentlyUsed.has(k) && !sessionUsed.has(k);
    });
    // If filtering left less than we want, fall back to including session-used (still excluding recently-used).
    const pool = fresh.length >= cfg.per_keyword ? fresh : found.filter((c) => !recentlyUsed.has(clipKey(c)));
    const shuffled = shuffle(pool);

    let kept = 0;
    for (const clip of shuffled) {
      if (kept >= cfg.per_keyword) break;
      const local = await downloadClip(clip, outDir);
      if (!local) continue;
      const isGreen = await isLikelyGreenScreen(local);
      if (isGreen) {
        console.log(`        [stock] clip rejeté (greenscreen détecté) : ${path.basename(local)}`);
        try { fs.unlinkSync(local); } catch { /* ignore */ }
        continue;
      }
      const finalClip = { ...clip, local_path: local };
      clips.push(finalClip);
      sessionUsed.add(clipKey(clip));
      kept++;
    }
  }

  // Persist the clips we used so subsequent runs of this niche avoid them for 30 days.
  if (nicheId && clips.length > 0) {
    saveUsedClips(nicheId, clips.map((c) => clipKey(c)));
  }

  return clips;
}

/**
 * Detect if a clip is dominantly a chroma-key green screen by analyzing YUV stats.
 * Pure green ≈ Y:150, U:43, V:21. Sample multiple frames to avoid false negatives
 * on clips that briefly contain green before transitioning.
 */
async function isLikelyGreenScreen(clipPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(
      'ffmpeg',
      [
        '-i',
        clipPath,
        '-vf',
        "select='not(mod(n\\,30))',signalstats,metadata=print",
        '-an',
        '-f',
        'null',
        '-',
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    );
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('exit', () => {
      const yMatches = [...stderr.matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
      const uMatches = [...stderr.matchAll(/UAVG=([\d.]+)/g)].map((m) => Number(m[1]));
      const vMatches = [...stderr.matchAll(/VAVG=([\d.]+)/g)].map((m) => Number(m[1]));
      if (yMatches.length === 0 || uMatches.length === 0 || vMatches.length === 0) {
        resolve(false);
        return;
      }
      let greenFrames = 0;
      for (let i = 0; i < yMatches.length; i++) {
        const y = yMatches[i];
        const u = uMatches[i] ?? 128;
        const v = vMatches[i] ?? 128;
        if (y > 100 && y < 220 && u < 80 && v < 90) {
          greenFrames++;
        }
      }
      const ratio = greenFrames / yMatches.length;
      resolve(ratio > 0.3);
    });
    child.on('error', () => resolve(false));
  });
}

async function searchProvider(
  keyword: string,
  cfg: NicheStock,
  provider: 'pexels' | 'pixabay'
): Promise<StockClip[]> {
  if (provider === 'pexels') return searchPexels(keyword, cfg);
  return searchPixabay(keyword, cfg);
}

async function searchPexels(keyword: string, cfg: NicheStock): Promise<StockClip[]> {
  const page = randomPage();
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(
    keyword
  )}&orientation=${cfg.orientation}&per_page=${PROVIDER_PER_PAGE}&size=medium&page=${page}`;
  const resp = await fetch(url, {
    headers: { Authorization: env().PEXELS_API_KEY },
  });
  if (!resp.ok) return [];
  const data = (await resp.json()) as {
    videos: { id: number; duration: number; video_files: { link: string; quality: string; width: number }[] }[];
  };
  const clips: StockClip[] = [];
  for (const v of data.videos ?? []) {
    if (v.duration < cfg.min_clip_duration || v.duration > cfg.max_clip_duration) continue;
    const file =
      v.video_files.find((f) => f.quality === 'hd' && f.width >= 720) ??
      v.video_files[0];
    if (!file) continue;
    clips.push({ id: v.id, url: file.link, source: 'pexels', duration: v.duration });
  }
  return clips;
}

async function searchPixabay(keyword: string, cfg: NicheStock): Promise<StockClip[]> {
  const page = randomPage();
  const url = `https://pixabay.com/api/videos/?key=${env().PIXABAY_API_KEY}&q=${encodeURIComponent(
    keyword
  )}&per_page=${PROVIDER_PER_PAGE}&orientation=vertical&safesearch=true&page=${page}`;
  const resp = await fetch(url);
  if (!resp.ok) return [];
  const data = (await resp.json()) as {
    hits: { id: number; duration: number; videos: Record<string, { url: string; width: number }> }[];
  };
  const clips: StockClip[] = [];
  for (const v of data.hits ?? []) {
    if (v.duration < cfg.min_clip_duration || v.duration > cfg.max_clip_duration) continue;
    const variant = v.videos.medium ?? v.videos.small ?? v.videos.tiny;
    if (!variant) continue;
    clips.push({ id: v.id, url: variant.url, source: 'pixabay', duration: v.duration });
  }
  return clips;
}

async function downloadClip(clip: StockClip, outDir: string): Promise<string | null> {
  try {
    const ext = '.mp4';
    const name = `${clip.source}-${clip.id}${ext}`;
    const dest = path.join(outDir, name);
    if (fs.existsSync(dest)) return dest;
    const resp = await fetch(clip.url);
    if (!resp.ok) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    fs.writeFileSync(dest, buf);
    return dest;
  } catch {
    return null;
  }
}
