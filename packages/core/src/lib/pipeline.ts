import fs from 'node:fs';
import path from 'node:path';
import { OUTPUT_DIR } from './config.js';
import { generateScript, saveTopicToHistory } from './script.js';
import { synthesizeVoice, buildSubtitles } from './voice.js';
import { searchStock } from './stock.js';
import { pickMusic, mixVoiceWithMusic } from './music.js';
import { renderOverlay, renderSlidesOverlay } from './render.js';
import { composeVideo } from './compose.js';
import { appendHistory, todayParis } from './state.js';
import type { NicheConfig, Slot, GeneratedScript } from '../types/index.js';

export interface RunOptions {
  niche: NicheConfig;
  slot: Slot;
  topicHint?: string;
  date?: string;
  skipRender?: boolean;
}

export interface RunResult {
  videoPath: string;
  captionPath: string;
  hashtagsPath: string;
  metaPath: string;
}

export async function runPipeline(opts: RunOptions): Promise<RunResult> {
  const date = opts.date ?? todayParis();
  const dayDir = path.join(OUTPUT_DIR, opts.niche.id, date);
  const tempDir = path.join(dayDir, '.tmp', opts.slot);
  fs.mkdirSync(tempDir, { recursive: true });

  appendHistory({
    ts: new Date().toISOString(),
    niche: opts.niche.id,
    slot: opts.slot,
    date,
    action: 'started',
  });

  try {
    console.log(`  [1/6] Génération du script (${opts.niche.mode})…`);
    let generated = await generateScript({
      niche: opts.niche,
      topicHint: opts.topicHint,
    });
    console.log(`        Sujet: ${generated.topic}`);

    let result: RunResult;
    if (opts.niche.mode === 'slides') {
      result = await runSlidesPipeline(opts, generated, dayDir, tempDir, date);
    } else {
      // Narration: retry once if the voice is outside [min_sec, max_sec].
      let attempt = await runNarrationPipeline(opts, generated, dayDir, tempDir, date);
      const { min_sec, max_sec } = opts.niche.duration;
      if (attempt.durationSec < min_sec) {
        console.log(`  ⚠ Voix ${attempt.durationSec.toFixed(1)}s < min ${min_sec}s — retry forceLonger`);
        generated = await generateScript({
          niche: opts.niche,
          topicHint: opts.topicHint ?? generated.topic,
          forceLonger: true,
        });
        attempt = await runNarrationPipeline(opts, generated, dayDir, tempDir, date);
      } else if (attempt.durationSec > max_sec) {
        console.log(`  ⚠ Voix ${attempt.durationSec.toFixed(1)}s > max ${max_sec}s — retry forceShorter`);
        generated = await generateScript({
          niche: opts.niche,
          topicHint: opts.topicHint ?? generated.topic,
          forceShorter: true,
        });
        attempt = await runNarrationPipeline(opts, generated, dayDir, tempDir, date);
      }
      result = attempt.result;
    }
    saveTopicToHistory(opts.niche.id, generated.topic);

    appendHistory({
      ts: new Date().toISOString(),
      niche: opts.niche.id,
      slot: opts.slot,
      date,
      topic: generated.topic,
      outFile: result.videoPath,
      action: 'success',
    });

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    appendHistory({
      ts: new Date().toISOString(),
      niche: opts.niche.id,
      slot: opts.slot,
      date,
      error: msg,
      action: 'error',
    });
    throw err;
  }
}

async function runNarrationPipeline(
  opts: RunOptions,
  generated: GeneratedScript,
  dayDir: string,
  tempDir: string,
  date: string
): Promise<{ result: RunResult; durationSec: number }> {
  if (!generated.script || !generated.full_text) {
    throw new Error('Narration pipeline expects script + full_text');
  }

  console.log('  [2/6] Synthèse vocale ElevenLabs…');
  const voiceRes = await synthesizeVoice(
    generated.full_text,
    opts.niche.voice,
    tempDir,
    'voice'
  );
  console.log(`        Durée: ${voiceRes.durationSec.toFixed(1)}s — compte #${voiceRes.keyIndex}`);

  let audioForRender: string | null = voiceRes.audioPath;
  if (opts.niche.music.enabled) {
    const music = pickMusic(opts.niche.music.mood);
    if (music) {
      console.log(`  [3/6] Mix musique (${path.basename(music)})…`);
      const mixed = path.join(tempDir, 'audio-final.mp3');
      await mixVoiceWithMusic(
        voiceRes.audioPath,
        music,
        mixed,
        voiceRes.durationSec,
        opts.niche.music.volume_db
      );
      audioForRender = mixed;
    } else {
      console.log(`  [3/6] Musique activée mais aucune piste dans assets/music/${opts.niche.music.mood}/ — skip`);
    }
  } else {
    console.log('  [3/6] Musique désactivée');
  }

  console.log(`  [4/6] Téléchargement stock (${generated.keywords.length} keywords)…`);
  const clipsDir = path.join(tempDir, 'clips');
  const clips = await searchStock(generated.keywords, opts.niche.stock, clipsDir);
  console.log(`        ${clips.length} clips récupérés`);

  const fps = opts.niche.video.fps;
  // Exclude the hook words from subtitles (they're already shown by the HookOverlay).
  const hookWordCount = generated.script.hook.trim().split(/\s+/).length;
  const hookTimings = voiceRes.wordTimings.slice(0, hookWordCount);
  const restTimings = voiceRes.wordTimings.slice(hookWordCount);
  const hookEndMs = hookTimings.length > 0 ? hookTimings[hookTimings.length - 1].endMs : 0;
  // Add a small visual breathing room after the hook (200ms) before subs kick in.
  const hookEndFrame = Math.max(20, Math.round((hookEndMs / 1000) * fps) + Math.round(0.2 * fps));

  const subtitles = buildSubtitles(restTimings, fps, 4);
  const durationFrames = Math.ceil(voiceRes.durationSec * fps) + fps;
  const overlayPath = path.join(tempDir, 'overlay.mov');

  if (!opts.skipRender) {
    console.log('  [5/6] Rendu overlay Remotion (narration + sous-titres)…');
    await renderOverlay({
      props: {
        theme: opts.niche.theme,
        hook: generated.script.hook,
        cta: generated.script.cta,
        subtitles,
        hookEndFrame,
        durationFrames,
        fps,
      },
      outFile: overlayPath,
    });
  }

  const videoPath = path.join(dayDir, `${opts.slot}.mp4`);
  if (!opts.skipRender) {
    console.log('  [6/6] Composition finale ffmpeg…');
    await composeVideo({
      clips: clips.map((c) => ({ local_path: c.local_path!, duration: c.duration })),
      audioPath: audioForRender,
      overlayPath,
      outFile: videoPath,
      durationSec: voiceRes.durationSec,
      width: opts.niche.video.width,
      height: opts.niche.video.height,
      fps,
    });
  }

  const result = writeSidecars(opts, generated, dayDir, date, videoPath, voiceRes.durationSec, clips, voiceRes.keyIndex);
  return { result, durationSec: voiceRes.durationSec };
}

