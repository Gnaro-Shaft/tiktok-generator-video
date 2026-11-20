import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { GnaroSceneV2 } from './GnaroVideoV2';
import { GNARO } from './GnaroBrand';
import { GrainOverlay } from './GnaroShared';
import { AnimatedBackground } from './GnaroSharedV2';

const D = {
  bg: '#0d0303',
  bgMid: '#1a0505',
  red: '#c0392b',
  muted: '#5a2525',
  bar: '#3d1414',
};

// ── TaskBeforeScene ──────────────────────────────────────────────────────────

export const TaskBeforeScene: React.FC<{ scene: GnaroSceneV2; durationInFrames: number }> = ({
  scene,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const labelEnter = spring({ frame, fps, config: { damping: 24, stiffness: 200 } });
  const valueEnter = spring({
    frame: frame - 6,
    fps,
    config: { damping: 10, stiffness: 500, mass: 0.8 },
  });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 55%, ${D.bgMid} 0%, ${D.bg} 72%)`,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <GrainOverlay />
      <div
        style={{
          position: 'absolute',
          top: 90,
          left: 80,
          right: 80,
          height: 1,
          background: `linear-gradient(to right, transparent, ${D.bar}, transparent)`,
          opacity: labelEnter,
        }}
      />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          opacity: labelEnter,
          transform: `translateX(${interpolate(labelEnter, [0, 1], [-60, 0])}px)`,
          fontFamily: GNARO.fonts.mono,
          fontSize: 34,
          letterSpacing: '0.3em',
          color: D.muted,
        }}
      >
        {scene.label ?? ''}
      </div>
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          opacity: valueEnter,
          transform: `scale(${interpolate(valueEnter, [0, 1], [1.5, 1])})`,
          fontFamily: GNARO.fonts.mono,
          fontSize: 240,
          color: D.red,
          letterSpacing: '-0.04em',
          lineHeight: 0.9,
        }}
      >
        {scene.display ?? ''}
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 90,
          left: 80,
          right: 80,
          height: 1,
          background: `linear-gradient(to right, transparent, ${D.bar}, transparent)`,
          opacity: labelEnter,
        }}
      />
    </AbsoluteFill>
  );
};

// ── TaskSummaryScene ─────────────────────────────────────────────────────────

export const TaskSummaryScene: React.FC<{ scene: GnaroSceneV2; durationInFrames: number }> = ({
  scene,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tasks = scene.steps ?? [];
  const framesPerTask = tasks.length > 0 ? Math.round((durationInFrames * 0.38) / tasks.length) : 10;
  const totalEnter = spring({
    frame: frame - framesPerTask * tasks.length,
    fps,
    config: { damping: 14, stiffness: 300 },
  });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 55%, ${D.bgMid} 0%, ${D.bg} 72%)`,
        justifyContent: 'center',
        alignItems: 'center',
        padding: '0 80px',
      }}
    >
      <GrainOverlay />
      <div style={{ position: 'relative', zIndex: 1, width: '100%' }}>
        {tasks.map((task, i) => {
          const [tLabel, tVal] = task.split('|');
          const enter = spring({ frame: frame - i * framesPerTask, fps, config: { damping: 20, stiffness: 200 } });
          return (
            <div
              key={i}
              style={{
                opacity: enter,
                transform: `translateX(${interpolate(enter, [0, 1], [-40, 0])}px)`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 0',
                borderBottom: `1px solid ${D.bar}`,
              }}
            >
              <span style={{ fontFamily: GNARO.fonts.mono, fontSize: 32, color: D.muted, letterSpacing: '0.15em' }}>
                {tLabel ?? task}
              </span>
              <span style={{ fontFamily: GNARO.fonts.mono, fontSize: 32, color: D.red }}>
                {tVal ?? ''}
              </span>
            </div>
          );
        })}
        <div
          style={{
            opacity: totalEnter,
            transform: `scale(${interpolate(totalEnter, [0, 1], [1.3, 1])})`,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'baseline',
            gap: 12,
            marginTop: 28,
          }}
        >
          <span style={{ fontFamily: GNARO.fonts.mono, fontSize: 160, color: D.red, letterSpacing: '-0.04em', lineHeight: 1 }}>
            {scene.display ?? ''}
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── FlashCutScene ────────────────────────────────────────────────────────────

export const FlashCutScene: React.FC = () => (
  <AbsoluteFill style={{ background: '#ffffff' }} />
);

// ── TaskAfterScene ───────────────────────────────────────────────────────────

export const TaskAfterScene: React.FC<{ scene: GnaroSceneV2; durationInFrames: number }> = ({
  scene,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const items = scene.steps ?? [];
  const framesPerItem = items.length > 0 ? Math.round((durationInFrames * 0.52) / items.length) : 15;
  const subtitleEnter = spring({
    frame: frame - framesPerItem * items.length,
    fps,
    config: { damping: 20, stiffness: 180 },
  });

  return (
    <AbsoluteFill
      style={{
        background: GNARO.colors.black,
        justifyContent: 'center',
        alignItems: 'center',
        padding: '0 80px',
      }}
    >
      <AnimatedBackground durationInFrames={durationInFrames} />
      <GrainOverlay />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 28,
        }}
      >
        {items.map((item, i) => {
          const appear = spring({ frame: frame - i * framesPerItem, fps, config: { damping: 20, stiffness: 200 } });
          const strikeDelay = i * framesPerItem + 8;
          const strikeProgress = interpolate(
            frame,
            [strikeDelay, strikeDelay + 20],
            [0, 1],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
          );
          const checkOpacity = interpolate(
            frame,
            [strikeDelay + 10, strikeDelay + 22],
            [0, 1],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
          );
          return (
            <div key={i} style={{ opacity: appear, display: 'flex', alignItems: 'center', gap: 24 }}>
              <span style={{ fontFamily: GNARO.fonts.mono, fontSize: 30, color: GNARO.colors.gold, opacity: checkOpacity, minWidth: 36 }}>
                ✓
              </span>
              <div style={{ position: 'relative', flex: 1 }}>
                <span style={{ fontFamily: GNARO.fonts.intertitle, fontSize: 80, color: GNARO.colors.cream }}>
                  {item}
                </span>
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: 0,
                    height: 3,
                    background: `linear-gradient(to right, ${GNARO.colors.gold}, ${GNARO.colors.goldHi})`,
                    width: `${strikeProgress * 100}%`,
                    transform: 'translateY(-50%)',
                    borderRadius: 2,
                  }}
                />
              </div>
            </div>
          );
        })}
        {scene.subtitle && (
          <p
            style={{
              fontFamily: GNARO.fonts.intertitle,
              fontStyle: 'italic',
              fontSize: 52,
              color: GNARO.colors.gold,
              textAlign: 'center',
              margin: '8px 0 0',
              opacity: subtitleEnter,
            }}
          >
            {scene.subtitle}
          </p>
        )}
      </div>
    </AbsoluteFill>
  );
};
