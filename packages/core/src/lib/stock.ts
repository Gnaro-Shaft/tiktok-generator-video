import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { env } from './config.js';
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

function isKeywordSafe(kw: string): boolean {
  const lower = kw.toLowerCase();
  return !KEYWORD_BLOCKLIST.some((b) => lower.includes(b));
}

export async function searchStock(
  keywords: string[],
  cfg: NicheStock,
  outDir: string
): Promise<StockClip[]> {
  fs.mkdirSync(outDir, { recursive: true });
  const clips: StockClip[] = [];

  const safeKeywords = keywords.filter((kw) => {
    const ok = isKeywordSafe(kw);
    if (!ok) console.log(`        [stock] keyword bloqué (safesearch) : "${kw}"`);
    return ok;
  });

  for (const kw of safeKeywords) {
    let found = await searchProvider(kw, cfg, cfg.primary);
    if (found.length === 0) {
      const fallback = cfg.primary === 'pexels' ? 'pixabay' : 'pexels';
      found = await searchProvider(kw, cfg, fallback);
    }
    let kept = 0;
    for (const clip of found) {
      if (kept >= cfg.per_keyword) break;
      const local = await downloadClip(clip, outDir);
      if (!local) continue;
      const isGreen = await isLikelyGreenScreen(local);
      if (isGreen) {
        console.log(`        [stock] clip rejeté (greenscreen détecté) : ${path.basename(local)}`);
        try { fs.unlinkSync(local); } catch { /* ignore */ }
        continue;
      }
      clips.push({ ...clip, local_path: local });
      kept++;
    }
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
    // Sample every ~30th frame (about 1 frame per second at 30fps).
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
      // Count frames matching green chroma signature.
      let greenFrames = 0;
      for (let i = 0; i < yMatches.length; i++) {
        const y = yMatches[i];
        const u = uMatches[i] ?? 128;
        const v = vMatches[i] ?? 128;
        // Pure green chromakey: Y in [120, 200], U well below 128, V below 128.
        if (y > 100 && y < 220 && u < 80 && v < 90) {
          greenFrames++;
        }
      }
      // If > 30% of sampled frames are green-dominant, reject.
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
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(
    keyword
  )}&orientation=${cfg.orientation}&per_page=${cfg.per_keyword * 2}&size=medium`;
  const resp = await fetch(url, {
    headers: { Authorization: env().PEXELS_API_KEY },
  });
  if (!resp.ok) return [];
  const data = (await resp.json()) as {
    videos: { duration: number; video_files: { link: string; quality: string; width: number }[] }[];
  };
  const clips: StockClip[] = [];
  for (const v of data.videos ?? []) {
    if (v.duration < cfg.min_clip_duration || v.duration > cfg.max_clip_duration) continue;
    const file =
      v.video_files.find((f) => f.quality === 'hd' && f.width >= 720) ??
      v.video_files[0];
    if (!file) continue;
    clips.push({ url: file.link, source: 'pexels', duration: v.duration });
  }
  return clips;
}

async function searchPixabay(keyword: string, cfg: NicheStock): Promise<StockClip[]> {
  const url = `https://pixabay.com/api/videos/?key=${env().PIXABAY_API_KEY}&q=${encodeURIComponent(
    keyword
  )}&per_page=${Math.max(3, cfg.per_keyword * 2)}&orientation=vertical&safesearch=true`;
  const resp = await fetch(url);
  if (!resp.ok) return [];
  const data = (await resp.json()) as {
    hits: { duration: number; videos: Record<string, { url: string; width: number }> }[];
  };
  const clips: StockClip[] = [];
  for (const v of data.hits ?? []) {
    if (v.duration < cfg.min_clip_duration || v.duration > cfg.max_clip_duration) continue;
    const variant = v.videos.medium ?? v.videos.small ?? v.videos.tiny;
    if (!variant) continue;
    clips.push({ url: variant.url, source: 'pixabay', duration: v.duration });
  }
  return clips;
}

async function downloadClip(clip: StockClip, outDir: string): Promise<string | null> {
  try {
    const ext = '.mp4';
    const name = `${clip.source}-${Math.abs(hash(clip.url))}${ext}`;
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

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}
