/**
 * TikTok Content Posting API — publication d'une vidéo.
 *
 * Flow (méthode FILE_UPLOAD, direct post) :
 *   1. init  → POST /v2/post/publish/video/init/ → publish_id + upload_url
 *   2. upload → PUT le fichier mp4 sur upload_url
 *   3. poll  → POST /v2/post/publish/status/fetch/ jusqu'à PUBLISH_COMPLETE
 *
 * Tant que l'app n'est pas auditée, TikTok force privacy_level=SELF_ONLY
 * (vidéo privée). Après audit, PUBLIC_TO_EVERYONE devient possible.
 */
import fs from 'node:fs';
import { getValidAccessToken } from './tiktok-auth.js';

const INIT_URL = 'https://open.tiktokapis.com/v2/post/publish/video/init/';
const STATUS_URL = 'https://open.tiktokapis.com/v2/post/publish/status/fetch/';

export type PrivacyLevel =
  | 'PUBLIC_TO_EVERYONE'
  | 'MUTUAL_FOLLOW_FRIENDS'
  | 'FOLLOWER_OF_CREATOR'
  | 'SELF_ONLY';

export interface PublishOptions {
  nicheId: string;
  videoPath: string;
  /** Titre/caption affiché sous la vidéo (peut inclure les hashtags). */
  title: string;
  /** Défaut SELF_ONLY tant que l'app n'est pas auditée. */
  privacyLevel?: PrivacyLevel;
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
}

export interface PublishResult {
  publishId: string;
  status: string;
}

const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB

export async function publishVideo(opts: PublishOptions): Promise<PublishResult> {
  if (!fs.existsSync(opts.videoPath)) {
    throw new Error(`Vidéo introuvable: ${opts.videoPath}`);
  }
  const accessToken = await getValidAccessToken(opts.nicheId);
  const videoSize = fs.statSync(opts.videoPath).size;

  // TikTok requires the whole video in one chunk if < 64MB, else chunked.
  const chunkSize = videoSize <= 64 * 1024 * 1024 ? videoSize : CHUNK_SIZE;
  const totalChunkCount = Math.ceil(videoSize / chunkSize);

  // --- 1. INIT --------------------------------------------------------------
  const initBody = {
    post_info: {
      title: opts.title.slice(0, 2200),
      privacy_level: opts.privacyLevel ?? 'SELF_ONLY',
      disable_comment: opts.disableComment ?? false,
      disable_duet: opts.disableDuet ?? false,
      disable_stitch: opts.disableStitch ?? false,
    },
    source_info: {
      source: 'FILE_UPLOAD',
      video_size: videoSize,
      chunk_size: chunkSize,
      total_chunk_count: totalChunkCount,
    },
  };

  const initResp = await fetch(INIT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(initBody),
  });
  const initData = (await initResp.json()) as {
    data?: { publish_id: string; upload_url: string };
    error?: { code: string; message: string };
  };
  if (!initResp.ok || initData.error?.code !== 'ok') {
    throw new Error(
      `TikTok init échoué: ${initData.error?.code} — ${initData.error?.message ?? initResp.status}`
    );
  }
  const { publish_id, upload_url } = initData.data!;

  // --- 2. UPLOAD ------------------------------------------------------------
  const fileBuffer = fs.readFileSync(opts.videoPath);
  for (let i = 0; i < totalChunkCount; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, videoSize) - 1;
    const chunk = fileBuffer.subarray(start, end + 1);
    const uploadResp = await fetch(upload_url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(chunk.length),
        'Content-Range': `bytes ${start}-${end}/${videoSize}`,
      },
      body: new Uint8Array(chunk),
    });
    if (!uploadResp.ok && uploadResp.status !== 201 && uploadResp.status !== 206) {
      throw new Error(`TikTok upload chunk ${i + 1}/${totalChunkCount} échoué: HTTP ${uploadResp.status}`);
    }
  }

  // --- 3. POLL STATUS -------------------------------------------------------
  const status = await pollStatus(opts.nicheId, accessToken, publish_id);
  return { publishId: publish_id, status };
}

async function pollStatus(
  nicheId: string,
  accessToken: string,
  publishId: string,
  maxAttempts = 30
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, 4000));
    const resp = await fetch(STATUS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({ publish_id: publishId }),
    });
    const data = (await resp.json()) as {
      data?: { status: string; fail_reason?: string };
      error?: { code: string; message: string };
    };
    const status = data.data?.status;
    if (status === 'PUBLISH_COMPLETE') return status;
    if (status === 'FAILED') {
      throw new Error(`TikTok publication échouée: ${data.data?.fail_reason ?? 'raison inconnue'}`);
    }
    // SEND_TO_USER_INBOX = uploadé en brouillon (mode non audité), considéré OK.
    if (status === 'SEND_TO_USER_INBOX') return status;
  }
  return 'PROCESSING_TIMEOUT';
}
