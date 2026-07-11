"""Postgres helpers for anonymous sessions and auth continuation."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from backend.usage_economics.usage_economics_postgres import _tx


def _ts(iso: str) -> str:
    if iso.endswith("Z"):
        return iso.replace("Z", "+00:00")
    return iso


def _row_out(d: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(d)
    for k, v in list(out.items()):
        if isinstance(v, datetime):
            out[k] = v.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return out


def insert_anonymous_session(
    *,
    session_id: str,
    org_id: str,
    token_hash: str,
    created_at: str,
    expires_at: str,
) -> None:
    with _tx() as conn:
        conn.execute(
            """
            INSERT INTO anonymous_sessions (
              session_id, org_id, token_hash, created_at, expires_at, consumed
            ) VALUES (%s, %s, %s, %s::timestamptz, %s::timestamptz, 0)
            """,
            (session_id, org_id, token_hash, _ts(created_at), _ts(expires_at)),
        )


def get_session_by_token_hash(token_hash: str) -> Optional[Dict[str, Any]]:
    with _tx() as conn:
        cur = conn.execute(
            "SELECT * FROM anonymous_sessions WHERE token_hash = %s",
            (token_hash,),
        )
        row = cur.fetchone()
    return _row_out(dict(row)) if row else None


def mark_session_claimed(*, session_id: str, user_id: str, claimed_at: str) -> bool:
    with _tx() as conn:
        cur = conn.execute(
            """
            UPDATE anonymous_sessions
            SET claimed_at = %s::timestamptz, claimed_user_id = %s, consumed = 1
            WHERE session_id = %s AND consumed = 0
            """,
            (_ts(claimed_at), user_id, session_id),
        )
        return int(cur.rowcount or 0) == 1


def insert_auth_continuation(
    *,
    continuation_id: str,
    session_id: str,
    org_id: str,
    agreement_id: Optional[str],
    destination_path: str,
    workflow_stage: Optional[str],
    auth_purpose: Optional[str],
    provider: Optional[str],
    created_at: str,
    expires_at: str,
) -> None:
    with _tx() as conn:
        conn.execute(
            """
            INSERT INTO auth_continuation_transactions (
              continuation_id, session_id, org_id, agreement_id,
              destination_path, workflow_stage, auth_purpose, provider,
              created_at, expires_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::timestamptz, %s::timestamptz)
            """,
            (
                continuation_id,
                session_id,
                org_id,
                agreement_id,
                destination_path,
                workflow_stage,
                auth_purpose,
                provider,
                _ts(created_at),
                _ts(expires_at),
            ),
        )


def get_auth_continuation(continuation_id: str) -> Optional[Dict[str, Any]]:
    with _tx() as conn:
        cur = conn.execute(
            "SELECT * FROM auth_continuation_transactions WHERE continuation_id = %s",
            (continuation_id,),
        )
        row = cur.fetchone()
    return _row_out(dict(row)) if row else None


def consume_auth_continuation(*, continuation_id: str, user_id: str, consumed_at: str) -> bool:
    with _tx() as conn:
        cur = conn.execute(
            """
            UPDATE auth_continuation_transactions
            SET consumed_at = %s::timestamptz, claimed_user_id = %s
            WHERE continuation_id = %s AND consumed_at IS NULL
            """,
            (_ts(consumed_at), user_id, continuation_id),
        )
        return int(cur.rowcount or 0) == 1
