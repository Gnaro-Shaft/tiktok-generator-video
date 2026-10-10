#!/usr/bin/env python3
"""
Archive a generated clip or image into the clip bank.

Usage:
  python apps/clip-bank/archive.py \\
    --path /abs/path/to/clip.mp4 \\
    --prompt "Developer workstation viewed from behind..." \\
    --model wan2.1-t2v-14b-Q5_K_M \\
    --seed 42 \\
    --scene-id s3 \\
    [--width 480] [--height 848] [--num-frames 49] [--fps 16.0]

Prints the assigned entry id on stdout.
Exits 0 on success, 1 on error.
"""
from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import BANK_DIR, load_index, save_index, local_uri, prompt_hash


def _entry_id(scene_id: str, phash: str) -> str:
    return f"{scene_id}_{phash[:8]}"


def main() -> None:
    ap = argparse.ArgumentParser(description="Archive a clip/image into the bank")
    ap.add_argument("--path", required=True, help="Absolute path to the source file")
    ap.add_argument("--prompt", required=True, help="Visual prompt used to generate it")
    ap.add_argument("--model", required=True, help="Model identifier")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--scene-id", default="unknown")
    ap.add_argument("--width", type=int, default=0)
    ap.add_argument("--height", type=int, default=0)
    ap.add_argument("--num-frames", type=int, default=0)
    ap.add_argument("--fps", type=float, default=0.0)
    args = ap.parse_args()

    src = Path(args.path)
    if not src.exists():
        sys.exit(f"ERROR: source file not found: {src}")

    media_type = "video" if src.suffix.lower() in (".mp4", ".mov", ".webm") else "image"
    subdir = BANK_DIR / ("videos" if media_type == "video" else "images")
    subdir.mkdir(parents=True, exist_ok=True)

    phash = prompt_hash(args.prompt)
    entry_id = _entry_id(args.scene_id, phash)
    dest = subdir / (entry_id + src.suffix)

    # Symlink to the original (avoids duplicating large files).
    if dest.exists() or dest.is_symlink():
        dest.unlink()
    dest.symlink_to(src.resolve())

    entries = load_index()
    # Replace existing entry with the same id rather than duplicating.
    entries = [e for e in entries if e.get("id") != entry_id]
    entries.append({
        "id": entry_id,
        "scene_id": args.scene_id,
        "prompt": args.prompt,
        "prompt_hash": phash,
        "model": args.model,
        "seed": args.seed,
        "media_type": media_type,
        "width": args.width,
        "height": args.height,
        "num_frames": args.num_frames,
        "fps": args.fps,
        "uri": local_uri(dest),
        "created_at": date.today().isoformat(),
    })

    save_index(entries)
    print(entry_id)


if __name__ == "__main__":
    main()
