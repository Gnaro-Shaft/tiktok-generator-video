#!/usr/bin/env python3
"""
Propose des ajustements de poids dans niche.yaml selon insights.json.
Affiche un diff lisible et attend confirmation avant d'écrire.

Usage: python apps/tiktok-stats/feedback.py
"""
import json
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit("PyYAML requis : pip install pyyaml")

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data" / "tiktok-stats"
NICHES_DIR = ROOT / "niches"
INSIGHTS_FILE = DATA_DIR / "insights.json"

WEIGHT_BOOST = 0.15
WEIGHT_MALUS = 0.10
WEIGHT_MIN   = 0.05
WEIGHT_MAX   = 1.0


def load_insights() -> dict:
    if not INSIGHTS_FILE.exists():
        sys.exit("[feedback] insights.json introuvable. Lance analyze.py d'abord.")
    return json.loads(INSIGHTS_FILE.read_text())


def load_weight(niche: str) -> float | None:
    cfg = NICHES_DIR / niche / "niche.yaml"
    if not cfg.exists():
        return None
    data = yaml.safe_load(cfg.read_text())
    return float(data.get("weight", 1.0))


def apply_weight(niche: str, new_weight: float):
    cfg = NICHES_DIR / niche / "niche.yaml"
    data = yaml.safe_load(cfg.read_text())
    data["weight"] = new_weight
    cfg.write_text(yaml.dump(data, allow_unicode=True, default_flow_style=False, sort_keys=False))


def propose(insights: dict) -> list[dict]:
    changes = []
    for niche in insights.get("top_niches", []):
        w = load_weight(niche)
        if w is None:
            continue
        new = min(WEIGHT_MAX, round(w + WEIGHT_BOOST, 2))
        if new != w:
            changes.append({"niche": niche, "current": w, "proposed": new, "direction": "▲", "reason": "top performer"})

    for niche in insights.get("low_performers", []):
        w = load_weight(niche)
        if w is None:
            continue
        new = max(WEIGHT_MIN, round(w - WEIGHT_MALUS, 2))
        if new != w:
            changes.append({"niche": niche, "current": w, "proposed": new, "direction": "▼", "reason": "low performer"})

    return changes


def main():
    insights = load_insights()
    changes = propose(insights)

    if not changes:
        print("[feedback] Aucun ajustement proposé.")
        return

    gen = insights.get("generated_at", "?")
    total = insights.get("total_videos", 0)
    print(f"\n[feedback] Insights du {gen} · {total} vidéos\n")
    print(f"  {'Niche':<20} {'Actuel':>8}  {'Proposé':>8}    Raison")
    print(f"  {'-'*20} {'-'*8}  {'-'*8}    {'-'*16}")
    for c in changes:
        print(f"  {c['niche']:<20} {c['current']:>8.2f}  {c['proposed']:>8.2f}  {c['direction']}  {c['reason']}")

    print()
    try:
        ans = input("Appliquer ces changements ? [o/N] ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        print("\n[feedback] Annulé.")
        return

    if ans != "o":
        print("[feedback] Annulé — aucune modification.")
        return

    for c in changes:
        apply_weight(c["niche"], c["proposed"])
    print(f"[feedback] ✓ {len(changes)} niche(s) mise(s) à jour.")


if __name__ == "__main__":
    main()
