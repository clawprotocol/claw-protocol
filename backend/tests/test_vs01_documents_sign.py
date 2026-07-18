"""VS01-B05–B07: document finalize, fetch, and sign-prep (no receipts)."""
from __future__ import annotations

import base64

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.proof.sign_packet import sign_packet_digest_sha256
from backend.services import document_service, signature_service

pytestmark = pytest.mark.unit


@pytest.fixture
def docs_dir(tmp_path, monkeypatch):
    from backend.storage.artifact_repository import reset_artifact_repository_singleton

    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("CLAW_BLOB_ROOT", str(tmp_path / "blobs"))
    monkeypatch.setenv("CLAW_ARTIFACT_REGISTRY_DB_PATH", str(tmp_path / "registry.sqlite3"))
    monkeypatch.setenv("CLAW_DOCUMENTS_DIR", str(tmp_path / "documents"))
    monkeypatch.setenv("CLAW_STORAGE_BACKEND", "local")
    reset_artifact_repository_singleton()
    return tmp_path


def _sample_manifest():
    return [
        {
            "field_id": "sig1",
            "page_index": 0,
            "x": 10.0,
            "y": 20.0,
            "w": 100.0,
            "h": 30.0,
        }
    ]


def test_document_service_finalize_roundtrip(docs_dir):
    raw = b"hello finalized agreement"
    meta = document_service.finalize_document(raw, content_type="application/pdf")
    assert meta["document_id"].startswith("doc_")
    assert meta["content_sha256"] == __import__("hashlib").sha256(raw).hexdigest()
    assert meta["size_bytes"] == len(raw)

    again = document_service.get_document_meta(meta["document_id"])
    assert again == meta
    assert document_service.get_document_bytes(meta["document_id"]) == raw


def test_document_service_invalid_id():
    assert document_service.get_document_meta("doc_../x") is None
    assert document_service.get_document_meta("missing") is None


def test_signature_service_prepare_digest_matches_proof(docs_dir):
    meta = document_service.finalize_document(b"bind-me", content_type="application/pdf")
    doc_id = meta["document_id"]

    out = signature_service.prepare_sign_packet(
        document_id=doc_id,
        signer_ref="signer-1",
        intent="agree",
        signed_at="2026-02-01T00:00:00Z",
        field_manifest=_sample_manifest(),
    )
    assert out["sign_packet_digest_sha256"] == sign_packet_digest_sha256(out["sign_packet"])
    assert out["sign_packet"]["document_id"] == doc_id
    assert out["sign_packet"]["document_content_sha256"] == meta["content_sha256"]


def test_signature_service_wrong_claim_fails(docs_dir):
    meta = document_service.finalize_document(b"x", content_type="application/pdf")
    with pytest.raises(ValueError, match="content_sha256_mismatch"):
        signature_service.prepare_sign_packet(
            document_id=meta["document_id"],
            signer_ref="a",
            intent="b",
            signed_at="2026-02-01T00:00:00Z",
            field_manifest=_sample_manifest(),
            content_sha256_claim="0" * 64,
        )


def test_signature_service_missing_document(docs_dir):
    with pytest.raises(ValueError, match="document_not_found"):
        signature_service.prepare_sign_packet(
            document_id="doc_nonexistent0000000000000000",
            signer_ref="a",
            intent="b",
            signed_at="2026-02-01T00:00:00Z",
            field_manifest=_sample_manifest(),
        )


def test_api_finalize_get_sign_prep(docs_dir):
    client = TestClient(app)
    raw = b"%PDF-1.4 minimal"
    b64 = base64.b64encode(raw).decode("ascii")
    org = {"X-Claw-Org-Id": "vs01-docs-sign-test-org"}

    fin = client.post(
        "/v1/documents",
        headers=org,
        json={"content_base64": b64, "content_type": "application/pdf"},
    )
    assert fin.status_code == 200, fin.text
    doc_id = fin.json()["document_id"]
    sha = fin.json()["content_sha256"]

    got = client.get(f"/v1/documents/{doc_id}", headers=org)
    assert got.status_code == 200
    assert got.json()["document"]["content_sha256"] == sha

    content = client.get(f"/v1/documents/{doc_id}/content", headers=org)
    assert content.status_code == 200
    assert content.content == raw

    prep = client.post(
        f"/v1/documents/{doc_id}/sign-prep",
        json={
            "signer_ref": "party-a",
            "intent": "execute_agreement",
            "signed_at": "2026-02-01T12:00:00Z",
            "field_manifest": _sample_manifest(),
            "content_sha256": sha,
        },
    )
    assert prep.status_code == 200, prep.text
    body = prep.json()
    assert body["ok"] is True
    assert len(body["sign_packet_digest_sha256"]) == 64
    assert body["sign_packet"]["schema_version"] == "sign_packet.v1"


def test_api_sign_prep_invalid_manifest(docs_dir):
    client = TestClient(app)
    org = {"X-Claw-Org-Id": "vs01-docs-sign-test-org"}
    raw = b"x"
    fin = client.post(
        "/v1/documents",
        headers=org,
        json={"content_base64": base64.b64encode(raw).decode("ascii")},
    )
    doc_id = fin.json()["document_id"]

    bad = client.post(
        f"/v1/documents/{doc_id}/sign-prep",
        json={
            "signer_ref": "a",
            "intent": "b",
            "signed_at": "2026-02-01T00:00:00Z",
            "field_manifest": [],
        },
    )
    assert bad.status_code == 422  # min_length=1
