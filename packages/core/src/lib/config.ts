import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import dotenv from 'dotenv';
import type { NicheConfig } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT = path.resolve(__dirname, '../../../..');
dotenv.config({ path: path.join(ROOT, '.env'), override: true });
export const NICHES_DIR = path.join(ROOT, 'niches');
export const ASSETS_DIR = path.join(ROOT, 'assets');
export const OUTPUT_DIR = process.env.OUTPUT_DIR
  ? (path.isAbsolute(process.env.OUTPUT_DIR)
      ? process.env.OUTPUT_DIR
      : path.resolve(ROOT, process.env.OUTPUT_DIR))
  : path.join(ROOT, 'output');

export interface Env {
  ANTHROPIC_API_KEY: string;
  ELEVENLABS_API_KEYS: string[];
  PEXELS_API_KEY: string;
  PIXABAY_API_KEY: string;
  REMOTION_CONCURRENCY: number;
  /** TikTok app credentials — optionnels tant que l'app n'est pas créée. */
  TIKTOK_CLIENT_KEY: string;
  TIKTOK_CLIENT_SECRET: string;
  TIKTOK_REDIRECT_URI: string;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function collectElevenLabsKeys(): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= 9; i++) {
    const v = process.env[`ELEVENLABS_API_KEY_${i}`];
    if (v && v.trim()) keys.push(v.trim());
  }
  // Backward compat: bare ELEVENLABS_API_KEY counts as last resort if no _N keys.
  const bare = process.env.ELEVENLABS_API_KEY;
  if (bare && bare.trim() && !keys.includes(bare.trim())) keys.push(bare.trim());
  if (keys.length === 0) {
    throw new Error('No ElevenLabs API key configured (ELEVENLABS_API_KEY_1, _2, ... or ELEVENLABS_API_KEY)');
  }
  return keys;
}

export function env(): Env {
  return {
    ANTHROPIC_API_KEY: required('ANTHROPIC_API_KEY'),
    ELEVENLABS_API_KEYS: collectElevenLabsKeys(),
    PEXELS_API_KEY: required('PEXELS_API_KEY'),
    PIXABAY_API_KEY: required('PIXABAY_API_KEY'),
    REMOTION_CONCURRENCY: Number(process.env.REMOTION_CONCURRENCY ?? 4),
    TIKTOK_CLIENT_KEY: process.env.TIKTOK_CLIENT_KEY ?? '',
    TIKTOK_CLIENT_SECRET: process.env.TIKTOK_CLIENT_SECRET ?? '',
    TIKTOK_REDIRECT_URI:
      process.env.TIKTOK_REDIRECT_URI ?? 'https://www.gcn-data.fr/tiktok-callback.html',
  };
}

/** Throws if TikTok credentials are not yet configured. */
export function requireTikTokEnv(): { clientKey: string; clientSecret: string; redirectUri: string } {
  const e = env();
  if (!e.TIKTOK_CLIENT_KEY || !e.TIKTOK_CLIENT_SECRET) {
    throw new Error(
      'TikTok non configuré — ajoute TIKTOK_CLIENT_KEY et TIKTOK_CLIENT_SECRET dans .env (depuis developers.tiktok.com)'
    );
  }
  return {
    clientKey: e.TIKTOK_CLIENT_KEY,
    clientSecret: e.TIKTOK_CLIENT_SECRET,
    redirectUri: e.TIKTOK_REDIRECT_URI,
  };
}

export function loadNiche(id: string): NicheConfig {
  const file = path.join(NICHES_DIR, id, 'niche.yaml');
  if (!fs.existsSync(file)) {
    throw new Error(`Niche config not found: ${file}`);
  }
  const raw = fs.readFileSync(file, 'utf-8');
  const parsed = YAML.parse(raw) as NicheConfig;
  parsed.id = id;
  return parsed;
}

export function loadPrompt(nicheId: string, name: string): string {
  const file = path.join(NICHES_DIR, nicheId, 'prompts', `${name}.md`);
  if (!fs.existsSync(file)) {
    throw new Error(`Prompt not found: ${file}`);
  }
  return fs.readFileSync(file, 'utf-8');
}

export function listNiches(): string[] {
  return fs
    .readdirSync(NICHES_DIR)
    .filter((d) => fs.existsSync(path.join(NICHES_DIR, d, 'niche.yaml')));
}
