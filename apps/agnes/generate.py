#!/usr/bin/env python3
"""
Génère des clips vidéo avec Agnes Video 2.5 Flash (text-to-video, gratuit en promo).

Usage:
  python generate.py --scenes output/gnaro/2026-10-09/post4/scenes.json --dry-run
  python generate.py --scenes output/gnaro/2026-10-09/post4/scenes.json
"""

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

MODEL_ID = "agnes-video-2.5-flash"

_REPO_ROOT = Path(__file__).resolve().parents[2]
_CLIP_BANK_LOOKUP = _REPO_ROOT / "apps" / "clip-bank" / "lookup.py"
_CLIP_BANK_ARCHIVE = _REPO_ROOT / "apps" / "clip-bank" / "archive.py"
_BASE_URL = "https://apihub.agnes-ai.com/v1"
_RESOLUTION = "720P"   # Flash : seule valeur autorisée
_ASPECT_RATIO = "9:16" # 720x1280 pour TikTok
_SEC_MIN = 4
_SEC_MAX = 12
_POLL_INTERVAL_SEC = 3
_POLL_TIMEOUT_SEC = 300

# Tarif liste (promo actuelle = $0)
_LIST_PRICE_USD_PER_SEC = 0.025


def _hash_scene(scene: dict) -> str:
    key = json.dumps(
        {
            "model": MODEL_ID,
            "prompt": scene["visual_prompt"],
            "seconds": _clamp_seconds(scene["duration_sec"]),
            "size": _RESOLUTION,
            "aspect_ratio": _ASPECT_RATIO,
        },
        sort_keys=True,
    )
    return hashlib.sha256(key.encode()).hexdigest()[:12]


def _clamp_seconds(duration_sec: int) -> str:
    clamped = max(_SEC_MIN, min(_SEC_MAX, int(duration_sec)))
    return str(clamped)


def _clip_filename(scene_id: str, h: str) -> str:
    return f"{scene_id}_{h}.mp4"


def _load_scenes(path: Path) -> dict:
    with path.open() as f:
        return json.load(f)


def _lookup_bank(prompt: str) -> Path | None:
    """Return a local clip path from the bank if a similar one exists."""
    r = subprocess.run(
        [sys.executable, str(_CLIP_BANK_LOOKUP), "--prompt", prompt, "--media-type", "video"],
        capture_output=True, text=True,
    )
    if r.returncode == 0 and r.stdout.strip():
        p = Path(r.stdout.strip())
        return p if p.exists() else None
    return None


def _archive_to_bank(path: Path, prompt: str, scene_id: str) -> None:
    subprocess.run(
        [sys.executable, str(_CLIP_BANK_ARCHIVE),
         "--path", str(path), "--prompt", prompt,
         "--model", MODEL_ID, "--scene-id", scene_id],
        check=False,
    )


def _plan(data: dict, clips_dir: Path) -> tuple[list, list]:
    to_generate, cached = [], []
    for scene in data["scenes"]:
        h = _hash_scene(scene)
        dest = clips_dir / _clip_filename(scene["id"], h)
        if dest.exists():
            cached.append((scene, dest, h))
        else:
            bank_path = _lookup_bank(scene["visual_prompt"])
            if bank_path:
                if not dest.exists():
                    dest.symlink_to(bank_path.resolve())
                print(f"  🏦  {scene['id']} : réutilisé depuis la banque ({bank_path.name})")
                cached.append((scene, dest, h))
            else:
                to_generate.append((scene, dest, h))
    return to_generate, cached


def _print_plan(data: dict, to_generate: list, cached: list, dry_run: bool) -> None:
    list_cost = sum(
        int(_clamp_seconds(s["duration_sec"])) * _LIST_PRICE_USD_PER_SEC
        for s, _, _ in to_generate
    )

    print(f"\n📋  {data['id']}  —  {data['niche']}/{data['slot']}")
    print()

    if cached:
        print(f"  ✅  Cache ({len(cached)}) :")
        for scene, dest, _ in cached:
            print(f"      {scene['id']:4s}  {scene['duration_sec']}s  →  {dest.name}")

    if not to_generate:
        print("\n  ✅  Toutes les scènes sont déjà en cache. Rien à générer.")
        return

    label = "🔍  Dry-run" if dry_run else "⏳  À générer"
    print(f"\n  {label} ({len(to_generate)}) :")
    for scene, dest, _ in to_generate:
        prompt = scene["visual_prompt"]
        excerpt = prompt[:72] + "…" if len(prompt) > 72 else prompt
        sec = _clamp_seconds(scene["duration_sec"])
        if int(sec) != scene["duration_sec"]:
            print(f"      {scene['id']:4s}  {scene['duration_sec']}s → {sec}s (clampé)")
        else:
            print(f"      {scene['id']:4s}  {sec}s")
        print(f"           {excerpt}")

    print()
    print(f"  💵  Coût tarif liste : ~${list_cost:.2f}  ({_LIST_PRICE_USD_PER_SEC}$/s — {MODEL_ID})")
    print(f"  🎁  Promo actuelle   : $0.00 (gratuit jusqu'à fin de promo)")

    if dry_run:
        print("\n  ✋  --dry-run actif. Lance sans --dry-run pour appeler l'API.")


