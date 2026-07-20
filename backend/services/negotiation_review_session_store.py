"""Durable negotiation-review session persistence (GTM Security Slice 3B)."""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from backend.utils.canon_json import canon_json_bytes

NEGOTIATION_REVIEW_SESSIONS_FIELD = "negotiation_review_sessions_v1"
NEGOTIATION_REVIEW_SESSIONS_VERSION = 1
NEGOTIATION_REVIEW_SESSION_VERSION = 1
REVIEW_BOOTSTRAP_INVALID_OR_EXPIRED = "review_bootstrap_invalid_or_expired"
REVIEW_BOOTSTRAP_INVALID_OR_EXPIRED_MESSAGE = (
    "This review link is invalid, expired, or no longer available."
)


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _sessions_dir() -> Path:
    base = os.getenv("CLAW_DATA_DIR", "").strip()
    root = Path(base).expanduser() if base else (_repo_root() / "data")
    path = root / "negotiation_review_sessions"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _index_path() -> Path:
    return _sessions_dir() / "session_lookup.sqlite3"


def _use_postgres() -> bool:
    from backend.db.config import use_postgresql_for_agreements

    return use_postgresql_for_agreements()


def session_token_hash(token: str) -> str:
    import hashlib

    return hashlib.sha256((token or "").encode("utf-8")).hexdigest()


def mint_session_secret() -> str:
    import secrets

    return secrets.token_urlsafe(32)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def sessions_field_material(record: Dict[str, Any]) -> bytes:
    if not isinstance(record, dict):
        return b""
    sessions = record.get("sessions")
    if not isinstance(sessions, dict):
        return canon_json_bytes({"v": record.get("v"), "sessions": {}})
    return canon_json_bytes({"v": record.get("v"), "sessions": sessions})


def empty_sessions_field() -> Dict[str, Any]:
    return {"v": NEGOTIATION_REVIEW_SESSIONS_VERSION, "sessions": {}}


def get_sessions_field(draft: Dict[str, Any]) -> Dict[str, Any]:
    raw = draft.get(NEGOTIATION_REVIEW_SESSIONS_FIELD)
    if isinstance(raw, dict) and isinstance(raw.get("sessions"), dict):
        return raw
    return empty_sessions_field()


def find_session_in_draft_by_token_hash(
    draft: Dict[str, Any], token_hash: str
) -> Optional[Dict[str, Any]]:
    th = (token_hash or "").strip()
    if not th:
        return None
    sessions = get_sessions_field(draft).get("sessions") or {}
    if not isinstance(sessions, dict):
        return None
    for session in sessions.values():
        if not isinstance(session, dict):
            continue
        if _clean(session.get("token_hash")) == th:
            return session
    return None


def find_session_in_draft_by_id(
    draft: Dict[str, Any], session_id: str
) -> Optional[Dict[str, Any]]:
    sid = (session_id or "").strip()
    if not sid:
        return None
    session = (get_sessions_field(draft).get("sessions") or {}).get(sid)
    return session if isinstance(session, dict) else None


def count_sessions_in_draft(draft: Dict[str, Any]) -> int:
    sessions = get_sessions_field(draft).get("sessions") or {}
    if not isinstance(sessions, dict):
        return 0
    return len(sessions)


def apply_session_to_draft(draft: Dict[str, Any], session_record: Dict[str, Any]) -> Dict[str, Any]:
    next_draft = dict(draft)
    container = dict(get_sessions_field(next_draft))
    sessions = dict(container.get("sessions") or {})
    sid = _clean(session_record.get("session_id"))
    if not sid:
        raise ValueError("missing_session_id")
    sessions[sid] = dict(session_record)
    container["v"] = NEGOTIATION_REVIEW_SESSIONS_VERSION
    container["sessions"] = sessions
    next_draft[NEGOTIATION_REVIEW_SESSIONS_FIELD] = container
    return next_draft


def apply_session_revocation_to_draft(
    draft: Dict[str, Any], *, session_id: str, revoked_at: str
) -> Tuple[Dict[str, Any], bool]:
    sid = (session_id or "").strip()
    if not sid:
        return draft, False
    next_draft = dict(draft)
    container = dict(get_sessions_field(next_draft))
    sessions = dict(container.get("sessions") or {})
    current = sessions.get(sid)
    if not isinstance(current, dict) or _clean(current.get("revoked_at")):
        return draft, False
    updated = dict(current)
    updated["revoked_at"] = revoked_at
    sessions[sid] = updated
    container["sessions"] = sessions
    next_draft[NEGOTIATION_REVIEW_SESSIONS_FIELD] = container
    return next_draft, True


def apply_session_last_seen_to_draft(
    draft: Dict[str, Any], *, session_id: str, last_seen_at: str
) -> Tuple[Dict[str, Any], bool]:
    sid = (session_id or "").strip()
    if not sid:
        return draft, False
    next_draft = dict(draft)
    container = dict(get_sessions_field(next_draft))
    sessions = dict(container.get("sessions") or {})
    current = sessions.get(sid)
    if not isinstance(current, dict):
        return draft, False
    updated = dict(current)
    updated["last_seen_at"] = last_seen_at
    sessions[sid] = updated
    container["sessions"] = sessions
    next_draft[NEGOTIATION_REVIEW_SESSIONS_FIELD] = container
    return next_draft, True


