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
import fcntl
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional

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


@contextmanager
def _agreement_file_lock(agreement_id: str) -> Iterator[None]:
    lock_path = _agreements_dir() / f".{agreement_id}.lock"
    with lock_path.open("a+b") as lock_file:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)


def _decode_draft_payload(raw: Any) -> Dict[str, Any]:
    parsed = raw if isinstance(raw, dict) else json.loads(str(raw))
    if not isinstance(parsed, dict):
        raise ValueError("invalid_agreement_payload")
    return parsed


def _frozen_material(record: Dict[str, Any]) -> bytes:
    return canon_json_bytes({key: value for key, value in record.items() if key != "frozenAt"})


def _preserve_frozen_audit(current: Dict[str, Any], next_draft: Dict[str, Any]) -> None:
    frozen_events = [
        event
        for event in (current.get("audit_log") or [])
        if isinstance(event, dict) and event.get("event_type") == "frozen_signing_authority_persisted"
    ]
    if not frozen_events:
        return
    audit = list(next_draft.get("audit_log") or [])
    existing = {canon_json_bytes(event) for event in audit if isinstance(event, dict)}
    for event in frozen_events:
        encoded = canon_json_bytes(event)
        if encoded not in existing:
            audit.append(event)
            existing.add(encoded)
    next_draft["audit_log"] = audit


def _guard_generic_frozen_write(
    current: Optional[Dict[str, Any]], draft: Dict[str, Any]
) -> Dict[str, Any]:
    next_draft = dict(draft)
    incoming_frozen = next_draft.get("frozen_signing_authority_v1")
    existing_frozen = (current or {}).get("frozen_signing_authority_v1")
    if isinstance(existing_frozen, dict):
        if incoming_frozen is None:
            next_draft["frozen_signing_authority_v1"] = existing_frozen
        elif canon_json_bytes(incoming_frozen) != canon_json_bytes(existing_frozen):
            raise ValueError("frozen_signing_authority_immutable")
        _preserve_frozen_audit(current or {}, next_draft)
    elif isinstance(incoming_frozen, dict):
        raise ValueError("frozen_signing_authority_endpoint_required")
    return next_draft


def _write_draft_file_unlocked(path: Path, draft: Dict[str, Any]) -> None:
    data = canon_json_bytes(draft)
    fd, tmp_name = tempfile.mkstemp(prefix=f"{path.stem}_", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_name, path)
        dir_fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)


def save_draft(draft: Dict[str, Any]) -> None:
    agreement_id = str(draft.get("id") or "").strip()
    if not agreement_id:
        raise ValueError("missing_id")
    if _use_postgres():
        _save_draft_postgres(draft, agreement_id)
        return
    path = _agreement_path(agreement_id)
    with _agreement_file_lock(agreement_id):
        current = _decode_draft_payload(path.read_text(encoding="utf-8")) if path.exists() else None
        _write_draft_file_unlocked(path, _guard_generic_frozen_write(current, draft))


def _save_draft_postgres(draft: Dict[str, Any], agreement_id: str) -> None:
    from backend.db.agreement_sql import agreement_postgres_connection, pg_execute

    now = datetime.now(timezone.utc)
    with agreement_postgres_connection() as cx:
        current_row = pg_execute(
            cx,
            "SELECT payload FROM agreement_drafts WHERE id = ? FOR UPDATE",
            (agreement_id,),
        ).fetchone()
        current = _decode_draft_payload(current_row[0]) if current_row else None
        payload_text = canon_json_bytes(
            _guard_generic_frozen_write(current, draft)
        ).decode("utf-8")
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


def _create_frozen_on_latest(
    latest: Dict[str, Any],
    *,
    frozen_record: Dict[str, Any],
    audit_event: Dict[str, Any],
    updated_at: str,
) -> tuple[Dict[str, Any], Optional[Dict[str, Any]]]:
    existing = latest.get("frozen_signing_authority_v1")
    if isinstance(existing, dict):
        if _frozen_material(existing) == _frozen_material(frozen_record):
            return existing, None
        raise ValueError("frozen_signing_authority_immutable")
    next_draft = dict(latest)
    next_draft["frozen_signing_authority_v1"] = frozen_record
    audit = list(latest.get("audit_log") or [])
    audit.append(dict(audit_event))
    next_draft["audit_log"] = audit
    next_draft["updated_at"] = updated_at
    return frozen_record, next_draft


def create_frozen_signing_authority(
    agreement_id: str,
    *,
    frozen_record: Dict[str, Any],
    audit_event: Dict[str, Any],
    updated_at: str,
) -> Dict[str, Any]:
    """Atomically create immutable frozen authority or return an identical existing record."""
    aid = str(agreement_id or "").strip()
    if not aid:
        raise ValueError("missing_agreement_id")
    if not isinstance(frozen_record, dict):
        raise ValueError("invalid_frozen_signing_authority")
    if _use_postgres():
        return _create_frozen_signing_authority_postgres(
            aid,
            frozen_record=frozen_record,
            audit_event=audit_event,
            updated_at=updated_at,
        )

    path = _agreement_path(aid)
    with _agreement_file_lock(aid):
        if not path.exists():
            raise KeyError("agreement_not_found")
        latest = _decode_draft_payload(path.read_text(encoding="utf-8"))
        stored, next_draft = _create_frozen_on_latest(
            latest,
            frozen_record=frozen_record,
            audit_event=audit_event,
            updated_at=updated_at,
        )
        if next_draft is not None:
            _write_draft_file_unlocked(path, next_draft)
        return stored


def _create_frozen_signing_authority_postgres(
    agreement_id: str,
    *,
    frozen_record: Dict[str, Any],
    audit_event: Dict[str, Any],
    updated_at: str,
) -> Dict[str, Any]:
    from backend.db.agreement_sql import agreement_postgres_connection, pg_execute

    with agreement_postgres_connection() as cx:
        row = pg_execute(
            cx,
            "SELECT payload FROM agreement_drafts WHERE id = ? FOR UPDATE",
            (agreement_id,),
        ).fetchone()
        if not row:
            raise KeyError("agreement_not_found")
        latest = _decode_draft_payload(row[0])
        stored, next_draft = _create_frozen_on_latest(
            latest,
            frozen_record=frozen_record,
            audit_event=audit_event,
            updated_at=updated_at,
        )
        if next_draft is not None:
            pg_execute(
                cx,
                """
                UPDATE agreement_drafts
                SET payload = ?::jsonb, updated_at = ?
                WHERE id = ?
                """,
                (
                    canon_json_bytes(next_draft).decode("utf-8"),
                    datetime.now(timezone.utc),
                    agreement_id,
                ),
            )
        return stored


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
