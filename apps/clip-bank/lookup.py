#!/usr/bin/env python3
"""
Look up an existing clip/image in the bank by prompt.

Usage:
  python apps/clip-bank/lookup.py --prompt "..." [--threshold 0.85] [--media-type video]

Prints the resolved local path on stdout if found.
Exits 0 if found, 1 if not found, 2 on error.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import load_index, resolve_uri, prompt_hash, prompt_similarity


def main() -> None:
    ap = argparse.ArgumentParser(description="Look up a clip/image by prompt")
    ap.add_argument("--prompt", required=True)
    ap.add_argument(
        "--threshold",
        type=float,
        default=0.85,
        help="Minimum fuzzy similarity ratio (0–1) for a match",
    )
    ap.add_argument(
        "--media-type",
        choices=["video", "image", "any"],
        default="any",
    )
    args = ap.parse_args()

    entries = load_index()
    if not entries:
        sys.exit(1)

    phash = prompt_hash(args.prompt)

    # 1. Exact hash match (fastest).
    for entry in entries:
        if entry.get("prompt_hash") != phash:
            continue
        if args.media_type != "any" and entry.get("media_type") != args.media_type:
            continue
        path = _resolve_and_check(entry)
        if path:
            print(path)
            sys.exit(0)

    # 2. Fuzzy match above threshold.
    best_score = 0.0
    best_entry = None
    for entry in entries:
        if args.media_type != "any" and entry.get("media_type") != args.media_type:
            continue
        score = prompt_similarity(args.prompt, entry.get("prompt", ""))
        if score > best_score:
            best_score = score
            best_entry = entry

    if best_entry and best_score >= args.threshold:
        path = _resolve_and_check(best_entry)
        if path:
            print(path)
            sys.exit(0)

    sys.exit(1)


def _resolve_and_check(entry: dict) -> str | None:
    uri = entry.get("uri", "")
    path = resolve_uri(uri)
    if path and path.exists():
        return str(path)
    return None


if __name__ == "__main__":
    main()
