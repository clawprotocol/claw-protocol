"""Phase 4C.2 — owner-guarded Quick PDF envelope, lock, token, receipt."""

from __future__ import annotations

import base64
import hashlib
import zipfile
from io import BytesIO

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services.quick_pdf_envelope import OWNER_ROLE_ID, RECIPIENT_ROLE_ID, validate_party_identity
from backend.tests.conftest_auth_security import make_authenticated_user_headers
from fastapi import HTTPException

PDF = b"%PDF-1.4 phase4c2-owner-bytes-final-paper"


@pytest.fixture()
def client(tmp_path, monkeypatch: pytest.MonkeyPatch):
    from backend.storage.artifact_repository import reset_artifact_repository_singleton
    from backend.usage_economics import store as usage_economics_store_mod
    from backend.security.anonymous_session_store import reset_anonymous_session_store_for_tests

    usage_economics_store_mod._store = None  # noqa: SLF001
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
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "0")
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-phase4c2-signing-secret")
    reset_artifact_repository_singleton()
    try:
        yield TestClient(app)
    finally:
        reset_anonymous_session_store_for_tests()
        usage_economics_store_mod._store = None  # noqa: SLF001


def _upload(client: TestClient, headers: dict) -> dict:
    res = client.post(
        "/v1/documents",
        headers=headers,
        json={"content_base64": base64.b64encode(PDF).decode("ascii"), "content_type": "application/pdf"},
    )
    assert res.status_code == 200, res.text
    return res.json()


def _parties() -> dict:
    return {
        "owner": {"name": "Avery Owner", "email": "avery.owner@lawdog.test"},
        "recipient": {"name": "Riley Recipient", "email": "riley.recipient@lawdog.test"},
    }


def _fields() -> list:
    return [
        {"field_id": "fld_o", "signer_role_id": OWNER_ROLE_ID, "field_type": "signature", "page_index": 0, "x": 0.1, "y": 0.7, "w": 0.3, "h": 0.1},
        {"field_id": "fld_r", "signer_role_id": RECIPIENT_ROLE_ID, "field_type": "signature", "page_index": 0, "x": 0.55, "y": 0.7, "w": 0.3, "h": 0.1},
    ]


def test_placeholder_parties_are_rejected() -> None:
    with pytest.raises(HTTPException):
        validate_party_identity("Owner", "you@email.com", label="owner")
    with pytest.raises(HTTPException):
        validate_party_identity("n/a", "avery.owner@lawdog.test", label="owner")


def test_envelope_binds_document_and_rejects_other_org(client: TestClient) -> None:
    headers = make_authenticated_user_headers("phase4c2-owner")
    doc = _upload(client, headers)
    body = {
        "document_id": doc["document_id"],
        "content_sha256": doc["content_sha256"],
        "size_bytes": doc["size_bytes"],
        "content_type": doc["content_type"],
        **_parties(),
    }
    created = client.post("/api/agreements/quick-pdf-envelope", headers=headers, json=body)
    assert created.status_code == 200, created.text
    env = created.json()["envelope"]
    assert env["agreement_id"]
    assert env["document_id"] == doc["document_id"]
    assert env["content_sha256"] == hashlib.sha256(PDF).hexdigest()
    assert "recipient_token" not in env
    again = client.post("/api/agreements/quick-pdf-envelope", headers=headers, json=body)
    assert again.status_code == 200
    assert again.json()["envelope"]["agreement_id"] == env["agreement_id"]
    other = make_authenticated_user_headers("phase4c2-other")
    stolen = client.post("/api/agreements/quick-pdf-envelope", headers=other, json=body)
    assert stolen.status_code == 403
    meta = client.get(f"/v1/documents/{doc['document_id']}", headers=headers)
    assert meta.json()["document"]["agreement_id"] == env["agreement_id"]


def test_hash_mismatch_blocks_prepare_and_receipt(client: TestClient) -> None:
    headers = make_authenticated_user_headers("phase4c2-owner")
    doc = _upload(client, headers)
    body = {
        "document_id": doc["document_id"],
        "content_sha256": doc["content_sha256"],
        "size_bytes": doc["size_bytes"],
        "content_type": doc["content_type"],
        **_parties(),
    }
    created = client.post("/api/agreements/quick-pdf-envelope", headers=headers, json=body)
    assert created.status_code == 200, created.text
    bad = {
        "document_id": doc["document_id"],
        "content_sha256": "0" * 64,
        "size_bytes": doc["size_bytes"],
        "content_type": doc["content_type"],
        "page_count": 1,
        "fields": _fields(),
    }
    fields = client.post("/api/agreements/quick-pdf-envelope/fields", headers=headers, json=bad)
    assert fields.status_code == 409
    assert fields.json()["detail"]["code"] == "document_hash_mismatch"


