from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any, Dict

from backend.utils.canon_json import canon_json_bytes


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _agreements_dir() -> Path:
    base = os.getenv("CLAW_DATA_DIR", "").strip()
    root = Path(base).expanduser() if base else (_repo_root() / "data")
    path = root / "agreements"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _agreement_path(agreement_id: str) -> Path:
    safe_id = (agreement_id or "").strip()
    if not safe_id:
        raise ValueError("missing_agreement_id")
    return _agreements_dir() / f"{safe_id}.json"


def save_draft(draft: Dict[str, Any]) -> None:
    agreement_id = str(draft.get("id") or "").strip()
    if not agreement_id:
        raise ValueError("missing_id")
    path = _agreement_path(agreement_id)
    data = canon_json_bytes(draft)
    fd, tmp_name = tempfile.mkstemp(prefix=f"{agreement_id}_", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_name, path)
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)


def load_draft(agreement_id: str) -> Dict[str, Any]:
    path = _agreement_path(agreement_id)
    if not path.exists():
        raise KeyError("agreement_not_found")
    raw = path.read_text(encoding="utf-8")
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise ValueError("invalid_agreement_payload")
    return parsed
