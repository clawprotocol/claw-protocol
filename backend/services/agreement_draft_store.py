from __future__ import annotations

"""
Agreement draft persistence.

Default: canonical JSON files under ``CLAW_DATA_DIR``/``data``/``agreements``.

Optional Postgres (``CLAW_AGREEMENT_DATABASE_URL`` or shared ``CLAW_DATABASE_URL``): one row per
draft (JSONB payload) in schema ``lawdog_agreements`` (override with ``CLAW_PG_SCHEMA_AGREEMENTS``).
"""

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

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


def _use_postgres() -> bool:
    from backend.db.config import use_postgresql_for_agreements

    return use_postgresql_for_agreements()


def draft_exists(agreement_id: str) -> bool:
    """True if a draft row/file exists for this id."""
    aid = (agreement_id or "").strip()
    if not aid:
        return False
    if _use_postgres():
        from backend.db.agreement_sql import agreement_postgres_connection, pg_execute

        with agreement_postgres_connection() as cx:
            cur = pg_execute(
                cx,
                "SELECT 1 FROM agreement_drafts WHERE id = ? LIMIT 1",
                (aid,),
            )
            return cur.fetchone() is not None
    return _agreement_path(aid).exists()


def save_draft(draft: Dict[str, Any]) -> None:
    agreement_id = str(draft.get("id") or "").strip()
    if not agreement_id:
        raise ValueError("missing_id")
    if _use_postgres():
        _save_draft_postgres(draft, agreement_id)
        return
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


def _save_draft_postgres(draft: Dict[str, Any], agreement_id: str) -> None:
    from backend.db.agreement_sql import agreement_postgres_connection, pg_execute

    payload_text = canon_json_bytes(draft).decode("utf-8")
    now = datetime.now(timezone.utc)
    with agreement_postgres_connection() as cx:
        pg_execute(
            cx,
            """
            INSERT INTO agreement_drafts (id, payload, created_at, updated_at)
            VALUES (?, ?::jsonb, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
              payload = EXCLUDED.payload,
              updated_at = EXCLUDED.updated_at
            """,
            (agreement_id, payload_text, now, now),
        )


def load_draft(agreement_id: str) -> Dict[str, Any]:
    if _use_postgres():
        return _load_draft_postgres(agreement_id)
    path = _agreement_path(agreement_id)
    if not path.exists():
        raise KeyError("agreement_not_found")
    raw = path.read_text(encoding="utf-8")
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise ValueError("invalid_agreement_payload")
    return parsed


def _load_draft_postgres(agreement_id: str) -> Dict[str, Any]:
    from backend.db.agreement_sql import agreement_postgres_connection, pg_execute

    aid = (agreement_id or "").strip()
    if not aid:
        raise KeyError("agreement_not_found")
    with agreement_postgres_connection() as cx:
        cur = pg_execute(
            cx,
            "SELECT payload FROM agreement_drafts WHERE id = ?",
            (aid,),
        )
        row = cur.fetchone()
    if not row:
        raise KeyError("agreement_not_found")
    payload = row[0]
    if isinstance(payload, dict):
        parsed = payload
    else:
        parsed = json.loads(str(payload))
    if not isinstance(parsed, dict):
        raise ValueError("invalid_agreement_payload")
    return parsed


def list_draft_agreement_ids_newest_first() -> List[str]:
    """Return draft ids newest first (mtime for files; ``updated_at`` for Postgres)."""
    if _use_postgres():
        from backend.db.agreement_sql import agreement_postgres_connection, pg_execute

        with agreement_postgres_connection() as cx:
            cur = pg_execute(
                cx,
                "SELECT id FROM agreement_drafts ORDER BY updated_at DESC",
                (),
            )
            rows = cur.fetchall()
        return [str(r[0]) for r in rows]
    paths: List[tuple[int, str]] = []
    for path in _agreements_dir().glob("*.json"):
        if path.name.endswith(".signing-lock.json"):
            continue
        try:
            st = path.stat()
        except OSError:
            continue
        paths.append((st.st_mtime_ns, path.stem))
    paths.sort(key=lambda t: -t[0])
    return [aid for _, aid in paths]