async function runSlidesPipeline(
  opts: RunOptions,
  generated: GeneratedScript,
  dayDir: string,
  tempDir: string,
  date: string
): Promise<RunResult> {
  if (!generated.scenes || generated.scenes.length === 0) {
    throw new Error('Slides pipeline expects scenes[]');
  }

  const fps = opts.niche.video.fps;
  let cursor = 0;
  const remotionScenes = generated.scenes.map((s, i) => {
    const dur = Math.max(1, Math.round(s.duration_sec * fps));
    const scene = {
      text: s.text,
      durationFrames: dur,
      startFrame: cursor,
      emphasis: s.emphasis,
      isHook: i === 0,
      isCta: i === generated.scenes!.length - 1,
    };
    cursor += dur;
    return scene;
  });
  const totalDurationFrames = cursor;
  const durationSec = totalDurationFrames / fps;
  console.log(`        ${remotionScenes.length} scènes — durée totale ${durationSec.toFixed(1)}s`);

  console.log('  [2/5] Pas de voix (mode slides) — skip ElevenLabs');

  let musicPath: string | null = null;
  if (opts.niche.music.enabled) {
    musicPath = pickMusic(opts.niche.music.mood);
    if (musicPath) {
      console.log(`  [3/5] Musique de fond: ${path.basename(musicPath)}`);
    } else {
      console.log(`  [3/5] Musique activée mais aucune piste dans assets/music/${opts.niche.music.mood}/ — silence`);
    }
  } else {
    console.log('  [3/5] Musique désactivée — silence');
  }

  console.log(`  [4/5] Téléchargement stock (${generated.keywords.length} keywords)…`);
  const clipsDir = path.join(tempDir, 'clips');
  const clips = await searchStock(generated.keywords, opts.niche.stock, clipsDir);
  console.log(`        ${clips.length} clips récupérés`);

  const overlayPath = path.join(tempDir, 'overlay.mov');
  if (!opts.skipRender) {
    console.log('  [5/5] Rendu overlay Remotion (slides) + composition ffmpeg…');
    await renderSlidesOverlay({
      props: {
        theme: opts.niche.theme,
        scenes: remotionScenes,
        durationFrames: totalDurationFrames,
        fps,
      },
      outFile: overlayPath,
    });
  }

  const videoPath = path.join(dayDir, `${opts.slot}.mp4`);
  if (!opts.skipRender) {
    await composeVideo({
      clips: clips.map((c) => ({ local_path: c.local_path!, duration: c.duration })),
      audioPath: null,
      musicPath,
      overlayPath,
      outFile: videoPath,
      durationSec,
      width: opts.niche.video.width,
      height: opts.niche.video.height,
      fps,
    });
  }

  return writeSidecars(opts, generated, dayDir, date, videoPath, durationSec, clips);
}

function writeSidecars(
  opts: RunOptions,
  generated: GeneratedScript,
  dayDir: string,
  date: string,
  videoPath: string,
  durationSec: number,
  clips: { source: 'pexels' | 'pixabay'; url: string }[],
  voiceKeyIndex?: number
): RunResult {
  const captionPath = path.join(dayDir, `${opts.slot}.caption.txt`);
  const hashtagsPath = path.join(dayDir, `${opts.slot}.hashtags.txt`);
  const metaPath = path.join(dayDir, `${opts.slot}.meta.json`);

  fs.writeFileSync(captionPath, generated.caption);
  fs.writeFileSync(
    hashtagsPath,
    generated.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ')
  );
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        niche: opts.niche.id,
        slot: opts.slot,
        date,
        mode: opts.niche.mode,
        topic: generated.topic,
        script: generated.script,
        full_text: generated.full_text,
        scenes: generated.scenes,
        hook: generated.hook,
        cta: generated.cta,
        caption: generated.caption,
        hashtags: generated.hashtags,
        keywords: generated.keywords,
        voice: opts.niche.mode === 'narration'
          ? { id: opts.niche.voice.voice_id, model: opts.niche.voice.model_id, key_index: voiceKeyIndex }
          : null,
        duration_sec: durationSec,
        clips: clips.map((c) => ({ source: c.source, url: c.url })),
      },
      null,
      2
    )
  );

  return { videoPath, captionPath, hashtagsPath, metaPath };
}
