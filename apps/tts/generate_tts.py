#!/usr/bin/env python3
"""
Génère la narration TTS par scène via VoiceStudio (local, localhost:3900).

Usage:
  python apps/tts/generate_tts.py --props output/gnaro/2026-11-06/agents-19/props.json
  python apps/tts/generate_tts.py --props ... --voice demo0001 --seed 42
"""

import argparse
import io
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
import requests
import scipy.io.wavfile as wavfile

SAMPLE_RATE = 24_000
VS_URL = "http://localhost:3900/v1/audio/speech"
DEFAULT_VOICE = "dfd52d3c"
DEFAULT_MODEL = "tts-1"
DEFAULT_SEED = 42

FFMPEG_PUNCH = (
    "atrim=start=0.05,asetpts=PTS-STARTPTS,"
    "loudnorm=I=-16:TP=-1.5:LRA=11"
)


def _post_process(wav_path: Path) -> None:
    tmp = wav_path.with_suffix(".tmp.wav")
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(wav_path), "-af", FFMPEG_PUNCH, str(tmp)],
        check=True, capture_output=True,
    )
    tmp.replace(wav_path)


def _whisper_timestamps(wav_path: Path) -> list[dict]:
    """Timestamps mot à mot via VoiceStudio Whisper STT. Retourne [] en cas d'erreur."""
    try:
        with open(wav_path, "rb") as f:
            resp = requests.post(
                "http://localhost:3900/v1/audio/transcriptions",
                files={"file": (wav_path.name, f, "audio/wav")},
                data={
                    "model": "whisper-1",
                    "response_format": "verbose_json",
                    "timestamp_granularities[]": "word",
                    "language": "fr",
                },
                timeout=60,
            )
        resp.raise_for_status()
        words = resp.json().get("words", [])
        return [{"word": w["word"].strip(), "start": float(w["start"]), "end": float(w["end"])} for w in words]
    except Exception as exc:
        print(f"         ⚠️  Whisper timestamps: {exc}", flush=True)
        return []


def _scene_text(scene: dict) -> str:
    t = scene.get("type", "")
    if t == "episode_title":
        parts = [scene.get("title", ""), scene.get("subtitle", "")]
        return ". ".join(p for p in parts if p)
    if t in ("shock", "intertitle", "funnel", "flow", "compare", "counter",
             "task_before", "task_summary", "task_after"):
        return scene.get("text", "")
    return ""


def _tts(text: str, voice: str, model: str, seed: int, speed: float = 1.0) -> np.ndarray:
    resp = requests.post(
        VS_URL,
        json={
            "model": model,
            "input": text,
            "voice": voice,
            "response_format": "wav",
            "language": "fr",
            "seed": seed,
            "speed": speed,
        },
        timeout=120,
    )
    resp.raise_for_status()
    _rate, data = wavfile.read(io.BytesIO(resp.content))
    return data.astype(np.float32) / 32768.0


def _tts_with_pauses(
    text: str, voice: str, model: str, seed: int,
    speed: float = 1.0, pause_ms: int = 400,
) -> np.ndarray:
    """Découpe le texte en phrases, génère chacune séparément, insère du silence entre elles."""
    sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', text.strip()) if s.strip()]
    if len(sentences) <= 1:
        return _tts(text, voice, model, seed, speed)

    silence = np.zeros(int(SAMPLE_RATE * pause_ms / 1000), dtype=np.float32)
    parts: list[np.ndarray] = []
    for i, sentence in enumerate(sentences):
        parts.append(_tts(sentence, voice, model, seed, speed))
        if i < len(sentences) - 1:
            parts.append(silence)
    return np.concatenate(parts)


def _update_props(
    props_path: Path,
    scene_audio: dict[str, str],
    scene_durations: dict[str, float],
    scene_timestamps: dict[str, list],
) -> None:
    """Met à jour props.json : audio_path + duration_sec + word_timestamps par scène."""
    data = json.loads(props_path.read_text())
    data.pop("audio_path", None)
    data.pop("audio_delay_sec", None)
    for scene in data["scenes"]:
        sid = scene["id"]
        if sid in scene_audio:
            scene["audio_path"] = scene_audio[sid]
            scene["duration_sec"] = round(scene_durations[sid], 3)
            ts = scene_timestamps.get(sid, [])
            if ts:
                scene["word_timestamps"] = ts
            else:
                scene.pop("word_timestamps", None)
        else:
            scene.pop("audio_path", None)
    props_path.write_text(json.dumps(data, ensure_ascii=False, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="Génère la narration TTS VoiceStudio par scène")
    parser.add_argument("--props", required=True, help="Chemin vers props.json")
    parser.add_argument("--voice", default=DEFAULT_VOICE, help="Voix VoiceStudio (alloy, demo0001…)")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Modèle TTS (tts-1, tts-1-hd)")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED, help="Seed pour voix cohérente")
    parser.add_argument("--speed", type=float, default=1.0, help="Vitesse TTS (1.0=normal)")
    parser.add_argument("--sentence-pause", type=int, default=400, help="Silence entre phrases en ms (défaut: 400)")
    parser.add_argument("--dry-run", action="store_true", help="Affiche le plan sans générer")
    args = parser.parse_args()

    props_path = Path(args.props)
    if not props_path.exists():
        sys.exit(f"❌  Fichier introuvable : {props_path}")

    data = json.loads(props_path.read_text())
    scenes = data["scenes"]
    total_dur = sum(s["duration_sec"] for s in scenes)

    print(f"\n📋  Narration TTS par scène — {len(scenes)} scènes — {total_dur}s — seed:{args.seed}")
    print()
    for s in scenes:
        txt = _scene_text(s)
        label = f"🗣️  \"{txt[:60]}\"" if txt else "⏩  silence"
        print(f"  {s['id']:4s}  {s['duration_sec']}s  {label}")

    if args.dry_run:
        print("\n  ✋  --dry-run actif.")
        return

    audio_dir = props_path.parent / "audio"
    audio_dir.mkdir(exist_ok=True)

    scene_audio: dict[str, str] = {}
    scene_durations: dict[str, float] = {}
    scene_timestamps: dict[str, list] = {}

    for scene in scenes:
        sid = scene["id"]
        dur = scene["duration_sec"]
        text = _scene_text(scene)

        if not text or scene.get("no_tts"):
            print(f"  {sid}  →  silence ({dur}s)", flush=True)
            continue

        print(f"  {sid}  →  TTS \"{text[:60]}\"…", flush=True)
        audio = _tts_with_pauses(text, args.voice, args.model, args.seed, args.speed, args.sentence_pause)

        out_path = audio_dir / f"{sid}.wav"
        wavfile.write(str(out_path), SAMPLE_RATE, (audio * 32768).astype(np.int16))
        _post_process(out_path)
        _rate, processed = wavfile.read(str(out_path))
        actual_dur = len(processed) / _rate
        print(f"         {actual_dur:.2f}s → {out_path.name} ({out_path.stat().st_size//1024}Ko)", flush=True)

        timestamps = _whisper_timestamps(out_path)
        if timestamps:
            print(f"         ⏱  {len(timestamps)} mots timestampés", flush=True)
        scene_timestamps[sid] = timestamps
        scene_audio[sid] = f"audio/{sid}.wav"
        scene_durations[sid] = actual_dur

    _update_props(props_path, scene_audio, scene_durations, scene_timestamps)
    print(f"\n✅  {len(scene_audio)} fichiers audio générés")
    print(f"✅  props.json mis à jour — audio_path par scène")


if __name__ == "__main__":
    main()
