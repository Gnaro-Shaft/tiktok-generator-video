#!/bin/bash
# =============================================================================
# tiktok-generator — run nightly: 12 videos = 6 niches × {morning, evening}
# Lancé par launchd tous les jours à 22:00 Europe/Paris.
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

  # Run batch all (morning then evening) en séquentiel — concurrency=1 évite la
  # contention Remotion+ffmpeg qui multiplie le temps total par 6 quand on tente 3 en //.
  # 12 vidéos × ~3min = ~40-50min total, prêt vers 22h50.
  /opt/homebrew/bin/pnpm --filter @tt/cli start -- --batch --slot all --concurrency 1
  RC=$?

  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo " Terminé à $(date '+%Y-%m-%d %H:%M:%S %Z') — exit code $RC"
  echo "════════════════════════════════════════════════════════════"

  exit $RC
} >> "$LOG_FILE" 2>&1
