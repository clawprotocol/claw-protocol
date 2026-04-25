"""
Separate persistence for document layout analysis — not proof / signed artifacts.

Stored JSON is advisory workflow metadata only.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Dict, Optional

_ANALYSIS_ID_RE = re.compile(r"^layout_[a-f0-9]{8,64}$")


def layout_analysis_root() -> Path:
    return Path(os.getenv("CLAW_LAYOUT_ANALYSIS_DIR", "artifacts/layout_analysis")).expanduser().resolve()


def analysis_path(analysis_id: str) -> Path:
    if not _ANALYSIS_ID_RE.match(analysis_id or ""):
        raise ValueError("invalid_analysis_id")
    root = layout_analysis_root()
    return root / f"{analysis_id}.json"


def save_layout_analysis(analysis_id: str, payload: Dict[str, Any]) -> None:
    path = analysis_path(analysis_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False),
        encoding="utf-8",
    )


def load_layout_analysis(analysis_id: str) -> Optional[Dict[str, Any]]:
    try:
        path = analysis_path(analysis_id)
    except ValueError:
        return None
    if not path.is_file():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return raw if isinstance(raw, dict) else None
    except (OSError, json.JSONDecodeError):
        return None
