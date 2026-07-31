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
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.utils.canon_json import canon_json_bytes

try:
    import fcntl
except ImportError:  # pragma: no cover — non-POSIX
    fcntl = None  # type: ignore[assignment]


class DraftCasConflictError(RuntimeError):
    """Compare-and-swap draft save rejected due to registry revision mismatch."""

    def __init__(self, code: str = "invite_replacement_conflict", message: str | None = None) -> None:
        self.code = (code or "invite_replacement_conflict").strip()
        super().__init__(message or self.code)


_FILE_LOCKS: dict[str, threading.RLock] = {}
_FILE_LOCKS_GUARD = threading.Lock()


def _thread_lock_for(agreement_id: str) -> threading.RLock:
    aid = (agreement_id or "").strip()
    with _FILE_LOCKS_GUARD:
        lock = _FILE_LOCKS.get(aid)
        if lock is None:
            lock = threading.RLock()
            _FILE_LOCKS[aid] = lock
        return lock


def _registry_revision_from_draft(draft: Optional[Dict[str, Any]]) -> int:
    if not isinstance(draft, dict):
        return 0
    reg = draft.get("recipient_delivery_v1")
    if not isinstance(reg, dict):
        return 0
    try:
        return int(reg.get("revision") or 0)
    except (TypeError, ValueError):
        return 0


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


def delete_draft_if_exists(agreement_id: str) -> bool:
    """Best-effort delete of a persisted draft after a failed meter/rollback. Returns True if removed."""
    aid = (agreement_id or "").strip()
    if not aid:
        return False
    if _use_postgres():
        from backend.db.agreement_sql import agreement_postgres_connection, pg_execute

        with agreement_postgres_connection() as cx:
            cur = pg_execute(cx, "DELETE FROM agreement_drafts WHERE id = ?", (aid,))
            return int(getattr(cur, "rowcount", 0) or 0) > 0
    path = _agreement_path(aid)
    if not path.exists():
        return False
    try:
        path.unlink()
        return True
    except OSError:
        return False


def _preserve_security_owned_recipient_delivery(
    incoming: Dict[str, Any],
    durable: Optional[Dict[str, Any]],
) -> bool:
    """
    Treat ``recipient_delivery_v1`` as a security-owned subdocument on generic saves.

    - If durable registry exists and incoming differs (any revision), keep durable exactly.
    - If durable has no registry, strip any incoming registry (CAS-only creation).
    - Never trust equal/higher incoming revision as authority for registry content.

    Returns True when incoming was modified.
    """
    import copy

    incoming_reg = incoming.get("recipient_delivery_v1")
    durable_reg = durable.get("recipient_delivery_v1") if isinstance(durable, dict) else None
    if isinstance(durable_reg, dict):
        if incoming_reg != durable_reg:
            incoming["recipient_delivery_v1"] = copy.deepcopy(durable_reg)
            return True
        return False
    # No durable registry: generic writers may not create one.
    if isinstance(incoming_reg, dict):
        incoming.pop("recipient_delivery_v1", None)
        return True
    return False


# Backward-compatible alias for callers/tests that still reference the prior name.
_preserve_newer_recipient_delivery = _preserve_security_owned_recipient_delivery


def _write_draft_file_unlocked(draft: Dict[str, Any], agreement_id: str) -> None:
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


def _load_draft_file_unlocked(agreement_id: str) -> Optional[Dict[str, Any]]:
    path = _agreement_path(agreement_id)
    if not path.exists():
        return None
    raw = path.read_text(encoding="utf-8")
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise ValueError("invalid_agreement_payload")
    return parsed


def save_draft(
    draft: Dict[str, Any],
    *,
    preserve_newer_recipient_delivery: bool = True,
) -> None:
    """
    Persist an agreement draft.

    When ``preserve_newer_recipient_delivery`` is True (default), generic writers cannot
    replace, clear, weaken, or create ``recipient_delivery_v1`` — the durable security-owned
    registry blob is preserved under lock regardless of incoming revision. Authorized CAS
    registry mutations use ``save_draft_cas`` (or call with preservation disabled only for
    controlled test seeding).
    """
    agreement_id = str(draft.get("id") or "").strip()
    if not agreement_id:
        raise ValueError("missing_id")

    if not preserve_newer_recipient_delivery:
        if _use_postgres():
            _save_draft_postgres_raw(draft, agreement_id)
        else:
            _write_draft_file_unlocked(draft, agreement_id)
        return

    lock = _thread_lock_for(agreement_id)
    with lock:
        if _use_postgres():
            _save_draft_postgres_preserving(draft, agreement_id)
            return
        path = _agreement_path(agreement_id)
        lock_path = path.with_suffix(path.suffix + ".lock")
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        with open(lock_path, "a+", encoding="utf-8") as lf:
            if fcntl is not None:
                fcntl.flock(lf.fileno(), fcntl.LOCK_EX)
            try:
                durable = _load_draft_file_unlocked(agreement_id)
                _preserve_security_owned_recipient_delivery(draft, durable)
                _write_draft_file_unlocked(draft, agreement_id)
            finally:
                if fcntl is not None:
                    fcntl.flock(lf.fileno(), fcntl.LOCK_UN)


