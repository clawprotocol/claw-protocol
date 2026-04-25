from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from backend.config.runtime_environment import data_dir


def compliance_db_path() -> str:
    env = os.getenv("CLAW_COMPLIANCE_DB_PATH", "").strip()
    if env:
        return os.path.expanduser(env)
    return os.path.join(data_dir(), "compliance_acknowledgements.sqlite3")


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _hash_optional(value: str | None, salt: str) -> str | None:
    if not value or not str(value).strip():
        return None
    raw = f"{salt}:{value.strip()}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


class AcknowledgementStore:
    def __init__(self, path: Optional[str] = None) -> None:
        self._path = path or compliance_db_path()
        os.makedirs(os.path.dirname(self._path) or ".", exist_ok=True)

    def _conn(self) -> sqlite3.Connection:
        c = sqlite3.connect(self._path, timeout=30.0)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL;")
        return c

    def init_schema(self) -> None:
        with self._conn() as con:
            con.executescript(
                """
                CREATE TABLE IF NOT EXISTS compliance_acknowledgements (
                  id TEXT PRIMARY KEY,
                  disclosure_key TEXT NOT NULL,
                  disclosure_version TEXT NOT NULL,
                  disclosure_hash TEXT NOT NULL,
                  org_id TEXT,
                  user_ref TEXT,
                  subject_type TEXT,
                  subject_id TEXT,
                  accepted_at TEXT NOT NULL,
                  client_ip_hash TEXT,
                  user_agent_hash TEXT,
                  meta_json TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_ack_org ON compliance_acknowledgements (org_id);
                CREATE INDEX IF NOT EXISTS idx_ack_disclosure ON compliance_acknowledgements (disclosure_key, disclosure_version);
                """
            )

    def record_acknowledgement(
        self,
        *,
        disclosure_key: str,
        disclosure_version: str,
        disclosure_hash: str,
        org_id: Optional[str] = None,
        user_ref: Optional[str] = None,
        subject_type: Optional[str] = None,
        subject_id: Optional[str] = None,
        client_ip: Optional[str] = None,
        user_agent: Optional[str] = None,
        meta: Optional[Dict[str, Any]] = None,
    ) -> str:
        self.init_schema()
        aid = f"ack_{uuid.uuid4().hex}"
        salt = os.getenv("CLAW_COMPLIANCE_HASH_SALT", "claw_compliance_v1").strip() or "claw_compliance_v1"
        ip_log = os.getenv("CLAW_COMPLIANCE_LOG_CLIENT_IP", "0").strip().lower() in ("1", "true", "yes")
        ip_h = _hash_optional(client_ip.strip() if client_ip else None, salt) if ip_log else None
        ua_h = _hash_optional(user_agent.strip() if user_agent else None, salt)
        meta_json = json.dumps(meta or {}, sort_keys=True, separators=(",", ":"))
        now = _utc_now()
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO compliance_acknowledgements (
                  id, disclosure_key, disclosure_version, disclosure_hash,
                  org_id, user_ref, subject_type, subject_id,
                  accepted_at, client_ip_hash, user_agent_hash, meta_json
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    aid,
                    disclosure_key,
                    disclosure_version,
                    disclosure_hash,
                    org_id,
                    user_ref,
                    subject_type,
                    subject_id,
                    now,
                    ip_h,
                    ua_h,
                    meta_json,
                ),
            )
            con.commit()
        return aid


_store: AcknowledgementStore | None = None


def get_acknowledgement_store() -> AcknowledgementStore:
    global _store
    if _store is None:
        _store = AcknowledgementStore()
    return _store
