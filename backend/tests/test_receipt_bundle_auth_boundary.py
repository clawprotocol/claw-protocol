"""
Patch 4 adversarial: raw receipt/bundle authorization.

Anonymous / guessed-id / cross-org / cross-party access must fail in commercial mode.
"""

from __future__ import annotations

from backend.tests.entitlement_test_support import ensure_headers_entitled, ensure_org_pro_entitlement

import base64
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(autouse=True)
def _entitle_owner_org_after_env(tmp_path, monkeypatch):
    """Grant Pro for primary owner headers once tmp_path-backed DBs are configured."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ONRAMP_DB_PATH", str(tmp_path / "onramp.sqlite3"))
    monkeypatch.setenv("CLAW_TREASURY_DB_PATH", str(tmp_path / "treasury.sqlite3"))
    from backend.economics.store import reset_economics_store_for_tests
    reset_economics_store_for_tests()
    for _name in ("_ORG_H", "_OWNER_H", "OWNER_HEADERS", "_HEADERS", "ORG_HEADERS", "_OWNER"):
        h = globals().get(_name)
        if isinstance(h, dict) and h.get("X-Claw-Org-Id"):
            ensure_headers_entitled(h)
    yield
    reset_economics_store_for_tests()

from backend.security.recipient_access_token import mint_recipient_access_token
from backend.services import document_service, receipt_service, signature_service
from backend.services.agreement_draft_store import save_draft
from backend.services.agreement_signing_lock_store import write_signing_lock


_SECRET = "unit-test-receipt-bundle-auth-boundary-secret"


@pytest.fixture()
def client(monkeypatch, tmp_path: Path):
    from backend.storage.artifact_repository import reset_artifact_repository_singleton
    from backend.usage_economics import store as usage_economics_store_mod
    from backend.economics.store import reset_economics_store_for_tests
    from backend.payments.store import reset_onramp_store_for_tests

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
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_ONRAMP_DB_PATH", str(tmp_path / "onramp.sqlite3"))
    monkeypatch.setenv("CLAW_TREASURY_DB_PATH", str(tmp_path / "treasury.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_METERING_ENABLED", "1")
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", _SECRET)
    monkeypatch.setenv("CLAW_PUBLIC_AGREEMENT_VERIFY", "1")
    monkeypatch.setenv("CLAW_COMMERCIAL_MODE", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "0")
    monkeypatch.delenv("CLAW_RECIPIENT_ACCESS_TOKEN_REQUIRED", raising=False)
    reset_artifact_repository_singleton()
    reset_economics_store_for_tests()
    reset_onramp_store_for_tests()
    return TestClient(app)


def _owner(user: str = "owner-a") -> dict[str, str]:
    return {"X-Claw-Org-Id": f"user-{user}", "X-Claw-Test-Auth-User-Id": user}


def _manifest():
    return [{"field_id": "sig1", "page_index": 0, "x": 1.0, "y": 2.0, "w": 3.0, "h": 4.0}]


def _issue_owned_receipt(client: TestClient, *, user: str = "owner-a", **finalize_extra) -> dict:
    raw = b"%PDF-1.4 receipt-auth"
    fin = client.post(
        "/v1/documents",
        headers=_owner(user),
        json={
            "content_base64": base64.b64encode(raw).decode("ascii"),
            "content_type": "application/pdf",
            **finalize_extra,
        },
    )
    assert fin.status_code == 200, fin.text
    doc = fin.json()
    sess = client.post(
        "/v1/sign-sessions",
        headers=_owner(user),
        json={"document_id": doc["document_id"], "content_sha256": doc["content_sha256"]},
    )
    assert sess.status_code == 200, sess.text
    sid = sess.json()["session"]["session_id"]
    complete = client.post(
        f"/v1/sign-sessions/{sid}/complete",
        headers=_owner(user),
        json={
            "signer_ref": "owner",
            "intent": "sign",
            "signed_at": "2026-02-01T00:00:00Z",
            "field_manifest": _manifest(),
        },
    )
    assert complete.status_code == 200, complete.text
    return {
        "receipt_id": complete.json()["receipt_id"],
        "document_id": doc["document_id"],
        "owner": user,
    }


def _seed_agreement(aid: str) -> None:
    save_draft(
        {
            "id": aid,
            "title": "Bound",
            "parties": [
                {"name": "Owner LLC", "role": "Client", "email": "o@example.com", "id": "p1"},
                {"name": "CP LLC", "role": "Service Provider", "email": "c@example.com", "id": "p2"},
            ],
            "versions": [],
            "audit_log": [],
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
        }
    )
    write_signing_lock(aid, {"locked_version_id": "v1"})


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


def _mint(*, agreement_id: str, party_id: str) -> str:
    from backend.services.agreement_draft_store import load_draft
    from backend.services.recipient_delivery_registry import (
        extract_jti_from_token,
        record_invite_sent_cas,
    )

    tok = mint_recipient_access_token(
        secret=_SECRET.encode("utf-8"),
        agreement_id=agreement_id,
        locked_version_id="v1",
        mode="sign",
        role="signer",
        ttl_seconds=3600,
        recipient_party_id=party_id,
    )
    draft = load_draft(agreement_id)
    assert draft is not None
    record_invite_sent_cas(
        draft,
        phase="signing",
        participant_id=party_id,
        jti=extract_jti_from_token(tok),
        audit_log=draft.setdefault("audit_log", []),
    )
    return tok


def test_anonymous_receipt_and_bundle_fail(client: TestClient):
    issued = _issue_owned_receipt(client)
    rid = issued["receipt_id"]

    assert client.get(f"/v1/receipts/{rid}").status_code in (401, 403)
    assert client.get(f"/v1/receipts/{rid}/bundle").status_code in (401, 403)
    assert client.get(f"/v1/proof/receipt/{rid}/export").status_code in (401, 403)


def test_guessed_receipt_ids_fail(client: TestClient):
    forged = "rcpt_" + ("0" * 32)
    # Authenticated attacker probing a non-existent / foreign id.
    r = client.get(f"/v1/receipts/{forged}", headers=_owner("attacker"))
    assert r.status_code in (403, 404), r.text
    b = client.get(f"/v1/receipts/{forged}/bundle", headers=_owner("attacker"))
    assert b.status_code in (403, 404), b.text


def test_cross_org_owner_cannot_read_receipt_or_bundle(client: TestClient):
    issued = _issue_owned_receipt(client, user="owner-a")
    rid = issued["receipt_id"]

    stolen = client.get(f"/v1/receipts/{rid}", headers=_owner("attacker"))
    assert stolen.status_code == 403, stolen.text
    assert stolen.json()["detail"]["code"] == "document_org_mismatch"

    stolen_b = client.get(f"/v1/receipts/{rid}/bundle", headers=_owner("attacker"))
    assert stolen_b.status_code == 403, stolen_b.text

    ok = client.get(f"/v1/receipts/{rid}", headers=_owner("owner-a"))
    assert ok.status_code == 200, ok.text
    ok_b = client.get(f"/v1/receipts/{rid}/bundle", headers=_owner("owner-a"))
    assert ok_b.status_code == 200, ok_b.text
    assert ok_b.headers.get("content-type", "").startswith("application/zip")


def test_recipient_cannot_access_other_party_receipt(client: TestClient):
    aid = "ag_receipt_party_bind"
    _seed_agreement(aid)
    _register_owner(aid, "owner-a")
    issued = _issue_owned_receipt(
        client,
        user="owner-a",
        agreement_id=aid,
        bound_party_id="p1",
    )
    rid = issued["receipt_id"]

    denied = client.get(
        f"/v1/receipts/{rid}",
        headers={"X-Claw-Recipient-Access-Token": _mint(agreement_id=aid, party_id="p2")},
    )
    assert denied.status_code == 403, denied.text
    assert denied.json()["detail"]["code"] == "document_party_mismatch"

    denied_b = client.get(
        f"/v1/receipts/{rid}/bundle",
        headers={"X-Claw-Recipient-Access-Token": _mint(agreement_id=aid, party_id="p2")},
    )
    assert denied_b.status_code == 403, denied_b.text

    ok = client.get(
        f"/v1/receipts/{rid}",
        headers={"X-Claw-Recipient-Access-Token": _mint(agreement_id=aid, party_id="p1")},
    )
    assert ok.status_code == 200, ok.text
    ok_b = client.get(
        f"/v1/receipts/{rid}/bundle",
        headers={"X-Claw-Recipient-Access-Token": _mint(agreement_id=aid, party_id="p1")},
    )
    assert ok_b.status_code == 200, ok_b.text


def test_legacy_unowned_receipt_fails_closed(client: TestClient):
    meta = document_service.finalize_document(b"legacy-unowned", content_type="application/pdf")
    assert not meta.get("owner_org_id")
    packet = signature_service.prepare_sign_packet(
        document_id=meta["document_id"],
        signer_ref="x",
        intent="y",
        signed_at="2026-02-01T00:00:00Z",
        field_manifest=_manifest(),
    )
    receipt = receipt_service.issue_and_persist_receipt(
        sign_packet=packet["sign_packet"],
        protocol_version="claw-v1",
    )
    rid = receipt["receipt_id"]

    r = client.get(f"/v1/receipts/{rid}", headers=_owner("owner-a"))
    assert r.status_code == 403, r.text
    assert r.json()["detail"]["code"] == "document_ownership_unregistered"

    b = client.get(f"/v1/receipts/{rid}/bundle", headers=_owner("owner-a"))
    assert b.status_code == 403, b.text


def test_usage_receipt_and_bundle_org_bound(client: TestClient, monkeypatch, tmp_path: Path):
    from backend.billing import usage_metering
    from backend.economics.store import get_economics_store
    from backend.payments.service import settle_onramp_payment
    from backend.payments.store import get_onramp_store
    from backend.treasury.treasury_store import TreasuryStore

    monkeypatch.setenv("CLAW_ONRAMP_DB_PATH", str(tmp_path / "onramp2.sqlite3"))
    monkeypatch.setenv("CLAW_TREASURY_DB_PATH", str(tmp_path / "treasury2.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics2.sqlite3"))
    from backend.economics.store import reset_economics_store_for_tests
    from backend.payments.store import reset_onramp_store_for_tests

    reset_economics_store_for_tests()
    reset_onramp_store_for_tests()

    org = "user-owner-a"
    o = get_onramp_store()
    o.init_schema()
    t = TreasuryStore(path=str(tmp_path / "treasury2.sqlite3"))
    t.init_schema()
    e = get_economics_store()
    e.init_schema()

    settle = settle_onramp_payment(
        provider="coinbase",
        provider_payment_id="p4-ur1",
        org_id=org,
        amount_usd=Decimal("50.00"),
        tx_hash="0xp4ur1",
        store=o,
        treasury=t,
    )
    assert settle["ok"] is True
    mu = usage_metering.meter_usage(
        org_id=org,
        user_id="owner-a",
        service_type="esign_create",
        unit_count=1.0,
        economics=e,
    )
    assert mu["ok"] is True, mu
    uid = mu["usage_event_id"]

    anon = client.get(f"/v1/usage/{uid}/receipt")
    assert anon.status_code in (401, 403), anon.text

    cross = client.get(f"/v1/usage/{uid}/receipt", headers=_owner("attacker"))
    assert cross.status_code == 403, cross.text
    assert cross.json()["detail"]["code"] == "usage_receipt_org_mismatch"

    ok = client.get(f"/v1/usage/{uid}/receipt", headers=_owner("owner-a"))
    assert ok.status_code == 200, ok.text
    assert ok.json()["usage_event_id"] == uid

    ok_b = client.get(f"/v1/usage/{uid}/bundle", headers=_owner("owner-a"))
    assert ok_b.status_code == 200, ok_b.text

    guessed = client.get(
        f"/v1/usage/{'0' * 32}/receipt",
        headers=_owner("owner-a"),
    )
    assert guessed.status_code in (403, 404), guessed.text


def test_public_verify_not_raw_receipt_download(client: TestClient, monkeypatch):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    headers = ensure_headers_entitled(_owner("owner-a"))
    created = client.post(
        "/api/agreements/draft",
        headers=headers,
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
    # Not a raw VS01 receipt or zip bundle download.
    assert "receipt_hash_sha256" not in body
    assert "sign_packet" not in dumped.lower()
    assert body.get("agreement_id") == aid
