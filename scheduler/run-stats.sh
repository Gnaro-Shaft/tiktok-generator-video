#!/bin/bash
# =============================================================================
# tiktok-stats — collecte quotidienne des stats + analyse + dashboard
# Lancé par launchd tous les jours à 08:00 Europe/Paris.
# =============================================================================
set -uo pipefail

PROJECT_DIR="/Users/dgnaro/projects/10-en-cours/tiktok_generator-video"
LOG_DIR="/Users/dgnaro/Library/Logs/tiktok-gen"
LOG_FILE="$LOG_DIR/stats.log"
PYTHON="/Users/dgnaro/.pyenv/versions/3.12.7/bin/python3"

mkdir -p "$LOG_DIR"

{
  echo "════════════════════════════════════════════════════════════"
  echo " tiktok-stats — $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "════════════════════════════════════════════════════════════"
  echo ""

  cd "$PROJECT_DIR" || { echo "ERREUR: PROJECT_DIR introuvable"; exit 1; }

  echo "[1/2] Collecte…"
  "$PYTHON" apps/tiktok-stats/collect.py --headless
  RC_COLLECT=$?

  if [ $RC_COLLECT -ne 0 ]; then
    echo "⚠ collect.py a échoué (exit $RC_COLLECT) — analyze ignoré"
    exit $RC_COLLECT
  fi

  echo ""
  echo "[2/2] Analyse + dashboard…"
  "$PYTHON" apps/tiktok-stats/analyze.py
  RC_ANALYZE=$?

  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo " Terminé à $(date '+%Y-%m-%d %H:%M:%S %Z') — exit $RC_ANALYZE"
  echo "════════════════════════════════════════════════════════════"

  exit $RC_ANALYZE
} >> "$LOG_FILE" 2>&1
