#!/usr/bin/env -S npx tsx
/**
 * Test si chaque modèle ElevenLabs supporte l'endpoint with-timestamps.
 * Critique pour les sous-titres karaoké.
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../..', '.env'), override: true });

const VOICE_ID = 'ErXwobaYiN019PkySvjV'; // Antoni
const TEXT = 'Test de timestamps. Trois mots clés.';
const MODELS = [
  'eleven_multilingual_v2',
  'eleven_turbo_v2_5',
  'eleven_flash_v2_5',
  'eleven_v3',
];

function loadKeys(): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= 9; i++) {
    const v = process.env[`ELEVENLABS_API_KEY_${i}`];
    if (v?.trim()) keys.push(v.trim());
  }
  return keys;
}

async function testWithTimestamps(apiKey: string, model: string) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      text: TEXT,
      model_id: model,
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.78,
        style: 0.5,
        use_speaker_boost: true,
      },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    return { ok: false, msg: `HTTP ${resp.status} : ${body.slice(0, 150)}` };
  }

  const data = (await resp.json()) as {
    audio_base64?: string;
    alignment?: { characters?: string[]; character_start_times_seconds?: number[] };
    normalized_alignment?: unknown;
  };

  const hasAudio = !!data.audio_base64;
  const hasAlignment = !!data.alignment?.characters && data.alignment.characters.length > 0;
  return {
    ok: hasAudio && hasAlignment,
    msg: `audio=${hasAudio} alignment=${hasAlignment} chars=${data.alignment?.characters?.length ?? 0}`,
  };
}

async function main() {
  const keys = loadKeys();
  console.log(`Test with-timestamps endpoint pour 4 modèles, voix Antoni :\n`);
  for (const model of MODELS) {
    let result: { ok: boolean; msg: string } | null = null;
    for (const key of keys) {
      result = await testWithTimestamps(key, model);
      if (result.ok || !result.msg.includes('quota_exceeded')) break;
    }
    const icon = result?.ok ? '✅' : '❌';
    console.log(`${icon} ${model.padEnd(24)} → ${result?.msg}`);
  }
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
