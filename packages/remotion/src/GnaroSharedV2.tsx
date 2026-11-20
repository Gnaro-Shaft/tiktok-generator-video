import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { GNARO } from './GnaroBrand';

// ── WordTimestamp ────────────────────────────────────────────────────────────

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

// ── useWordEntrance ──────────────────────────────────────────────────────────

export interface WordStyle {
  word: string;
  opacity: number;
  y: number;
  isEmphasis: boolean;
}

function normalizeToken(w: string): string {
  return w.toLowerCase().replace(/[',.\-!?«»—–]/g, '').trim();
}

function alignTimestamps(
  displayWords: string[],
  timestamps: WordTimestamp[],
): Array<WordTimestamp | undefined> {
  const result = new Array<WordTimestamp | undefined>(displayWords.length).fill(undefined);
  const LOOKAHEAD = 8;
  let tsHead = 0;
  for (let wi = 0; wi < displayWords.length; wi++) {
    const needle = normalizeToken(displayWords[wi]);
    if (!needle || tsHead >= timestamps.length) continue;
    for (let ti = tsHead; ti < Math.min(timestamps.length, tsHead + LOOKAHEAD); ti++) {
      const hay = normalizeToken(timestamps[ti].word);
      if (!hay) { tsHead = ti + 1; continue; }
      if (hay === needle || needle.startsWith(hay) || hay.startsWith(needle)) {
        result[wi] = timestamps[ti];
        tsHead = ti + 1;
        break;
      }
    }
  }
  return result;
}

export function useWordEntrance(
  text: string,
  emphasis?: string,
  staggerFrames = 3,
  timestamps?: WordTimestamp[],
): WordStyle[] {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(' ');
  const alignedTs = timestamps ? alignTimestamps(words, timestamps) : [];
  const emphSet = new Set(
    (emphasis ?? '').toLowerCase().split(' ').map(w => w.replace(/[.,!?«»]/g, ''))
  );
  return words.map((word, i) => {
    const ts = alignedTs[i];
    const startFrame = ts != null ? Math.round(ts.start * fps) : i * staggerFrames;
    const p = spring({
      frame: frame - startFrame,
      fps,
      config: { damping: 18, stiffness: 220, mass: 0.4 },
    });
    return {
      word,
      opacity: interpolate(p, [0, 1], [0, 1]),
      y: interpolate(p, [0, 1], [14, 0]),
      isEmphasis: emphSet.has(word.toLowerCase().replace(/[.,!?«»]/g, '')),
    };
  });
}

// ── useDrawLine ──────────────────────────────────────────────────────────────

export function useDrawLine(startFrame: number, durationFrames: number): number {
  const frame = useCurrentFrame();
  return interpolate(frame, [startFrame, startFrame + durationFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

// ── useSceneFlash ────────────────────────────────────────────────────────────

export function useSceneFlash(durationFrames = 4): number {
  const frame = useCurrentFrame();
  return interpolate(frame, [0, durationFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

// ── AnimatedBackground ───────────────────────────────────────────────────────

export const AnimatedBackground: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const t = durationInFrames > 0 ? frame / durationInFrames : 0;
  const x = 50 + 12 * Math.sin(t * Math.PI * 2);
  const y = 50 + 8 * Math.cos(t * Math.PI * 1.7);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(ellipse at ${x}% ${y}%, ${GNARO.colors.ash} 0%, ${GNARO.colors.black} 68%)`,
      }}
    />
  );
};
