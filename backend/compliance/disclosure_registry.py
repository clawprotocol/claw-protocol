"""
Versioned disclosures for consent logging.

**COUNSEL REVIEW REQUIRED** for final text in disclosure_versions.json.
Hashes are computed from canonical JSON per entry (keys sorted, compact separators).
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict

from backend.utils.canon_json import canon_sha256_hex


def _disclosure_json_path() -> Path:
    return Path(__file__).resolve().parent / "disclosure_versions.json"


@lru_cache(maxsize=1)
def load_disclosure_registry() -> Dict[str, Any]:
    path = _disclosure_json_path()
    raw = path.read_text(encoding="utf-8")
    data = json.loads(raw)
    if not isinstance(data, dict):
        return {}
    return {k: v for k, v in data.items() if not str(k).startswith("_")}


def disclosure_payload_hash(payload: Dict[str, Any]) -> str:
    """Stable SHA-256 over canonical JSON."""
    return canon_sha256_hex(payload)


def list_disclosures() -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    reg = load_disclosure_registry()
    for key, entry in reg.items():
        if not isinstance(entry, dict):
            continue
        ver = str(entry.get("version") or "")
        body = {k: entry[k] for k in sorted(entry.keys())}
        h = disclosure_payload_hash(body)
        out[key] = {
            "key": key,
            "version": ver,
            "title": entry.get("title"),
            "summary": entry.get("summary"),
            "content_sha256": h,
        }
    return out


def get_disclosure_record(disclosure_key: str) -> Dict[str, Any] | None:
    reg = load_disclosure_registry()
    entry = reg.get(disclosure_key)
    if not isinstance(entry, dict):
        return None
    body = {k: entry[k] for k in sorted(entry.keys())}
    h = disclosure_payload_hash(body)
    return {
        "key": disclosure_key,
        "version": str(entry.get("version") or ""),
        "title": entry.get("title"),
        "summary": entry.get("summary"),
        "content_sha256": h,
    }
