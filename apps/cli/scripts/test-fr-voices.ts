#!/usr/bin/env -S npx tsx
/**
 * Teste un panel de voix FR-natives sur un texte business-ia.
 * Mp3 dans /tmp/fr-voices/<name>.mp3.
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../..', '.env'), override: true });

const TEXT = `Arrête de perdre du temps sur des tâches répétitives. Un agent IA peut gérer tes emails, ta prospection et ton service client. Concrètement, tu configures une fois, et ça tourne tout seul. Trois heures gagnées par jour, sans effort.`;

// Voix FR natives de la Voice Library — masculines + féminines.
const FR_VOICES: { name: string; id: string }[] = [
  { name: 'Raphael-ads-social', id: 'OKpKhTrwN6S16IfQTHzZ' },
  { name: 'Augustin-conversational', id: 'kKgyAHjGAbeWHCNd7qoC' },
  { name: 'Vincent-calm-narrative', id: 'eDaM8z1udmnynsRHDkUP' },
  { name: 'Alexis-calm', id: 'PWMsXrscExaV05YVAl7P' },
  { name: 'Stephane-enthusiastic', id: 'mbQbIR5Rvn4QUOMKfqNg' },
  { name: 'Florian-narrator', id: 'FL0d5832ACnJkBaedeKX' },
  { name: 'Stella-FR-female', id: 'ebRwkdEFVZIx2A6YucFh' },
  { name: 'Virginie-soft-female', id: 'NzCI2wsmQgzQiufNpYi7' },
];

const OUT_DIR = '/tmp/fr-voices';
fs.mkdirSync(OUT_DIR, { recursive: true });

function loadKeys(): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= 9; i++) {
    const v = process.env[`ELEVENLABS_API_KEY_${i}`];
    if (v?.trim()) keys.push(v.trim());
  }
  return keys;
}

async function generate(apiKey: string, voice: { name: string; id: string }): Promise<boolean> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice.id}`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text: TEXT,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.4, use_speaker_boost: true },
      }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      console.log(`❌ ${voice.name.padEnd(26)} → HTTP ${resp.status} : ${body.slice(0, 110)}`);
      return false;
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    fs.writeFileSync(path.join(OUT_DIR, `${voice.name}.mp3`), buf);
    console.log(`✅ ${voice.name.padEnd(26)} → ${(buf.length / 1024).toFixed(0)} KB`);
    return true;
  } catch (err) {
    console.log(`❌ ${voice.name} : ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

async function main() {
  const keys = loadKeys();
  if (keys.length === 0) {
    console.error('Aucune clé ElevenLabs');
    process.exit(1);
  }
  console.log(`Texte test : "${TEXT.slice(0, 80)}..."\n`);
  console.log(`Test ${FR_VOICES.length} voix FR natives (modèle turbo_v2_5)...\n`);
  for (const voice of FR_VOICES) {
    for (const key of keys) {
      const ok = await generate(key, voice);
      if (ok) break;
    }
  }
  console.log(`\nÉcouter : open ${OUT_DIR}/`);
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
