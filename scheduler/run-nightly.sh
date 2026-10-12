#!/bin/bash
# =============================================================================
# tiktok-generator — run nightly: 6 videos = 6 niches × evening (1/jour)
# Lancé par launchd tous les jours à 20:30 Europe/Paris.
# Cadence réduite de 12→6 le 2026-05-23 pour rester sous le quota ElevenLabs.
# =============================================================================
set -uo pipefail

PROJECT_DIR="/Users/dgnaro/tiktok_generator-video"
LOG_DIR="$HOME/Library/Logs/tiktok-gen"
mkdir -p "$LOG_DIR"

DATE=$(date '+%Y-%m-%d')
LOG_FILE="$LOG_DIR/nightly-$DATE.log"

# launchd doesn't load shell profile; re-create a usable PATH.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

{
  echo "════════════════════════════════════════════════════════════"
  echo " tiktok-gen nightly — $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "════════════════════════════════════════════════════════════"
  echo ""

  cd "$PROJECT_DIR" || { echo "ERREUR: PROJECT_DIR introuvable: $PROJECT_DIR"; exit 1; }

  # Run batch evening uniquement — concurrency=1 évite la contention Remotion+ffmpeg.
  # 6 vidéos × ~5min = ~30min total, prêt vers 21h00.
  /opt/homebrew/bin/pnpm --filter @tt/cli start -- --batch --slot evening --concurrency 1
  RC=$?

  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo " Terminé à $(date '+%Y-%m-%d %H:%M:%S %Z') — exit code $RC"
  echo "════════════════════════════════════════════════════════════"

  exit $RC
} >> "$LOG_FILE" 2>&1
