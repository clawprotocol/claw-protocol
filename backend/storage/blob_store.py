"""
Blob storage boundary for production hosting.

Artifacts and suggested placement:

- **Agreement drafts** (JSON): today ``backend/services/agreement_draft_store.py`` uses local files under
  ``CLAW_DATA_DIR``/``data/agreements`` — suitable for DB/metadata-sized documents; for multi-instance API
  without shared disk, move to object storage key ``agreements/{id}.json`` via this interface (future).
- **Signing lock sidecars** (``*.signing-lock.json``): co-locate with draft or same key prefix.
- **Rendered HTML snapshots**: optional cache under ``renders/{agreement_id}/{version_id}.html``.
- **Execution packets / audit bundles** (exported JSON, DOCX): user-triggered exports — ``exports/...`` keys;
  deterministic receipts already live in the timeline SQLite DB + Merkle batches.
- **VS01 filesystem receipts** (if any): keep path abstraction if migrating off local ``/v1/receipts``.

Implementations: ``LocalBlobStore`` (default) minimal wrapper; ``ObjectStoreStub`` raises ``NotImplementedError``
for S3-compatible backends (boto3/minio wiring is intentionally deferred).
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Protocol, runtime_checkable


@runtime_checkable
class BlobStore(Protocol):
    def get_bytes(self, key: str) -> bytes: ...
    def put_bytes(self, key: str, data: bytes, *, content_type: str | None = None) -> None: ...
    def delete(self, key: str) -> None: ...
    def exists(self, key: str) -> bool: ...


class LocalBlobStore:
    """Files under ``root`` (e.g. ``CLAW_BLOB_ROOT`` or ``CLAW_DATA_DIR/blobs``)."""

    def __init__(self, root: Path | str) -> None:
        self.root = Path(root).expanduser()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        k = (key or "").lstrip("/").replace("..", "_")
        if not k:
            raise ValueError("empty_key")
        return self.root / k

    def get_bytes(self, key: str) -> bytes:
        p = self._path(key)
        return p.read_bytes()

    def put_bytes(self, key: str, data: bytes, *, content_type: str | None = None) -> None:
        _ = content_type
        p = self._path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)

    def delete(self, key: str) -> None:
        p = self._path(key)
        if p.exists():
            p.unlink()

    def exists(self, key: str) -> bool:
        return self._path(key).exists()


class ObjectStoreStub:
    """Placeholder for S3 / MinIO / R2: implement ``put_bytes`` before enabling in production."""

    def get_bytes(self, key: str) -> bytes:
        raise NotImplementedError("ObjectStoreStub: configure S3-compatible backend (deferred).")

    def put_bytes(self, key: str, data: bytes, *, content_type: str | None = None) -> None:
        raise NotImplementedError("ObjectStoreStub: configure S3-compatible backend (deferred).")

    def delete(self, key: str) -> None:
        raise NotImplementedError("ObjectStoreStub: configure S3-compatible backend (deferred).")

    def exists(self, key: str) -> bool:
        raise NotImplementedError("ObjectStoreStub: configure S3-compatible backend (deferred).")


def get_blob_store() -> BlobStore:
    backend = os.getenv("CLAW_STORAGE_BACKEND", "local").strip().lower()
    if backend in ("s3", "object", "r2"):
        return ObjectStoreStub()
    root = os.getenv("CLAW_BLOB_ROOT", "").strip()
    if not root:
        base = os.getenv("CLAW_DATA_DIR", "").strip()
        root = str(Path(base).expanduser() / "blobs") if base else str(Path("data") / "blobs")
    return LocalBlobStore(Path(root).expanduser())