def build_session_record(
    *,
    agreement_id: str,
    locked_version_id: str,
    content_sha256: str,
    party_id: str,
    role: str,
    consumed_token_jti: str,
    recipient_display_name: str,
    agreement_title: str,
    token_hash: str,
    created_at: str,
    expires_at: str,
    session_id: Optional[str] = None,
) -> Dict[str, Any]:
    sid = (session_id or uuid.uuid4().hex).strip()
    return {
        "v": NEGOTIATION_REVIEW_SESSION_VERSION,
        "session_id": sid,
        "token_hash": token_hash,
        "agreement_id": agreement_id,
        "locked_version_id": locked_version_id,
        "content_sha256": content_sha256,
        "party_id": party_id,
        "role": role,
        "consumed_token_jti": consumed_token_jti,
        "recipient_display_name": recipient_display_name,
        "agreement_title": agreement_title,
        "created_at": created_at,
        "expires_at": expires_at,
        "revoked_at": None,
        "last_seen_at": None,
    }


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _index_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(_index_path()), timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn


def init_session_lookup_index() -> None:
    if _use_postgres():
        return
    with _index_conn() as con:
        con.executescript(
            """
            CREATE TABLE IF NOT EXISTS negotiation_review_session_lookup (
              token_hash TEXT PRIMARY KEY,
              agreement_id TEXT NOT NULL,
              session_id TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_negotiation_review_session_lookup_agreement
              ON negotiation_review_session_lookup (agreement_id);
            """
        )


def upsert_session_lookup_hint(record: Dict[str, Any]) -> None:
    """Best-effort, non-authoritative lookup hint for file mode."""
    if _use_postgres():
        return
    th = _clean(record.get("token_hash"))
    aid = _clean(record.get("agreement_id"))
    sid = _clean(record.get("session_id"))
    if not th or not aid or not sid:
        return
    init_session_lookup_index()
    with _index_conn() as con:
        con.execute(
            """
            INSERT INTO negotiation_review_session_lookup (token_hash, agreement_id, session_id)
            VALUES (?, ?, ?)
            ON CONFLICT(token_hash) DO UPDATE SET
              agreement_id = excluded.agreement_id,
              session_id = excluded.session_id
            """,
            (th, aid, sid),
        )


def lookup_session_hint(token_hash: str) -> Optional[Tuple[str, str]]:
    th = (token_hash or "").strip()
    if not th or _use_postgres():
        return None
    init_session_lookup_index()
    with _index_conn() as con:
        row = con.execute(
            "SELECT agreement_id, session_id FROM negotiation_review_session_lookup WHERE token_hash = ?",
            (th,),
        ).fetchone()
        if not row:
            return None
        return str(row[0]), str(row[1])


