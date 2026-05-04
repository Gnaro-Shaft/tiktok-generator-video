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

/**
 * Build a TikTok-ready vertical background from stock clips.
 * Each clip is looped (stream_loop) to fill its allocated slot, scaled+cropped vertical,
 * then concatenated. This eliminates the "saccadé" feel of clips ending prematurely.
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

  const perClip = durationSec / clips.length;
  const args: string[] = ['-y'];
  for (const c of clips) {
    args.push('-stream_loop', '-1', '-i', c.local_path);
  }

  const filters: string[] = [];
  const labels: string[] = [];
  for (let i = 0; i < clips.length; i++) {
    // Force format=yuv420p + setrange limited to avoid green/blue screen glitches
    // when source clips have unknown color metadata.
    filters.push(
      `[${i}:v]trim=duration=${perClip.toFixed(3)},setpts=PTS-STARTPTS,` +
        `scale=${width}:${height}:force_original_aspect_ratio=increase,` +
        `crop=${width}:${height},setsar=1,fps=${fps},` +
        `format=yuv420p[v${i}]`
    );
    labels.push(`[v${i}]`);
  }
  filters.push(`${labels.join('')}concat=n=${clips.length}:v=1:a=0[outv]`);

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
