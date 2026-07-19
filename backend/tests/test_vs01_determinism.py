"""
VS01-B14: determinism — identical sign inputs (incl. frozen signed_at) → identical
proof digests; bundle zip stable when bundle_id + created_at are fixed.
"""
from __future__ import annotations

import base64
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.proof.receipt import build_receipt_body_and_hash
from backend.proof.sign_packet import sign_packet_digest_sha256
from backend.utils.vs01_verification_bundle import (
    build_verification_bundle_zip_bytes,
    bundle_manifest_digest_sha256,
)

pytestmark = pytest.mark.unit

_ORG = {"X-Claw-Org-Id": "vs01-determinism-test-org"}


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
        {"field_id": "a", "h": 2, "page_index": 0, "w": 1, "x": 0, "y": 1},
    ]


def test_two_completes_same_doc_same_inputs_same_receipt_hash(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """
    B14 core invariant: document_id is part of sign_packet, so each new finalize
    yields a different receipt_hash. With one shared document_id, two sessions +
    identical complete-sign inputs must yield identical sign_packet and both
    digests. receipt_id differs (runtime ids).
    """
    _configure_artifacts(monkeypatch, tmp_path)
    client = TestClient(app)

    raw = b"determinism-doc-bytes-fixed"
    fin = client.post(
        "/v1/documents",
        headers=_ORG,
        json={"content_base64": base64.b64encode(raw).decode("ascii")},
    )
    assert fin.status_code == 200
    doc_id = fin.json()["document_id"]
    h = fin.json()["content_sha256"]

    fixed_complete = {
        "signer_ref": "signer-determinism",
        "intent": "agree_and_sign",
        "signed_at": "2026-01-15T00:00:00.000Z",
        "field_manifest": _field_manifest(),
        "protocol_version": "1.0.0",
    }

    out: list[dict] = []
    for _ in range(2):
        sess = client.post(
            "/v1/sign-sessions",
            headers=_ORG,
            json={"document_id": doc_id, "content_sha256": h},
        )
        assert sess.status_code == 200
        sid = sess.json()["session"]["session_id"]
        comp = client.post(
            f"/v1/sign-sessions/{sid}/complete",
            headers=_ORG,
            json=fixed_complete,
        )
        assert comp.status_code == 200, comp.text
        out.append(comp.json()["receipt"])

    r1, r2 = out
    assert r1["receipt_id"] != r2["receipt_id"]
    assert r1["sign_packet"] == r2["sign_packet"]
    assert r1["sign_packet_digest_sha256"] == r2["sign_packet_digest_sha256"]
    assert r1["receipt_hash_sha256"] == r2["receipt_hash_sha256"]

    d1 = sign_packet_digest_sha256(r1["sign_packet"])
    assert d1 == r1["sign_packet_digest_sha256"]


def test_verification_bundle_zip_bytes_identical_with_fixed_ids(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Same receipt + document + bundle_id + created_at → identical zip bytes."""
    _configure_artifacts(monkeypatch, tmp_path)
    client = TestClient(app)

    raw = b"bundle-determinism"
    fin = client.post(
        "/v1/documents",
        headers=_ORG,
        json={"content_base64": base64.b64encode(raw).decode("ascii")},
    )
    doc_id = fin.json()["document_id"]
    h = fin.json()["content_sha256"]
    sess = client.post(
        "/v1/sign-sessions",
        headers=_ORG,
        json={"document_id": doc_id, "content_sha256": h},
    )
    sid = sess.json()["session"]["session_id"]
    comp = client.post(
        f"/v1/sign-sessions/{sid}/complete",
        headers=_ORG,
        json={
            "signer_ref": "bun",
            "intent": "agree_and_sign",
            "signed_at": "2026-03-01T12:00:00.000Z",
            "field_manifest": _field_manifest(),
            "protocol_version": "1.0.0",
        },
    )
    assert comp.status_code == 200
    rec = comp.json()["receipt"]

    bid = "bundle_golden_vs01"
    cat = "2026-03-01T12:00:01.000Z"
    z1, m1 = build_verification_bundle_zip_bytes(
        receipt=rec,
        document_bytes=raw,
        bundle_id=bid,
        created_at=cat,
    )
    z2, m2 = build_verification_bundle_zip_bytes(
        receipt=rec,
        document_bytes=raw,
        bundle_id=bid,
        created_at=cat,
    )
    assert z1 == z2
    assert m1 == m2
    assert bundle_manifest_digest_sha256(m1) == bundle_manifest_digest_sha256(m2)


def test_stored_receipt_digests_match_proof_recompute(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """
    Persisted receipt must match proof recomputation (no fixed hex: document_id
    and content hash vary per finalize; only internal consistency is asserted).
    """
    _configure_artifacts(monkeypatch, tmp_path)
    client = TestClient(app)

    raw = b"golden-vs01-payload"
    fin = client.post(
        "/v1/documents",
        headers=_ORG,
        json={"content_base64": base64.b64encode(raw).decode("ascii")},
    )
    assert fin.status_code == 200
    doc_id = fin.json()["document_id"]
    h = fin.json()["content_sha256"]
    sess = client.post(
        "/v1/sign-sessions",
        headers=_ORG,
        json={"document_id": doc_id, "content_sha256": h},
    )
    sid = sess.json()["session"]["session_id"]
    comp = client.post(
        f"/v1/sign-sessions/{sid}/complete",
        headers=_ORG,
        json={
            "signer_ref": "golden-signer",
            "intent": "agree_and_sign",
            "signed_at": "2026-02-01T12:00:00.000Z",
            "field_manifest": _field_manifest(),
            "protocol_version": "1.0.0",
        },
    )
    assert comp.status_code == 200
    rec = comp.json()["receipt"]

    sp = rec["sign_packet"]
    digest = sign_packet_digest_sha256(sp)
    assert rec["sign_packet_digest_sha256"] == digest

    _body, expect_rh = build_receipt_body_and_hash(
        protocol_version=rec["protocol_version"],
        document_id=rec["document_id"],
        document_content_sha256=rec["document_content_sha256"],
        sign_packet=sp,
        sign_packet_digest_sha256=digest,
    )
    assert expect_rh == rec["receipt_hash_sha256"]
