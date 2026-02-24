from __future__ import annotations

import hashlib
import os
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _data_dir() -> str:
    env = os.getenv("CLAW_DATA_DIR", "").strip()
    if env:
        return os.path.expanduser(env)
    prod = "/var/lib/claw"
    try:
        if os.path.isdir(prod) and os.access(prod, os.W_OK):
            return prod
    except Exception:
        pass
    return os.path.expanduser("~/.claw")


def _db_path() -> str:
    return os.path.expanduser(
        os.getenv("CLAW_AGREEMENT_DB_PATH", os.path.join(_data_dir(), "agreements.sqlite3"))
    )


class AgreementVersionStore:
    def __init__(self, db_path: Optional[str] = None) -> None:
        self.db_path = db_path or _db_path()
        self._init_db()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        return conn

    def _init_db(self) -> None:
        os.makedirs(os.path.dirname(self.db_path) or ".", exist_ok=True)
        with self._conn() as c:
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS agreement_versions (
                    agreement_id TEXT NOT NULL,
                    version INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    title TEXT NOT NULL,
                    body_markdown TEXT NOT NULL,
                    body_sha256 TEXT NOT NULL,
                    disclaimers_json TEXT,
                    metadata_json TEXT,
                    PRIMARY KEY (agreement_id, version)
                )
                """
            )

    def save_version(
        self,
        *,
        agreement_id: str,
        title: str,
        body_markdown: str,
        created_at: Optional[str],
        disclaimers: Optional[List[str]],
        metadata: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        created_at = created_at or _utc_now_iso()
        body_sha256 = hashlib.sha256(body_markdown.encode("utf-8")).hexdigest()
        with self._conn() as c:
            row = c.execute(
                "SELECT MAX(version) AS v FROM agreement_versions WHERE agreement_id = ?",
                (agreement_id,),
            ).fetchone()
            next_version = 1 if row["v"] is None else int(row["v"]) + 1
            c.execute(
                """
                INSERT INTO agreement_versions
                (agreement_id, version, created_at, title, body_markdown, body_sha256, disclaimers_json, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    agreement_id,
                    next_version,
                    created_at,
                    title,
                    body_markdown,
                    body_sha256,
                    _json_dump(disclaimers) if disclaimers is not None else None,
                    _json_dump(metadata) if metadata is not None else None,
                ),
            )
        return {
            "agreement_id": agreement_id,
            "version": next_version,
            "body_sha256": body_sha256,
            "created_at": created_at,
        }

    def list_versions(self, *, agreement_id: str) -> List[Dict[str, Any]]:
        with self._conn() as c:
            rows = c.execute(
                """
                SELECT agreement_id, version, created_at, title, body_sha256
                FROM agreement_versions
                WHERE agreement_id = ?
                ORDER BY version DESC
                """,
                (agreement_id,),
            ).fetchall()
        return [dict(r) for r in rows]

    def get_version(self, *, agreement_id: str, version: int) -> Dict[str, Any]:
        with self._conn() as c:
            row = c.execute(
                """
                SELECT * FROM agreement_versions
                WHERE agreement_id = ? AND version = ?
                """,
                (agreement_id, version),
            ).fetchone()
        if not row:
            raise KeyError("agreement_version_not_found")
        data = dict(row)
        data["disclaimers"] = _json_load(data.get("disclaimers_json"))
        data["metadata"] = _json_load(data.get("metadata_json"))
        data.pop("disclaimers_json", None)
        data.pop("metadata_json", None)
        return data

    def diff_versions(
        self, *, agreement_id: str, from_version: int, to_version: int
    ) -> Dict[str, Any]:
        a = self.get_version(agreement_id=agreement_id, version=from_version)
        b = self.get_version(agreement_id=agreement_id, version=to_version)
        a_text = _normalize_newlines(a.get("body_markdown") or "")
        b_text = _normalize_newlines(b.get("body_markdown") or "")
        diff_lines = _unified_diff(a_text, b_text, agreement_id, from_version, to_version)
        diff_text = "".join(diff_lines)
        diff_sha256 = hashlib.sha256(diff_text.encode("utf-8")).hexdigest()
        return {
            "ok": True,
            "diff_text": diff_text,
            "diff_sha256": diff_sha256,
        }


def _json_dump(obj: Any) -> str:
    import json

    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _json_load(data: Optional[str]) -> Any:
    if not data:
        return None
    import json

    return json.loads(data)


def _normalize_newlines(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n")


def _unified_diff(
    a_text: str, b_text: str, agreement_id: str, from_version: int, to_version: int
) -> List[str]:
    import difflib

    header = [
        f"agreement_id: {agreement_id}\n",
        f"from_version: {from_version}\n",
        f"to_version: {to_version}\n",
        "\n",
    ]
    diff = list(
        difflib.unified_diff(
            a_text.splitlines(keepends=True),
            b_text.splitlines(keepends=True),
            fromfile=f"v{from_version}",
            tofile=f"v{to_version}",
        )
    )
    return header + diff