def _load_authoritative_session_from_draft(
    agreement_id: str, *, token_hash: str, session_id: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    from backend.services.agreement_draft_store import load_draft

    aid = (agreement_id or "").strip()
    th = (token_hash or "").strip()
    if not aid or not th:
        return None
    try:
        draft = load_draft(aid)
    except KeyError:
        return None
    if session_id:
        session = find_session_in_draft_by_id(draft, session_id)
    else:
        session = find_session_in_draft_by_token_hash(draft, th)
    if not session or _clean(session.get("token_hash")) != th:
        return None
    return session


def _scan_drafts_for_session(token_hash: str) -> Optional[Dict[str, Any]]:
    from backend.services.agreement_draft_store import _agreements_dir, _decode_draft_payload

    th = (token_hash or "").strip()
    if not th:
        return None
    agreements_dir = _agreements_dir()
    for path in agreements_dir.glob("*.json"):
        if path.name.startswith("."):
            continue
        try:
            draft = _decode_draft_payload(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        session = find_session_in_draft_by_token_hash(draft, th)
        if session:
            try:
                upsert_session_lookup_hint(session)
            except Exception:
                pass
            return session
    return None


def _session_record_from_postgres_row(row: Any) -> Optional[Dict[str, Any]]:
    if not row:
        return None
    payload = row[0]
    revoked_at_column = row[1] if len(row) > 1 else None
    if revoked_at_column:
        return None
    session = payload if isinstance(payload, dict) else json.loads(str(payload))
    if not isinstance(session, dict):
        return None
    if _clean(session.get("revoked_at")) or _clean(revoked_at_column):
        return None
    return session


def get_session_by_token_hash(token_hash: str) -> Optional[Dict[str, Any]]:
    th = (token_hash or "").strip()
    if not th:
        return None
    if _use_postgres():
        from backend.db.agreement_sql import agreement_postgres_connection, pg_execute

        with agreement_postgres_connection() as cx:
            row = pg_execute(
                cx,
                """
                SELECT payload, revoked_at
                FROM negotiation_review_sessions
                WHERE token_hash = ?
                """,
                (th,),
            ).fetchone()
            return _session_record_from_postgres_row(row)

    hint = lookup_session_hint(th)
    if hint:
        agreement_id, session_id = hint
        session = _load_authoritative_session_from_draft(
            agreement_id, token_hash=th, session_id=session_id
        )
        if session:
            return session
    return _scan_drafts_for_session(th)


def insert_session_postgres(cx: Any, record: Dict[str, Any]) -> None:
    from backend.db.agreement_sql import pg_execute

    payload_text = json.dumps(record, separators=(",", ":"), ensure_ascii=False)
    pg_execute(
        cx,
        """
        INSERT INTO negotiation_review_sessions (
          session_id, token_hash, agreement_id, payload, created_at, expires_at, revoked_at
        ) VALUES (?, ?, ?, ?::jsonb, ?, ?, NULL)
        """,
        (
            record["session_id"],
            record["token_hash"],
            record["agreement_id"],
            payload_text,
            record["created_at"],
            record["expires_at"],
        ),
    )


def revoke_session(
    *,
    session_id: str,
    revoked_at: str,
    agreement_id: Optional[str] = None,
    cx: Any | None = None,
) -> bool:
    sid = (session_id or "").strip()
    if not sid:
        return False
    if _use_postgres():
        from backend.db.agreement_sql import agreement_postgres_connection, pg_execute

        if cx is not None:
            cur = pg_execute(
                cx,
                """
                UPDATE negotiation_review_sessions
                SET revoked_at = ?
                WHERE session_id = ? AND revoked_at IS NULL
                """,
                (revoked_at, sid),
            )
            return cur.rowcount == 1
        with agreement_postgres_connection() as pg_cx:
            cur = pg_execute(
                pg_cx,
                """
                UPDATE negotiation_review_sessions
                SET revoked_at = ?
                WHERE session_id = ? AND revoked_at IS NULL
                """,
                (revoked_at, sid),
            )
            return cur.rowcount == 1

    aid = (agreement_id or "").strip()
    if not aid:
        return False
    from backend.services.agreement_draft_store import (
        _agreement_path,
        _decode_draft_payload,
        _write_draft_file_unlocked,
        agreement_file_lock,
    )

    with agreement_file_lock(aid):
        path = _agreement_path(aid)
        draft = _decode_draft_payload(path.read_text(encoding="utf-8"))
        next_draft, changed = apply_session_revocation_to_draft(
            draft, session_id=sid, revoked_at=revoked_at
        )
        if not changed:
            return False
        _write_draft_file_unlocked(path, next_draft)
    return True


def touch_last_seen(*, session_id: str, last_seen_at: str, agreement_id: Optional[str] = None) -> None:
    sid = (session_id or "").strip()
    if not sid:
        return
    if _use_postgres():
        from backend.db.agreement_sql import agreement_postgres_connection, pg_execute

        with agreement_postgres_connection() as cx:
            row = pg_execute(
                cx,
                "SELECT payload, revoked_at FROM negotiation_review_sessions WHERE session_id = ?",
                (sid,),
            ).fetchone()
            session = _session_record_from_postgres_row(row)
            if not session:
                return
            session["last_seen_at"] = last_seen_at
            pg_execute(
                cx,
                """
                UPDATE negotiation_review_sessions
                SET payload = ?::jsonb
                WHERE session_id = ?
                """,
                (json.dumps(session, separators=(",", ":"), ensure_ascii=False), sid),
            )
        return

    aid = (agreement_id or "").strip()
    if not aid:
        return
    from backend.services.agreement_draft_store import (
        _agreement_path,
        _decode_draft_payload,
        _write_draft_file_unlocked,
        agreement_file_lock,
    )

    with agreement_file_lock(aid):
        path = _agreement_path(aid)
        draft = _decode_draft_payload(path.read_text(encoding="utf-8"))
        next_draft, changed = apply_session_last_seen_to_draft(
            draft, session_id=sid, last_seen_at=last_seen_at
        )
        if changed:
            _write_draft_file_unlocked(path, next_draft)


def count_sessions_for_agreement(agreement_id: str) -> int:
    aid = (agreement_id or "").strip()
    if not aid:
        return 0
    if _use_postgres():
        from backend.db.agreement_sql import agreement_postgres_connection, pg_execute

        with agreement_postgres_connection() as cx:
            row = pg_execute(
                cx,
                "SELECT COUNT(*) FROM negotiation_review_sessions WHERE agreement_id = ?",
                (aid,),
            ).fetchone()
            return int(row[0]) if row else 0
    from backend.services.agreement_draft_store import load_draft

    try:
        draft = load_draft(aid)
    except KeyError:
        return 0
    return count_sessions_in_draft(draft)


def reset_negotiation_review_session_store_for_tests() -> None:
    """Clear file-mode lookup index between tests."""
    if _use_postgres():
        return
    path = _index_path()
    if path.exists():
        path.unlink()
