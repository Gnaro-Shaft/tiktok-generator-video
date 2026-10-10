#!/usr/bin/env python3
"""
Génère des clips vidéo avec Higgsfield Seedance 2.5 (text-to-video).

Usage:
  python generate.py --scenes output/gnaro/2026-10-09/morning/scenes.json --dry-run
  python generate.py --scenes output/gnaro/2026-10-09/morning/scenes.json [--budget 5.0]
"""

import argparse
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

import httpx
import higgsfield_client
from dotenv import load_dotenv

MODEL_ID = "bytedance/seedance-2.5/text-to-video"

_REPO_ROOT = Path(__file__).resolve().parents[2]
_CLIP_BANK_LOOKUP = _REPO_ROOT / "apps" / "clip-bank" / "lookup.py"
_CLIP_BANK_ARCHIVE = _REPO_ROOT / "apps" / "clip-bank" / "archive.py"
_RESOLUTION = "720p"
_ASPECT_RATIO = "9:16"

# Taux Higgsfield Seedance 2.5 — vérifier sur console.higgsfield.ai (30% off en cours).
_COST_PER_SEC_EUR = 0.144


def _hash_scene(scene: dict) -> str:
    """Fingerprint déterministe : mêmes paramètres API → même fichier → pas de re-génération."""
    key = json.dumps(
        {
            "model": MODEL_ID,
            "prompt": scene["visual_prompt"],
            "duration_sec": scene["duration_sec"],
            "resolution": _RESOLUTION,
            "aspect_ratio": _ASPECT_RATIO,
        },
        sort_keys=True,
    )
    return hashlib.sha256(key.encode()).hexdigest()[:12]


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
    """Retourne (to_generate, cached) selon l'état du répertoire clips et la banque."""
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


def _print_plan(
    data: dict,
    to_generate: list,
    cached: list,
    budget: float,
    dry_run: bool,
) -> None:
    cost = sum(s["duration_sec"] * _COST_PER_SEC_EUR for s, _, _ in to_generate)

    print(f"\n📋  {data['id']}  —  {data['niche']}/{data['slot']}  ({data['total_duration_sec']} s)")
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
        print(f"      {scene['id']:4s}  {scene['duration_sec']}s")
        print(f"           {excerpt}")

    print()
    print(f"  💶  Coût estimé : ~{cost:.2f} €  ({_COST_PER_SEC_EUR} €/s — Seedance 2.5 {_RESOLUTION})")
    print(f"  🔒  Budget max  :  {budget:.2f} €")

    if cost > budget:
        print(f"\n  🛑  Dépassement budget ({cost:.2f} € > {budget:.2f} €).")
        print("      → Réduis le nombre de scènes ou augmente --budget.")
        sys.exit(1)

    if dry_run:
        print("\n  ✋  --dry-run actif. Lance sans --dry-run pour appeler l'API.")


def _download(url: str, dest: Path) -> None:
    with httpx.stream("GET", url, follow_redirects=True, timeout=120) as r:
        r.raise_for_status()
        with dest.open("wb") as f:
            for chunk in r.iter_bytes(chunk_size=65536):
                f.write(chunk)


def _update_clip_path(scenes_path: Path, scene_id: str, clip_path: Path) -> None:
    """Écrit le clip_path absolu dans scenes.json — permet à Remotion de localiser le clip."""
    data = json.loads(scenes_path.read_text())
    for scene in data["scenes"]:
        if scene["id"] == scene_id:
            scene["clip_path"] = str(clip_path.resolve())
            break
    scenes_path.write_text(json.dumps(data, ensure_ascii=False, indent=2))


def _generate_real(to_generate: list, clips_dir: Path, scenes_path: Path) -> None:
    for scene, dest, _ in to_generate:
        print(f"\n  ⏳  {scene['id']}  ({scene['duration_sec']}s)  génération…", flush=True)

        result = higgsfield_client.subscribe(
            MODEL_ID,
            arguments={
                "prompt": scene["visual_prompt"],
                "duration": scene["duration_sec"],
                "resolution": _RESOLUTION,
                "aspect_ratio": _ASPECT_RATIO,
                "output_format": "mp4",
                "generate_audio": False,
            },
        )

        status = result.get("status", "unknown")
        if status != "completed":
            sys.exit(f"  ❌  {scene['id']} : statut '{status}' — arrêt.")

        video_url = result["video"]["url"]
        print(f"  ⬇️   Téléchargement…", flush=True)
        _download(video_url, dest)
        _update_clip_path(scenes_path, scene["id"], dest)
        _archive_to_bank(dest, scene["visual_prompt"], scene["id"])
        print(f"  ✅  {scene['id']}  →  {dest.name}")


def main() -> None:
    load_dotenv()

    parser = argparse.ArgumentParser(
        description="Génère des clips Seedance 2.5 depuis un scenes.json"
    )
    parser.add_argument("--scenes", required=True, help="Chemin vers scenes.json")
    parser.add_argument("--dry-run", action="store_true", help="Plan sans appel API")
    parser.add_argument(
        "--budget",
        type=float,
        default=None,
        help="Plafond EUR par exécution (prioritaire sur HIGGSFIELD_BUDGET_EUR)",
    )
    args = parser.parse_args()

    scenes_path = Path(args.scenes)
    if not scenes_path.exists():
        sys.exit(f"❌  Fichier introuvable : {scenes_path}")

    data = _load_scenes(scenes_path)
    clips_dir = scenes_path.parent / "clips"
    clips_dir.mkdir(parents=True, exist_ok=True)

    budget = (
        args.budget
        if args.budget is not None
        else float(os.getenv("HIGGSFIELD_BUDGET_EUR", "5.0"))
    )

    to_generate, cached = _plan(data, clips_dir)

    # Toujours synchroniser clip_path pour les scènes déjà en cache.
    for scene, dest, _ in cached:
        if scene.get("clip_path") != str(dest.resolve()):
            _update_clip_path(scenes_path, scene["id"], dest)

    _print_plan(data, to_generate, cached, budget, args.dry_run)

    if not to_generate or args.dry_run:
        return

    if not os.getenv("HF_KEY"):
        sys.exit("❌  HF_KEY requis dans .env (format : id:secret).")

    _generate_real(to_generate, clips_dir, scenes_path)


if __name__ == "__main__":
    main()
