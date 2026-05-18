#!/usr/bin/env -S npx tsx
/**
 * Liste les voix du compte ElevenLabs + cherche les voix FR-natives
 * dans la Voice Library partagée.
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../..', '.env'), override: true });

function loadKeys(): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= 9; i++) {
    const v = process.env[`ELEVENLABS_API_KEY_${i}`];
    if (v?.trim()) keys.push(v.trim());
  }
  return keys;
}

interface Voice {
  voice_id: string;
  name: string;
  labels?: Record<string, string>;
  category?: string;
}

async function listAccountVoices(apiKey: string): Promise<Voice[]> {
  const resp = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': apiKey },
  });
  if (!resp.ok) return [];
  const data = (await resp.json()) as { voices: Voice[] };
  return data.voices ?? [];
}

async function searchSharedFrenchVoices(apiKey: string): Promise<Voice[]> {
  // Voice Library API — filtre par langue française.
  const url = 'https://api.elevenlabs.io/v1/shared-voices?language=fr&page_size=30';
  const resp = await fetch(url, { headers: { 'xi-api-key': apiKey } });
  if (!resp.ok) {
    console.log(`  (shared-voices HTTP ${resp.status})`);
    return [];
  }
  const data = (await resp.json()) as { voices: Voice[] };
  return data.voices ?? [];
}

async function main() {
  const keys = loadKeys();
  if (keys.length === 0) {
    console.error('Aucune clé ElevenLabs');
    process.exit(1);
  }
  const apiKey = keys[0];

  console.log('=== Voix du compte (premade + custom) ===\n');
  const account = await listAccountVoices(apiKey);
  for (const v of account) {
    const labels = v.labels
      ? Object.entries(v.labels).map(([k, val]) => `${k}=${val}`).join(', ')
      : '';
    console.log(`  ${v.name.padEnd(16)} ${v.voice_id}  [${v.category}] ${labels}`);
  }

  console.log('\n=== Voix FR natives dans la Voice Library ===\n');
  const fr = await searchSharedFrenchVoices(apiKey);
  if (fr.length === 0) {
    console.log('  (aucune retournée — endpoint peut-être indisponible sur ce plan)');
  }
  for (const v of fr.slice(0, 25)) {
    const labels = v.labels
      ? Object.entries(v.labels).map(([k, val]) => `${k}=${val}`).join(', ')
      : '';
    console.log(`  ${v.name.padEnd(20)} ${v.voice_id}  ${labels}`);
  }
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
