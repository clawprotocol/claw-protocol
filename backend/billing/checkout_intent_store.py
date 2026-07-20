"""Server-bound checkout intents for anonymous create-flow Pro checkout."""

from __future__ import annotations

import os
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import HTTPException

CREATE_FLOW_CHECKOUT_AGREEMENT_ID = "__claw_create_checkout__"

_CHECKOUT_INTENT_FAILED = {
    "code": "checkout_intent_invalid",
    "message": "Checkout intent is not valid for this workspace.",
}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _utc_now_dt() -> datetime:
    return datetime.now(timezone.utc)


def _intent_ttl_hours() -> int:
    try:
        return max(1, int(os.getenv("CLAW_CHECKOUT_INTENT_TTL_HOURS", "24").strip() or "24"))
    except ValueError:
        return 24


def _db_path() -> str:
    from backend.usage_economics.store import usage_economics_db_path

    return usage_economics_db_path()


class CheckoutIntentStore:
    def __init__(self, path: Optional[str] = None) -> None:
        self._path = path or _db_path()
        os.makedirs(os.path.dirname(self._path) or ".", exist_ok=True)

    def init_schema(self) -> None:
        with self._conn() as con:
            con.executescript(
                """
                CREATE TABLE IF NOT EXISTS billing_checkout_intents (
                  intent_id TEXT PRIMARY KEY,
                  org_id TEXT NOT NULL,
                  user_id TEXT,
                  created_at TEXT NOT NULL,
                  expires_at TEXT NOT NULL,
                  consumed_at TEXT,
                  stripe_session_id TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_billing_checkout_intents_org
                  ON billing_checkout_intents (org_id, created_at);
                """
            )

    def _conn(self) -> sqlite3.Connection:
        c = sqlite3.connect(self._path, timeout=30.0)
        c.row_factory = sqlite3.Row
        return c

    def create_intent(self, *, org_id: str, user_id: Optional[str] = None) -> Dict[str, Any]:
        self.init_schema()
        oid = (org_id or "").strip()
        if not oid:
            raise ValueError("org_id_required")
        intent_id = f"ci_{uuid.uuid4().hex}"
        now = _utc_now_dt()
        expires = now + timedelta(hours=_intent_ttl_hours())
        row = {
            "intent_id": intent_id,
            "org_id": oid,
            "user_id": (user_id or "").strip() or None,
            "created_at": now.isoformat().replace("+00:00", "Z"),
            "expires_at": expires.isoformat().replace("+00:00", "Z"),
            "consumed_at": None,
            "stripe_session_id": None,
        }
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO billing_checkout_intents (
                  intent_id, org_id, user_id, created_at, expires_at, consumed_at, stripe_session_id
                ) VALUES (?, ?, ?, ?, ?, NULL, NULL)
                """,
                (
                    row["intent_id"],
                    row["org_id"],
                    row["user_id"],
                    row["created_at"],
                    row["expires_at"],
                ),
            )
        return row

    def get_intent(self, intent_id: str) -> Optional[Dict[str, Any]]:
        self.init_schema()
        iid = (intent_id or "").strip()
        if not iid:
            return None
        with self._conn() as con:
            cur = con.execute(
                "SELECT * FROM billing_checkout_intents WHERE intent_id = ?",
                (iid,),
            )
            row = cur.fetchone()
        return dict(row) if row else None

    def mark_consumed(self, *, intent_id: str, stripe_session_id: str) -> bool:
        self.init_schema()
        iid = (intent_id or "").strip()
        sid = (stripe_session_id or "").strip()
        if not iid:
            return False
        with self._conn() as con:
            cur = con.execute(
                """
                UPDATE billing_checkout_intents
                SET consumed_at = ?, stripe_session_id = ?
                WHERE intent_id = ? AND consumed_at IS NULL
                """,
                (_utc_now(), sid or None, iid),
            )
            return int(cur.rowcount or 0) > 0


_store: Optional[CheckoutIntentStore] = None


def get_checkout_intent_store() -> CheckoutIntentStore:
    global _store
    if _store is None:
        _store = CheckoutIntentStore()
    return _store


def reset_checkout_intent_store_for_tests() -> None:
    global _store
    _store = None


def create_create_flow_checkout_intent(*, org_id: str, user_id: Optional[str] = None) -> Dict[str, Any]:
    return get_checkout_intent_store().create_intent(org_id=org_id, user_id=user_id)


def assert_create_flow_checkout_intent_for_verify(
    *,
    intent_id: str,
    org_id: str,
    request_user_id: Optional[str],
    stripe_session_id: str,
) -> None:
    """Fail closed unless the intent belongs to this workspace and is unused."""
    row = get_checkout_intent_store().get_intent(intent_id)
    if not row:
        raise HTTPException(status_code=403, detail=dict(_CHECKOUT_INTENT_FAILED))
    if str(row.get("org_id") or "").strip() != (org_id or "").strip():
        raise HTTPException(status_code=403, detail=dict(_CHECKOUT_INTENT_FAILED))
    intent_user = str(row.get("user_id") or "").strip()
    req_user = (request_user_id or "").strip()
    if intent_user and req_user and intent_user != req_user:
        raise HTTPException(status_code=403, detail=dict(_CHECKOUT_INTENT_FAILED))
    exp_raw = str(row.get("expires_at") or "")
    if exp_raw:
        try:
            exp = datetime.fromisoformat(exp_raw.replace("Z", "+00:00"))
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if _utc_now_dt() > exp:
                raise HTTPException(status_code=403, detail=dict(_CHECKOUT_INTENT_FAILED))
        except HTTPException:
            raise
        except Exception:
            pass
    if row.get("consumed_at"):
        consumed_sid = str(row.get("stripe_session_id") or "").strip()
        if consumed_sid and consumed_sid == (stripe_session_id or "").strip():
            return
        raise HTTPException(status_code=403, detail=dict(_CHECKOUT_INTENT_FAILED))
    if not get_checkout_intent_store().mark_consumed(intent_id=intent_id, stripe_session_id=stripe_session_id):
        raise HTTPException(status_code=403, detail=dict(_CHECKOUT_INTENT_FAILED))
