"""Phase 4C.1 — PDF finalize ownership, validation, and Quick return authority."""

from __future__ import annotations

import base64
import hashlib

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.security.safe_redirect import (
    is_allowlisted_internal_path,
    is_approved_server_quick_pdf_return,
    resolve_safe_redirect_path,
    resolve_server_auth_destination,
)
from backend.security.vs01_document_upload import (
    DocumentUploadRejected,
    validate_finalize_upload_bytes,
)
from backend.tests.conftest_auth_security import make_authenticated_user_headers


PDF = b"%PDF-1.4 phase4c1-owner-bytes"


@pytest.fixture()
def client(tmp_path, monkeypatch: pytest.MonkeyPatch):
    from backend.storage.artifact_repository import reset_artifact_repository_singleton
    from backend.usage_economics import store as usage_economics_store_mod

    usage_economics_store_mod._store = None  # noqa: SLF001
    from backend.security.anonymous_session_store import reset_anonymous_session_store_for_tests

    reset_anonymous_session_store_for_tests()
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_ANON_SESSION_SECRET", "test-anon-session-secret")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("CLAW_BLOB_ROOT", str(tmp_path / "blobs"))
    monkeypatch.setenv("CLAW_ARTIFACT_REGISTRY_DB_PATH", str(tmp_path / "registry.sqlite3"))
    monkeypatch.setenv("CLAW_DOCUMENTS_DIR", str(tmp_path / "documents"))
    monkeypatch.setenv("CLAW_STORAGE_BACKEND", "local")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_COMMERCIAL_MODE", "1")
    reset_artifact_repository_singleton()
    try:
        yield TestClient(app)
    finally:
        reset_anonymous_session_store_for_tests()
        usage_economics_store_mod._store = None  # noqa: SLF001


def test_caller_next_cannot_enter_quick() -> None:
    assert is_allowlisted_internal_path("/app/quick") is False
    assert is_allowlisted_internal_path("/app/quick?start=pdf") is False
    assert resolve_safe_redirect_path("/app/quick?start=pdf", "/app") == "/app"
    assert resolve_safe_redirect_path("/app/quick?next=/app/create", "/app") == "/app"


def test_server_only_quick_pdf_return_is_distinct_from_next() -> None:
    assert is_approved_server_quick_pdf_return("/app/quick?start=pdf") is True
    assert is_approved_server_quick_pdf_return("/app/quick") is False
    assert is_approved_server_quick_pdf_return("/app/quick?start=pdf&t=secret") is False
    assert is_approved_server_quick_pdf_return("/app/quick?start=pdf&agreement_bridge=1") is False
    assert is_approved_server_quick_pdf_return("/app/quick?start=type") is False
    assert resolve_server_auth_destination("/app/quick?start=pdf", "/app") == "/app/quick?start=pdf"
    assert resolve_server_auth_destination("/app/quick?start=pdf&src=csn", "/app") == "/app/quick?start=pdf&src=csn"
    assert resolve_server_auth_destination("/app/quick?start=pdf&documentId=doc_1", "/app") == "/app"


def test_validate_finalize_upload_bytes_rejects_empty_non_pdf_and_oversize() -> None:
    with pytest.raises(DocumentUploadRejected, match="empty_document"):
        validate_finalize_upload_bytes(b"")
    with pytest.raises(DocumentUploadRejected, match="document_not_pdf"):
        validate_finalize_upload_bytes(b"not-a-pdf")
    with pytest.raises(DocumentUploadRejected, match="document_not_pdf"):
        validate_finalize_upload_bytes(PDF, "text/plain")
    with pytest.raises(DocumentUploadRejected, match="document_too_large"):
        validate_finalize_upload_bytes(PDF, "application/pdf", max_bytes=3)
    validate_finalize_upload_bytes(PDF, "application/pdf")


