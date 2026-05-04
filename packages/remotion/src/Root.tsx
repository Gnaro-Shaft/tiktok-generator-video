import { Composition } from 'remotion';
import { TikTokVideo, defaultProps } from './TikTokVideo';
import { SlidesVideo, slidesDefaultProps } from './SlidesVideo';

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="TikTokVideo"
        component={TikTokVideo}
        durationInFrames={defaultProps.durationFrames}
        fps={defaultProps.fps}
        width={1080}
        height={1920}
        defaultProps={defaultProps}
        calculateMetadata={({ props }) => ({
          durationInFrames: props.durationFrames,
          fps: props.fps,
        })}
      />
      <Composition
        id="OverlayMatte"
        component={TikTokVideo}
        durationInFrames={defaultProps.durationFrames}
        fps={defaultProps.fps}
        width={1080}
        height={1920}
        defaultProps={defaultProps}
        calculateMetadata={({ props }) => ({
          durationInFrames: props.durationFrames,
          fps: props.fps,
        })}
      />
      <Composition
        id="SlidesOverlay"
        component={SlidesVideo}
        durationInFrames={slidesDefaultProps.durationFrames}
        fps={slidesDefaultProps.fps}
        width={1080}
        height={1920}
        defaultProps={slidesDefaultProps}
        calculateMetadata={({ props }) => ({
          durationInFrames: props.durationFrames,
          fps: props.fps,
        })}
      />
    </>
  );
};
