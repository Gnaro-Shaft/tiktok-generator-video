import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

interface ClipInput {
  local_path: string;
  duration: number;
}

export interface ComposeOptions {
  clips: ClipInput[];
  /** Voice or mixed (voice+music) audio. If null, silence track is generated. */
  audioPath: string | null;
  /** Background music for slides mode (used if audioPath is null). */
  musicPath?: string | null;
  overlayPath: string;
  outFile: string;
  durationSec: number;
  width: number;
  height: number;
  fps: number;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed (${code}): ${stderr.slice(-500)}`));
    });
    child.on('error', reject);
  });
}

/** Cross-fade duration between consecutive clips (seconds). */
const TRANSITION_DUR = 0.5;
/** Overscan multiplier for Ken Burns pan margin (15% extra around each clip). */
const KEN_BURNS_OVERSCAN = 1.15;

/**
 * Build a TikTok-ready vertical background from stock clips.
 *
 * Features:
 *  - Each clip is looped (stream_loop) to fill its allocated slot — fluidity ++
 *  - Ken Burns pan: subtle slow pan on each clip (direction alternated) — adds motion
 *  - Cross-fade transitions between consecutive clips (0.5s) — smooth, pro feel
 *  - format=yuv420p forced to prevent green/blue screen glitches
 */
async function buildBackground(
  clips: ClipInput[],
  width: number,
  height: number,
  fps: number,
  durationSec: number,
  outFile: string
): Promise<void> {
  if (clips.length === 0) {
    await runFfmpeg([
      '-y',
      '-f',
      'lavfi',
      '-i',
      `color=c=#0a0a2e:s=${width}x${height}:r=${fps}:d=${durationSec}`,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-t',
      String(durationSec),
      outFile,
    ]);
    return;
  }

  const N = clips.length;
  // With xfade, two consecutive clips overlap by TRANSITION_DUR. So total visible
  // duration = N * perClip - (N - 1) * TRANSITION_DUR. We want this to equal durationSec,
  // so adjust perClip upward to compensate.
  const useXfade = N > 1;
  const perClip = useXfade
    ? (durationSec + (N - 1) * TRANSITION_DUR) / N
    : durationSec;

  const args: string[] = ['-y'];
  for (const c of clips) {
    args.push('-stream_loop', '-1', '-i', c.local_path);
  }

  const scaleW = Math.ceil(width * KEN_BURNS_OVERSCAN);
  const scaleH = Math.ceil(height * KEN_BURNS_OVERSCAN);
  const xMargin = scaleW - width; // pan range horizontal
  const yMargin = scaleH - height; // pan range vertical
  const D = perClip.toFixed(3);

  const filters: string[] = [];
  for (let i = 0; i < N; i++) {
    // Alternate pan direction every clip for visual diversity.
    // 4 directions: left→right, right→left, top→bottom, bottom→top.
    const direction = ['lr', 'rl', 'tb', 'bt'][i % 4];
    let xExpr: string;
    let yExpr: string;
    switch (direction) {
      case 'lr':
        xExpr = `${xMargin}*t/${D}`;
        yExpr = `${yMargin}/2`;
        break;
      case 'rl':
        xExpr = `${xMargin}*(1-t/${D})`;
        yExpr = `${yMargin}/2`;
        break;
      case 'tb':
        xExpr = `${xMargin}/2`;
        yExpr = `${yMargin}*t/${D}`;
        break;
      default: // bt
        xExpr = `${xMargin}/2`;
        yExpr = `${yMargin}*(1-t/${D})`;
        break;
    }

    // Pipeline per clip:
    //  trim → reset PTS → scale exact to overscan W:H → pan-crop W:H → format
    // Two-step scale keeps the canvas size deterministic regardless of source aspect.
    filters.push(
      `[${i}:v]trim=duration=${D},setpts=PTS-STARTPTS,` +
        `scale=${width}:${height}:force_original_aspect_ratio=increase,` +
        `crop=${width}:${height},` +
        `scale=${scaleW}:${scaleH},` +
        `crop=${width}:${height}:x='${xExpr}':y='${yExpr}',` +
        `setsar=1,fps=${fps},format=yuv420p[v${i}]`
    );
  }

  // Chain xfade transitions between consecutive clips, or single passthrough.
  if (!useXfade) {
    filters.push(`[v0]null[outv]`);
  } else {
    let prev = '[v0]';
    for (let i = 1; i < N; i++) {
      // Output of i-th xfade starts at (i+1)*perClip - i*TRANSITION_DUR seconds total,
      // and the xfade itself begins at i*perClip - i*TRANSITION_DUR + (perClip - TRANSITION_DUR)
      // = (i+1)*perClip - (i+1)*TRANSITION_DUR. But offset is measured from input start of
      // the first input ([prev]), so it's (cumulated duration of prev) - TRANSITION_DUR.
      // Cumulated duration of prev after i-1 xfades = i*perClip - (i-1)*TRANSITION_DUR.
      // xfade starts at that minus TRANSITION_DUR = i*perClip - i*TRANSITION_DUR.
      const offset = i * perClip - i * TRANSITION_DUR;
      const isLast = i === N - 1;
      const out = isLast ? '[outv]' : `[x${i}]`;
      filters.push(
        `${prev}[v${i}]xfade=transition=fade:duration=${TRANSITION_DUR}:offset=${offset.toFixed(3)}${out}`
      );
      prev = out;
    }
  }

  args.push(
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[outv]',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(fps),
    '-t',
    String(durationSec),
    outFile
  );

  await runFfmpeg(args);
}

