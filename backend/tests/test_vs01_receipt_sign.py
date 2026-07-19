"""
VS01-B08–B10: receipt_service, sign-session, complete-sign orchestration.
"""
from __future__ import annotations

import base64
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.proof.receipt import RECEIPT_SCHEMA_VERSION, build_receipt_body_and_hash
from backend.proof.sign_packet import SIGN_PACKET_SCHEMA_VERSION, sign_packet_digest_sha256
from backend.services import document_service, receipt_service, signature_service

pytestmark = pytest.mark.unit

_ORG = {"X-Claw-Org-Id": "vs01-receipt-sign-test-org"}

DOC_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"


def _configure_artifacts(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    from backend.storage.artifact_repository import reset_artifact_repository_singleton

    base = tmp_path / "claw"
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    monkeypatch.setenv("CLAW_DATA_DIR", str(base / "data"))
    monkeypatch.setenv("CLAW_BLOB_ROOT", str(base / "blobs"))
    monkeypatch.setenv("CLAW_ARTIFACT_REGISTRY_DB_PATH", str(base / "artifact_registry.sqlite3"))
    monkeypatch.setenv("CLAW_DOCUMENTS_DIR", str(base / "documents"))
    monkeypatch.setenv("CLAW_SIGN_SESSIONS_DIR", str(base / "sessions"))
    monkeypatch.setenv("CLAW_RECEIPTS_DIR", str(base / "receipts"))
    monkeypatch.setenv("CLAW_STORAGE_BACKEND", "local")
    reset_artifact_repository_singleton()


def _field_manifest() -> list[dict]:
    return [
        {"field_id": "sig1", "h": 4, "page_index": 0, "w": 3, "x": 0, "y": 0},
    ]


def test_issue_receipt_matches_proof_golden(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CLAW_RECEIPTS_DIR", raising=False)
    sp = {
        "schema_version": SIGN_PACKET_SCHEMA_VERSION,
        "document_id": "doc-vs01",
        "document_content_sha256": DOC_HASH,
        "signer_ref": "signer-test",
        "intent": "agree_and_sign",
        "signed_at": "2026-02-01T12:00:00.000Z",
        "field_manifest": _field_manifest(),
    }
    digest = sign_packet_digest_sha256(sp)
    body, expect_hash = build_receipt_body_and_hash(
        protocol_version="1.0.0",
        document_id="doc-vs01",
        document_content_sha256=DOC_HASH,
        sign_packet=sp,
        sign_packet_digest_sha256=digest,
    )
    r = receipt_service.issue_receipt(
        sign_packet=sp,
        protocol_version="1.0.0",
        receipt_id="rcpt_fixed_test",
    )
    assert r["receipt_id"] == "rcpt_fixed_test"
    assert r["receipt_hash_sha256"] == expect_hash
    assert r["schema_version"] == RECEIPT_SCHEMA_VERSION
    assert r["protocol_version"] == "1.0.0"
    assert r["sign_packet_digest_sha256"] == digest
    # receipt_body keys only in stored proof layer
    for k, v in body.items():
        assert r[k] == v


def test_persist_and_get_receipt_roundtrip(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    # File layout assertion below targets legacy receipts dir; disable unified store for this unit.
    monkeypatch.setenv("CLAW_UNIFIED_ARTIFACT_STORE", "0")
    _configure_artifacts(monkeypatch, tmp_path)
    sp = {
        "schema_version": SIGN_PACKET_SCHEMA_VERSION,
        "document_id": "doc-vs01",
        "document_content_sha256": DOC_HASH,
        "signer_ref": "signer-test",
        "intent": "agree_and_sign",
        "signed_at": "2026-02-01T12:00:00.000Z",
        "field_manifest": _field_manifest(),
    }
    r = receipt_service.issue_receipt(sign_packet=sp, protocol_version="1.0.0")
    receipt_service.persist_receipt(r)
    loaded = receipt_service.get_receipt(r["receipt_id"])
    assert loaded == r
    path = tmp_path / "claw" / "receipts" / r["receipt_id"] / "receipt.json"
    assert path.is_file()
    disk = json.loads(path.read_text(encoding="utf-8"))
    assert disk["receipt_hash_sha256"] == r["receipt_hash_sha256"]


def test_create_sign_session_rejects_wrong_hash(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _configure_artifacts(monkeypatch, tmp_path)
    meta = document_service.finalize_document(b"hello")
    wrong = "f" * 64
    with pytest.raises(ValueError, match="content_sha256_mismatch"):
        signature_service.create_sign_session(
            document_id=meta["document_id"],
            content_sha256=wrong,
        )


def test_complete_sign_happy_path_http(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _configure_artifacts(monkeypatch, tmp_path)
    client = TestClient(app)
    raw = b"vs01 complete sign bytes"
    fin = client.post(
        "/v1/documents",
        headers=_ORG,
        json={
            "content_base64": base64.b64encode(raw).decode("ascii"),
            "content_type": "application/pdf",
        },
    )
    assert fin.status_code == 200
    doc = fin.json()
    doc_id = doc["document_id"]
    content_sha256 = doc["content_sha256"]

    sess = client.post(
        "/v1/sign-sessions",
        headers=_ORG,
        json={"document_id": doc_id, "content_sha256": content_sha256},
    )
    assert sess.status_code == 200
    session_id = sess.json()["session"]["session_id"]

    complete = client.post(
        f"/v1/sign-sessions/{session_id}/complete",
        headers=_ORG,
        json={
            "signer_ref": "user-dev-1",
            "intent": "agree_and_sign",
            "signed_at": "2026-02-01T15:30:00.000Z",
            "field_manifest": _field_manifest(),
            "protocol_version": "1.0.0",
        },
    )
    assert complete.status_code == 200, complete.text
    payload = complete.json()
    assert payload["ok"] is True
    rid = payload["receipt_id"]
    assert rid.startswith("rcpt_")
    rh = payload["receipt_hash_sha256"]
    assert len(rh) == 64
    rec = payload["receipt"]
    assert rec["receipt_hash_sha256"] == rh
    assert rec["document_id"] == doc_id
    assert "ingest_packet_digest_sha256" not in rec
    assert "timeline_event_id" not in rec

    loaded = receipt_service.get_receipt(rid)
    assert loaded == rec

    digest = sign_packet_digest_sha256(rec["sign_packet"])
    assert rec["sign_packet_digest_sha256"] == digest


def test_complete_sign_second_call_conflict(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _configure_artifacts(monkeypatch, tmp_path)
    client = TestClient(app)
    fin = client.post(
        "/v1/documents",
        headers=_ORG,
        json={"content_base64": base64.b64encode(b"x").decode("ascii")},
    )
    doc_id = fin.json()["document_id"]
    h = fin.json()["content_sha256"]
    sess = client.post(
        "/v1/sign-sessions",
        headers=_ORG,
        json={"document_id": doc_id, "content_sha256": h},
    )
    sid = sess.json()["session"]["session_id"]
    body = {
        "signer_ref": "u1",
        "intent": "agree_and_sign",
        "signed_at": "2026-02-01T10:00:00.000Z",
        "field_manifest": _field_manifest(),
        "protocol_version": "1.0.0",
    }
    r1 = client.post(f"/v1/sign-sessions/{sid}/complete", headers=_ORG, json=body)
    assert r1.status_code == 200
    r2 = client.post(f"/v1/sign-sessions/{sid}/complete", headers=_ORG, json=body)
    assert r2.status_code == 409
    assert r2.json()["detail"] == "session_not_pending"


def test_complete_sign_invalid_manifest_400(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _configure_artifacts(monkeypatch, tmp_path)
    client = TestClient(app)
    fin = client.post(
        "/v1/documents",
        headers=_ORG,
        json={"content_base64": base64.b64encode(b"y").decode("ascii")},
    )
    doc_id = fin.json()["document_id"]
    h = fin.json()["content_sha256"]
    sess = client.post(
        "/v1/sign-sessions",
        headers=_ORG,
        json={"document_id": doc_id, "content_sha256": h},
    )
    sid = sess.json()["session"]["session_id"]
    bad = client.post(
        f"/v1/sign-sessions/{sid}/complete",
        headers=_ORG,
        json={
            "signer_ref": "u1",
            "intent": "agree_and_sign",
            "signed_at": "2026-02-01T10:00:00.000Z",
            "field_manifest": [],
            "protocol_version": "1.0.0",
        },
    )
    assert bad.status_code == 422  # pydantic min_length
