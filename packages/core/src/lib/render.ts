import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { ROOT, env } from './config.js';
import type { RenderProps } from '../types/index.js';

export interface OverlayProps {
  theme: RenderProps['theme'];
  hook: string;
  cta: string;
  subtitles: RenderProps['subtitles'];
  hookEndFrame: number;
  durationFrames: number;
  fps: number;
}

export interface SlidesOverlayProps {
  theme: RenderProps['theme'];
  scenes: {
    text: string;
    durationFrames: number;
    startFrame: number;
    emphasis?: string;
    isHook: boolean;
    isCta: boolean;
  }[];
  durationFrames: number;
  fps: number;
}

export interface RenderOverlayOptions {
  props: OverlayProps;
  outFile: string;
}

export interface RenderSlidesOverlayOptions {
  props: SlidesOverlayProps;
  outFile: string;
}

async function renderComposition(
  composition: string,
  outFile: string,
  props: unknown,
  propsFilename: string
): Promise<void> {
  const remotionRoot = path.join(ROOT, 'packages', 'remotion');
  const propsFile = path.join(path.dirname(outFile), propsFilename);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(propsFile, JSON.stringify(props));

  const args = [
    'remotion',
    'render',
    'src/index.ts',
    composition,
    outFile,
    '--props',
    propsFile,
    '--codec',
    'prores',
    '--prores-profile',
    '4444',
    '--pixel-format',
    'yuva444p10le',
    '--image-format',
    'png',
    '--concurrency',
    String(env().REMOTION_CONCURRENCY),
    '--log',
    'warn',
  ];

  await runCmd('npx', args, remotionRoot);
}

export async function renderOverlay(opts: RenderOverlayOptions): Promise<string> {
  await renderComposition('OverlayMatte', opts.outFile, opts.props, '_overlay-props.json');
  return opts.outFile;
}

export async function renderSlidesOverlay(
  opts: RenderSlidesOverlayOptions
): Promise<string> {
  await renderComposition('SlidesOverlay', opts.outFile, opts.props, '_slides-props.json');
  return opts.outFile;
}

function runCmd(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}