def _download(url: str, dest: Path) -> None:
    with httpx.stream("GET", url, follow_redirects=True, timeout=120) as r:
        r.raise_for_status()
        with dest.open("wb") as f:
            for chunk in r.iter_bytes(chunk_size=65536):
                f.write(chunk)


def _update_clip_path(scenes_path: Path, scene_id: str, clip_path: Path) -> None:
    data = json.loads(scenes_path.read_text())
    for scene in data["scenes"]:
        if scene["id"] == scene_id:
            scene["clip_path"] = str(clip_path.resolve())
            break
    scenes_path.write_text(json.dumps(data, ensure_ascii=False, indent=2))


_CREATE_RETRIES = 4
_CREATE_RETRY_DELAY_SEC = 10


def _create_task(client: httpx.Client, prompt: str, seconds: str) -> str:
    for attempt in range(1, _CREATE_RETRIES + 1):
        resp = client.post(
            f"{_BASE_URL}/videos",
            json={
                "model": MODEL_ID,
                "prompt": prompt,
                "mode": "text",
                "seconds": seconds,
                "size": _RESOLUTION,
                "aspect_ratio": _ASPECT_RATIO,
            },
            timeout=30,
        )
        if resp.status_code < 500:
            break
        if attempt < _CREATE_RETRIES:
            print(
                f"      ⚠️  {resp.status_code} — retry {attempt}/{_CREATE_RETRIES - 1}"
                f" dans {_CREATE_RETRY_DELAY_SEC}s…",
                flush=True,
            )
            time.sleep(_CREATE_RETRY_DELAY_SEC)
        else:
            resp.raise_for_status()
    resp.raise_for_status()
    data = resp.json()
    video_id = data.get("video_id") or data.get("id")
    if not video_id:
        sys.exit(f"  ❌  Réponse inattendue (pas de video_id) : {data}")
    return video_id


def _poll_task(client: httpx.Client, video_id: str) -> str:
    deadline = time.time() + _POLL_TIMEOUT_SEC
    while time.time() < deadline:
        resp = client.get(
            "https://apihub.agnes-ai.com/agnesapi",
            params={"video_id": video_id, "model_name": MODEL_ID},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        status = data.get("status", "unknown")
        progress = data.get("progress", 0)
        print(f"      statut : {status}  ({progress}%)", end="\r", flush=True)

        if status == "completed":
            print()
            url = data.get("url")
            if not url:
                sys.exit(f"  ❌  Tâche completed mais pas d'url : {data}")
            return url

        if status == "failed":
            print()
            sys.exit(f"  ❌  Génération échouée : {data.get('error', data)}")

        time.sleep(_POLL_INTERVAL_SEC)

    sys.exit(f"  ❌  Timeout ({_POLL_TIMEOUT_SEC}s) dépassé pour {video_id}.")


def _generate_real(
    to_generate: list, clips_dir: Path, scenes_path: Path, api_key: str
) -> None:
    headers = {"Authorization": f"Bearer {api_key}"}
    with httpx.Client(headers=headers) as client:
        for scene, dest, _ in to_generate:
            seconds = _clamp_seconds(scene["duration_sec"])
            print(f"\n  ⏳  {scene['id']}  ({seconds}s)  création de la tâche…", flush=True)
            video_id = _create_task(client, scene["visual_prompt"], seconds)
            print(f"      video_id : {video_id}", flush=True)
            print(f"      polling…", flush=True)
            url = _poll_task(client, video_id)
            print(f"  ⬇️   Téléchargement…", flush=True)
            _download(url, dest)
            _update_clip_path(scenes_path, scene["id"], dest)
            _archive_to_bank(dest, scene["visual_prompt"], scene["id"])
            print(f"  ✅  {scene['id']}  →  {dest.name}")


def main() -> None:
    load_dotenv()

    parser = argparse.ArgumentParser(
        description="Génère des clips Agnes Video 2.5 Flash depuis un scenes.json"
    )
    parser.add_argument("--scenes", required=True, help="Chemin vers scenes.json")
    parser.add_argument("--dry-run", action="store_true", help="Plan sans appel API")
    args = parser.parse_args()

    scenes_path = Path(args.scenes)
    if not scenes_path.exists():
        sys.exit(f"❌  Fichier introuvable : {scenes_path}")

    data = _load_scenes(scenes_path)
    clips_dir = scenes_path.parent / "clips"
    clips_dir.mkdir(parents=True, exist_ok=True)

    to_generate, cached = _plan(data, clips_dir)

    for scene, dest, _ in cached:
        if scene.get("clip_path") != str(dest.resolve()):
            _update_clip_path(scenes_path, scene["id"], dest)

    _print_plan(data, to_generate, cached, args.dry_run)

    if not to_generate or args.dry_run:
        return

    api_key = os.getenv("AGNES_API_KEY")
    if not api_key:
        sys.exit("❌  AGNES_API_KEY requis dans .env")

    _generate_real(to_generate, clips_dir, scenes_path, api_key)


if __name__ == "__main__":
    main()
