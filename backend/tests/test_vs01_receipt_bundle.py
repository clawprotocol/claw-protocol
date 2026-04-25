"""
VS01-B11–B12: GET receipt + verification bundle zip.
"""
from __future__ import annotations

import base64
import hashlib
import json
import zipfile
from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.proof.receipt import build_receipt_body_and_hash
from backend.proof.sign_packet import SIGN_PACKET_SCHEMA_VERSION, sign_packet_digest_sha256
from backend.services import document_service, receipt_service
from backend.utils.vs01_verification_bundle import (
    VERIFICATION_BUNDLE_SCHEMA_VERSION,
    build_verification_bundle_manifest,
    build_verification_bundle_zip_bytes,
    bundle_manifest_digest_sha256,
    canonical_json_bytes,
    content_sha256_hex,
)

pytestmark = pytest.mark.unit

DOC_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"


def _configure_artifacts(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    from backend.storage.artifact_repository import reset_artifact_repository_singleton

    base = tmp_path / "claw"
    monkeypatch.setenv("CLAW_DATA_DIR", str(base / "data"))
    monkeypatch.setenv("CLAW_BLOB_ROOT", str(base / "blobs"))
    monkeypatch.setenv("CLAW_ARTIFACT_REGISTRY_DB_PATH", str(base / "artifact_registry.sqlite3"))
    monkeypatch.setenv("CLAW_DOCUMENTS_DIR", str(base / "documents"))
    monkeypatch.setenv("CLAW_SIGN_SESSIONS_DIR", str(base / "sessions"))
    monkeypatch.setenv("CLAW_RECEIPTS_DIR", str(base / "receipts"))
    monkeypatch.setenv("CLAW_STORAGE_BACKEND", "local")
    reset_artifact_repository_singleton()


def _field_manifest() -> list[dict]:
    return [{"field_id": "sig1", "h": 4, "page_index": 0, "w": 3, "x": 0, "y": 0}]


def test_get_receipt_404(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    _configure_artifacts(monkeypatch, tmp_path)
    client = TestClient(app)
    r = client.get("/v1/receipts/rcpt_nonexistent")
    assert r.status_code == 404
    assert "not found" in r.json()["detail"].lower()


def test_get_receipt_after_complete_sign(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _configure_artifacts(monkeypatch, tmp_path)
    client = TestClient(app)
    fin = client.post(
        "/v1/documents",
        json={"content_base64": base64.b64encode(b"bundle-doc").decode("ascii")},
    )
    doc_id = fin.json()["document_id"]
    h = fin.json()["content_sha256"]
    sid = client.post(
        "/v1/sign-sessions",
        json={"document_id": doc_id, "content_sha256": h},
    ).json()["session"]["session_id"]
    comp = client.post(
        f"/v1/sign-sessions/{sid}/complete",
        json={
            "signer_ref": "u1",
            "intent": "agree_and_sign",
            "signed_at": "2026-02-01T12:00:00.000Z",
            "field_manifest": _field_manifest(),
            "protocol_version": "1.0.0",
        },
    )
    assert comp.status_code == 200
    rid = comp.json()["receipt_id"]

    got = client.get(f"/v1/receipts/{rid}")
    assert got.status_code == 200
    body = got.json()
    assert body["ok"] is True
    assert body["receipt"]["receipt_id"] == rid
    assert body["receipt"]["receipt_hash_sha256"] == comp.json()["receipt_hash_sha256"]


def test_bundle_zip_contents_and_hashes(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _configure_artifacts(monkeypatch, tmp_path)
    client = TestClient(app)
    raw = b"exact bytes for bundle"
    fin = client.post(
        "/v1/documents",
        json={"content_base64": base64.b64encode(raw).decode("ascii")},
    )
    doc_id = fin.json()["document_id"]
    h = fin.json()["content_sha256"]
    sid = client.post(
        "/v1/sign-sessions",
        json={"document_id": doc_id, "content_sha256": h},
    ).json()["session"]["session_id"]
    comp = client.post(
        f"/v1/sign-sessions/{sid}/complete",
        json={
            "signer_ref": "signer-bundle",
            "intent": "agree_and_sign",
            "signed_at": "2026-02-02T00:00:00.000Z",
            "field_manifest": _field_manifest(),
            "protocol_version": "2.0.0",
        },
    )
    rid = comp.json()["receipt_id"]

    res = client.get(f"/v1/receipts/{rid}/bundle")
    assert res.status_code == 200
    assert res.headers.get("content-type", "").startswith("application/zip")

    zf = zipfile.ZipFile(BytesIO(res.content), "r")
    names = sorted(zf.namelist())
    assert names == ["VERIFY.md", "document.bin", "manifest.json", "receipt.json"]

    manifest = json.loads(zf.read("manifest.json").decode("utf-8"))
    assert manifest["schema_version"] == VERIFICATION_BUNDLE_SCHEMA_VERSION
    assert manifest["protocol_version"] == "2.0.0"
    assert manifest["bundle_id"] == f"vs01_bundle_{rid}"

    arts = manifest["artifacts"]
    paths = [a["path"] for a in arts]
    assert paths == sorted(paths)

    for a in arts:
        data = zf.read(a["path"])
        expect = hashlib.sha256(data).hexdigest()
        assert a["content_sha256"] == expect

    assert zf.read("document.bin") == raw
    disk_receipt = json.loads(zf.read("receipt.json").decode("utf-8"))
    assert disk_receipt["receipt_id"] == rid

    digest = sign_packet_digest_sha256(disk_receipt["sign_packet"])
    assert disk_receipt["sign_packet_digest_sha256"] == digest
    _, expect_rh = build_receipt_body_and_hash(
        protocol_version=disk_receipt["protocol_version"],
        document_id=disk_receipt["document_id"],
        document_content_sha256=disk_receipt["document_content_sha256"],
        sign_packet=disk_receipt["sign_packet"],
        sign_packet_digest_sha256=disk_receipt["sign_packet_digest_sha256"],
    )
    assert disk_receipt["receipt_hash_sha256"] == expect_rh


def test_bundle_receipt_not_found(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _configure_artifacts(monkeypatch, tmp_path)
    client = TestClient(app)
    r = client.get("/v1/receipts/rcpt_missing/bundle")
    assert r.status_code == 404


def test_bundle_document_hash_mismatch_after_tamper(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _configure_artifacts(monkeypatch, tmp_path)
    client = TestClient(app)
    fin = client.post(
        "/v1/documents",
        json={"content_base64": base64.b64encode(b"clean").decode("ascii")},
    )
    doc_id = fin.json()["document_id"]
    h = fin.json()["content_sha256"]
    sid = client.post(
        "/v1/sign-sessions",
        json={"document_id": doc_id, "content_sha256": h},
    ).json()["session"]["session_id"]
    comp = client.post(
        f"/v1/sign-sessions/{sid}/complete",
        json={
            "signer_ref": "u1",
            "intent": "agree_and_sign",
            "signed_at": "2026-02-01T10:00:00.000Z",
            "field_manifest": _field_manifest(),
            "protocol_version": "1.0.0",
        },
    )
    rid = comp.json()["receipt_id"]

    blob_matches = list(
        (tmp_path / "claw" / "blobs").glob(f"artifacts/vs01_document/{doc_id}/**/content.bin")
    )
    assert len(blob_matches) == 1
    blob_matches[0].write_bytes(b"TAMPERED")

    bad = client.get(f"/v1/receipts/{rid}/bundle")
    assert bad.status_code == 400
    assert "matches the receipt" in bad.json()["detail"].lower()


def test_bundle_manifest_digest_stable() -> None:
    receipt_bytes = canonical_json_bytes({"receipt_id": "rcpt_x", "k": "v"})
    doc_bytes = b"doc"
    verify_b = b"# verify"
    m = build_verification_bundle_manifest(
        bundle_id="b1",
        created_at="2026-01-01T00:00:00.000Z",
        protocol_version="1.0.0",
        receipt_json_bytes=receipt_bytes,
        document_bytes=doc_bytes,
        verify_md_bytes=verify_b,
    )
    d1 = bundle_manifest_digest_sha256(m)
    d2 = bundle_manifest_digest_sha256(m)
    assert d1 == d2
    assert len(d1) == 64


def test_build_zip_rejects_hash_mismatch() -> None:
    sp = {
        "schema_version": SIGN_PACKET_SCHEMA_VERSION,
        "document_id": "doc-vs01",
        "document_content_sha256": DOC_HASH,
        "signer_ref": "s",
        "intent": "agree_and_sign",
        "signed_at": "2026-02-01T12:00:00.000Z",
        "field_manifest": _field_manifest(),
    }
    digest = sign_packet_digest_sha256(sp)
    body, rh = build_receipt_body_and_hash(
        protocol_version="1.0.0",
        document_id="doc-vs01",
        document_content_sha256=DOC_HASH,
        sign_packet=sp,
        sign_packet_digest_sha256=digest,
    )
    rec = dict(body)
    rec["receipt_id"] = "rcpt_t"
    rec["receipt_hash_sha256"] = rh
    wrong_doc = b"not empty"
    with pytest.raises(ValueError, match="document_hash_mismatch"):
        build_verification_bundle_zip_bytes(receipt=rec, document_bytes=wrong_doc)
