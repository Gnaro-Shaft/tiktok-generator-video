# tiktok-generator-video

Générateur unifié de vidéos TikTok pour 6 niches. Une seule pipeline, configs YAML par niche.

## Stack

- **TypeScript** monorepo `pnpm` workspaces
- **Claude Sonnet 4.5** (génération de scripts)
- **ElevenLabs** (synthèse vocale + word timings) avec fallback multi-comptes auto
- **Pexels** + **Pixabay** (stock footage, fallback chain, safesearch)
- **Remotion 4** (overlay alpha : hook + sous-titres karaoké + CTA)
- **ffmpeg** (composition finale : background concat + overlay + audio)
- **launchd** (scheduler quotidien 22:00 macOS)

## Niches

| ID | Voice (ElevenLabs) | Theme |
|---|---|---|
| `aion` | k8cFOyAg7B9qwBlDDNTC | Cyan/violet futuriste — entité IA observatrice |
| `actu` | Adam | Rouge presse — décryptage news |
| `business-ia` | Matilda | Rouge/cyan — outils IA pour entrepreneurs |
| `finance` | Bill | Doré/bleu nuit — finance personnelle |
| `motivation` | Antoni | Orange feu — coach exigeant |
| `productivite` | Charlotte | Vert turquoise — méthodes testées |

## Installation

```bash
# 1. Cloner
git clone <repo-url> tiktok-generator-video
cd tiktok-generator-video

# 2. Dépendances
pnpm install

# 3. Variables d'environnement
cp .env.example .env
# Éditer .env avec tes clés API

# 4. Vérifier ffmpeg
ffmpeg -version  # >= 6.0 recommandé
```

## Utilisation

```bash
# Lister les niches
pnpm --filter @tt/cli start -- --list

# Générer 1 vidéo
pnpm --filter @tt/cli start -- --niche aion --slot morning

# Générer toutes les niches en parallèle (1 slot)
pnpm --filter @tt/cli start -- --batch --slot morning --concurrency 3

# Générer 12 vidéos = 6 niches × {morning, evening}
pnpm --filter @tt/cli start -- --batch --slot all --concurrency 3
```

Output : `output/<niche>/<YYYY-MM-DD>/<slot>.{mp4,caption.txt,hashtags.txt,meta.json}`

## Scheduler quotidien (macOS launchd)

Le scheduler génère **12 vidéos chaque soir à 22:00** (6 niches × 2 slots).

```bash
# Installer
ln -sf "$PWD/scheduler/com.tiktokgen.nightly.plist" ~/Library/LaunchAgents/com.tiktokgen.nightly.plist
launchctl load ~/Library/LaunchAgents/com.tiktokgen.nightly.plist

# Vérifier
launchctl list | grep tiktokgen

# Test manuel (sans attendre 22h)
launchctl start com.tiktokgen.nightly
tail -f ~/Library/Logs/tiktok-gen/nightly-$(date +%Y-%m-%d).log

# Désactiver
launchctl unload ~/Library/LaunchAgents/com.tiktokgen.nightly.plist
```

## Architecture

```
tiktok-generator-video/
├── packages/
│   ├── core/            ← noyau TS (script, voice, stock, music, render, compose)
│   └── remotion/        ← compositions Remotion (overlay alpha)
├── apps/
│   └── cli/             ← `tt` CLI
├── niches/
│   ├── aion/            ← niche.yaml + prompts/system.md
│   ├── actu/
│   ├── business-ia/
│   ├── finance/
│   ├── motivation/
│   └── productivite/
├── assets/
│   ├── music/<mood>/    ← mp3 libres de droits par mood (corporate, energetic, etc.)
│   └── sfx/
├── scheduler/
│   ├── run-nightly.sh
│   └── com.tiktokgen.nightly.plist
└── output/              ← MP4 + sidecars (gitignored)
```

### Pipeline

```
1. Script        → Anthropic SDK (prompt par niche, retry auto si durée hors bornes)
2. Voice         → ElevenLabs convertWithTimestamps (multi-account fallback)
3. Music mix     → ffmpeg ducking (optionnel, mood par niche)
4. Stock footage → Pexels primaire + Pixabay fallback, safesearch + blocklist
5. Render Remotion → overlay.mov ProRes 4444 alpha (hook + subs karaoké + CTA)
6. Compose ffmpeg  → background loop (-stream_loop -1) + overlay + audio → final mp4
```

## Configuration d'une niche

`niches/<niche>/niche.yaml` :

```yaml
language: fr
topic: "..."
description: "..."
mode: narration         # ou 'slides' (sans voix)

duration:
  min_sec: 62           # plancher monétisation TikTok
  target_sec: 67
  max_sec: 75

voice:
  voice_id: "..."       # ElevenLabs voice ID
  model_id: eleven_multilingual_v2
  stability: 0.45
  similarity_boost: 0.75
  style: 0.50
  use_speaker_boost: true

theme:
  primary_color: "#..."
  secondary_color: "#..."
  background_color: "#..."
  text_color: "#..."
  subtitle_highlight: "#FFD60A"
  font_family: "Inter, system-ui, sans-serif"
  hook_font_size: 124
  subtitle_font_size: 86
  cta_font_size: 66

stock:
  primary: pexels       # ou pixabay
  per_keyword: 2
  min_clip_duration: 3.0
  max_clip_duration: 8.0
  orientation: portrait

music:
  enabled: false        # pose des mp3 dans assets/music/<mood>/ pour activer
  mood: corporate
  volume_db: -18

video:
  width: 1080
  height: 1920
  fps: 30
  codec: h264
```

`niches/<niche>/prompts/system.md` : prompt système Claude pour cette niche.

## Multi-compte ElevenLabs

Le quota Creator est de 100K chars/mois. Pour scaler sans upgrade Pro/Scale :
1. Crée plusieurs comptes ElevenLabs
2. Mets chaque clé dans `.env` : `ELEVENLABS_API_KEY_1`, `_2`, `_3`...
3. Le pipeline essaie dans l'ordre, bascule auto sur erreur 401 `quota_exceeded`

## Pixabay Music — starter pack

Place 3 mp3 par mood (libres de droits, sans vocals, ≥ 45s) dans :

```
assets/music/corporate/    # business-ia, finance
assets/music/cinematic/    # actu, aion
assets/music/energetic/    # motivation
assets/music/calm/         # productivite
assets/music/reflective/
assets/music/serious/
```

Source recommandée : https://pixabay.com/music/

Pour activer la musique sur une niche : passer `music.enabled: true` dans son `niche.yaml`.

## Licence

Code privé. Modèles vocaux ElevenLabs et clips Pexels/Pixabay sous leurs licences respectives.
