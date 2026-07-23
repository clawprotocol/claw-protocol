"""
Patch 3 adversarial: VS01 document/sign + /v1/proof authorization.

Anonymous / forged-org / cross-party access must fail in commercial mode.
Public agreement verify remains read-only and redacted.
"""

from __future__ import annotations

import base64

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.security.recipient_access_token import mint_recipient_access_token
from backend.services import document_service, receipt_service, signature_service
from backend.services.agreement_draft_store import save_draft
from backend.services.agreement_signing_lock_store import write_signing_lock


_SECRET = "unit-test-vs01-proof-auth-boundary-secret"


@pytest.fixture()
def client(monkeypatch, tmp_path):
    from backend.storage.artifact_repository import reset_artifact_repository_singleton
    from backend.usage_economics import store as usage_economics_store_mod

    usage_economics_store_mod._store = None  # noqa: SLF001
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("CLAW_BLOB_ROOT", str(tmp_path / "blobs"))
    monkeypatch.setenv("CLAW_ARTIFACT_REGISTRY_DB_PATH", str(tmp_path / "registry.sqlite3"))
    monkeypatch.setenv("CLAW_DOCUMENTS_DIR", str(tmp_path / "documents"))
    monkeypatch.setenv("CLAW_SIGN_SESSIONS_DIR", str(tmp_path / "sessions"))
    monkeypatch.setenv("CLAW_RECEIPTS_DIR", str(tmp_path / "receipts"))
    monkeypatch.setenv("CLAW_STORAGE_BACKEND", "local")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_PROOF_LAYER_DB_PATH", str(tmp_path / "proof.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", _SECRET)
    monkeypatch.setenv("CLAW_PUBLIC_AGREEMENT_VERIFY", "1")
    monkeypatch.setenv("CLAW_COMMERCIAL_MODE", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "0")
    monkeypatch.delenv("CLAW_RECIPIENT_ACCESS_TOKEN_REQUIRED", raising=False)
    monkeypatch.delenv("CLAW_ALLOW_TOKENLESS_SIGNER_COMPLETE", raising=False)
    reset_artifact_repository_singleton()
    return TestClient(app)


def _owner(user: str = "owner-a") -> dict[str, str]:
    return {"X-Claw-Org-Id": f"user-{user}", "X-Claw-Test-Auth-User-Id": user}


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