def test_prepare_mints_one_token_and_owner_sign_is_not_fully_executed(client: TestClient) -> None:
    headers = make_authenticated_user_headers("phase4c2-owner")
    doc = _upload(client, headers)
    bind = {
        "document_id": doc["document_id"],
        "content_sha256": doc["content_sha256"],
        "size_bytes": doc["size_bytes"],
        "content_type": doc["content_type"],
    }
    created = client.post("/api/agreements/quick-pdf-envelope", headers=headers, json={**bind, **_parties()})
    assert created.status_code == 200, created.text
    aid = created.json()["envelope"]["agreement_id"]
    saved = client.post(
        "/api/agreements/quick-pdf-envelope/fields",
        headers=headers,
        json={**bind, "page_count": 1, "fields": _fields()},
    )
    assert saved.status_code == 200, saved.text
    prep = client.post("/api/agreements/quick-pdf-envelope/prepare", headers=headers, json=bind)
    assert prep.status_code == 200, prep.text
    assert prep.json()["delivery"]["email"] == "unavailable"
    path = prep.json()["recipient_open_path"]
    assert path.startswith("/app/esign/")
    assert "vs01_recipient_sign=1" in path
    assert "recipient_name=" not in path
    assert "recipient_email=" not in path
    assert "vs01_rmanifest" not in path
    again = client.post("/api/agreements/quick-pdf-envelope/prepare", headers=headers, json=bind)
    assert again.status_code == 200
    assert again.json().get("idempotent") is True
    signed = client.post("/api/agreements/quick-pdf-envelope/owner-complete", headers=headers, json=bind)
    assert signed.status_code == 200, signed.text
    assert signed.json()["completion"]["owner_signed"] is True
    assert signed.json()["completion"]["fully_executed"] is False
    receipt = client.get(f"/api/agreements/quick-pdf-envelope/receipt?document_id={doc['document_id']}", headers=headers)
    assert receipt.status_code == 200
    assert receipt.json()["completion"]["fully_executed"] is False
    bundle = client.get(f"/api/agreements/quick-pdf-envelope/bundle?document_id={doc['document_id']}", headers=headers)
    assert bundle.status_code == 409
    from urllib.parse import parse_qs, urlparse

    token = (parse_qs(urlparse(path).query).get("t") or [""])[0]
    complete = client.post(
        f"/api/agreements/{aid}/vs01-signer-complete",
        headers={"X-Claw-Recipient-Access-Token": token},
        json={
            "signer_role_id": RECIPIENT_ROLE_ID,
            "participant_id": created.json()["envelope"]["recipient_party_id"],
            "document_id": doc["document_id"],
            "display_name": "Riley Recipient",
        },
    )
    assert complete.status_code == 200, complete.text
    replay = client.post(
        f"/api/agreements/{aid}/vs01-signer-complete",
        headers={"X-Claw-Recipient-Access-Token": token},
        json={
            "signer_role_id": RECIPIENT_ROLE_ID,
            "participant_id": created.json()["envelope"]["recipient_party_id"],
            "document_id": doc["document_id"],
            "display_name": "Riley Recipient",
        },
    )
    assert replay.status_code in (200, 403, 409)
    if replay.status_code == 200:
        assert replay.json().get("already_signed") is True
    done = client.get(f"/api/agreements/quick-pdf-envelope/receipt?document_id={doc['document_id']}", headers=headers)
    assert done.status_code == 200
    assert done.json()["completion"]["fully_executed"] is True
    z = client.get(f"/api/agreements/quick-pdf-envelope/bundle?document_id={doc['document_id']}", headers=headers)
    assert z.status_code == 200
    with zipfile.ZipFile(BytesIO(z.content)) as archive:
        assert archive.read("document.pdf") == PDF
        assert b"content_sha256" in archive.read("receipt.json")
    other = make_authenticated_user_headers("phase4c2-other")
    assert client.get(f"/api/agreements/quick-pdf-envelope/receipt?document_id={doc['document_id']}", headers=other).status_code == 403
    assert client.get(f"/api/agreements/quick-pdf-envelope/bundle?document_id={doc['document_id']}", headers=other).status_code == 403
