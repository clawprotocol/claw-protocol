"""SQLite index for Agreement Memory — not used for receipts, hashes, or deterministic proof."""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.config.runtime_environment import data_dir


def agreement_memory_db_path() -> str:
    env = os.getenv("CLAW_AGREEMENT_MEMORY_DB_PATH", "").strip()
    if env:
        return os.path.expanduser(env)
    return os.path.join(data_dir(), "agreement_memory.sqlite3")


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class AgreementMemoryStore:
    def __init__(self, path: Optional[str] = None) -> None:
        self._path = path or agreement_memory_db_path()
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
                CREATE TABLE IF NOT EXISTS memory_documents (
                  agreement_id TEXT NOT NULL,
                  org_id TEXT NOT NULL,
                  title TEXT,
                  document_type TEXT,
                  status TEXT,
                  party_names_json TEXT NOT NULL DEFAULT '[]',
                  effective_date TEXT,
                  monetary_terms TEXT,
                  clause_tags_json TEXT NOT NULL DEFAULT '[]',
                  linked_timeline_id TEXT,
                  linked_receipt_ids_json TEXT NOT NULL DEFAULT '[]',
                  version_ids_json TEXT NOT NULL DEFAULT '[]',
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  embedding_model TEXT,
                  embedding_json TEXT,
                  ai_summary TEXT,
                  clause_fingerprints_json TEXT NOT NULL DEFAULT '[]',
                  search_blob TEXT NOT NULL DEFAULT '',
                  PRIMARY KEY (agreement_id, org_id)
                );
                CREATE INDEX IF NOT EXISTS idx_memory_org ON memory_documents(org_id);
                CREATE INDEX IF NOT EXISTS idx_memory_agreement ON memory_documents(agreement_id);
                CREATE TABLE IF NOT EXISTS memory_org_sync (
                  org_id TEXT NOT NULL PRIMARY KEY,
                  last_reindex_at TEXT NOT NULL,
                  last_indexed_count INTEGER NOT NULL DEFAULT 0
                );
                """
            )
            cols = [r[1] for r in con.execute("PRAGMA table_info(memory_documents)").fetchall()]
            if "timeline_has_events" not in cols:
                con.execute(
                    "ALTER TABLE memory_documents ADD COLUMN timeline_has_events INTEGER NOT NULL DEFAULT 0"
                )

    def upsert_document(self, row: Dict[str, Any]) -> None:
        now = _utc_now()
        aid = str(row["agreement_id"]).strip()
        oid = str(row["org_id"]).strip()
        with self._conn() as con:
            existing = con.execute(
                "SELECT created_at FROM memory_documents WHERE agreement_id = ? AND org_id = ?",
                (aid, oid),
            ).fetchone()
            created_at = str(row.get("created_at") or (existing[0] if existing else now))
            th = 1 if int(row.get("timeline_has_events") or 0) else 0
            con.execute(
                """
                INSERT INTO memory_documents (
                  agreement_id, org_id, title, document_type, status,
                  party_names_json, effective_date, monetary_terms, clause_tags_json,
                  linked_timeline_id, linked_receipt_ids_json, version_ids_json,
                  created_at, updated_at, embedding_model, embedding_json, ai_summary,
                  clause_fingerprints_json, search_blob, timeline_has_events
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(agreement_id, org_id) DO UPDATE SET
                  title = excluded.title,
                  document_type = excluded.document_type,
                  status = excluded.status,
                  party_names_json = excluded.party_names_json,
                  effective_date = excluded.effective_date,
                  monetary_terms = excluded.monetary_terms,
                  clause_tags_json = excluded.clause_tags_json,
                  linked_timeline_id = excluded.linked_timeline_id,
                  linked_receipt_ids_json = excluded.linked_receipt_ids_json,
                  version_ids_json = excluded.version_ids_json,
                  updated_at = excluded.updated_at,
                  embedding_model = excluded.embedding_model,
                  embedding_json = excluded.embedding_json,
                  ai_summary = excluded.ai_summary,
                  clause_fingerprints_json = excluded.clause_fingerprints_json,
                  search_blob = excluded.search_blob,
                  timeline_has_events = excluded.timeline_has_events
                """,
                (
                    aid,
                    oid,
                    row.get("title"),
                    row.get("document_type"),
                    row.get("status"),
                    json.dumps(row.get("party_names") or []),
                    row.get("effective_date"),
                    row.get("monetary_terms"),
                    json.dumps(row.get("clause_tags") or []),
                    row.get("linked_timeline_id"),
                    json.dumps(row.get("linked_receipt_ids") or []),
                    json.dumps(row.get("version_ids") or []),
                    created_at,
                    now,
                    row.get("embedding_model"),
                    row.get("embedding_json"),
                    row.get("ai_summary"),
                    json.dumps(row.get("clause_fingerprints") or []),
                    str(row.get("search_blob") or ""),
                    th,
                ),
            )

    def list_by_org(self, org_id: str) -> List[Dict[str, Any]]:
        with self._conn() as con:
            rows = con.execute(
                "SELECT * FROM memory_documents WHERE org_id = ? ORDER BY updated_at DESC",
                (org_id.strip(),),
            ).fetchall()
        return [_parse_memory_row(r) for r in rows]

    def get_embedding_rows_for_org(self, org_id: str) -> List[Dict[str, Any]]:
        """Rows that have embeddings for vector search."""
        with self._conn() as con:
            rows = con.execute(
                """
                SELECT agreement_id, title, status, party_names_json, clause_tags_json,
                       ai_summary, embedding_json, search_blob, updated_at,
                       linked_timeline_id, version_ids_json, timeline_has_events
                FROM memory_documents
                WHERE org_id = ? AND embedding_json IS NOT NULL AND embedding_json != ''
                """,
                (org_id.strip(),),
            ).fetchall()
        return [dict(r) for r in rows]

    def count_documents_for_org(self, org_id: str) -> int:
        with self._conn() as con:
            row = con.execute(
                "SELECT COUNT(*) AS n FROM memory_documents WHERE org_id = ?",
                (org_id.strip(),),
            ).fetchone()
        return int(row["n"]) if row else 0

    def record_org_reindex(self, org_id: str, indexed_count: int) -> None:
        now = _utc_now()
        oid = org_id.strip()
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO memory_org_sync (org_id, last_reindex_at, last_indexed_count)
                VALUES (?, ?, ?)
                ON CONFLICT(org_id) DO UPDATE SET
                  last_reindex_at = excluded.last_reindex_at,
                  last_indexed_count = excluded.last_indexed_count
                """,
                (oid, now, int(indexed_count)),
            )

    def get_org_reindex_meta(self, org_id: str) -> Optional[Dict[str, Any]]:
        with self._conn() as con:
            row = con.execute(
                "SELECT last_reindex_at, last_indexed_count FROM memory_org_sync WHERE org_id = ?",
                (org_id.strip(),),
            ).fetchone()
        return dict(row) if row else None

    def get_one(self, org_id: str, agreement_id: str) -> Optional[Dict[str, Any]]:
        with self._conn() as con:
            row = con.execute(
                """
                SELECT * FROM memory_documents
                WHERE org_id = ? AND agreement_id = ?
                """,
                (org_id.strip(), agreement_id.strip()),
            ).fetchone()
        return _parse_memory_row(row) if row else None

    def delete_for_agreement(self, org_id: str, agreement_id: str) -> None:
        with self._conn() as con:
            con.execute(
                "DELETE FROM memory_documents WHERE org_id = ? AND agreement_id = ?",
                (org_id.strip(), agreement_id.strip()),
            )


def _parse_memory_row(row: sqlite3.Row) -> Dict[str, Any]:
    d = dict(row)

    def _j(col: str, key: str) -> None:
        raw = d.get(col)
        if isinstance(raw, str) and raw.strip():
            try:
                d[key] = json.loads(raw)
            except Exception:
                d[key] = []
        else:
            d[key] = []

    _j("party_names_json", "party_names")
    _j("clause_tags_json", "clause_tags")
    _j("linked_receipt_ids_json", "linked_receipt_ids")
    _j("version_ids_json", "version_ids")
    _j("clause_fingerprints_json", "clause_fingerprints")
    if d.get("embedding_json") and isinstance(d["embedding_json"], str):
        try:
            d["embedding"] = json.loads(d["embedding_json"])
        except Exception:
            d["embedding"] = None
    if "timeline_has_events" in d:
        try:
            d["timeline_has_events"] = bool(int(d["timeline_has_events"]))
        except Exception:
            d["timeline_has_events"] = False
    return d


_store: Optional[AgreementMemoryStore] = None


def get_agreement_memory_store() -> AgreementMemoryStore:
    global _store
    if _store is None:
        _store = AgreementMemoryStore()
    return _store
