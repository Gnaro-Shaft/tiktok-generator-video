import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { env } from './config.js';
import type { NicheVoice, WordTiming } from '../types/index.js';

export interface VoiceSynthesisResult {
  audioPath: string;
  durationSec: number;
  wordTimings: WordTiming[];
  /** 1-based index of the ElevenLabs key that succeeded. */
  keyIndex: number;
}

function isQuotaExceeded(err: unknown): boolean {
  if (!err) return false;
  const e = err as { statusCode?: number; status?: number; message?: string; body?: unknown };
  const code = e.statusCode ?? e.status;
  const msg = (e.message ?? '') + ' ' + JSON.stringify(e.body ?? '');
  return code === 401 && /quota_exceeded|exceeds your quota/i.test(msg);
}

export async function synthesizeVoice(
  text: string,
  voice: NicheVoice,
  outDir: string,
  basename = 'voice'
): Promise<VoiceSynthesisResult> {
  fs.mkdirSync(outDir, { recursive: true });
  const audioPath = path.join(outDir, `${basename}.mp3`);

  const keys = env().ELEVENLABS_API_KEYS;
  let lastErr: unknown;

  for (let i = 0; i < keys.length; i++) {
    const apiKey = keys[i];
    try {
      const client = new ElevenLabsClient({ apiKey });
      const result = await client.textToSpeech.convertWithTimestamps(voice.voice_id, {
        text,
        modelId: voice.model_id,
        voiceSettings: {
          stability: voice.stability,
          similarityBoost: voice.similarity_boost,
          style: voice.style,
          useSpeakerBoost: voice.use_speaker_boost,
        },
      });

      const audioB64 =
        (result as { audioBase64?: string; audio_base64?: string }).audioBase64 ??
        (result as { audio_base64?: string }).audio_base64;
      if (!audioB64) throw new Error('ElevenLabs response missing audio');
      fs.writeFileSync(audioPath, Buffer.from(audioB64, 'base64'));

      const alignment = (result as {
        alignment?: {
          characters: string[];
          characterStartTimesSeconds: number[];
          characterEndTimesSeconds: number[];
        };
      }).alignment;
      if (!alignment) throw new Error('ElevenLabs response missing alignment');

      let wordTimings = charactersToWords(
        alignment.characters,
        alignment.characterStartTimesSeconds,
        alignment.characterEndTimesSeconds
      );

      let durationSec = alignment.characterEndTimesSeconds.at(-1) ?? 0;

      // Compress silences > 0.8s to 0.35s — lisse le débit perçu comme "ralentissement".
      const compressed = await compressLongSilences(audioPath, wordTimings, 0.8, 0.35);
      if (compressed) {
        wordTimings = compressed.wordTimings;
        durationSec = compressed.durationSec;
      }

      if (i > 0) {
        console.log(`        [voice] fallback réussi sur compte #${i + 1}`);
      }
      return { audioPath, durationSec, wordTimings, keyIndex: i + 1 };
    } catch (err) {
      lastErr = err;
      if (isQuotaExceeded(err) && i + 1 < keys.length) {
        console.log(`        [voice] compte #${i + 1} quota épuisé → bascule sur compte #${i + 2}`);
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new Error('ElevenLabs synthesis failed on all keys');
}

/**
 * Compress silences longer than `thresholdSec` to `targetSec`.
 * Adjusts wordTimings accordingly. Returns null if no silence > threshold found.
 */
async function compressLongSilences(
  audioPath: string,
  wordTimings: WordTiming[],
  thresholdSec: number,
  targetSec: number
): Promise<{ wordTimings: WordTiming[]; durationSec: number } | null> {
  const silences = await detectSilences(audioPath, thresholdSec);
  if (silences.length === 0) return null;

  console.log(`        [voice] ${silences.length} silence(s) anormaux > ${thresholdSec}s → compression`);

  // Adjust each word timing: subtract removed time from silences before this word.
  const adjusted: WordTiming[] = [];
  for (const wt of wordTimings) {
    let { startMs, endMs } = wt;
    for (const s of silences) {
      const sStartMs = s.startSec * 1000;
      const sEndMs = s.endSec * 1000;
      const removedMs = (s.endSec - s.startSec - targetSec) * 1000;
      if (removedMs <= 0) continue;
      if (wt.startMs >= sEndMs) {
        startMs -= removedMs;
        endMs -= removedMs;
      } else if (wt.endMs > sStartMs) {
        endMs = Math.min(endMs, sStartMs);
      }
    }
    if (endMs > startMs) adjusted.push({ word: wt.word, startMs, endMs });
  }

  // Re-encode audio with silenceremove.
  const tmpOut = audioPath.replace(/\.mp3$/, '.compressed.mp3');
  const filter = `silenceremove=stop_periods=-1:stop_duration=${targetSec}:stop_threshold=-30dB:stop_silence=${targetSec}`;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'ffmpeg',
      ['-y', '-i', audioPath, '-af', filter, '-c:a', 'libmp3lame', '-b:a', '128k', tmpOut],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    );
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`silenceremove failed: ${stderr.slice(-300)}`))
    );
    child.on('error', reject);
  });
  fs.renameSync(tmpOut, audioPath);

  // Use the ACTUAL audio file duration (not the last word timing) so we don't
  // truncate the trailing audio when ffmpeg composes the final video.
  const actualDurationSec = await probeAudioDuration(audioPath);
  return { wordTimings: adjusted, durationSec: actualDurationSec };
}