def test_paid_owner_finalize_preserves_bytes_and_stamps_org(client: TestClient) -> None:
    headers = make_authenticated_user_headers("phase4c1-owner")
    fin = client.post(
        "/v1/documents",
        headers=headers,
        json={
            "content_base64": base64.b64encode(PDF).decode("ascii"),
            "content_type": "application/pdf",
        },
    )
    assert fin.status_code == 200, fin.text
    body = fin.json()
    assert body["owner_org_id"] == "user-phase4c1-owner"
    assert body["size_bytes"] == len(PDF)
    assert body["content_type"] == "application/pdf"
    assert body["content_sha256"] == hashlib.sha256(PDF).hexdigest()
    content = client.get(f"/v1/documents/{body['document_id']}/content", headers=headers)
    assert content.status_code == 200
    assert content.content == PDF
    other = make_authenticated_user_headers("phase4c1-other")
    stolen = client.get(f"/v1/documents/{body['document_id']}", headers=other)
    assert stolen.status_code == 403
    assert stolen.json()["detail"]["code"] == "document_org_mismatch"
    stolen_bytes = client.get(f"/v1/documents/{body['document_id']}/content", headers=other)
    assert stolen_bytes.status_code == 403


def test_finalize_rejects_non_pdf_empty_and_oversize_with_sanitized_codes(client: TestClient) -> None:
    headers = make_authenticated_user_headers("phase4c1-owner")
    empty = client.post(
        "/v1/documents",
        headers=headers,
        json={"content_base64": "", "content_type": "application/pdf"},
    )
    assert empty.status_code in (400, 422)
    bad = client.post(
        "/v1/documents",
        headers=headers,
        json={"content_base64": base64.b64encode(b"hello").decode("ascii"), "content_type": "application/pdf"},
    )
    assert bad.status_code == 400
    assert bad.json()["detail"] == "document_not_pdf"
    assert "Traceback" not in bad.text
    import backend.security.vs01_document_upload as upload_mod

    upload_mod.MAX_FINALIZE_PDF_BYTES = 8
    try:
        huge = client.post(
            "/v1/documents",
            headers=headers,
            json={
                "content_base64": base64.b64encode(b"%PDF-1.4 oversized").decode("ascii"),
                "content_type": "application/pdf",
            },
        )
    finally:
        upload_mod.MAX_FINALIZE_PDF_BYTES = 25 * 1024 * 1024
    assert huge.status_code == 400
    assert huge.json()["detail"] == "document_too_large"


def test_quick_pdf_return_continuation_is_purpose_gated(client: TestClient) -> None:
    def _finalize(continuation_id: str, user_id: str) -> dict:
        fin = client.post(
            "/v1/workspace/finalize-auth",
            headers=make_authenticated_user_headers(user_id),
            json={"continuation_id": continuation_id, "claim_method": "magic_link"},
        )
        assert fin.status_code == 200, fin.text
        return fin.json()

    forged_next = client.post(
        "/v1/workspace/auth-continuation",
        json={
            "destination_path": "/app/quick?start=pdf",
            "workflow_stage": "dashboard",
            "auth_purpose": "returning_sign_in",
        },
    )
    assert forged_next.status_code == 200, forged_next.text
    assert _finalize(forged_next.json()["continuation_id"], "phase4c1-forged")["destination_path"] == "/app"

    allowed = client.post(
        "/v1/workspace/auth-continuation",
        json={
            "destination_path": "/app/quick?start=pdf",
            "workflow_stage": "unknown",
            "auth_purpose": "quick_pdf_return",
        },
    )
    assert allowed.status_code == 200, allowed.text
    assert _finalize(allowed.json()["continuation_id"], "phase4c1-return")["destination_path"] == "/app/quick?start=pdf"

    stripped = client.post(
        "/v1/workspace/auth-continuation",
        json={
            "destination_path": "/app/quick?start=pdf&t=secret&agreement_bridge=1",
            "auth_purpose": "quick_pdf_return",
        },
    )
    assert stripped.status_code == 200, stripped.text
    assert _finalize(stripped.json()["continuation_id"], "phase4c1-stripped")["destination_path"] == "/app"
