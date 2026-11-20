import { Composition } from 'remotion';
import { TikTokVideo, TikTokVideoProps, defaultProps } from './TikTokVideo';
import { SlidesVideo, SlidesVideoProps, slidesDefaultProps } from './SlidesVideo';
import { GnaroVideo, GnaroVideoProps, gnaroDefaultProps } from './GnaroVideo';
import { GnaroVideoV2, GnaroVideoV2Props, gnaroV2DefaultProps } from './GnaroVideoV2';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComp = React.ComponentType<any>;

const gnaroTotalFrames = (props: GnaroVideoProps) =>
  props.scenes.reduce((acc, s) => acc + Math.round(s.duration_sec * props.fps), 0) || 1;

const gnaroV2TotalFrames = (props: GnaroVideoV2Props) =>
  props.scenes.reduce((acc, s) => acc + Math.round(s.duration_sec * props.fps), 0) || 1;

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="TikTokVideo"
        component={TikTokVideo as AnyComp}
        durationInFrames={defaultProps.durationFrames}
        fps={defaultProps.fps}
        width={1080}
        height={1920}
        defaultProps={defaultProps as unknown as Record<string, unknown>}
        calculateMetadata={({ props }) => {
          const p = props as unknown as TikTokVideoProps;
          return { durationInFrames: p.durationFrames, fps: p.fps };
        }}
      />
      <Composition
        id="OverlayMatte"
        component={TikTokVideo as AnyComp}
        durationInFrames={defaultProps.durationFrames}
        fps={defaultProps.fps}
        width={1080}
        height={1920}
        defaultProps={defaultProps as unknown as Record<string, unknown>}
        calculateMetadata={({ props }) => {
          const p = props as unknown as TikTokVideoProps;
          return { durationInFrames: p.durationFrames, fps: p.fps };
        }}
      />
      <Composition
        id="SlidesOverlay"
        component={SlidesVideo as AnyComp}
        durationInFrames={slidesDefaultProps.durationFrames}
        fps={slidesDefaultProps.fps}
        width={1080}
        height={1920}
        defaultProps={slidesDefaultProps as unknown as Record<string, unknown>}
        calculateMetadata={({ props }) => {
          const p = props as unknown as SlidesVideoProps;
          return { durationInFrames: p.durationFrames, fps: p.fps };
        }}
      />
      <Composition
        id="GnaroVideo"
        component={GnaroVideo as AnyComp}
        durationInFrames={gnaroTotalFrames(gnaroDefaultProps)}
        fps={gnaroDefaultProps.fps}
        width={1080}
        height={1920}
        defaultProps={gnaroDefaultProps as unknown as Record<string, unknown>}
        calculateMetadata={({ props }) => {
          const p = props as unknown as GnaroVideoProps;
          return { durationInFrames: gnaroTotalFrames(p), fps: p.fps };
        }}
      />
      <Composition
        id="GnaroVideoV2"
        component={GnaroVideoV2 as AnyComp}
        durationInFrames={gnaroV2TotalFrames(gnaroV2DefaultProps)}
        fps={gnaroV2DefaultProps.fps}
        width={1080}
        height={1920}
        defaultProps={gnaroV2DefaultProps as unknown as Record<string, unknown>}
        calculateMetadata={({ props }) => {
          const p = props as unknown as GnaroVideoV2Props;
          return { durationInFrames: gnaroV2TotalFrames(p), fps: p.fps };
        }}
      />
    </>
  );
};
