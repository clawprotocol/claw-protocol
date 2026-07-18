"""Server-side signing lock snapshot for validating recipient tokens (separate from browser localStorage)."""

from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from backend.services.agreement_draft_store import _agreements_dir, agreement_file_lock, draft_exists


def _use_postgres() -> bool:
    from backend.db.config import use_postgresql_for_agreements

    return use_postgresql_for_agreements()


def _lock_path(agreement_id: str) -> Path:
    safe_id = (agreement_id or "").strip()
    if not safe_id:
        raise ValueError("missing_agreement_id")
    return _agreements_dir() / f"{safe_id}.signing-lock.json"


def _decode_lock_payload(raw: Any) -> Optional[Dict[str, Any]]:
    if raw is None:
        return None
    if isinstance(raw, dict):
        return raw
    try:
        data = json.loads(str(raw))
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def read_signing_lock_unlocked(agreement_id: str) -> Optional[Dict[str, Any]]:
    """Read signing lock without acquiring the agreement file lock (caller must hold it)."""
    if _use_postgres():
        raise RuntimeError("read_signing_lock_unlocked requires caller-managed postgres transaction")
    path = _lock_path(agreement_id)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def read_signing_lock_for_update(cx: Any, agreement_id: str) -> Optional[Dict[str, Any]]:
    from backend.db.agreement_sql import pg_execute

    aid = (agreement_id or "").strip()
    if not aid:
        return None
    cur = pg_execute(
        cx,
        "SELECT payload FROM agreement_signing_locks WHERE agreement_id = ? FOR UPDATE",
        (aid,),
    )
    row = cur.fetchone()
    if not row:
        return None
    return _decode_lock_payload(row[0])


def read_signing_lock(agreement_id: str) -> Optional[Dict[str, Any]]:
    if _use_postgres():
        return _read_signing_lock_postgres(agreement_id)
    path = _lock_path(agreement_id)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def _read_signing_lock_postgres(agreement_id: str) -> Optional[Dict[str, Any]]:
    from backend.db.agreement_sql import agreement_postgres_connection, pg_execute

    aid = (agreement_id or "").strip()
    if not aid:
        return None
    with agreement_postgres_connection() as cx:
        cur = pg_execute(
            cx,
            "SELECT payload FROM agreement_signing_locks WHERE agreement_id = ?",
            (aid,),
        )
        row = cur.fetchone()
    if not row:
        return None
    return _decode_lock_payload(row[0])


def clear_signing_lock(agreement_id: str) -> None:
    """Remove server-side signing lock so negotiation / draft edits can resume."""
    if _use_postgres():
        _clear_signing_lock_postgres(agreement_id)
        return
    with agreement_file_lock(agreement_id):
        path = _lock_path(agreement_id)
        try:
            if path.exists():
                path.unlink()
        except OSError:
            pass


def _clear_signing_lock_postgres(agreement_id: str) -> None:
    from backend.db.agreement_sql import agreement_postgres_connection, pg_execute

    aid = (agreement_id or "").strip()
    if not aid:
        return
    with agreement_postgres_connection() as cx:
        pg_execute(cx, "SELECT id FROM agreement_drafts WHERE id = ? FOR UPDATE", (aid,))
        pg_execute(cx, "DELETE FROM agreement_signing_locks WHERE agreement_id = ?", (aid,))


def write_signing_lock(agreement_id: str, payload: Dict[str, Any]) -> None:
    if _use_postgres():
        _write_signing_lock_postgres(agreement_id, payload)
        return
    with agreement_file_lock(agreement_id):
        path = _lock_path(agreement_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
        fd, tmp_name = tempfile.mkstemp(prefix=f"{agreement_id}_lock_", suffix=".tmp", dir=str(path.parent))
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(raw)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp_name, path)
        finally:
            if os.path.exists(tmp_name):
                os.unlink(tmp_name)


def _write_signing_lock_postgres(agreement_id: str, payload: Dict[str, Any]) -> None:
    from backend.db.agreement_sql import agreement_postgres_connection, pg_execute

    aid = (agreement_id or "").strip()
    if not aid:
        raise ValueError("missing_agreement_id")
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    now = datetime.now(timezone.utc)
    with agreement_postgres_connection() as cx:
        pg_execute(cx, "SELECT id FROM agreement_drafts WHERE id = ? FOR UPDATE", (aid,))
        pg_execute(
            cx,
            """
            INSERT INTO agreement_signing_locks (agreement_id, payload, updated_at)
            VALUES (?, ?::jsonb, ?)
            ON CONFLICT (agreement_id) DO UPDATE SET
              payload = EXCLUDED.payload,
              updated_at = EXCLUDED.updated_at
            """,
            (aid, raw, now),
        )


def assert_draft_exists(agreement_id: str) -> None:
    if not draft_exists(agreement_id):
        raise KeyError("agreement_not_found")