async function probeAudioDuration(audioPath: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', audioPath],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let stdout = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.on('exit', () => {
      const dur = Number(stdout.trim());
      resolve(Number.isFinite(dur) ? dur : 0);
    });
    child.on('error', () => resolve(0));
  });
}

async function detectSilences(
  audioPath: string,
  thresholdSec: number
): Promise<{ startSec: number; endSec: number }[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'ffmpeg',
      ['-i', audioPath, '-af', `silencedetect=n=-30dB:d=${thresholdSec}`, '-f', 'null', '-'],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    );
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('exit', () => {
      const ranges: { startSec: number; endSec: number }[] = [];
      const startRe = /silence_start: ([\d.]+)/g;
      const endRe = /silence_end: ([\d.]+)/g;
      const starts: number[] = [];
      const ends: number[] = [];
      let m;
      while ((m = startRe.exec(stderr))) starts.push(Number(m[1]));
      while ((m = endRe.exec(stderr))) ends.push(Number(m[1]));
      for (let i = 0; i < Math.min(starts.length, ends.length); i++) {
        ranges.push({ startSec: starts[i], endSec: ends[i] });
      }
      resolve(ranges);
    });
    child.on('error', reject);
  });
}

function charactersToWords(chars: string[], starts: number[], ends: number[]): WordTiming[] {
  const words: WordTiming[] = [];
  let current = '';
  let wordStart = 0;

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (/\s/.test(c)) {
      if (current.length > 0) {
        words.push({
          word: current,
          startMs: Math.round(wordStart * 1000),
          endMs: Math.round(ends[i - 1] * 1000),
        });
        current = '';
      }
    } else {
      if (current.length === 0) wordStart = starts[i];
      current += c;
    }
  }
  if (current.length > 0) {
    words.push({
      word: current,
      startMs: Math.round(wordStart * 1000),
      endMs: Math.round(ends[ends.length - 1] * 1000),
    });
  }
  return words;
}

/**
 * Build subtitle segments that NEVER cross sentence boundaries.
 */
export function buildSubtitles(wordTimings: WordTiming[], fps: number, maxWords = 4) {
  if (wordTimings.length === 0) return [];

  const clauses: WordTiming[][] = [];
  let current: WordTiming[] = [];
  const isTerminal = (w: string) => /[.?!:;…]$/.test(w);
  for (const wt of wordTimings) {
    current.push(wt);
    if (isTerminal(wt.word)) {
      clauses.push(current);
      current = [];
    }
  }
  if (current.length > 0) clauses.push(current);

  const rawChunks: WordTiming[][] = [];
  for (const clause of clauses) {
    for (let i = 0; i < clause.length; i += maxWords) {
      rawChunks.push(clause.slice(i, i + maxWords));
    }
  }

  const merged: WordTiming[][] = [];
  for (const chunk of rawChunks) {
    const prev = merged[merged.length - 1];
    if (prev && chunk.length === 1 && !isTerminal(prev[prev.length - 1].word)) {
      prev.push(...chunk);
    } else {
      merged.push(chunk);
    }
  }

  return merged.map((group) => {
    const words = group.map((wt) => ({
      word: wt.word,
      startFrame: Math.round((wt.startMs / 1000) * fps),
      endFrame: Math.round((wt.endMs / 1000) * fps),
    }));
    return {
      text: group.map((wt) => wt.word).join(' '),
      startFrame: words[0].startFrame,
      endFrame: words[words.length - 1].endFrame,
      words,
    };
  });
}
