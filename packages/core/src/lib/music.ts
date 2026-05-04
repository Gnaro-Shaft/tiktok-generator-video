import fs from 'node:fs';
import path from 'node:path';
import ffmpeg from 'fluent-ffmpeg';
import { ASSETS_DIR } from './config.js';
import type { MusicMood } from '../types/index.js';

export function pickMusic(mood: MusicMood): string | null {
  const dir = path.join(ASSETS_DIR, 'music', mood);
  if (!fs.existsSync(dir)) return null;
  const tracks = fs.readdirSync(dir).filter((f) => /\.(mp3|wav|m4a)$/i.test(f));
  if (tracks.length === 0) return null;
  return path.join(dir, tracks[Math.floor(Math.random() * tracks.length)]);
}

export async function mixVoiceWithMusic(
  voicePath: string,
  musicPath: string,
  outPath: string,
  voiceDurationSec: number,
  musicVolumeDb: number = -18
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(voicePath)
      .input(musicPath)
      .complexFilter([
        `[1:a]volume=${musicVolumeDb}dB,aloop=loop=-1:size=2e+09[bg]`,
        `[bg]atrim=duration=${voiceDurationSec}[bgcut]`,
        `[0:a][bgcut]amix=inputs=2:duration=first:dropout_transition=0[out]`,
      ])
      .outputOptions(['-map', '[out]', '-c:a', 'libmp3lame', '-b:a', '192k'])
      .save(outPath)
      .on('end', () => resolve())
      .on('error', reject);
  });
}
