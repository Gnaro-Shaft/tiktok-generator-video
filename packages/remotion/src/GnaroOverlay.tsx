import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { GNARO } from './GnaroBrand';
import type { GnaroScene } from './GnaroVideo';
import { Cursor, GrainOverlay, renderEmphasis, useFade } from './GnaroShared';
import { FilmClipScene, FilmImageScene } from './GnaroFilmScenes';

// ── Episode title card ──────────────────────────────────────────────────────

const EpisodeTitleCard: React.FC<{ scene: GnaroScene; durationInFrames: number }> = ({
  scene,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const opacity = useFade(durationInFrames);

  return (
    <AbsoluteFill
      style={{
        background: GNARO.colors.black,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        opacity,
      }}
    >
      <span
        style={{
          fontFamily: GNARO.fonts.mono,
          fontSize: 32,
          letterSpacing: '0.3em',
          color: GNARO.colors.gold,
          marginBottom: 24,
        }}
      >
        {scene.episode}
      </span>
      <div style={{ width: 120, height: 1, background: GNARO.colors.gold, opacity: 0.6, marginBottom: 28 }} />
      <p
        style={{
          fontFamily: GNARO.fonts.intertitle,
          fontStyle: 'italic',
          fontSize: 110,
          color: GNARO.colors.cream,
          textAlign: 'center',
          lineHeight: 1.15,
          margin: 0,
          paddingInline: 80,
        }}
      >
        {scene.title}
      </p>
      <div style={{ width: 120, height: 1, background: GNARO.colors.gold, opacity: 0.6, marginTop: 28 }} />
      {scene.subtitle && (
        <p
          style={{
            fontFamily: GNARO.fonts.intertitle,
            fontStyle: 'italic',
            fontSize: 44,
            color: GNARO.colors.paper,
            textAlign: 'center',
            margin: 0,
            marginTop: 20,
            paddingInline: 100,
            lineHeight: 1.4,
          }}
        >
          {scene.subtitle}
        </p>
      )}
      <div
        style={{
          position: 'absolute',
          bottom: 60,
          left: 60,
          fontFamily: GNARO.fonts.mono,
          fontSize: 32,
          color: GNARO.colors.paper,
          display: 'flex',
          alignItems: 'baseline',
        }}
      >
        {GNARO.logo}<Cursor frame={frame} />
      </div>
      <GrainOverlay />
    </AbsoluteFill>
  );
};

// ── Intertitle card ─────────────────────────────────────────────────────────

const IntertitleCard: React.FC<{ scene: GnaroScene; durationInFrames: number }> = ({
  scene,
  durationInFrames,
}) => {
  const opacity = useFade(durationInFrames);
  const text = scene.text ?? '';

  return (
    <AbsoluteFill
      style={{
        background: GNARO.colors.ink,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 48,
        opacity,
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '2px solid rgba(226,216,194,0.5)',
          padding: '80px 60px',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(226,216,194,0.25)',
            padding: '60px 48px',
          }}
        >
          <p
            style={{
              fontFamily: GNARO.fonts.intertitle,
              fontStyle: 'italic',
              fontSize: 80,
              color: GNARO.colors.cream,
              textAlign: 'center',
              lineHeight: 1.4,
              margin: 0,
            }}
          >
            {renderEmphasis(text, scene.emphasis)}
          </p>
        </div>
      </div>
      <GrainOverlay />
    </AbsoluteFill>
  );
};

// ── Shock card ──────────────────────────────────────────────────────────────

const ShockCard: React.FC<{ scene: GnaroScene; durationInFrames: number }> = ({
  scene,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 22, stiffness: 180 } });
  const text = scene.text ?? '';

  return (
    <AbsoluteFill
      style={{
        background: GNARO.colors.black,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 80px',
        opacity: enter,
        transform: `scale(${0.96 + 0.04 * enter})`,
      }}
    >
      <p
        style={{
          fontFamily: GNARO.fonts.intertitle,
          fontSize: 88,
          color: GNARO.colors.cream,
          textAlign: 'center',
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        {renderEmphasis(text, scene.emphasis)}
      </p>
      <GrainOverlay />
    </AbsoluteFill>
  );
};

// ── Logo card ───────────────────────────────────────────────────────────────

const LogoCard: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 14, stiffness: 80 } });
  const fadeOut = interpolate(
    frame,
    [Math.max(0, durationInFrames - 8), durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const opacity = Math.min(enter, fadeOut);

  return (
    <AbsoluteFill
      style={{
        background: GNARO.colors.black,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        opacity,
        transform: `scale(${0.9 + 0.1 * enter})`,
      }}
    >
      <div
        style={{
          fontFamily: GNARO.fonts.intertitle,
          fontSize: 160,
          color: GNARO.colors.cream,
          letterSpacing: '-0.02em',
          lineHeight: 1,
          display: 'flex',
          alignItems: 'baseline',
        }}
      >
        {GNARO.logo}<Cursor frame={frame} />
      </div>
      <div style={{ width: 120, height: 1, background: GNARO.colors.gold, opacity: 0.5 }} />
      <span
        style={{
          fontFamily: GNARO.fonts.mono,
          fontSize: 36,
          color: GNARO.colors.paper,
          letterSpacing: '0.14em',
          borderBottom: `1px solid ${GNARO.colors.goldHi}`,
          paddingBottom: 6,
        }}
      >
        {GNARO.site}
      </span>
      <GrainOverlay />
    </AbsoluteFill>
  );
};

// ── Scene dispatcher ────────────────────────────────────────────────────────

export const GnaroSceneRenderer: React.FC<{
  scene: GnaroScene;
  durationInFrames: number;
}> = ({ scene, durationInFrames }) => {
  switch (scene.type) {
    case 'episode_title':
      return <EpisodeTitleCard scene={scene} durationInFrames={durationInFrames} />;
    case 'intertitle':
      return <IntertitleCard scene={scene} durationInFrames={durationInFrames} />;
    case 'shock':
      return <ShockCard scene={scene} durationInFrames={durationInFrames} />;
    case 'clip':
      return <FilmClipScene scene={scene} durationInFrames={durationInFrames} />;
    case 'image':
      return <FilmImageScene scene={scene} durationInFrames={durationInFrames} />;
    case 'logo':
      return <LogoCard durationInFrames={durationInFrames} />;
  }
};
