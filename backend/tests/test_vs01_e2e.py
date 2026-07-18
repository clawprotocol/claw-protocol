"""
VS01-B13: end-to-end HTTP path — finalize → session → complete → GET receipt → bundle.

Uses VS01 routes only; filesystem artifact dirs isolated via env (tmp_path).
"""
from __future__ import annotations

import base64
import hashlib
import io
import json
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.proof.receipt import build_receipt_body_and_hash
from backend.proof.sign_packet import sign_packet_digest_sha256

pytestmark = [pytest.mark.e2e]


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
    return [
        {"field_id": "sig1", "h": 4, "page_index": 0, "w": 3, "x": 0, "y": 0},
    ]


def test_vs01_full_path_finalize_sign_get_receipt_export_bundle(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _configure_artifacts(monkeypatch, tmp_path)
    client = TestClient(app)
    org = {"X-Claw-Org-Id": "vs01-e2e-test-org"}

    raw = b"VS01-B13 e2e document payload"
    fin = client.post(
        "/v1/documents",
        headers=org,
        json={
            "content_base64": base64.b64encode(raw).decode("ascii"),
            "content_type": "application/octet-stream",
        },
    )
    assert fin.status_code == 200, fin.text
    doc = fin.json()
    doc_id = doc["document_id"]
    content_sha256 = doc["content_sha256"]
    assert hashlib.sha256(raw).hexdigest() == content_sha256

    sess = client.post(
        "/v1/sign-sessions",
        json={"document_id": doc_id, "content_sha256": content_sha256},
    )
    assert sess.status_code == 200
    session_id = sess.json()["session"]["session_id"]

    complete = client.post(
        f"/v1/sign-sessions/{session_id}/complete",
        json={
            "signer_ref": "e2e-signer",
            "intent": "agree_and_sign",
            "signed_at": "2026-02-01T18:00:00.000Z",
            "field_manifest": _field_manifest(),
            "protocol_version": "1.0.0",
        },
    )
    assert complete.status_code == 200, complete.text
    rid = complete.json()["receipt_id"]

    get_rec = client.get(f"/v1/receipts/{rid}", headers=org)
    assert get_rec.status_code == 200
    body = get_rec.json()
    assert body["ok"] is True
    rec = body["receipt"]
    assert rec["receipt_id"] == rid
    assert rec["document_id"] == doc_id

    bundle_resp = client.get(f"/v1/receipts/{rid}/bundle", headers=org)
    assert bundle_resp.status_code == 200
    assert bundle_resp.headers.get("content-type", "").startswith("application/zip")

    zdata = bundle_resp.content
    buf = io.BytesIO(zdata)
    with zipfile.ZipFile(buf, "r") as zf:
        names = set(zf.namelist())
        assert "manifest.json" in names
        assert "receipt.json" in names
        assert "document.bin" in names
        assert "VERIFY.md" in names

        manifest = json.loads(zf.read("manifest.json").decode("utf-8"))
        assert manifest["schema_version"] == "verification_bundle.v1"
        assert manifest["protocol_version"] == "1.0.0"
        arts = manifest["artifacts"]
        arts_sorted = sorted(arts, key=lambda a: a["path"])
        assert arts == arts_sorted

        for art in arts:
            p = art["path"]
            data = zf.read(p)
            assert hashlib.sha256(data).hexdigest() == art["content_sha256"]

        disk_rec = json.loads(zf.read("receipt.json").decode("utf-8"))
        assert disk_rec["receipt_hash_sha256"] == rec["receipt_hash_sha256"]
        assert zf.read("document.bin") == raw

    digest = sign_packet_digest_sha256(rec["sign_packet"])
    assert rec["sign_packet_digest_sha256"] == digest
    _, expect_rh = build_receipt_body_and_hash(
        protocol_version=rec["protocol_version"],
        document_id=rec["document_id"],
        document_content_sha256=rec["document_content_sha256"],
        sign_packet=rec["sign_packet"],
        sign_packet_digest_sha256=digest,
    )
    assert rec["receipt_hash_sha256"] == expect_rh
