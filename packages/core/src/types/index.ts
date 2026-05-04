export type Slot = 'morning' | 'evening';

export type Mode = 'narration' | 'slides';

export type MusicMood =
  | 'energetic'
  | 'calm'
  | 'corporate'
  | 'cinematic'
  | 'reflective'
  | 'serious';

export interface NicheTheme {
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

export interface NicheVoice {
  voice_id: string;
  model_id: string;
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
}

export interface NicheDuration {
  min_sec: number;
  target_sec: number;
  max_sec: number;
}

export interface NicheStock {
  primary: 'pexels' | 'pixabay';
  per_keyword: number;
  min_clip_duration: number;
  max_clip_duration: number;
  orientation: 'portrait' | 'landscape' | 'square';
}

export interface NicheMusic {
  enabled: boolean;
  mood: MusicMood;
  volume_db: number;
}

export interface NicheVideo {
  width: number;
  height: number;
  fps: number;
  codec: string;
}

export interface NicheConfig {
  id: string;
  language: string;
  topic: string;
  description: string;
  mode: Mode;
  duration: NicheDuration;
  voice: NicheVoice;
  theme: NicheTheme;
  stock: NicheStock;
  music: NicheMusic;
  video: NicheVideo;
}

export interface ScriptSection {
  hook: string;
  body: string;
  cta: string;
}

export interface SlideScene {
  text: string;
  duration_sec: number;
  emphasis?: string;   // optional word/short phrase to highlight
}

export interface GeneratedScript {
  mode: Mode;
  topic: string;
  /** Narration mode: full hook+body+cta as continuous text */
  script?: ScriptSection;
  full_text?: string;
  /** Slides mode: ordered scenes that play sequentially */
  hook?: string;
  scenes?: SlideScene[];
  cta?: string;
  caption: string;
  hashtags: string[];
  keywords: string[];
}

export interface WordTiming {
  word: string;
  startMs: number;
  endMs: number;
}

export interface SubtitleSegment {
  text: string;
  startFrame: number;
  endFrame: number;
  words: { word: string; startFrame: number; endFrame: number }[];
}

export interface StockClip {
  url: string;
  source: 'pexels' | 'pixabay';
  duration: number;
  local_path?: string;
}

export interface RenderProps {
  theme: NicheTheme;
  hook: string;
  cta: string;
  subtitles: SubtitleSegment[];
  /** Frame where the hook overlay disappears (= end of audio for the hook). */
  hookEndFrame: number;
  durationFrames: number;
  fps: number;
}
