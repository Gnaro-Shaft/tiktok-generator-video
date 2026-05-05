import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { OUTPUT_DIR } from './config.js';
import type { NicheConfig, Slot } from '../types/index.js';

export interface CheckIssue {
  severity: 'error' | 'warn';
  code: string;
  message: string;
}

export interface CheckResult {
  niche: string;
  slot: Slot;
  date: string;
  ok: boolean;
  issues: CheckIssue[];
  metrics: {
    mp4_duration_sec: number;
    voice_duration_sec: number;
    last_subtitle_sec: number;
    silences_long_count: number;
  };
}

async function probeDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath],
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

async function detectSilencesAtThreshold(
  audioPath: string,
  thresholdSec: number
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(
      'ffmpeg',
      ['-i', audioPath, '-af', `silencedetect=n=-30dB:d=${thresholdSec}`, '-f', 'null', '-'],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    );
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('exit', () => {
      const matches = stderr.match(/silence_duration:/g);
      resolve(matches?.length ?? 0);
    });
    child.on('error', () => resolve(0));
  });
}

/**
 * Run quality checks on a generated video. Returns issues found.
 *
 * Heuristics:
 *  - mp4 duration ≈ voice duration (else: voice was truncated)
 *  - duration in [min_sec, max_sec] (else: monetization issue)
 *  - last subtitle endFrame ≈ voice duration (else: subtitle drift)
 *  - silences ≥ 1.5s in voice (perceived "ralentissement")
 *  - silences ≥ 2.5s = abnormal hiccup (would warrant manual rerun)
 */
export async function checkVideo(
  niche: NicheConfig,
  slot: Slot,
  date: string
): Promise<CheckResult> {
  const dayDir = path.join(OUTPUT_DIR, niche.id, date);
  const mp4 = path.join(dayDir, `${slot}.mp4`);
  const voice = path.join(dayDir, '.tmp', slot, 'voice.mp3');
  const propsFile = path.join(dayDir, '.tmp', slot, '_overlay-props.json');

  const issues: CheckIssue[] = [];
  const result: CheckResult = {
    niche: niche.id,
    slot,
    date,
    ok: false,
    issues,
    metrics: {
      mp4_duration_sec: 0,
      voice_duration_sec: 0,
      last_subtitle_sec: 0,
      silences_long_count: 0,
    },
  };

  if (!fs.existsSync(mp4)) {
    issues.push({ severity: 'error', code: 'MP4_MISSING', message: `Vidéo introuvable: ${mp4}` });
    return result;
  }

  const mp4Dur = await probeDuration(mp4);
  result.metrics.mp4_duration_sec = mp4Dur;

  const { min_sec, max_sec } = niche.duration;
  if (mp4Dur < min_sec) {
    issues.push({
      severity: 'error',
      code: 'TOO_SHORT',
      message: `Vidéo ${mp4Dur.toFixed(1)}s < min ${min_sec}s (perd la monétisation TikTok)`,
    });
  } else if (mp4Dur > max_sec + 5) {
    issues.push({
      severity: 'warn',
      code: 'TOO_LONG',
      message: `Vidéo ${mp4Dur.toFixed(1)}s > max ${max_sec}s + 5s tolérance`,
    });
  }

  if (fs.existsSync(voice)) {
    const voiceDur = await probeDuration(voice);
    result.metrics.voice_duration_sec = voiceDur;

    if (Math.abs(voiceDur - mp4Dur) > 0.6) {
      issues.push({
        severity: 'error',
        code: 'VOICE_TRUNCATED',
        message: `MP4 ${mp4Dur.toFixed(1)}s vs voice ${voiceDur.toFixed(1)}s (écart ${Math.abs(voiceDur - mp4Dur).toFixed(1)}s) — la voix est tronquée`,
      });
    }

    const silences15 = await detectSilencesAtThreshold(voice, 1.5);
    const silences25 = await detectSilencesAtThreshold(voice, 2.5);
    result.metrics.silences_long_count = silences15;

    if (silences25 > 0) {
      issues.push({
        severity: 'error',
        code: 'ABNORMAL_SILENCE',
        message: `${silences25} silence(s) > 2.5s détecté(s) dans la voix — hiccup ElevenLabs, regénérer la niche`,
      });
    } else if (silences15 > 0) {
      issues.push({
        severity: 'warn',
        code: 'LONG_SILENCES',
        message: `${silences15} silence(s) > 1.5s détecté(s) — ralentissement perceptible`,
      });
    }
  }

  if (fs.existsSync(propsFile)) {
    try {
      const props = JSON.parse(fs.readFileSync(propsFile, 'utf-8'));
      const subs = props.subtitles ?? [];
      const fps = props.fps ?? 30;
      if (subs.length > 0) {
        const lastEndFrame = subs[subs.length - 1].endFrame ?? 0;
        const lastSec = lastEndFrame / fps;
        result.metrics.last_subtitle_sec = lastSec;
        const drift = lastSec - result.metrics.voice_duration_sec;
        if (Math.abs(drift) > 1.5) {
          issues.push({
            severity: 'error',
            code: 'SUBTITLE_DRIFT',
            message: `Dernier sous-titre à ${lastSec.toFixed(1)}s vs voix ${result.metrics.voice_duration_sec.toFixed(1)}s (drift ${drift.toFixed(1)}s) — sous-titres désynchronisés`,
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  result.ok = !issues.some((i) => i.severity === 'error');
  return result;
}

export function formatCheckLine(r: CheckResult): string {
  const m = r.metrics;
  const tag = r.ok ? (r.issues.length === 0 ? '✅' : '⚠ ') : '❌';
  const flags = r.issues
    .map((i) => `[${i.code}]`)
    .join(' ');
  return `${tag} ${r.niche.padEnd(13)} ${r.slot.padEnd(7)} mp4=${m.mp4_duration_sec.toFixed(1)}s voice=${m.voice_duration_sec.toFixed(1)}s lastSub=${m.last_subtitle_sec.toFixed(1)}s ${flags}`.trim();
}
