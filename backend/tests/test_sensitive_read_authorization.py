"""GTM Security Slice 2 — sensitive read authorization negative and positive tests."""

from __future__ import annotations

import base64
import os
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.security.recipient_access_token import mint_recipient_access_token
from backend.services import document_service
from backend.tests.conftest_auth_security import mint_anonymous_session
from backend.tests.conftest_usage_economics_helpers import register_test_agreement_owner
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit

_ORG_A = {"X-Claw-Org-Id": "slice2-org-a"}
_ORG_B = {"X-Claw-Org-Id": "slice2-org-b"}
_LOCAL_ORG = {"X-Claw-Org-Id": "local-org"}
_SIGNING_SECRET = "slice2-signing-token-secret"


@pytest.fixture(autouse=True)
def _reset_usage_economics_singleton():
    usage_economics_store_mod._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001


def _configure_storage(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    from backend.storage.artifact_repository import reset_artifact_repository_singleton

    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("CLAW_BLOB_ROOT", str(tmp_path / "blobs"))
    monkeypatch.setenv("CLAW_ARTIFACT_REGISTRY_DB_PATH", str(tmp_path / "registry.sqlite3"))
    monkeypatch.setenv("CLAW_DOCUMENTS_DIR", str(tmp_path / "documents"))
    monkeypatch.setenv("CLAW_RECEIPTS_DIR", str(tmp_path / "receipts"))
    monkeypatch.setenv("CLAW_SIGN_SESSIONS_DIR", str(tmp_path / "sessions"))
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(tmp_path / "agreements.sqlite3"))
    monkeypatch.setenv("CLAW_STORAGE_BACKEND", "local")
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", _SIGNING_SECRET)
    monkeypatch.setenv("CLAW_ANON_SESSION_SECRET", "test-anon-session-secret")
    reset_artifact_repository_singleton()


def _configure_production_like(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "staging")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    _configure_storage(monkeypatch, tmp_path)


