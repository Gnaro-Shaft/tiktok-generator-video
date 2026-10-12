#!/usr/bin/env python3
"""
Collecte les stats vidéo depuis TikTok Creator Center via Playwright.
Utilise un profil Chromium dédié (~/.tiktok-stats-profile) pour ne pas
conflicтer avec Chrome déjà ouvert.

Première utilisation : une fenêtre s'ouvre, connecte-toi à TikTok, puis appuie
sur Entrée dans ce terminal. La session est persistée pour les runs suivants.

Usage:
  python apps/tiktok-stats/collect.py          # skip si déjà fait aujourd'hui
  python apps/tiktok-stats/collect.py --force  # force la collecte

Output: data/tiktok-stats/YYYY-MM-DD.json
"""
import json
import sys
import time
from datetime import date
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sys.exit("playwright requis : pip install playwright && playwright install chromium")

ROOT = Path(__file__).resolve().parents[2]
OUTPUT_DIR = ROOT / "data" / "tiktok-stats"
PLAYWRIGHT_PROFILE = Path.home() / ".tiktok-stats-profile"

URLS = [
    "https://www.tiktok.com/creator-center/analytics?tab=content",
    "https://www.tiktok.com/tiktok-studio/content",
]

API_KEYWORDS = (
    "post_list", "aweme_list", "item_list",
    "analytics/content", "video_list", "creator/analytics",
)


def _parse_count(val) -> int:
    if isinstance(val, (int, float)):
        return int(val)
    s = str(val).strip().upper().replace(",", "").replace(" ", "")
    if s.endswith("K"):
        return int(float(s[:-1]) * 1_000)
    if s.endswith("M"):
        return int(float(s[:-1]) * 1_000_000)
    try:
        return int(s)
    except ValueError:
        return 0


def _extract_from_body(body: dict) -> list[dict]:
    items = (
        body.get("aweme_list")
        or body.get("video_list")
        or body.get("item_list")
        or body.get("data", {}).get("aweme_list")
        or body.get("data", {}).get("video_list")
        or body.get("data", {}).get("item_list")
        or []
    )
    results = []
    for item in items:
        stats = item.get("statistics") or item.get("stats") or {}
        video_id = str(
            item.get("aweme_id") or item.get("item_id") or item.get("id") or ""
        )
        if not video_id:
            continue
        dur = item.get("duration") or item.get("video", {}).get("duration") or 0
        duration_sec = dur // 1000 if dur > 1000 else dur
        results.append({
            "video_id": video_id,
            "desc": (item.get("desc") or item.get("title") or "")[:120],
            "published_ts": item.get("create_time") or item.get("createTime") or 0,
            "duration_sec": int(duration_sec),
            "views":    _parse_count(stats.get("play_count")    or stats.get("view_count")  or 0),
            "likes":    _parse_count(stats.get("digg_count")    or stats.get("like_count")  or 0),
            "comments": _parse_count(stats.get("comment_count") or 0),
            "shares":   _parse_count(stats.get("share_count")   or 0),
        })
    return results


def collect() -> list[dict]:
    captured: list[dict] = []

    def on_response(response):
        url = response.url
        if "tiktok.com" not in url:
            return
        if not any(k in url for k in API_KEYWORDS):
            return
        try:
            body = response.json()
        except Exception:
            return
        items = _extract_from_body(body)
        if items:
            captured.extend(items)
            print(f"  ✓ {len(items)} vidéos ← {url[:90]}")

    if not PLAYWRIGHT_PROFILE.exists():
        print("[collect] Profil absent. Lance d'abord : python apps/tiktok-stats/login.py")
        sys.exit(1)

    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=str(PLAYWRIGHT_PROFILE),
            headless=False,
            args=["--no-first-run", "--no-default-browser-check"],
        )
        page = ctx.new_page()
        page.on("response", on_response)

        for url in URLS:
            print(f"[collect] → {url}")
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=30_000)
                time.sleep(5)
                for _ in range(3):
                    page.keyboard.press("End")
                    time.sleep(1.5)
                if captured:
                    break
            except Exception as e:
                print(f"  ⚠ {e}")

        ctx.close()

    seen: set[str] = set()
    unique = []
    for v in captured:
        if v["video_id"] not in seen:
            seen.add(v["video_id"])
            unique.append(v)
    return unique


def main():
    force = "--force" in sys.argv
    today = date.today().isoformat()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUTPUT_DIR / f"{today}.json"

    if out.exists() and not force:
        print(f"[collect] Déjà collecté aujourd'hui ({today}). --force pour relancer.")
        sys.exit(0)

    print(f"[collect] Collecte du {today}…")
    videos = collect()

    if not videos:
        print("[collect] ⚠  Aucune donnée interceptée.")
        print("  → Vérifie que TikTok est connecté dans Chrome.")
        print("  → Navigue manuellement vers l'onglet Contenu si la fenêtre est ouverte.")
        sys.exit(1)

    payload = {"date": today, "count": len(videos), "videos": videos}
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    print(f"[collect] {len(videos)} vidéos → {out}")


if __name__ == "__main__":
    main()
