"""Persist consumed recipient-link JTIs (optional single-use) and usage log lines."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _tokens_dir() -> Path:
    base = os.getenv("CLAW_DATA_DIR", "").strip()
    root = Path(base).expanduser() if base else (_repo_root() / "data")
    d = root / "recipient_tokens"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _consumed_path() -> Path:
    return _tokens_dir() / "consumed_jti.json"


def _usage_log_path() -> Path:
    return _tokens_dir() / "validate_usage.jsonl"


def is_jti_consumed(jti: str) -> bool:
    t = (jti or "").strip()
    if not t:
        return False
    path = _consumed_path()
    if not path.is_file():
        return False
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return False
    if not isinstance(data, dict):
        return False
    jtis = data.get("jtis")
    if not isinstance(jtis, list):
        return False
    return t in jtis


def consume_jti(jti: str) -> None:
    t = (jti or "").strip()
    if not t:
        return
    path = _consumed_path()
    jtis: List[str] = []
    if path.is_file():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict) and isinstance(data.get("jtis"), list):
                jtis = [str(x) for x in data["jtis"] if str(x).strip()]
        except Exception:
            jtis = []
    if t in jtis:
        return
    jtis.append(t)
    # cap growth (keep most recent 20k)
    if len(jtis) > 20_000:
        jtis = jtis[-20_000:]
    path.write_text(json.dumps({"jtis": jtis}, indent=0), encoding="utf-8")


def append_usage_record(record: Dict[str, Any]) -> None:
    line = json.dumps(record, separators=(",", ":"), ensure_ascii=False) + "\n"
    path = _usage_log_path()
    with path.open("a", encoding="utf-8") as f:
        f.write(line)