def _create_agreement(client: TestClient, org_headers: dict) -> str:
    res = client.post(
        "/api/agreements/draft",
        headers=org_headers,
        json={
            "title": "Slice2 contract",
            "jurisdiction": "TX",
            "parties": [
                {"name": "Owner", "role": "owner", "id": "p-owner"},
                {"name": "Signer", "role": "signer", "id": "p-signer"},
            ],
            "purpose": "Testing sensitive reads",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert res.status_code == 200, res.text
    return res.json()["id"]


def _finalize_document_with_agreement(
    *,
    agreement_id: str,
) -> str:
    raw = b"%PDF-1.4 slice2 document"
    meta = document_service.finalize_document(
        raw,
        content_type="application/pdf",
        agreement_id=agreement_id,
    )
    return meta["document_id"]


def _patch_activation_document(document_id: str):
    return patch(
        "backend.security.sensitive_read_authorization._activation_document_id_for_agreement",
        return_value=document_id,
    )


def _issue_receipt_for_document(client: TestClient, doc_id: str, content_sha256: str) -> str:
    sess = client.post(
        "/v1/sign-sessions",
        json={"document_id": doc_id, "content_sha256": content_sha256},
    )
    assert sess.status_code == 200, sess.text
    session_id = sess.json()["session"]["session_id"]
    complete = client.post(
        f"/v1/sign-sessions/{session_id}/complete",
        json={
            "signer_ref": "slice2-signer",
            "intent": "agree_and_sign",
            "signed_at": "2026-07-18T00:00:00Z",
            "field_manifest": [
                {"field_id": "f1", "page_index": 0, "x": 1.0, "y": 2.0, "w": 3.0, "h": 4.0},
            ],
            "protocol_version": "1.0.0",
        },
    )
    assert complete.status_code == 200, complete.text
    return complete.json()["receipt_id"]


def _mint_recipient_token(*, agreement_id: str) -> str:
    return mint_recipient_access_token(
        secret=os.environ["CLAW_AGREEMENT_SIGNING_TOKEN_SECRET"].encode("utf-8"),
        agreement_id=agreement_id,
        locked_version_id="v1",
        mode="review",
        role="signer",
        ttl_seconds=3600,
        recipient_party_id="p-signer",
    )


def test_random_uuid_document_content_denied(monkeypatch, tmp_path):
    _configure_storage(monkeypatch, tmp_path)
    client = TestClient(app)
    res = client.get("/v1/documents/doc_nonexistent0000000000000000/content")
    assert res.status_code == 404
    assert res.json()["detail"] == "not_found"


def test_document_content_missing_org_header_401(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    _configure_storage(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client, _ORG_A)
    doc_id = _finalize_document_with_agreement(agreement_id=aid)
    res = client.get(f"/v1/documents/{doc_id}/content")
    assert res.status_code == 401
    assert res.json()["detail"]["code"] == "org_header_required"


def test_document_content_forged_org_cross_owner_404(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    _configure_storage(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client, _ORG_A)
    doc_id = _finalize_document_with_agreement(agreement_id=aid)
    res = client.get(f"/v1/documents/{doc_id}/content", headers=_ORG_B)
    assert res.status_code == 404
    assert res.json()["detail"] == "not_found"


def test_document_content_owner_allowed_with_org_header(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    _configure_storage(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client, _ORG_A)
    doc_id = _finalize_document_with_agreement(agreement_id=aid)
    ok = client.get(f"/v1/documents/{doc_id}/content", headers=_ORG_A)
    assert ok.status_code == 200
    assert ok.headers.get("cache-control") == "no-store, private"


def test_recipient_token_without_activation_denied(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    _configure_storage(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client, _ORG_A)
    doc_id = _finalize_document_with_agreement(agreement_id=aid)
    token = _mint_recipient_token(agreement_id=aid)
    res = client.get(
        f"/v1/documents/{doc_id}/content",
        headers={"X-Claw-Recipient-Access-Token": token},
    )
    assert res.status_code == 404
    assert res.json()["detail"] == "not_found"


def test_recipient_token_wrong_document_denied(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    _configure_storage(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client, _ORG_A)
    doc_id = _finalize_document_with_agreement(agreement_id=aid)
    other_doc = _finalize_document_with_agreement(agreement_id=aid)
    token = _mint_recipient_token(agreement_id=aid)
    with _patch_activation_document(doc_id):
        res = client.get(
            f"/v1/documents/{other_doc}/content",
            headers={"X-Claw-Recipient-Access-Token": token},
        )
    assert res.status_code == 404
    assert res.json()["detail"] == "not_found"


def test_recipient_token_exact_binding_allowed(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    _configure_storage(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client, _ORG_A)
    doc_id = _finalize_document_with_agreement(agreement_id=aid)
    token = _mint_recipient_token(agreement_id=aid)
    with _patch_activation_document(doc_id):
        res = client.get(
            f"/v1/documents/{doc_id}/content",
            headers={"X-Claw-Recipient-Access-Token": token},
        )
    assert res.status_code == 200
    assert res.headers.get("cache-control") == "no-store, private"


def test_recipient_token_wrong_agreement_denied(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    _configure_storage(monkeypatch, tmp_path)
    client = TestClient(app)
    aid_a = _create_agreement(client, _ORG_A)
    aid_b = _create_agreement(client, _ORG_B)
    doc_a = _finalize_document_with_agreement(agreement_id=aid_a)
    token = _mint_recipient_token(agreement_id=aid_b)
    with _patch_activation_document(doc_a):
        res = client.get(
            f"/v1/documents/{doc_a}/content",
            headers={"X-Claw-Recipient-Access-Token": token},
        )
    assert res.status_code == 404
    assert res.json()["detail"] == "not_found"


@pytest.mark.parametrize("session_document_id", ["", None, "wrong-document-id"])
def test_recipient_session_document_binding_denied(
    monkeypatch,
    tmp_path,
    session_document_id,
):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    _configure_storage(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client, _ORG_A)
    doc_id = _finalize_document_with_agreement(agreement_id=aid)
    session_payload = {"agreement_id": aid}
    if session_document_id is not None:
        session_payload["document_id"] = session_document_id
    with patch(
        "backend.security.sensitive_read_authorization.read_recipient_session_cookie",
        return_value="session-secret",
    ), patch(
        "backend.security.sensitive_read_authorization.load_revalidated_recipient_session",
        return_value=(session_payload, {}, None),
    ):
        res = client.get(f"/v1/documents/{doc_id}/content")
    assert res.status_code == 404
    assert res.json()["detail"] == "not_found"


def test_recipient_session_exact_document_binding_allowed(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    _configure_storage(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client, _ORG_A)
    doc_id = _finalize_document_with_agreement(agreement_id=aid)
    with patch(
        "backend.security.sensitive_read_authorization.read_recipient_session_cookie",
        return_value="session-secret",
    ), patch(
        "backend.security.sensitive_read_authorization.load_revalidated_recipient_session",
        return_value=({"agreement_id": aid, "document_id": doc_id}, {}, None),
    ):
        res = client.get(f"/v1/documents/{doc_id}/content")
    assert res.status_code == 200
    assert res.headers.get("cache-control") == "no-store, private"


def test_production_forged_legacy_org_document_read_denied(monkeypatch, tmp_path):
    _configure_production_like(monkeypatch, tmp_path)
    client = TestClient(app)
    _, _, verified_headers = mint_anonymous_session(client)
    aid = _create_agreement(client, verified_headers)
    register_test_agreement_owner(
        db_path=str(tmp_path / "usage.sqlite3"),
        agreement_id=aid,
        org_id=verified_headers["X-Claw-Org-Id"],
    )
    doc_id = _finalize_document_with_agreement(agreement_id=aid)
    for forged in (_LOCAL_ORG, _ORG_A):
        res = client.get(f"/v1/documents/{doc_id}/content", headers=forged)
        assert res.status_code == 403
        assert res.json()["detail"]["code"] == "owner_identity_unverified"


def test_production_forged_legacy_org_document_create_denied(monkeypatch, tmp_path):
    _configure_production_like(monkeypatch, tmp_path)
    client = TestClient(app)
    raw = b"%PDF production create test"
    for headers in (_LOCAL_ORG, _ORG_A, None):
        res = client.post(
            "/v1/documents",
            headers=headers or {},
            json={"content_base64": base64.b64encode(raw).decode("ascii"), "content_type": "application/pdf"},
        )
        assert res.status_code in (401, 403)
        if res.status_code == 403:
            assert res.json()["detail"]["code"] == "owner_identity_unverified"
        else:
            assert res.json()["detail"]["code"] == "org_header_required"


def test_production_verified_owner_document_create_allowed(monkeypatch, tmp_path):
    _configure_production_like(monkeypatch, tmp_path)
    client = TestClient(app)
    _, _, verified_headers = mint_anonymous_session(client)
    raw = b"%PDF verified owner create"
    res = client.post(
        "/v1/documents",
        headers=verified_headers,
        json={"content_base64": base64.b64encode(raw).decode("ascii"), "content_type": "application/pdf"},
    )
    assert res.status_code == 200
    doc_id = res.json()["document_id"]
    meta = document_service.get_document_meta(doc_id) or {}
    assert meta.get("owner_subject") == f"org:{verified_headers['X-Claw-Org-Id']}"


def test_receipt_bundle_denied_without_authority(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    _configure_storage(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client, _ORG_A)
    doc_id = _finalize_document_with_agreement(agreement_id=aid)
    meta = document_service.get_document_meta(doc_id) or {}
    rid = _issue_receipt_for_document(client, doc_id, meta["content_sha256"])
    res = client.get(f"/v1/receipts/{rid}/bundle")
    assert res.status_code == 401


def test_receipt_bundle_owner_allowed(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    _configure_storage(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client, _ORG_A)
    doc_id = _finalize_document_with_agreement(agreement_id=aid)
    meta = document_service.get_document_meta(doc_id) or {}
    rid = _issue_receipt_for_document(client, doc_id, meta["content_sha256"])
    res = client.get(f"/v1/receipts/{rid}/bundle", headers=_ORG_A)
    assert res.status_code == 200
    assert res.headers.get("cache-control") == "no-store, private"


def test_receipt_get_private_cache_headers(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    _configure_storage(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client, _ORG_A)
    doc_id = _finalize_document_with_agreement(agreement_id=aid)
    meta = document_service.get_document_meta(doc_id) or {}
    rid = _issue_receipt_for_document(client, doc_id, meta["content_sha256"])
    res = client.get(f"/v1/receipts/{rid}", headers=_ORG_A)
    assert res.status_code == 200
    assert res.headers.get("cache-control") == "no-store, private"


def test_unknown_and_cross_tenant_receipt_responses_match(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    _configure_storage(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client, _ORG_A)
    doc_id = _finalize_document_with_agreement(agreement_id=aid)
    meta = document_service.get_document_meta(doc_id) or {}
    rid = _issue_receipt_for_document(client, doc_id, meta["content_sha256"])

    unknown = client.get("/v1/receipts/rcpt_nonexistent000000", headers=_ORG_B)
    cross = client.get(f"/v1/receipts/{rid}", headers=_ORG_B)
    assert unknown.status_code == 404
    assert cross.status_code == 404
    assert unknown.json()["detail"] == cross.json()["detail"] == "not_found"


def test_unknown_and_cross_tenant_document_responses_match(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    _configure_storage(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client, _ORG_A)
    doc_id = _finalize_document_with_agreement(agreement_id=aid)

    unknown = client.get("/v1/documents/doc_nonexistent0000000000000000", headers=_ORG_B)
    cross = client.get(f"/v1/documents/{doc_id}", headers=_ORG_B)
    assert unknown.status_code == 404
    assert cross.status_code == 404
    assert unknown.json()["detail"] == cross.json()["detail"] == "not_found"


def test_agreement_proof_status_requires_owner(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    _configure_storage(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client, _ORG_A)
    anon = client.get(f"/api/agreements/{aid}/proof-status")
    assert anon.status_code == 401
    ok = client.get(f"/api/agreements/{aid}/proof-status", headers=_ORG_A)
    assert ok.status_code == 200
    assert ok.headers.get("cache-control") == "no-store, private"


def test_proof_status_receipt_private_cache_headers(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    _configure_storage(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client, _ORG_A)
    doc_id = _finalize_document_with_agreement(agreement_id=aid)
    meta = document_service.get_document_meta(doc_id) or {}
    rid = _issue_receipt_for_document(client, doc_id, meta["content_sha256"])
    res = client.get(f"/v1/proof/receipt/{rid}/status", headers=_ORG_A)
    assert res.status_code == 200
    assert res.headers.get("cache-control") == "no-store, private"


def test_public_verify_still_usable_without_credentials(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(tmp_path / "agreements.sqlite3"))
    client = TestClient(app)
    aid = _create_agreement(client, _ORG_A)
    res = client.get(f"/api/agreements/public/{aid}/verify")
    assert res.status_code == 200
    body = res.json()
    assert "participants" in body or "agreement_id" in body or "status" in body


def test_unlinked_document_owner_subject_read(monkeypatch, tmp_path):
    _configure_storage(monkeypatch, tmp_path)
    client = TestClient(app)
    raw = b"%PDF standalone"
    fin = client.post(
        "/v1/documents",
        headers=_ORG_A,
        json={"content_base64": base64.b64encode(raw).decode("ascii"), "content_type": "application/pdf"},
    )
    assert fin.status_code == 200
    doc_id = fin.json()["document_id"]
    denied = client.get(f"/v1/documents/{doc_id}/content")
    assert denied.status_code == 401
    ok = client.get(f"/v1/documents/{doc_id}/content", headers=_ORG_A)
    assert ok.status_code == 200
    assert ok.content == raw


def test_production_unlinked_document_forged_owner_read_denied(monkeypatch, tmp_path):
    _configure_production_like(monkeypatch, tmp_path)
    client = TestClient(app)
    _, _, verified_headers = mint_anonymous_session(client)
    raw = b"%PDF unlinked verified"
    fin = client.post(
        "/v1/documents",
        headers=verified_headers,
        json={"content_base64": base64.b64encode(raw).decode("ascii"), "content_type": "application/pdf"},
    )
    assert fin.status_code == 200
    doc_id = fin.json()["document_id"]
    res = client.get(f"/v1/documents/{doc_id}/content", headers=_LOCAL_ORG)
    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "owner_identity_unverified"


def test_document_metadata_private_cache_headers(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    _configure_storage(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client, _ORG_A)
    doc_id = _finalize_document_with_agreement(agreement_id=aid)
    res = client.get(f"/v1/documents/{doc_id}", headers=_ORG_A)
    assert res.status_code == 200
    assert res.headers.get("cache-control") == "no-store, private"
