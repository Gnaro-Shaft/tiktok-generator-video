#!/usr/bin/env python3
"""
Connexion TikTok — à lancer UNE SEULE FOIS depuis ton terminal.
Initialise le profil Playwright avec ta session TikTok.

Usage : python apps/tiktok-stats/login.py

1. Une fenêtre Chromium s'ouvre sur la page de login TikTok.
2. Connecte-toi normalement (email/téléphone, QR code, etc.).
3. Ferme la fenêtre quand tu es connecté.
4. La session est persistée dans ~/.tiktok-stats-profile
"""
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    raise SystemExit("playwright requis : pip install playwright && playwright install chromium")

PLAYWRIGHT_PROFILE = Path.home() / ".tiktok-stats-profile"


def main():
    print("[login] Ouverture de Chromium…")
    print("[login] Connecte-toi à TikTok, puis ferme la fenêtre.")

    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=str(PLAYWRIGHT_PROFILE),
            headless=False,
            args=["--no-first-run"],
        )
        page = ctx.new_page()
        page.goto("https://www.tiktok.com/login", wait_until="domcontentloaded", timeout=30_000)

        # Attend que l'utilisateur ferme la fenêtre
        try:
            ctx.wait_for_event("close", timeout=0)
        except Exception:
            pass

    print(f"[login] ✓ Session sauvegardée dans {PLAYWRIGHT_PROFILE}")
    print("[login] Tu peux maintenant lancer collect.py.")


if __name__ == "__main__":
    main()
