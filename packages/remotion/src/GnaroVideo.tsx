import React from 'react';
import { AbsoluteFill, Audio, Sequence, Series, staticFile } from 'remotion';
import { GnaroSceneRenderer } from './GnaroOverlay';

export type GnaroSceneType = 'episode_title' | 'intertitle' | 'shock' | 'clip' | 'image' | 'logo';

export interface GnaroScene {
  id: string;
  type: GnaroSceneType;
  episode?: string;
  title?: string;
  subtitle?: string;
  text?: string;
  emphasis?: string;
  clip_path?: string;
  image_path?: string;
  duration_sec: number;
}

export interface GnaroVideoProps {
  scenes: GnaroScene[];
  fps: number;
  audio_path?: string;
  audio_delay_sec?: number;
}

export const gnaroDefaultProps: GnaroVideoProps = {
  scenes: [],
  fps: 30,
};

export const GnaroVideo: React.FC<GnaroVideoProps> = ({ scenes, fps, audio_path, audio_delay_sec }) => {
  const audioDelayFrames = Math.round((audio_delay_sec ?? 0) * fps);
  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0908' }}>
      {audio_path && (
        <Sequence from={audioDelayFrames}>
          <Audio src={resolveClipSrc(audio_path)} />
        </Sequence>
      )}
      <Series>
        {scenes.map((scene) => {
          const durationInFrames = Math.round(scene.duration_sec * fps);
          return (
            <Series.Sequence key={scene.id} durationInFrames={durationInFrames}>
              <GnaroSceneRenderer scene={scene} durationInFrames={durationInFrames} />
            </Series.Sequence>
          );
        })}
      </Series>
    </AbsoluteFill>
  );
};

const resolveClipSrc = (clip_path: string): string =>
  clip_path.startsWith('http') ? clip_path : staticFile(clip_path);
