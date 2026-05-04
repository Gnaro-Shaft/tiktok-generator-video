import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
} from 'remotion';
import React from 'react';

interface SubtitleWord {
  word: string;
  startFrame: number;
  endFrame: number;
}

interface SubtitleSegment {
  text: string;
  startFrame: number;
  endFrame: number;
  words: SubtitleWord[];
}

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

export interface TikTokVideoProps {
  theme: Theme;
  hook: string;
  cta: string;
  subtitles: SubtitleSegment[];
  hookEndFrame: number;
  durationFrames: number;
  fps: number;
}

export const defaultProps: TikTokVideoProps = {
  theme: {
    primary_color: '#FF0050',
    secondary_color: '#00F2EA',
    background_color: '#000000',
    text_color: '#FFFFFF',
    subtitle_highlight: '#FFD600',
    font_family: 'Inter, system-ui, sans-serif',
    hook_font_size: 130,
    subtitle_font_size: 90,
    cta_font_size: 70,
  },
  hook: 'Demo Hook',
  cta: "Suis-moi pour plus d'astuces",
  subtitles: [],
  hookEndFrame: 75,
  durationFrames: 1800,
  fps: 30,
};

export const TikTokVideo: React.FC<TikTokVideoProps> = ({
  theme,
  hook,
  cta,
  subtitles,
  hookEndFrame,
  durationFrames,
}) => {
  const ctaStart = Math.max(0, durationFrames - 90);
  const hookFrames = Math.max(20, hookEndFrame);

  return (
    <AbsoluteFill style={{ backgroundColor: 'transparent' }}>
      <Sequence from={0} durationInFrames={hookFrames}>
        <HookOverlay text={hook} theme={theme} totalFrames={hookFrames} />
      </Sequence>

      <Sequence from={hookFrames} durationInFrames={durationFrames - hookFrames}>
        <Subtitles segments={subtitles} theme={theme} offset={hookFrames} />
      </Sequence>

      <Sequence from={ctaStart} durationInFrames={durationFrames - ctaStart}>
        <CtaOverlay text={cta} theme={theme} />
      </Sequence>
    </AbsoluteFill>
  );
};

const HookOverlay: React.FC<{ text: string; theme: Theme; totalFrames: number }> = ({
  text,
  theme,
  totalFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ fps, frame, config: { damping: 12, stiffness: 180 } });
  const opacity = interpolate(
    frame,
    [0, 8, Math.max(8, totalFrames - 10), totalFrames],
    [0, 1, 1, 0],
    { extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        padding: 80,
      }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          opacity,
          color: theme.text_color,
          fontFamily: theme.font_family,
          fontSize: theme.hook_font_size,
          fontWeight: 900,
          textAlign: 'center',
          lineHeight: 1.1,
          textShadow: '0 4px 24px rgba(0,0,0,0.8)',
          background: `linear-gradient(180deg, ${theme.primary_color}cc 0%, ${theme.secondary_color}cc 100%)`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          padding: 30,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

const Subtitles: React.FC<{
  segments: SubtitleSegment[];
  theme: Theme;
  offset: number;
}> = ({ segments, theme, offset }) => {
  const frame = useCurrentFrame() + offset;
  const active = segments.find((s) => frame >= s.startFrame && frame <= s.endFrame);
  if (!active) return null;

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        paddingBottom: 280,
      }}
    >
      <div
        style={{
          color: theme.text_color,
          fontFamily: theme.font_family,
          fontSize: theme.subtitle_font_size,
          fontWeight: 800,
          textAlign: 'center',
          textShadow: '0 4px 16px rgba(0,0,0,0.95), 0 0 12px rgba(0,0,0,0.7)',
          maxWidth: '90%',
          lineHeight: 1.2,
          padding: '20px 40px',
        }}
      >
        {active.words.map((w, i) => {
          const isCurrent = frame >= w.startFrame && frame <= w.endFrame;
          return (
            <span
              key={i}
              style={{
                color: isCurrent ? theme.subtitle_highlight : theme.text_color,
                marginRight: 16,
                display: 'inline-block',
              }}
            >
              {w.word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const CtaOverlay: React.FC<{ text: string; theme: Theme }> = ({ text, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = spring({ fps, frame, config: { damping: 14 } });

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 120,
      }}
    >
      <div
        style={{
          opacity,
          color: theme.text_color,
          fontFamily: theme.font_family,
          fontSize: theme.cta_font_size,
          fontWeight: 800,
          textAlign: 'center',
          padding: '24px 48px',
          backgroundColor: theme.primary_color,
          borderRadius: 24,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};