def save_draft_cas(draft: Dict[str, Any], *, expected_revision: int) -> None:
    """
    Persist ``draft`` only when on-disk ``recipient_delivery_v1.revision`` equals
    ``expected_revision`` (the revision observed before the in-memory transition).

    The draft being saved must already contain a bumped registry revision
    strictly greater than ``expected_revision``. On conflict, raises
    ``DraftCasConflictError`` and leaves storage unchanged.
    """
    agreement_id = str(draft.get("id") or "").strip()
    if not agreement_id:
        raise ValueError("missing_id")
    new_rev = _registry_revision_from_draft(draft)
    try:
        base = int(expected_revision)
    except (TypeError, ValueError):
        base = 0
    if new_rev <= base:
        raise DraftCasConflictError(
            "invite_replacement_conflict",
            "Draft registry revision was not advanced for CAS persist.",
        )

    lock = _thread_lock_for(agreement_id)
    with lock:
        if _use_postgres():
            _save_draft_postgres_cas(draft, agreement_id, expected_revision=base)
            return
        path = _agreement_path(agreement_id)
        lock_path = path.with_suffix(path.suffix + ".lock")
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        with open(lock_path, "a+", encoding="utf-8") as lf:
            if fcntl is not None:
                fcntl.flock(lf.fileno(), fcntl.LOCK_EX)
            try:
                current_rev = 0
                durable = _load_draft_file_unlocked(agreement_id)
                if durable is not None:
                    current_rev = _registry_revision_from_draft(durable)
                if current_rev != base:
                    raise DraftCasConflictError(
                        "invite_replacement_conflict",
                        "Invite registry revision conflict; reload and retry.",
                    )
                # CAS already validated revision; write incoming registry authoritatively.
                _write_draft_file_unlocked(draft, agreement_id)
            finally:
                if fcntl is not None:
                    fcntl.flock(lf.fileno(), fcntl.LOCK_UN)


def _save_draft_postgres_cas(
    draft: Dict[str, Any],
    agreement_id: str,
    *,
    expected_revision: int,
) -> None:
    from backend.db.agreement_sql import agreement_postgres_connection, pg_execute

    payload_text = canon_json_bytes(draft).decode("utf-8")
    now = datetime.now(timezone.utc)
    with agreement_postgres_connection() as cx:
        cur = pg_execute(
            cx,
            "SELECT payload FROM agreement_drafts WHERE id = ? FOR UPDATE",
            (agreement_id,),
        )
        row = cur.fetchone()
        current_rev = 0
        if row:
            payload = row[0]
            if isinstance(payload, dict):
                current = payload
            else:
                current = json.loads(str(payload))
            if not isinstance(current, dict):
                raise ValueError("invalid_agreement_payload")
            current_rev = _registry_revision_from_draft(current)
        if current_rev != int(expected_revision):
            raise DraftCasConflictError(
                "invite_replacement_conflict",
                "Invite registry revision conflict; reload and retry.",
            )
        if row:
            pg_execute(
                cx,
                """
                UPDATE agreement_drafts
                SET payload = ?::jsonb, updated_at = ?
                WHERE id = ?
                """,
                (payload_text, now, agreement_id),
            )
        else:
            pg_execute(
                cx,
                """
                INSERT INTO agreement_drafts (id, payload, created_at, updated_at)
                VALUES (?, ?::jsonb, ?, ?)
                """,
                (agreement_id, payload_text, now, now),
            )


def _save_draft_postgres_preserving(draft: Dict[str, Any], agreement_id: str) -> None:
    from backend.db.agreement_sql import agreement_postgres_connection, pg_execute

    now = datetime.now(timezone.utc)
    with agreement_postgres_connection() as cx:
        cur = pg_execute(
            cx,
            "SELECT payload FROM agreement_drafts WHERE id = ? FOR UPDATE",
            (agreement_id,),
        )
        row = cur.fetchone()
        durable: Optional[Dict[str, Any]] = None
        if row:
            payload = row[0]
            if isinstance(payload, dict):
                durable = payload
            else:
                durable = json.loads(str(payload))
            if not isinstance(durable, dict):
                raise ValueError("invalid_agreement_payload")
        _preserve_security_owned_recipient_delivery(draft, durable)
        payload_text = canon_json_bytes(draft).decode("utf-8")
        if row:
            pg_execute(
                cx,
                """
                UPDATE agreement_drafts
                SET payload = ?::jsonb, updated_at = ?
                WHERE id = ?
                """,
                (payload_text, now, agreement_id),
            )
        else:
            pg_execute(
                cx,
                """
                INSERT INTO agreement_drafts (id, payload, created_at, updated_at)
                VALUES (?, ?::jsonb, ?, ?)
                """,
                (agreement_id, payload_text, now, now),
            )


