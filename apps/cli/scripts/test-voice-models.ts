#!/usr/bin/env -S npx tsx
/**
 * Comparateur de modèles ElevenLabs (fetch direct, pas de SDK).
 * Génère le même texte avec plusieurs modèles + plusieurs voix.
 * Mp3 dans /tmp/voice-test/<voice>-<model>.mp3.
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../..', '.env'), override: true });

const TEXT = `Quatre-vingt-six pour cent des gens abandonnent après trois mois. Le problème, c'est pas la motivation. C'est la méthode. Discipline d'abord, motivation après. Pas l'inverse.`;

const VOICES = [
  { name: 'Antoni', id: 'ErXwobaYiN019PkySvjV' },
  { name: 'Daniel', id: 'onwK4e9ZLuTAKqWW03F9' },
];

const MODELS = [
  'eleven_multilingual_v2',
  'eleven_turbo_v2_5',
  'eleven_flash_v2_5',
  'eleven_v3',
];

const OUT_DIR = '/tmp/voice-test';
fs.mkdirSync(OUT_DIR, { recursive: true });

function loadKeys(): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= 9; i++) {
    const v = process.env[`ELEVENLABS_API_KEY_${i}`];
    if (v && v.trim()) keys.push(v.trim());
  }
  const bare = process.env.ELEVENLABS_API_KEY;
  if (bare && bare.trim() && !keys.includes(bare.trim())) keys.push(bare.trim());
  return keys;
}

async function generate(apiKey: string, voice: { name: string; id: string }, model: string): Promise<boolean> {
  const outPath = path.join(OUT_DIR, `${voice.name}-${model}.mp3`);
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice.id}`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
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
      console.log(`❌ ${voice.name.padEnd(8)} / ${model.padEnd(24)} → HTTP ${resp.status} : ${body.slice(0, 120)}`);
      return false;
    }

    const buf = Buffer.from(await resp.arrayBuffer());
    fs.writeFileSync(outPath, buf);
    const sizeKB = (buf.length / 1024).toFixed(0);
    console.log(`✅ ${voice.name.padEnd(8)} / ${model.padEnd(24)} → ${sizeKB} KB`);
    return true;
  } catch (err) {
    console.log(`❌ ${voice.name} / ${model} : ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

async function main() {
  const keys = loadKeys();
  if (keys.length === 0) {
    console.error('Aucune clé ElevenLabs (.env)');
    process.exit(1);
  }

  console.log(`Texte test (${TEXT.length} chars) :`);
  console.log(`  "${TEXT}"`);
  console.log('');
  console.log(`Génération ${VOICES.length} voix × ${MODELS.length} modèles = ${VOICES.length * MODELS.length} mp3...`);
  console.log('');

  for (const voice of VOICES) {
    for (const model of MODELS) {
      // Try each key in turn until success (handles quota/payment_issue).
      for (const key of keys) {
        const ok = await generate(key, voice, model);
        if (ok) break;
      }
    }
  }

  console.log('');
  console.log(`Résultats dans ${OUT_DIR}/`);
  console.log(`Pour écouter : open ${OUT_DIR}/`);
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
