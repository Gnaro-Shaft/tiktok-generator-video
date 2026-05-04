import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
} from 'remotion';
import React from 'react';

interface Theme {
  primary_color: string;
  secondary_color: string;
  background_color: string;
  text_color: string;
  subtitle_highlight: string;
  font_family: string;
  hook_font_size: number;
  subtitle_font_size: number;
  cta_font_size: number;
}

export interface SlidesScene {
  text: string;
  durationFrames: number;
  startFrame: number;
  emphasis?: string;
  isHook: boolean;
  isCta: boolean;
}

export interface SlidesVideoProps {
  theme: Theme;
  scenes: SlidesScene[];
  durationFrames: number;
  fps: number;
}

export const slidesDefaultProps: SlidesVideoProps = {
  theme: {
    primary_color: '#FF6B35',
    secondary_color: '#F7C59F',
    background_color: '#0A0A0A',
    text_color: '#FFFFFF',
    subtitle_highlight: '#FFD60A',
    font_family: 'Inter, system-ui, sans-serif',
    hook_font_size: 130,
    subtitle_font_size: 90,
    cta_font_size: 70,
  },
  scenes: [],
  durationFrames: 1800,
  fps: 30,
};

export const SlidesVideo: React.FC<SlidesVideoProps> = ({ theme, scenes }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: 'transparent' }}>
      {scenes.map((scene, i) => (
        <Sequence
          key={i}
          from={scene.startFrame}
          durationInFrames={scene.durationFrames}
        >
          <Slide scene={scene} theme={theme} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

const Slide: React.FC<{ scene: SlidesScene; theme: Theme }> = ({ scene, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({ fps, frame, config: { damping: 14, stiffness: 160 } });
  const fadeOut = interpolate(
    frame,
    [scene.durationFrames - 8, scene.durationFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const opacity = Math.min(enter, fadeOut);

  const fontSize = scene.isHook
    ? theme.hook_font_size
    : scene.isCta
      ? theme.cta_font_size
      : theme.subtitle_font_size;

  const verticalAlign = scene.isCta ? 'flex-end' : scene.isHook ? 'center' : 'center';
  const paddingBottom = scene.isCta ? 200 : 0;

  return (
    <AbsoluteFill
      style={{
        justifyContent: verticalAlign,
        alignItems: 'center',
        padding: 80,
        paddingBottom,
      }}
    >
      <div
        style={{
          opacity,
          transform: `scale(${0.92 + 0.08 * enter})`,
          color: theme.text_color,
          fontFamily: theme.font_family,
          fontSize,
          fontWeight: 900,
          textAlign: 'center',
          lineHeight: 1.15,
          textShadow: '0 6px 28px rgba(0,0,0,0.85), 0 0 18px rgba(0,0,0,0.6)',
          maxWidth: '90%',
        }}
      >
        {renderTextWithEmphasis(scene.text, scene.emphasis, theme)}
      </div>
      {scene.isCta && (
        <div
          style={{
            opacity,
            marginTop: 40,
            padding: '20px 48px',
            backgroundColor: theme.primary_color,
            color: '#FFFFFF',
            fontFamily: theme.font_family,
            fontSize: 56,
            fontWeight: 800,
            borderRadius: 20,
            boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
          }}
        >
          ↓ Suis le compte
        </div>
      )}
    </AbsoluteFill>
  );
};

function renderTextWithEmphasis(text: string, emphasis: string | undefined, theme: Theme) {
  if (!emphasis || !text.includes(emphasis)) {
    return text;
  }
  const parts = text.split(emphasis);
  const out: React.ReactNode[] = [];
  for (let i = 0; i < parts.length; i++) {
    out.push(<React.Fragment key={`p${i}`}>{parts[i]}</React.Fragment>);
    if (i < parts.length - 1) {
      out.push(
        <span
          key={`e${i}`}
          style={{
            color: theme.subtitle_highlight,
            display: 'inline-block',
            transform: 'scale(1.08)',
          }}
        >
          {emphasis}
        </span>
      );
    }
  }
  return <>{out}</>;
}