async function generateSilence(outFile: string, durationSec: number): Promise<void> {
  await runFfmpeg([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-t',
    String(durationSec),
    '-c:a',
    'libmp3lame',
    '-b:a',
    '128k',
    outFile,
  ]);
}

async function loopMusicToDuration(
  musicPath: string,
  outFile: string,
  durationSec: number
): Promise<void> {
  const fadeStart = Math.max(0, durationSec - 1.5);
  await runFfmpeg([
    '-y',
    '-stream_loop',
    '-1',
    '-i',
    musicPath,
    '-t',
    String(durationSec),
    '-af',
    `volume=0.85,afade=t=out:st=${fadeStart}:d=1.5`,
    '-c:a',
    'libmp3lame',
    '-b:a',
    '192k',
    outFile,
  ]);
}

export async function composeVideo(opts: ComposeOptions): Promise<string> {
  const tmpDir = path.join(path.dirname(opts.outFile), '.compose');
  fs.mkdirSync(tmpDir, { recursive: true });
  const bgFile = path.join(tmpDir, 'background.mp4');

  await buildBackground(
    opts.clips,
    opts.width,
    opts.height,
    opts.fps,
    opts.durationSec,
    bgFile
  );

  let finalAudio: string;
  if (opts.audioPath) {
    finalAudio = opts.audioPath;
  } else if (opts.musicPath) {
    finalAudio = path.join(tmpDir, 'music-only.mp3');
    await loopMusicToDuration(opts.musicPath, finalAudio, opts.durationSec);
  } else {
    finalAudio = path.join(tmpDir, 'silence.mp3');
    await generateSilence(finalAudio, opts.durationSec);
  }

  await runFfmpeg([
    '-y',
    '-i',
    bgFile,
    '-i',
    opts.overlayPath,
    '-i',
    finalAudio,
    '-filter_complex',
    '[0:v]format=yuv420p[bg];[bg][1:v]overlay=0:0:format=auto,format=yuv420p[v]',
    '-map',
    '[v]',
    '-map',
    '2:a',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-shortest',
    '-movflags',
    '+faststart',
    opts.outFile,
  ]);

  fs.rmSync(tmpDir, { recursive: true, force: true });
  return opts.outFile;
}
