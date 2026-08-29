"""VS01 finalize_document: legacy fallback when unified artifact store cannot write."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

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


def test_finalize_document_legacy_uses_fallback_base_when_primary_unusable(monkeypatch, tmp_path):
    """Regression: Railway cwd may be read-only; CLAW_DATA_DIR/documents must still accept writes."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("CLAW_DOCUMENTS_DIR", str(tmp_path / "blocked"))
    (tmp_path / "blocked").write_text("not-a-directory", encoding="utf-8")
    monkeypatch.setenv("CLAW_UNIFIED_ARTIFACT_STORE", "0")

    meta = document_service.finalize_document(b"%PDF-1.4 ok", content_type="application/pdf")
    doc_id = meta["document_id"]
    fallback = tmp_path / "data" / "documents" / doc_id
    assert (fallback / "body.bin").is_file()
    assert json.loads((fallback / "meta.json").read_text(encoding="utf-8")).get("document_id") == doc_id


def test_finalize_document_writes_temp_claw_documents_when_data_and_documents_dirs_unset(
    monkeypatch, tmp_path,
):
    """Regression Railway: without CLAW_DATA_DIR / CLAW_DOCUMENTS_DIR, use temp dir (not cwd artifacts)."""
    monkeypatch.delenv("CLAW_DOCUMENTS_DIR", raising=False)
    monkeypatch.delenv("CLAW_DATA_DIR", raising=False)
    monkeypatch.setenv("CLAW_UNIFIED_ARTIFACT_STORE", "0")
    reset_artifact_repository_singleton()
    meta = document_service.finalize_document(b"%PDF-1.4 temp-only", content_type="application/pdf")
    doc_id = meta["document_id"]
    expected = Path(tempfile.gettempdir()) / "claw-documents" / doc_id / "body.bin"
    assert expected.is_file()


def test_finalize_document_unified_success_ignores_legacy_mirror_failure(monkeypatch, tmp_path):
    """Non-critical legacy mirror must not fail finalize when unified store already persisted."""
    calls = {"n": 0}

    def _mirror_boom(did: str, content: bytes, meta: dict):
        calls["n"] += 1
        raise OSError("simulated_read_only_mirror")

    monkeypatch.setattr(document_service, "_write_legacy_layout", _mirror_boom)
    meta = document_service.finalize_document(b"%PDF-1.4 mirror-fail", content_type="application/pdf")
    assert meta.get("document_id", "").startswith("doc_")
    assert calls["n"] == 1


def test_finalize_document_replaces_content_in_place_same_id(monkeypatch, tmp_path):
    """Prepare reuse: overwrite GET /content for an existing vs01 document id."""
    monkeypatch.setenv("CLAW_UNIFIED_ARTIFACT_STORE", "0")
    first = document_service.finalize_document(
        b"%PDF-1.4 template-body",
        content_type="application/pdf",
        agreement_id="dd37f0e4-feba-42e5-bb37-713218aaf346",
    )
    doc_id = first["document_id"]
    replaced = document_service.finalize_document(
        b"%PDF-1.4 review-services-agreement",
        content_type="application/pdf",
        agreement_id="dd37f0e4-feba-42e5-bb37-713218aaf346",
        document_id=doc_id,
    )
    assert replaced["document_id"] == doc_id
    assert replaced["content_sha256"] != first["content_sha256"]
    assert document_service.get_document_bytes(doc_id) == b"%PDF-1.4 review-services-agreement"
    meta = document_service.get_document_meta(doc_id) or {}
    assert meta.get("agreement_id") == "dd37f0e4-feba-42e5-bb37-713218aaf346"


def test_document_storage_seed_error_context_lists_candidates(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DOCUMENTS_DIR", str(tmp_path / "d1"))
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path / "data"))
    ctx = document_service.document_storage_seed_error_context()
    assert ctx.get("unified_artifact_store_enabled") is True
    c = ctx.get("documents_candidates") or []
    assert any("d1" in str(x) for x in c)
    assert any("documents" in str(x) for x in c)
    assert any("claw-documents" in str(x) for x in c)
