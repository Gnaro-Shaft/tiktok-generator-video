import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont as loadIMFell } from '@remotion/google-fonts/IMFellEnglish';
import { loadFont as loadSpaceMono } from '@remotion/google-fonts/SpaceMono';
import { GNARO } from './GnaroBrand';

loadIMFell();
loadSpaceMono();

// ── Cursor ──────────────────────────────────────────────────────────────────

export const Cursor: React.FC<{ frame: number }> = ({ frame }) => {
  const visible = Math.floor(frame / (GNARO.cursorBlink / 2)) % 2 === 0;
  return <span style={{ color: GNARO.colors.gold, opacity: visible ? 1 : 0 }}>_</span>;
};

// ── renderEmphasis ──────────────────────────────────────────────────────────

export const renderEmphasis = (text: string, emphasis?: string): React.ReactNode => {
  if (!emphasis) return text;
  const parts = text.split(emphasis);
  return parts.map((part, i) => (
    <React.Fragment key={i}>
      {part}
      {i < parts.length - 1 && (
        <span style={{ color: GNARO.colors.gold }}>{emphasis}</span>
      )}
    </React.Fragment>
  ));
};

// ── useFade ─────────────────────────────────────────────────────────────────

export const useFade = (durationInFrames: number): number => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 18, stiffness: 100 } });
  const fadeOut = interpolate(
    frame,
    [Math.max(0, durationInFrames - 10), durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  return Math.min(enter, fadeOut);
};

// ── GrainOverlay ─────────────────────────────────────────────────────────────

const GRAIN_URL = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='256' height='256'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.78' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E`;

export const GrainOverlay: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundImage: `url("${GRAIN_URL}")`,
      opacity: 0.055,
      pointerEvents: 'none',
      mixBlendMode: 'overlay',
    }}
  />
);
