"""
Hero marketing page: short audio → text (Whisper). Push-to-talk; batch upload only.
Rate-limited and size-capped for cost / abuse control.
"""

from __future__ import annotations

import io
import logging
import os
import time
from collections import defaultdict
from typing import Dict, List

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from pydantic import BaseModel

from backend.llm_router import OPENAI_API_KEY

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/transcribe", tags=["transcription"])

# In-memory sliding window: client key -> list of unix timestamps
_window: Dict[str, List[float]] = defaultdict(list)

_MAX_AUDIO_BYTES = int(os.getenv("CLAW_HERO_TRANSCRIBE_MAX_BYTES", str(4 * 1024 * 1024)))
_MIN_AUDIO_BYTES = int(os.getenv("CLAW_HERO_TRANSCRIBE_MIN_BYTES", "500"))
_MAX_RECORDINGS_PER_MINUTE = int(os.getenv("CLAW_HERO_TRANSCRIBE_RPM", "3"))
_WINDOW_SEC = 60.0
_WHISPER_MODEL = os.getenv("CLAW_WHISPER_MODEL", "whisper-1")


def _client_key(request: Request) -> str:
    host = request.client.host if request.client else "unknown"
    ua = (request.headers.get("user-agent") or "")[:80]
    return f"{host}|{ua}"


def _rate_allow(key: str) -> bool:
    now = time.time()
    arr = _window[key]
    cutoff = now - _WINDOW_SEC
    while arr and arr[0] < cutoff:
        arr.pop(0)
    if len(arr) >= _MAX_RECORDINGS_PER_MINUTE:
        return False
    arr.append(now)
    return True


class TranscribeHeroResponse(BaseModel):
    text: str


@router.post("/hero", response_model=TranscribeHeroResponse)
async def transcribe_hero_audio(request: Request, file: UploadFile = File(...)) -> TranscribeHeroResponse:
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="transcription_unavailable")

    key = _client_key(request)
    if not _rate_allow(key):
        raise HTTPException(
            status_code=429,
            detail="Too many transcription attempts. Wait a moment and try again.",
        )

    raw = await file.read()
    n = len(raw)
    if n < _MIN_AUDIO_BYTES:
        raise HTTPException(status_code=400, detail="Recording too short or empty.")
    if n > _MAX_AUDIO_BYTES:
        raise HTTPException(status_code=400, detail="Audio file too large.")

    filename = (file.filename or "audio.webm").lower()
    if not any(filename.endswith(ext) for ext in (".webm", ".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".wav", ".ogg")):
        # Whisper accepts several; default webm from MediaRecorder
        pass

    try:
        from openai import OpenAI

        client = OpenAI(api_key=OPENAI_API_KEY)
        bio = io.BytesIO(raw)
        bio.name = filename if "." in filename else "audio.webm"
        tr = client.audio.transcriptions.create(model=_WHISPER_MODEL, file=bio)
        text = (tr.text or "").strip()
    except Exception as e:
        _log.warning("hero transcribe failed: %s", e, exc_info=False)
        raise HTTPException(status_code=502, detail="Transcription failed. Type or try again.") from e

    if not text:
        raise HTTPException(status_code=400, detail="No speech detected in recording.")

    return TranscribeHeroResponse(text=text)
