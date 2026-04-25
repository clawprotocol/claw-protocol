"""
Stable artifact identity (SQLite registry) + binary blobs (``BlobStore``).

Callers store and fetch by ``artifact_id`` or by **logical ref** (e.g. VS01 ``document_id``).
"""

from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.config.storage_runtime import artifact_registry_db_path
from backend.storage.blob_store import BlobStore, get_blob_store


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass(frozen=True)
class ArtifactRecord:
    artifact_id: str
    artifact_type: str
    logical_ref: str
    storage_key: str
    content_sha256: str
    size_bytes: int
    content_type: str
    created_at: str
    storage_backend: str
    visibility: str
    agreement_id: Optional[str]
    version_id: Optional[str]
    metadata: Dict[str, Any]


class ArtifactRepository:
    """
    Registry (SQLite) + blob backend. **Internal accounting source of truth** for stored bytes:
    not processor dashboards.
    """

    def __init__(
        self,
        *,
        db_path: Optional[str] = None,
        blob: Optional[BlobStore] = None,
    ) -> None:
        self._db_path = db_path or artifact_registry_db_path()
        self._blob = blob or get_blob_store()
        self._backend_name = os.getenv("CLAW_STORAGE_BACKEND", "local").strip().lower()

    def _conn(self) -> sqlite3.Connection:
        Path(self._db_path).parent.mkdir(parents=True, exist_ok=True)
        c = sqlite3.connect(self._db_path, timeout=30.0)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL;")
        return c

    def init_schema(self) -> None:
        with self._conn() as con:
            con.executescript(
                """
                CREATE TABLE IF NOT EXISTS artifact_records (
                  artifact_id TEXT PRIMARY KEY,
                  artifact_type TEXT NOT NULL,
                  logical_ref TEXT NOT NULL,
                  storage_key TEXT NOT NULL UNIQUE,
                  content_type TEXT NOT NULL,
                  size_bytes INTEGER NOT NULL,
                  content_sha256 TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  storage_backend TEXT NOT NULL,
                  visibility TEXT NOT NULL DEFAULT 'private',
                  agreement_id TEXT,
                  version_id TEXT,
                  metadata TEXT NOT NULL DEFAULT '{}'
                );
                CREATE INDEX IF NOT EXISTS idx_artifact_type_ref
                  ON artifact_records (artifact_type, logical_ref);
                CREATE INDEX IF NOT EXISTS idx_artifact_agreement
                  ON artifact_records (agreement_id);
                """
            )

    def put_artifact(
        self,
        *,
        artifact_type: str,
        logical_ref: str,
        data: bytes,
        content_type: str,
        visibility: str = "private",
        agreement_id: Optional[str] = None,
        version_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        artifact_id: Optional[str] = None,
        storage_key: Optional[str] = None,
    ) -> ArtifactRecord:
        if not data:
            raise ValueError("empty artifact payload")
        aid = artifact_id or str(uuid.uuid4())
        sk = storage_key or f"artifacts/{artifact_type}/{logical_ref}/{aid}/content.bin"
        sha = hashlib.sha256(data).hexdigest()
        now = _utc_now()
        meta = dict(metadata or {})

        self._blob.put_bytes(sk, data, content_type=content_type)

        with self._conn() as con:
            con.execute(
                """
                INSERT INTO artifact_records (
                  artifact_id, artifact_type, logical_ref, storage_key,
                  content_type, size_bytes, content_sha256, created_at,
                  storage_backend, visibility, agreement_id, version_id, metadata
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    aid,
                    artifact_type,
                    logical_ref,
                    sk,
                    content_type,
                    len(data),
                    sha,
                    now,
                    self._backend_name,
                    visibility,
                    agreement_id,
                    version_id,
                    json.dumps(meta, sort_keys=True, separators=(",", ":"), ensure_ascii=False),
                ),
            )
        return ArtifactRecord(
            artifact_id=aid,
            artifact_type=artifact_type,
            logical_ref=logical_ref,
            storage_key=sk,
            content_sha256=sha,
            size_bytes=len(data),
            content_type=content_type,
            created_at=now,
            storage_backend=self._backend_name,
            visibility=visibility,
            agreement_id=agreement_id,
            version_id=version_id,
            metadata=meta,
        )

    def get_latest_by_logical_ref(
        self, *, artifact_type: str, logical_ref: str
    ) -> Optional[ArtifactRecord]:
        with self._conn() as con:
            row = con.execute(
                """
                SELECT * FROM artifact_records
                WHERE artifact_type = ? AND logical_ref = ?
                ORDER BY created_at DESC LIMIT 1
                """,
                (artifact_type, logical_ref),
            ).fetchone()
        return self._row_to_record(row) if row else None

    def get_bytes_by_logical_ref(self, *, artifact_type: str, logical_ref: str) -> Optional[bytes]:
        rec = self.get_latest_by_logical_ref(artifact_type=artifact_type, logical_ref=logical_ref)
        if not rec:
            return None
        try:
            return self._blob.get_bytes(rec.storage_key)
        except (FileNotFoundError, OSError) as e:
            if self._backend_name != "local":
                raise
            return None

    def get_metadata_by_logical_ref(
        self, *, artifact_type: str, logical_ref: str
    ) -> Optional[ArtifactRecord]:
        return self.get_latest_by_logical_ref(artifact_type=artifact_type, logical_ref=logical_ref)

    def exists_logical_ref(self, *, artifact_type: str, logical_ref: str) -> bool:
        return self.get_latest_by_logical_ref(artifact_type=artifact_type, logical_ref=logical_ref) is not None

    def delete_logical_latest(self, *, artifact_type: str, logical_ref: str) -> None:
        rec = self.get_latest_by_logical_ref(artifact_type=artifact_type, logical_ref=logical_ref)
        if not rec:
            return
        with self._conn() as con:
            con.execute("DELETE FROM artifact_records WHERE artifact_id = ?", (rec.artifact_id,))
        try:
            self._blob.delete(rec.storage_key)
        except Exception:
            pass

    def list_recent(self, *, limit: int = 100) -> List[Dict[str, Any]]:
        with self._conn() as con:
            rows = con.execute(
                """
                SELECT artifact_id, artifact_type, logical_ref, storage_key, content_sha256,
                  size_bytes, content_type, created_at, visibility, agreement_id, version_id
                FROM artifact_records ORDER BY created_at DESC LIMIT ?
                """,
                (limit,),
            ).fetchall()
            return [dict(r) for r in rows]

    def _row_to_record(self, row: sqlite3.Row) -> ArtifactRecord:
        md_raw = row["metadata"] if "metadata" in row.keys() else "{}"
        try:
            md = json.loads(str(md_raw)) if md_raw else {}
            if not isinstance(md, dict):
                md = {}
        except json.JSONDecodeError:
            md = {}
        return ArtifactRecord(
            artifact_id=str(row["artifact_id"]),
            artifact_type=str(row["artifact_type"]),
            logical_ref=str(row["logical_ref"]),
            storage_key=str(row["storage_key"]),
            content_sha256=str(row["content_sha256"]),
            size_bytes=int(row["size_bytes"]),
            content_type=str(row["content_type"]),
            created_at=str(row["created_at"]),
            storage_backend=str(row["storage_backend"]),
            visibility=str(row["visibility"]),
            agreement_id=str(row["agreement_id"]) if row["agreement_id"] else None,
            version_id=str(row["version_id"]) if row["version_id"] else None,
            metadata=md,
        )


_repo: Optional[ArtifactRepository] = None


def get_artifact_repository() -> ArtifactRepository:
    global _repo
    if _repo is None:
        _repo = ArtifactRepository()
        _repo.init_schema()
    return _repo


def reset_artifact_repository_singleton() -> None:
    """Tests only: clear cached repo so env (db path, blob root) changes apply."""
    global _repo
    _repo = None
