import React from 'react';
import { AbsoluteFill, Img, interpolate, OffthreadVideo, staticFile, useCurrentFrame } from 'remotion';
import { GNARO } from './GnaroBrand';
import type { GnaroScene } from './GnaroVideo';
import { Cursor, GrainOverlay, renderEmphasis, useFade } from './GnaroShared';

// ── Film clip scene (B&W video) ─────────────────────────────────────────────

export const FilmClipScene: React.FC<{ scene: GnaroScene; durationInFrames: number }> = ({
  scene,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const opacity = useFade(durationInFrames);
  const text = scene.text ?? '';

  return (
    <AbsoluteFill style={{ background: GNARO.colors.black }}>
      {scene.clip_path && (
        <div style={{ position: 'absolute', inset: 0, filter: 'grayscale(1) contrast(1.05)' }}>
          <OffthreadVideo
            src={staticFile(scene.clip_path)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,0.55) 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 48,
          left: 52,
          fontFamily: GNARO.fonts.mono,
          fontSize: 28,
          color: 'rgba(226,216,194,0.55)',
          display: 'flex',
          alignItems: 'baseline',
        }}
      >
        {GNARO.logo}<Cursor frame={frame} />
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 200,
          left: 0,
          right: 0,
          paddingInline: 64,
          opacity,
        }}
      >
        <p
          style={{
            fontFamily: GNARO.fonts.intertitle,
            fontStyle: 'italic',
            fontSize: 68,
            color: GNARO.colors.cream,
            textAlign: 'center',
            lineHeight: 1.35,
            margin: 0,
            textShadow: `0 4px 20px ${GNARO.colors.shadow}`,
          }}
        >
          {renderEmphasis(text, scene.emphasis)}
        </p>
      </div>
      <GrainOverlay />
    </AbsoluteFill>
  );
};

// ── Film image scene (B&W photo + Ken Burns) ────────────────────────────────

export const FilmImageScene: React.FC<{ scene: GnaroScene; durationInFrames: number }> = ({
  scene,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const opacity = useFade(durationInFrames);
  const scale = interpolate(frame, [0, durationInFrames], [1.0, 1.08], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const text = scene.text ?? '';

  return (
    <AbsoluteFill style={{ background: GNARO.colors.black }}>
      {scene.image_path && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            filter: 'grayscale(1) contrast(1.05)',
          }}
        >
          <Img
            src={staticFile(scene.image_path)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: `scale(${scale})`,
              transformOrigin: 'center center',
            }}
          />
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,0.6) 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 48,
          left: 52,
          fontFamily: GNARO.fonts.mono,
          fontSize: 28,
          color: 'rgba(226,216,194,0.55)',
          display: 'flex',
          alignItems: 'baseline',
        }}
      >
        {GNARO.logo}<Cursor frame={frame} />
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 200,
          left: 0,
          right: 0,
          paddingInline: 64,
          opacity,
        }}
      >
        <p
          style={{
            fontFamily: GNARO.fonts.intertitle,
            fontStyle: 'italic',
            fontSize: 68,
            color: GNARO.colors.cream,
            textAlign: 'center',
            lineHeight: 1.35,
            margin: 0,
            textShadow: `0 4px 20px ${GNARO.colors.shadow}`,
          }}
        >
          {renderEmphasis(text, scene.emphasis)}
        </p>
      </div>
      <GrainOverlay />
    </AbsoluteFill>
  );
};
