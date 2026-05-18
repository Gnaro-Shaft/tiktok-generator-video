/**
 * TikTok Analytics — récupération des stats de compte et de vidéos.
 *
 * Endpoints :
 *   - GET  /v2/user/info/   → followers, likes, video_count
 *   - POST /v2/video/list/  → vidéos + view/like/comment/share counts
 *
 * Stockage : niches/<niche>/state/tiktok-stats.jsonl (1 snapshot par run).
 */
import fs from 'node:fs';
import path from 'node:path';
import { NICHES_DIR } from './config.js';
import { getValidAccessToken } from './tiktok-auth.js';

const USER_INFO_URL = 'https://open.tiktokapis.com/v2/user/info/';
const VIDEO_LIST_URL = 'https://open.tiktokapis.com/v2/video/list/';

export interface AccountStats {
  niche: string;
  ts: string;
  follower_count: number;
  following_count: number;
  likes_count: number;
  video_count: number;
}

export interface VideoStats {
  id: string;
  title: string;
  create_time: number;
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
}

export async function fetchAccountStats(nicheId: string): Promise<AccountStats> {
  const accessToken = await getValidAccessToken(nicheId);
  const fields = 'follower_count,following_count,likes_count,video_count';
  const resp = await fetch(`${USER_INFO_URL}?fields=${fields}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await resp.json()) as {
    data?: { user: Omit<AccountStats, 'niche' | 'ts'> };
    error?: { code: string; message: string };
  };
  if (!resp.ok || data.error?.code !== 'ok') {
    throw new Error(`TikTok user/info échoué: ${data.error?.code} — ${data.error?.message ?? resp.status}`);
  }
  const u = data.data!.user;
  return {
    niche: nicheId,
    ts: new Date().toISOString(),
    follower_count: u.follower_count ?? 0,
    following_count: u.following_count ?? 0,
    likes_count: u.likes_count ?? 0,
    video_count: u.video_count ?? 0,
  };
}

export async function fetchVideoStats(nicheId: string, maxCount = 20): Promise<VideoStats[]> {
  const accessToken = await getValidAccessToken(nicheId);
  const fields = 'id,title,create_time,view_count,like_count,comment_count,share_count';
  const resp = await fetch(`${VIDEO_LIST_URL}?fields=${fields}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({ max_count: Math.min(maxCount, 20) }),
  });
  const data = (await resp.json()) as {
    data?: { videos: VideoStats[] };
    error?: { code: string; message: string };
  };
  if (!resp.ok || data.error?.code !== 'ok') {
    throw new Error(`TikTok video/list échoué: ${data.error?.code} — ${data.error?.message ?? resp.status}`);
  }
  return data.data?.videos ?? [];
}

/** Persist an account stats snapshot (append JSONL) for trend tracking. */
export function saveStatsSnapshot(stats: AccountStats): void {
  const file = path.join(NICHES_DIR, stats.niche, 'state', 'tiktok-stats.jsonl');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(stats) + '\n');
}

/** Collect + persist stats for a niche. Returns account stats + recent videos. */
export async function collectAnalytics(
  nicheId: string
): Promise<{ account: AccountStats; videos: VideoStats[] }> {
  const account = await fetchAccountStats(nicheId);
  saveStatsSnapshot(account);
  const videos = await fetchVideoStats(nicheId);
  return { account, videos };
}