def _save_draft_postgres_raw(draft: Dict[str, Any], agreement_id: str) -> None:
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


def _save_draft_postgres(draft: Dict[str, Any], agreement_id: str) -> None:
    _save_draft_postgres_preserving(draft, agreement_id)


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


def _cap_list_limit(limit: Optional[int]) -> Optional[int]:
    if limit is None:
        return None
    return max(1, min(int(limit), 500))


def _json_array_field(raw: Any) -> List[Any]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return []
        return parsed if isinstance(parsed, list) else []
    return []


def _admin_metadata_slice_from_draft(agreement_id: str, draft: Dict[str, Any]) -> Dict[str, Any]:
    """Admin-safe draft projection (no body/purpose/payment fields)."""
    return {
        "id": agreement_id,
        "created_at": draft.get("created_at"),
        "updated_at": draft.get("updated_at"),
        "title": draft.get("title"),
        "review_sent_at": draft.get("review_sent_at"),
        "parties": draft.get("parties") if isinstance(draft.get("parties"), list) else [],
        "audit_log": draft.get("audit_log") if isinstance(draft.get("audit_log"), list) else [],
        "versions": draft.get("versions") if isinstance(draft.get("versions"), list) else [],
    }


def list_draft_agreement_ids_newest_first(limit: Optional[int] = None) -> List[str]:
    """Return draft ids newest first (mtime for files; ``updated_at`` for Postgres)."""
    cap = _cap_list_limit(limit)
    if _use_postgres():
        from backend.db.agreement_sql import agreement_postgres_connection, pg_execute

        with agreement_postgres_connection() as cx:
            if cap is None:
                cur = pg_execute(
                    cx,
                    "SELECT id FROM agreement_drafts ORDER BY updated_at DESC",
                    (),
                )
            else:
                cur = pg_execute(
                    cx,
                    "SELECT id FROM agreement_drafts ORDER BY updated_at DESC LIMIT ?",
                    (cap,),
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
    ids = [aid for _, aid in paths]
    if cap is None:
        return ids
    return ids[:cap]


def _list_draft_admin_metadata_postgres(limit: int) -> List[Dict[str, Any]]:
    from backend.db.agreement_sql import agreement_postgres_connection, pg_execute

    with agreement_postgres_connection() as cx:
        cur = pg_execute(
            cx,
            """
            SELECT
              id,
              payload->>'created_at' AS created_at,
              payload->>'updated_at' AS updated_at,
              payload->>'title' AS title,
              payload->>'review_sent_at' AS review_sent_at,
              payload->'parties' AS parties,
              payload->'audit_log' AS audit_log,
              payload->'versions' AS versions
            FROM agreement_drafts
            ORDER BY updated_at DESC
            LIMIT ?
            """,
            (limit,),
        )
        rows = cur.fetchall()
    out: List[Dict[str, Any]] = []
    for row in rows:
        aid = str(row[0])
        out.append(
            {
                "id": aid,
                "created_at": row[1],
                "updated_at": row[2],
                "title": row[3],
                "review_sent_at": row[4],
                "parties": _json_array_field(row[5]),
                "audit_log": _json_array_field(row[6]),
                "versions": _json_array_field(row[7]),
            }
        )
    return out


def _list_draft_admin_metadata_files(limit: int) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for aid in list_draft_agreement_ids_newest_first(limit=limit):
        try:
            draft = load_draft(aid)
        except Exception:
            continue
        if not isinstance(draft, dict):
            continue
        out.append(_admin_metadata_slice_from_draft(aid, draft))
    return out


def list_draft_admin_metadata_newest_first(limit: int = 200) -> List[Dict[str, Any]]:
    """
    Newest-first admin-safe draft metadata.

    Postgres: one connection, one ``LIMIT`` query with JSONB field projection.
    Local files: bounded id listing then per-file ``load_draft`` (dev/small datasets).
    """
    cap = _cap_list_limit(limit) or 200
    if _use_postgres():
        return _list_draft_admin_metadata_postgres(cap)
    return _list_draft_admin_metadata_files(cap)
