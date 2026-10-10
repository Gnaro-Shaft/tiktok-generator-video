"""Shared helpers for the clip bank (archive, lookup, future migration)."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Optional

REPO_ROOT = Path(__file__).resolve().parents[2]
BANK_DIR = REPO_ROOT / "assets" / "clip-bank"
INDEX_PATH = BANK_DIR / "index.json"


# ── Index I/O ──────────────────────────────────────────────────────────────────

def load_index() -> list[dict]:
    if not INDEX_PATH.exists():
        return []
    return json.loads(INDEX_PATH.read_text())


def save_index(entries: list[dict]) -> None:
    INDEX_PATH.write_text(json.dumps(entries, ensure_ascii=False, indent=2) + "\n")


# ── URI helpers ────────────────────────────────────────────────────────────────
# Phase 1: local only.  Phase 2: s3:// / smb:// handled by migrate.py.

def local_uri(path: Path) -> str:
    return "file://" + str(path.resolve())


def resolve_uri(uri: str) -> Optional[Path]:
    """Return a local Path for a file:// URI, None for remote URIs (phase 2)."""
    if uri.startswith("file://"):
        return Path(uri[len("file://"):])
    return None


# ── Prompt fingerprint ─────────────────────────────────────────────────────────

def prompt_hash(prompt: str) -> str:
    """Stable SHA-256 of the normalised prompt (lowercase, collapsed whitespace)."""
    normalised = " ".join(prompt.lower().split())
    return hashlib.sha256(normalised.encode()).hexdigest()


# ── Fuzzy similarity ───────────────────────────────────────────────────────────

def prompt_similarity(a: str, b: str) -> float:
    """SequenceMatcher ratio on normalised prompts (0–1)."""
    import difflib
    na = " ".join(a.lower().split())
    nb = " ".join(b.lower().split())
    return difflib.SequenceMatcher(None, na, nb).ratio()