def _finalize(client: TestClient, *, user: str = "owner-a", **extra) -> dict:
    raw = b"%PDF-1.4 auth-boundary"
    r = client.post(
        "/v1/documents",
        headers=_owner(user),
        json={
            "content_base64": base64.b64encode(raw).decode("ascii"),
            "content_type": "application/pdf",
            **extra,
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("owner_org_id") == f"user-{user}"
    return body


def _seed_agreement(*, aid: str, parties: list[dict] | None = None) -> None:
    ps = parties or [
        {"name": "Owner LLC", "role": "Client", "email": "o@example.com", "id": "p1"},
        {"name": "CP LLC", "role": "Service Provider", "email": "c@example.com", "id": "p2"},
    ]
    save_draft(
        {
            "id": aid,
            "title": "Bound",
            "parties": ps,
            "versions": [],
            "audit_log": [],
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
        }
    )
    write_signing_lock(aid, {"locked_version_id": "v1"})


def _mint(*, agreement_id: str, party_id: str, mode: str = "sign") -> str:
    from backend.services.agreement_draft_store import load_draft
    from backend.services.recipient_delivery_registry import (
        extract_jti_from_token,
        normalize_delivery_phase,
        record_invite_sent_cas,
    )

    tok = mint_recipient_access_token(
        secret=_SECRET.encode("utf-8"),
        agreement_id=agreement_id,
        locked_version_id="v1",
        mode=mode,  # type: ignore[arg-type]
        role="signer",
        ttl_seconds=3600,
        recipient_party_id=party_id,
    )
    draft = load_draft(agreement_id)
    assert draft is not None
    record_invite_sent_cas(
        draft,
        phase=normalize_delivery_phase("signing" if mode == "sign" else mode),
        participant_id=party_id,
        jti=extract_jti_from_token(tok),
        audit_log=draft.setdefault("audit_log", []),
    )
    return tok


def _register_owner(aid: str, user: str = "owner-a") -> None:
    from backend.usage_economics.store import get_usage_economics_store

    store = get_usage_economics_store()
    store.init_schema()
    if store.get_agreement_owner_row(aid):
        return
    store.insert_agreement_owner(
        agreement_id=aid,
        subject_ref=f"org:user-{user}",
        internal_keys_draft=0,
    )


def test_anonymous_document_and_sign_routes_fail(client: TestClient):
    doc = _finalize(client)
    doc_id = doc["document_id"]
    sha = doc["content_sha256"]

    assert client.post(
        "/v1/documents",
        json={"content_base64": base64.b64encode(b"x").decode("ascii")},
    ).status_code in (401, 403)

    for path, method in (
        (f"/v1/documents/{doc_id}", "get"),
        (f"/v1/documents/{doc_id}/content", "get"),
    ):
        r = getattr(client, method)(path)
        assert r.status_code in (401, 403), path

    prep = client.post(
        f"/v1/documents/{doc_id}/sign-prep",
        json={
            "signer_ref": "a",
            "intent": "b",
            "signed_at": "2026-02-01T00:00:00Z",
            "field_manifest": _sample_manifest(),
            "content_sha256": sha,
        },
    )
    assert prep.status_code in (401, 403), prep.text

    sess = client.post(
        "/v1/sign-sessions",
        json={"document_id": doc_id, "content_sha256": sha},
    )
    assert sess.status_code in (401, 403), sess.text


def test_anonymous_proof_surfaces_fail(client: TestClient):
    doc = _finalize(client)
    sess = client.post(
        "/v1/sign-sessions",
        headers=_owner(),
        json={"document_id": doc["document_id"], "content_sha256": doc["content_sha256"]},
    )
    assert sess.status_code == 200, sess.text
    sid = sess.json()["session"]["session_id"]
    complete = client.post(
        f"/v1/sign-sessions/{sid}/complete",
        headers=_owner(),
        json={
            "signer_ref": "owner",
            "intent": "sign",
            "signed_at": "2026-02-01T00:00:00Z",
            "field_manifest": _sample_manifest(),
        },
    )
    assert complete.status_code == 200, complete.text
    rid = complete.json()["receipt_id"]

    for path in (
        f"/v1/proof/receipt/{rid}/status",
        f"/v1/proof/receipt/{rid}/details",
        f"/v1/proof/receipt/{rid}/export",
        "/v1/proof/folders",
    ):
        assert client.get(path).status_code in (401, 403), path

    assert client.post(
        f"/v1/proof/receipt/{rid}/upgrade",
        json={"preference": "batched"},
    ).status_code in (401, 403)

    export = client.post(
        "/v1/proof/exports",
        json={"scope": "user_all"},
    )
    assert export.status_code in (401, 403), export.text

    assert client.post(
        "/v1/proof/folders",
        json={"folder_name": "Clients"},
    ).status_code in (401, 403)


def test_forged_cross_org_document_and_proof_fail(client: TestClient):
    doc = _finalize(client, user="owner-a")
    doc_id = doc["document_id"]

    forged = client.get(f"/v1/documents/{doc_id}", headers=_owner("attacker"))
    assert forged.status_code == 403, forged.text
    assert forged.json()["detail"]["code"] == "document_org_mismatch"

    sess = client.post(
        "/v1/sign-sessions",
        headers=_owner("attacker"),
        json={"document_id": doc_id, "content_sha256": doc["content_sha256"]},
    )
    assert sess.status_code == 403, sess.text

    # Owner completes → receipt bound via document owner_org_id
    ok_sess = client.post(
        "/v1/sign-sessions",
        headers=_owner("owner-a"),
        json={"document_id": doc_id, "content_sha256": doc["content_sha256"]},
    )
    assert ok_sess.status_code == 200
    sid = ok_sess.json()["session"]["session_id"]
    complete = client.post(
        f"/v1/sign-sessions/{sid}/complete",
        headers=_owner("owner-a"),
        json={
            "signer_ref": "owner",
            "intent": "sign",
            "signed_at": "2026-02-01T00:00:00Z",
            "field_manifest": _sample_manifest(),
        },
    )
    assert complete.status_code == 200
    rid = complete.json()["receipt_id"]

    stolen = client.get(
        f"/v1/proof/receipt/{rid}/status",
        headers=_owner("attacker"),
    )
    assert stolen.status_code == 403, stolen.text

    owner_ok = client.get(
        f"/v1/proof/receipt/{rid}/status",
        headers=_owner("owner-a"),
    )
    assert owner_ok.status_code == 200, owner_ok.text


def test_recipient_cannot_access_other_party_document(client: TestClient):
    aid = "ag_vs01_party_bind"
    _seed_agreement(aid=aid)
    _register_owner(aid, "owner-a")

    doc = _finalize(
        client,
        user="owner-a",
        agreement_id=aid,
        bound_party_id="p1",
    )
    doc_id = doc["document_id"]

    tok_p2 = _mint(agreement_id=aid, party_id="p2")
    denied = client.get(
        f"/v1/documents/{doc_id}",
        headers={"X-Claw-Recipient-Access-Token": tok_p2},
    )
    assert denied.status_code == 403, denied.text
    assert denied.json()["detail"]["code"] == "document_party_mismatch"

    tok_p1 = _mint(agreement_id=aid, party_id="p1")
    ok = client.get(
        f"/v1/documents/{doc_id}",
        headers={"X-Claw-Recipient-Access-Token": tok_p1},
    )
    assert ok.status_code == 200, ok.text

    # Cross-agreement token
    _seed_agreement(aid="ag_other")
    cross = _mint(agreement_id="ag_other", party_id="p1")
    cross_r = client.get(
        f"/v1/documents/{doc_id}",
        headers={"X-Claw-Recipient-Access-Token": cross},
    )
    assert cross_r.status_code == 403, cross_r.text


def test_owner_only_own_org_documents(client: TestClient):
    a = _finalize(client, user="owner-a")
    b = _finalize(client, user="owner-b")

    assert client.get(f"/v1/documents/{a['document_id']}", headers=_owner("owner-a")).status_code == 200
    assert client.get(f"/v1/documents/{b['document_id']}", headers=_owner("owner-a")).status_code == 403
    assert client.get(f"/v1/documents/{b['document_id']}", headers=_owner("owner-b")).status_code == 200


def test_missing_ownership_metadata_fails_closed(client: TestClient):
    meta = document_service.finalize_document(b"legacy-no-owner", content_type="application/pdf")
    doc_id = meta["document_id"]
    assert not meta.get("owner_org_id")

    r = client.get(f"/v1/documents/{doc_id}", headers=_owner("owner-a"))
    assert r.status_code == 403, r.text
    assert r.json()["detail"]["code"] == "document_ownership_unregistered"

    # Receipt without document ownership also fails closed
    packet = signature_service.prepare_sign_packet(
        document_id=doc_id,
        signer_ref="x",
        intent="y",
        signed_at="2026-02-01T00:00:00Z",
        field_manifest=_sample_manifest(),
    )
    receipt = receipt_service.issue_and_persist_receipt(
        sign_packet=packet["sign_packet"],
        protocol_version="claw-v1",
    )
    pr = client.get(
        f"/v1/proof/receipt/{receipt['receipt_id']}/status",
        headers=_owner("owner-a"),
    )
    assert pr.status_code == 403, pr.text
    assert pr.json()["detail"]["code"] in {
        "proof_ownership_unregistered",
        "proof_access_denied",
        "document_ownership_unregistered",
    }


def test_public_verify_remains_readonly_redacted(client: TestClient, monkeypatch):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    created = client.post(
        "/api/agreements/draft",
        headers=_owner("owner-a"),
        json={
            "title": "Public Verify",
            "jurisdiction": "TX",
            "parties": [
                {"name": "Owner Co", "role": "Client", "id": "p1", "email": "o@x.com"},
                {"name": "Signer Co", "role": "Service Provider", "id": "p2", "email": "s@x.com"},
            ],
            "purpose": "CONFIDENTIAL_PURPOSE_BODY",
            "payment_terms": "CONFIDENTIAL_PAYMENT_TERMS",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert created.status_code == 200, created.text
    aid = created.json()["id"]

    pub = client.get(f"/api/agreements/public/{aid}/verify")
    assert pub.status_code == 200, pub.text
    body = pub.json()
    dumped = str(body)
    assert "CONFIDENTIAL_PURPOSE_BODY" not in dumped
    assert "CONFIDENTIAL_PAYMENT_TERMS" not in dumped
    assert "draft" not in body or body.get("draft") in (None, {})
    pub2 = client.get(f"/api/agreements/public/{aid}/verify")
    assert pub2.status_code == 200


def test_agreement_proof_status_still_gated(client: TestClient, monkeypatch):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    created = client.post(
        "/api/agreements/draft",
        headers=_owner("owner-a"),
        json={
            "title": "Proof Status",
            "jurisdiction": "TX",
            "parties": [
                {"name": "Owner Co", "role": "Client", "id": "p1", "email": "o@x.com"},
                {"name": "Signer Co", "role": "Service Provider", "id": "p2", "email": "s@x.com"},
            ],
            "purpose": "x",
            "payment_terms": "y",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert created.status_code == 200
    aid = created.json()["id"]
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "0")

    anon = client.get(f"/api/agreements/{aid}/proof-status")
    assert anon.status_code in (401, 403), anon.text

    owner = client.get(f"/api/agreements/{aid}/proof-status", headers=_owner("owner-a"))
    assert owner.status_code == 200, owner.text
