import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { GnaroScene } from './GnaroVideo';
import type { GnaroSceneV2 } from './GnaroVideoV2';
import { GNARO } from './GnaroBrand';
import { GrainOverlay } from './GnaroShared';
import { GnaroSceneRenderer } from './GnaroOverlay';
import { AnimatedBackground, useDrawLine, useSceneFlash, useWordEntrance } from './GnaroSharedV2';
import { TaskBeforeScene, TaskSummaryScene, FlashCutScene, TaskAfterScene } from './GnaroScenesExt';

// ── ShockCardV2 ──────────────────────────────────────────────────────────────

const ShockCardV2: React.FC<{ scene: GnaroSceneV2; durationInFrames: number }> = ({
  scene,
  durationInFrames,
}) => {
  const wordStyles = useWordEntrance(scene.text ?? '', scene.emphasis, 3, scene.word_timestamps);
  return (
    <AbsoluteFill
      style={{
        background: GNARO.colors.black,
        justifyContent: 'center',
        alignItems: 'center',
        padding: '0 72px',
      }}
    >
      <AnimatedBackground durationInFrames={durationInFrames} />
      <GrainOverlay />
      <p
        style={{
          position: 'relative',
          zIndex: 1,
          fontFamily: GNARO.fonts.intertitle,
          fontSize: 88,
          color: GNARO.colors.cream,
          textAlign: 'center',
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        {wordStyles.map(({ word, opacity, y, isEmphasis }, i) => (
          <span
            key={i}
            style={{
              opacity,
              transform: `translateY(${y}px)`,
              display: 'inline-block',
              color: isEmphasis ? GNARO.colors.gold : GNARO.colors.cream,
              marginRight: '0.3em',
            }}
          >
            {word}
          </span>
        ))}
      </p>
    </AbsoluteFill>
  );
};

// ── IntertitleCardV2 ─────────────────────────────────────────────────────────

const IntertitleCardV2: React.FC<{ scene: GnaroSceneV2; durationInFrames: number }> = ({
  scene,
}) => {
  const wordStyles = useWordEntrance(scene.text ?? '', undefined, 4, scene.word_timestamps);
  return (
    <AbsoluteFill
      style={{
        background: GNARO.colors.ink,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 48,
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
            {wordStyles.map(({ word, opacity, y }, i) => (
              <span
                key={i}
                style={{
                  opacity,
                  transform: `translateY(${y}px)`,
                  display: 'inline-block',
                  marginRight: '0.3em',
                }}
              >
                {word}
              </span>
            ))}
          </p>
        </div>
      </div>
      <GrainOverlay />
    </AbsoluteFill>
  );
};

// ── FunnelScene ──────────────────────────────────────────────────────────────

const FunnelScene: React.FC<{ scene: GnaroSceneV2; durationInFrames: number }> = ({
  scene,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const total = scene.total ?? 200;
  const selected = scene.selected ?? 20;
  const unit = scene.unit ?? '';
  const W = 760;
  const H = 320;
  const bw = Math.round(W * Math.sqrt(selected / Math.max(total, 1)));
  const bx = Math.round((W - bw) / 2);
  const topEnter = spring({ frame, fps, config: { damping: 20, stiffness: 180 } });
  const topLineP = useDrawLine(5, 12);
  const diagP = useDrawLine(15, 22);
  const bottomLineP = useDrawLine(35, 12);
  const bottomEnter = spring({ frame: frame - 46, fps, config: { damping: 20, stiffness: 180 } });
  const G = GNARO.colors;
  return (
    <AbsoluteFill
      style={{
        background: G.black,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
      }}
    >
      <AnimatedBackground durationInFrames={durationInFrames} />
      <GrainOverlay />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {scene.text && (
          <p style={{ fontFamily: GNARO.fonts.intertitle, fontStyle: 'italic', fontSize: 50, color: G.paper, textAlign: 'center', margin: '0 0 20px', paddingInline: 80 }}>
            {scene.text}
          </p>
        )}
        <div style={{ opacity: topEnter, transform: `scale(${0.72 + 0.28 * topEnter})`, display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontFamily: GNARO.fonts.mono, fontSize: 136, color: G.cream, letterSpacing: '-0.03em', lineHeight: 1 }}>{total}</span>
          <span style={{ fontFamily: GNARO.fonts.mono, fontSize: 48, color: G.paper }}>{unit}</span>
        </div>
        <svg width={W * 0.72} height={H * 0.72} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
          <path d={`M 0,0 L ${W},0`} stroke={G.paper} strokeWidth={2.5} fill="none" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - topLineP} />
          <path d={`M 0,0 L ${bx},${H}`} stroke={G.gold} strokeWidth={2.5} fill="none" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - diagP} />
          <path d={`M ${W},0 L ${bx + bw},${H}`} stroke={G.gold} strokeWidth={2.5} fill="none" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - diagP} />
          <path d={`M ${bx},${H} L ${bx + bw},${H}`} stroke={G.goldHi} strokeWidth={3} fill="none" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - bottomLineP} />
        </svg>
        <div style={{ opacity: bottomEnter, transform: `scale(${0.72 + 0.28 * bottomEnter})`, display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontFamily: GNARO.fonts.mono, fontSize: 136, color: G.gold, letterSpacing: '-0.03em', lineHeight: 1 }}>{selected}</span>
          <span style={{ fontFamily: GNARO.fonts.mono, fontSize: 48, color: G.goldHi }}>{unit}</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── FlowScene ────────────────────────────────────────────────────────────────

const FlowScene: React.FC<{ scene: GnaroSceneV2; durationInFrames: number }> = ({
  scene,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const steps = scene.steps ?? [];
  const framesPerStep = steps.length > 0 ? Math.round((durationInFrames * 0.65) / steps.length) : 20;
  return (
    <AbsoluteFill
      style={{
        background: GNARO.colors.black,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
        padding: '0 80px',
      }}
    >
      <AnimatedBackground durationInFrames={durationInFrames} />
      <GrainOverlay />
      <div style={{ position: 'relative', zIndex: 1, width: '100%' }}>
        {scene.text && (
          <p style={{ fontFamily: GNARO.fonts.intertitle, fontStyle: 'italic', fontSize: 52, color: GNARO.colors.paper, textAlign: 'center', marginBottom: 56, marginTop: 0 }}>
            {scene.text}
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {steps.map((step, i) => {
            const enter = spring({ frame: frame - i * framesPerStep, fps, config: { damping: 20, stiffness: 200 } });
            return (
              <div key={i} style={{ opacity: enter, transform: `translateX(${interpolate(enter, [0, 1], [-48, 0])}px)`, display: 'flex', alignItems: 'center', gap: 24 }}>
                <span style={{ fontFamily: GNARO.fonts.mono, fontSize: 36, color: GNARO.colors.gold, minWidth: 60, textAlign: 'right' }}>{String(i + 1).padStart(2, '0')}</span>
                <div style={{ flex: 1, height: 1, background: GNARO.colors.ash }} />
                <span style={{ fontFamily: GNARO.fonts.intertitle, fontSize: 64, color: GNARO.colors.cream }}>{step}</span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── CompareScene ─────────────────────────────────────────────────────────────

const CompareScene: React.FC<{ scene: GnaroSceneV2; durationInFrames: number }> = ({
  scene,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const leftEnter = spring({ frame, fps, config: { damping: 20, stiffness: 160 } });
  const rightEnter = spring({ frame: frame - 15, fps, config: { damping: 20, stiffness: 160 } });
  return (
    <AbsoluteFill
      style={{
        background: GNARO.colors.black,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
        gap: 64,
      }}
    >
      <AnimatedBackground durationInFrames={durationInFrames} />
      <GrainOverlay />
      {scene.text && (
        <p style={{ position: 'relative', zIndex: 1, fontFamily: GNARO.fonts.intertitle, fontStyle: 'italic', fontSize: 50, color: GNARO.colors.paper, margin: 0, textAlign: 'center', paddingInline: 80 }}>
          {scene.text}
        </p>
      )}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 72, alignItems: 'center' }}>
        <div style={{ textAlign: 'center', opacity: leftEnter, transform: `translateX(${interpolate(leftEnter, [0, 1], [-32, 0])}px)` }}>
          <div style={{ fontFamily: GNARO.fonts.mono, fontSize: 108, color: GNARO.colors.paper, letterSpacing: '-0.03em', lineHeight: 1 }}>{scene.from}</div>
          <div style={{ fontFamily: GNARO.fonts.mono, fontSize: 32, color: GNARO.colors.paper, letterSpacing: '0.12em', marginTop: 16 }}>{scene.from_label ?? 'AVANT'}</div>
        </div>
        <div style={{ width: 2, height: 180, background: `linear-gradient(to bottom, transparent, ${GNARO.colors.gold}, transparent)`, opacity: Math.min(leftEnter, rightEnter) }} />
        <div style={{ textAlign: 'center', opacity: rightEnter, transform: `translateX(${interpolate(rightEnter, [0, 1], [32, 0])}px)` }}>
          <div style={{ fontFamily: GNARO.fonts.mono, fontSize: 108, color: GNARO.colors.goldHi, letterSpacing: '-0.03em', lineHeight: 1 }}>{scene.to}</div>
          <div style={{ fontFamily: GNARO.fonts.mono, fontSize: 32, color: GNARO.colors.gold, letterSpacing: '0.12em', marginTop: 16 }}>{scene.to_label ?? 'APRÈS'}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── CounterScene ─────────────────────────────────────────────────────────────

const CounterScene: React.FC<{ scene: GnaroSceneV2; durationInFrames: number }> = ({
  scene,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const value = scene.value ?? 0;
  const progress = spring({ frame, fps, config: { damping: 25, stiffness: 80, mass: 1 } });
  const count = Math.round(value * progress);
  const labelEnter = spring({ frame: frame - 10, fps, config: { damping: 18, stiffness: 150 } });
  const isDanger = scene.theme === 'danger';
  const isGold = scene.theme === 'gold';
  const numColor = isDanger ? '#c0392b' : isGold ? GNARO.colors.goldHi : GNARO.colors.cream;
  const unitColor = isDanger ? '#5a2525' : GNARO.colors.gold;
  const bg = isDanger ? '#0d0303' : GNARO.colors.black;
  return (
    <AbsoluteFill
      style={{
        background: bg,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
        gap: 32,
      }}
    >
      {!isDanger && <AnimatedBackground durationInFrames={durationInFrames} />}
      <GrainOverlay />
      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', paddingInline: 80 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8 }}>
          {scene.prefix && <span style={{ fontFamily: GNARO.fonts.mono, fontSize: 160, color: numColor, letterSpacing: '-0.04em', lineHeight: 1 }}>{scene.prefix}</span>}
          <span style={{ fontFamily: GNARO.fonts.mono, fontSize: 200, color: numColor, letterSpacing: '-0.04em', lineHeight: 1 }}>{count}</span>
          {scene.unit && <span style={{ fontFamily: GNARO.fonts.mono, fontSize: 72, color: unitColor }}>{scene.unit}</span>}
        </div>
        {scene.text && (
          <p style={{ fontFamily: GNARO.fonts.intertitle, fontStyle: 'italic', fontSize: 56, color: GNARO.colors.paper, margin: '28px 0 0', opacity: labelEnter }}>
            {scene.text}
          </p>
        )}
      </div>
    </AbsoluteFill>
  );
};

// ── Dispatcher ───────────────────────────────────────────────────────────────

const InnerScene: React.FC<{ scene: GnaroSceneV2; durationInFrames: number }> = ({ scene, durationInFrames }) => {
  switch (scene.type) {
    case 'shock':
      return <ShockCardV2 scene={scene} durationInFrames={durationInFrames} />;
    case 'intertitle':
      return <IntertitleCardV2 scene={scene} durationInFrames={durationInFrames} />;
    case 'funnel':
      return <FunnelScene scene={scene} durationInFrames={durationInFrames} />;
    case 'flow':
      return <FlowScene scene={scene} durationInFrames={durationInFrames} />;
    case 'compare':
      return <CompareScene scene={scene} durationInFrames={durationInFrames} />;
    case 'counter':
      return <CounterScene scene={scene} durationInFrames={durationInFrames} />;
    case 'task_before':
      return <TaskBeforeScene scene={scene} durationInFrames={durationInFrames} />;
    case 'task_summary':
      return <TaskSummaryScene scene={scene} durationInFrames={durationInFrames} />;
    case 'flash_cut':
      return <FlashCutScene />;
    case 'task_after':
      return <TaskAfterScene scene={scene} durationInFrames={durationInFrames} />;
    default:
      return <GnaroSceneRenderer scene={scene as unknown as GnaroScene} durationInFrames={durationInFrames} />;
  }
};

export const GnaroSceneRendererV2: React.FC<{
  scene: GnaroSceneV2;
  durationInFrames: number;
}> = ({ scene, durationInFrames }) => {
  const flash = useSceneFlash();
  return (
    <>
      <InnerScene scene={scene} durationInFrames={durationInFrames} />
      <AbsoluteFill style={{ background: '#c8a840', opacity: flash * 0.55, zIndex: 20, pointerEvents: 'none' }} />
    </>
  );
};
