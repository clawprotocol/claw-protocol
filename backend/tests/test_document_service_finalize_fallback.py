"""VS01 finalize_document: legacy fallback when unified artifact store cannot write."""

from __future__ import annotations

import json

import pytest

from backend.services import document_service
from backend.storage.artifact_repository import reset_artifact_repository_singleton


@pytest.fixture(autouse=True)
def _clear_caches(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_DOCUMENTS_DIR", str(tmp_path / "documents"))
    monkeypatch.setenv("CLAW_UNIFIED_ARTIFACT_STORE", "1")
    monkeypatch.setenv("CLAW_ARTIFACT_REGISTRY_DB_PATH", str(tmp_path / "registry.sqlite3"))
    monkeypatch.setenv("CLAW_BLOB_ROOT", str(tmp_path / "blobs"))
    reset_artifact_repository_singleton()
    yield
    reset_artifact_repository_singleton()


def test_finalize_document_falls_back_to_legacy_when_put_artifact_not_implemented(monkeypatch, tmp_path):
    class _BadRepo:
        def init_schema(self) -> None:
            return None

        def put_artifact(self, **_kwargs):
            raise NotImplementedError("object store stub")

    monkeypatch.setattr(
        "backend.storage.artifact_repository.get_artifact_repository",
        lambda: _BadRepo(),
    )

    meta = document_service.finalize_document(b"%PDF-1.4 minimal", content_type="application/pdf")
    assert meta.get("document_id", "").startswith("doc_")
    assert len(meta.get("content_sha256", "")) == 64

    doc_id = meta["document_id"]
    root = document_service.documents_root() / doc_id
    assert (root / "body.bin").is_file()
    meta_disk = json.loads((root / "meta.json").read_text(encoding="utf-8"))
    assert meta_disk.get("document_id") == doc_id
