import React from 'react';
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { GNARO } from './GnaroBrand';
import type { GnaroScene } from './GnaroVideo';
import { GrainOverlay, renderEmphasis, useFade } from './GnaroShared';

type NodeStatus = 'done' | 'active' | 'pending';

interface NodeDef { id: string; glyph: string; label: string }

const NODES: NodeDef[] = [
  { id: 'notes',  glyph: 'N', label: 'Notes'     },
  { id: 'chunk',  glyph: 'C', label: 'Chunks'    },
  { id: 'embed',  glyph: 'V', label: 'Vecteurs'  },
  { id: 'search', glyph: 'R', label: 'Recherche' },
  { id: 'answer', glyph: '→', label: 'Réponse'   },
];

const STAGE_TO_IDX: Record<string, number> = {
  chunk: 1, embed: 2, search: 3, answer: 4, all: 5,
};

const nodeStatus = (nodeIdx: number, activeIdx: number): NodeStatus => {
  if (nodeIdx < activeIdx) return 'done';
  if (nodeIdx === activeIdx) return 'active';
  return 'pending';
};

interface NodeProps { def: NodeDef; s: NodeStatus; frame: number; fps: number }

const PipelineNode: React.FC<NodeProps> = ({ def, s, frame, fps }) => {
  const enter = spring({ frame, fps, config: { damping: 20, stiffness: 140 } });
  const pulse = 0.65 + 0.35 * Math.sin((frame / fps) * Math.PI * 2.2);

  const C = {
    done:    { border: GNARO.colors.paper,  text: GNARO.colors.paper,  bg: 'rgba(192,160,71,0.07)' },
    active:  { border: GNARO.colors.gold,   text: GNARO.colors.cream,  bg: 'rgba(192,160,71,0.14)' },
    pending: { border: GNARO.colors.ash,    text: GNARO.colors.ash,    bg: 'transparent'            },
  }[s];

  const scale = s === 'active' ? 0.97 + 0.03 * enter : 1;
  const glow  = s === 'active' ? `0 0 ${32 * pulse}px rgba(192,160,71,${0.45 * pulse})` : 'none';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 28,
      width: 620,
      padding: '22px 32px',
      border: `2px solid ${C.border}`,
      borderRadius: 3,
      background: C.bg,
      opacity: s === 'pending' ? 0.28 : 1,
      transform: `scale(${scale})`,
      boxShadow: glow,
    }}>
      <span style={{
        fontFamily: GNARO.fonts.mono,
        fontSize: 34,
        color: s === 'done' ? GNARO.colors.gold : s === 'active' ? GNARO.colors.goldHi : GNARO.colors.ash,
        width: 36,
        textAlign: 'center',
        lineHeight: 1,
      }}>
        {s === 'done' ? '✓' : def.glyph}
      </span>
      <span style={{
        fontFamily: GNARO.fonts.mono,
        fontSize: 46,
        color: C.text,
        letterSpacing: '0.04em',
      }}>
        {def.label}
      </span>
    </div>
  );
};

export const DiagramScene: React.FC<{ scene: GnaroScene; durationInFrames: number }> = ({
  scene,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = useFade(durationInFrames);
  const activeIdx = STAGE_TO_IDX[scene.stage ?? 'chunk'] ?? 1;
  const text = scene.text ?? '';

  return (
    <AbsoluteFill style={{ background: GNARO.colors.ink, display: 'flex', flexDirection: 'column', alignItems: 'center', opacity }}>

      <div style={{ flex: '0 0 auto', paddingTop: 100, paddingInline: 80, textAlign: 'center' }}>
        <p style={{
          fontFamily: GNARO.fonts.intertitle,
          fontStyle: 'italic',
          fontSize: 66,
          color: GNARO.colors.cream,
          lineHeight: 1.45,
          margin: 0,
        }}>
          {renderEmphasis(text, scene.emphasis)}
        </p>
      </div>

      <div style={{ width: 100, height: 1, background: GNARO.colors.gold, opacity: 0.35, margin: '48px 0 56px' }} />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {NODES.map((node, idx) => (
          <React.Fragment key={node.id}>
            <PipelineNode def={node} s={nodeStatus(idx, activeIdx)} frame={frame} fps={fps} />
            {idx < NODES.length - 1 && (
              <div style={{
                width: 2,
                height: 36,
                background: idx < activeIdx ? GNARO.colors.gold : GNARO.colors.ash,
                opacity: idx < activeIdx ? 0.55 : 0.2,
                margin: '3px 0',
              }} />
            )}
          </React.Fragment>
        ))}
      </div>

      <GrainOverlay />
    </AbsoluteFill>
  );
};
