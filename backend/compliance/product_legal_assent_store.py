"""Server-backed storage for product signup Terms + Privacy assent (audit trail)."""

from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from backend.compliance.acknowledgement_store import compliance_db_path


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _hash_optional(value: str | None, salt: str) -> str | None:
    if not value or not str(value).strip():
        return None
    raw = f"{salt}:{value.strip()}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


class ProductLegalAssentStore:
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
                CREATE TABLE IF NOT EXISTS product_signup_legal_assents (
                  id TEXT PRIMARY KEY,
                  server_received_at TEXT NOT NULL,
                  assent_timestamp_iso TEXT NOT NULL,
                  terms_version_id TEXT NOT NULL,
                  privacy_version_id TEXT NOT NULL,
                  legal_ack_version INTEGER NOT NULL,
                  user_ref TEXT,
                  org_id TEXT,
                  authenticated_user_id TEXT,
                  client_assent_id TEXT,
                  auth_path TEXT,
                  user_agent_hash TEXT,
                  client_ip_hash TEXT,
                  meta_json TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_pla_received ON product_signup_legal_assents (server_received_at);
                CREATE INDEX IF NOT EXISTS idx_pla_client ON product_signup_legal_assents (client_assent_id);
                CREATE INDEX IF NOT EXISTS idx_pla_org ON product_signup_legal_assents (org_id);
                """
            )

    def record_assent(
        self,
        *,
        assent_timestamp_iso: str,
        terms_version_id: str,
        privacy_version_id: str,
        legal_ack_version: int,
        user_ref: Optional[str] = None,
        org_id: Optional[str] = None,
        authenticated_user_id: Optional[str] = None,
        client_assent_id: Optional[str] = None,
        auth_path: Optional[str] = None,
        client_ip: Optional[str] = None,
        user_agent: Optional[str] = None,
        meta: Optional[Dict[str, Any]] = None,
    ) -> str:
        self.init_schema()
        aid = f"psa_{uuid.uuid4().hex}"
        salt = os.getenv("CLAW_COMPLIANCE_HASH_SALT", "claw_compliance_v1").strip() or "claw_compliance_v1"
        ip_log = os.getenv("CLAW_COMPLIANCE_LOG_CLIENT_IP", "0").strip().lower() in ("1", "true", "yes")
        ip_plain = str(client_ip).strip() if client_ip is not None else ""
        ip_h = _hash_optional(ip_plain or None, salt) if ip_log else None
        ua_plain = str(user_agent).strip() if user_agent is not None else ""
        ua_h = _hash_optional(ua_plain or None, salt)
        meta_json = json.dumps(meta or {}, sort_keys=True, separators=(",", ":"))
        now = _utc_now()
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO product_signup_legal_assents (
                  id, server_received_at, assent_timestamp_iso, terms_version_id, privacy_version_id,
                  legal_ack_version, user_ref, org_id, authenticated_user_id, client_assent_id, auth_path,
                  user_agent_hash, client_ip_hash, meta_json
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    aid,
                    now,
                    assent_timestamp_iso.strip(),
                    terms_version_id.strip(),
                    privacy_version_id.strip(),
                    legal_ack_version,
                    user_ref.strip() if user_ref and str(user_ref).strip() else None,
                    org_id.strip() if org_id and str(org_id).strip() else None,
                    authenticated_user_id.strip()
                    if authenticated_user_id and str(authenticated_user_id).strip()
                    else None,
                    client_assent_id.strip() if client_assent_id and str(client_assent_id).strip() else None,
                    auth_path.strip() if auth_path and str(auth_path).strip() else None,
                    ua_h,
                    ip_h,
                    meta_json,
                ),
            )
            con.commit()
        return aid


def get_product_legal_assent_store() -> ProductLegalAssentStore:
    """New instance each call so `CLAW_COMPLIANCE_DB_PATH` changes (e.g. tests) are respected."""
    return ProductLegalAssentStore()
