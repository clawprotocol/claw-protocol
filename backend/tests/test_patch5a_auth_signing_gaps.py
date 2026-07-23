"""
Patch 5A adversarial: owner-write bind, layout analyze IDOR, packet JTI cancel,
and legacy router fail-closed in commercial mode.
"""

from __future__ import annotations

import base64

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.security.recipient_access_token import mint_recipient_access_token
from backend.services.agreement_draft_store import load_draft
from backend.services.agreement_signing_lock_store import write_signing_lock
from backend.services.recipient_delivery_registry import (
    extract_jti_from_token,
    is_jti_superseded,
)

fitz = pytest.importorskip("fitz")

_SECRET = "unit-test-patch5a-auth-signing-secret"


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
    monkeypatch.setenv("CLAW_LAYOUT_ANALYSIS_DIR", str(tmp_path / "layout"))
    monkeypatch.setenv("CLAW_STORAGE_BACKEND", "local")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", _SECRET)
    monkeypatch.setenv("CLAW_COMMERCIAL_MODE", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "0")
    monkeypatch.delenv("CLAW_RECIPIENT_ACCESS_TOKEN_REQUIRED", raising=False)
    reset_artifact_repository_singleton()
    return TestClient(app)


def _owner(user: str = "owner-a") -> dict[str, str]:
    return {"X-Claw-Org-Id": f"user-{user}", "X-Claw-Test-Auth-User-Id": user}


def _create_owned_draft(client: TestClient, *, user: str = "owner-a") -> str:
    """Create draft; ownership registers even when economics metering is off (commercial)."""
    r = client.post(
        "/api/agreements/draft",
        headers=_owner(user),
        json={
            "title": "Owned",
            "jurisdiction": "TX",
            "parties": [
                {"name": "Owner Co", "role": "Client", "id": "p1", "email": "o@x.com"},
                {"name": "Signer Co", "role": "Service Provider", "id": "p2", "email": "s@x.com"},
            ],
            "purpose": "Purpose",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _tiny_pdf_b64() -> str:
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    page.insert_text((72, 120), "Signature: ___________________________", fontsize=12)
    raw = doc.tobytes()
    doc.close()
    return base64.b64encode(raw).decode("ascii")


def test_cross_org_owner_mutations_fail_when_economics_off(client: TestClient, monkeypatch):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "0")
    monkeypatch.setenv("CLAW_COMMERCIAL_MODE", "1")
    aid = _create_owned_draft(client, user="owner-a")

    # Confirm ownership row exists despite economics off.
    from backend.usage_economics.store import get_usage_economics_store

    store = get_usage_economics_store()
    store.init_schema()
    assert store.owner_subject_for_agreement(aid) == "org:user-owner-a"

    for path, method, json_body in (
        (f"/api/agreements/{aid}/review-sent", "post", None),
        (f"/api/agreements/{aid}/signing-packet/cancel", "post", {}),
    ):
        if method == "post":
            r = client.post(path, headers=_owner("owner-b"), json=json_body)
        else:
            r = client.get(path, headers=_owner("owner-b"))
        assert r.status_code == 403, (path, r.text)
        detail = r.json().get("detail") or {}
        assert detail.get("code") in {
            "workspace_mismatch",
            "ownership_not_registered",
            "agreement_read_denied",
        }, detail

    # Owner A can still mutate.
    ok = client.post(f"/api/agreements/{aid}/review-sent", headers=_owner("owner-a"))
    assert ok.status_code == 200, ok.text


def test_layout_analyze_by_document_id_cross_org_fails(client: TestClient):
    fin = client.post(
        "/v1/documents",
        headers=_owner("owner-a"),
        json={
            "content_base64": _tiny_pdf_b64(),
            "content_type": "application/pdf",
        },
    )
    assert fin.status_code == 200, fin.text
    doc_id = fin.json()["document_id"]

    stolen = client.post(
        "/v1/document-layout/analyze",
        headers=_owner("owner-b"),
        json={
            "document_id": doc_id,
            "options": {"assistive_llm": False, "persist": True},
        },
    )
    assert stolen.status_code == 403, stolen.text
    assert stolen.json()["detail"]["code"] == "document_org_mismatch"

    integ = client.post(
        "/v1/integration/documents/analyze",
        headers=_owner("owner-b"),
        json={
            "document_id": doc_id,
            "options": {"assistive_llm": False, "persist": True},
        },
    )
    assert integ.status_code == 403, integ.text

    own = client.post(
        "/v1/document-layout/analyze",
        headers=_owner("owner-a"),
        json={
            "document_id": doc_id,
            "options": {"assistive_llm": False, "persist": True},
        },
    )
    assert own.status_code == 200, own.text
    assert own.json().get("owner_org_id") == "user-owner-a"


def _seed_packet_and_invite(aid: str, *, party_id: str = "p2") -> str:
    draft = load_draft(aid)
    draft["vs01_signing_packet_v1"] = {
        "v": 1,
        "document_id": "doc_vs01",
        "packet_state": "active",
        "portable": {
            "v": 1,
            "seed": {"documentId": "doc_vs01", "agreementId": aid, "corpusPlain": "x" * 1600},
            "roles": [
                {"roleId": "role_owner", "partyIndex": 0, "requiresSignature": True},
                {"roleId": "role_cp", "partyIndex": 1, "requiresSignature": True},
            ],
            "fields": [
                {
                    "id": "cp_sig",
                    "assignedSignerRoleId": "role_cp",
                    "counterpartyId": party_id,
                    "type": "signature",
                }
            ],
        },
    }
    write_signing_lock(aid, {"locked_version_id": "v1"})
    tok = mint_recipient_access_token(
        secret=_SECRET.encode("utf-8"),
        agreement_id=aid,
        locked_version_id="v1",
        mode="sign",
        role="signer",
        ttl_seconds=3600,
        recipient_party_id=party_id,
    )
    jti = extract_jti_from_token(tok)
    audit = draft.setdefault("audit_log", [])
    from backend.services.recipient_delivery_registry import record_invite_sent_cas

    # Security-owned registry requires CAS — generic save_draft cannot bind JTIs.
    record_invite_sent_cas(
        draft,
        phase="signing",
        participant_id=party_id,
        jti=jti,
        email="s@x.com",
        audit_log=audit,
    )
    return tok


def test_recipient_cannot_complete_after_packet_cancel(client: TestClient):
    aid = _create_owned_draft(client, user="owner-a")
    tok = _seed_packet_and_invite(aid)

    cancel = client.post(
        f"/api/agreements/{aid}/signing-packet/cancel",
        headers=_owner("owner-a"),
        json={},
    )
    assert cancel.status_code == 200, cancel.text
    assert cancel.json()["packet_state"] == "cancelled"

    # Idempotent second cancel
    cancel2 = client.post(
        f"/api/agreements/{aid}/signing-packet/cancel",
        headers=_owner("owner-a"),
        json={},
    )
    assert cancel2.status_code == 200, cancel2.text

    complete = client.post(
        f"/api/agreements/{aid}/vs01-signer-complete",
        headers={"X-Claw-Recipient-Access-Token": tok},
        json={
            "signer_role_id": "role_cp",
            "participant_id": "p2",
            "document_id": "doc_vs01",
        },
    )
    assert complete.status_code == 403, complete.text
    detail = complete.json().get("detail") or {}
    assert detail.get("code") in {
        "invite_superseded",
        "packet_cancelled",
        "token_expired",
        "invalid_token",
    }, detail

    draft = load_draft(aid)
    jti = extract_jti_from_token(tok)
    assert is_jti_superseded(draft, jti, "signing", "p2")


def test_reissue_supersedes_old_jti_new_invite_ok(client: TestClient, monkeypatch, tmp_path):
    """Reissue invalidates prior signing JTIs; a newly recorded invite is not superseded."""
    from backend.tests.auth_fixtures import persist_and_accept_review_snapshot

    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    aid = _create_owned_draft(client, user="owner-a")
    accepted = persist_and_accept_review_snapshot(
        client,
        aid,
        "y" * 1600,
        headers=_owner("owner-a"),
    )
    corpus_hash = "abc123"
    portable = {
        "v": 1,
        "seed": {
            "v": 1,
            "documentId": "doc_frozen",
            "agreementId": aid,
            "corpusHash": corpus_hash,
            "corpusPlain": "y" * 1600,
        },
        "roles": [
            {"roleId": "role_owner", "partyIndex": 0, "requiresSignature": True},
            {"roleId": "role_cp", "partyIndex": 1, "requiresSignature": True},
        ],
        "fields": [],
        "authorityMode": "accepted_review_snapshot",
    }
    frozen = {
        "version": 1,
        "agreementId": aid,
        "agreementSessionId": "sess",
        "frozenCorpusHash": corpus_hash,
        "frozenAt": "2026-07-08T00:00:00.000Z",
        "parties": [
            {"agreementPartyId": "p1", "legalEntityName": "Owner Co", "canonicalOrder": 0},
            {"agreementPartyId": "p2", "legalEntityName": "Signer Co", "canonicalOrder": 1},
        ],
        "signers": [
            {
                "signerRecordId": "s1",
                "agreementPartyId": "p1",
                "signerEmail": "o@x.com",
                "signingOrder": 0,
                "requiresSignature": True,
                "requiresInitials": False,
            },
            {
                "signerRecordId": "s2",
                "agreementPartyId": "p2",
                "signerEmail": "s@x.com",
                "signingOrder": 1,
                "requiresSignature": True,
                "requiresInitials": False,
            },
        ],
        "recipients": [],
        "execution": {
            "partyOrder": ["p1", "p2"],
            "signerOrder": ["s1", "s2"],
            "executionBlockHash": "exec",
        },
    }
    sent = client.post(
        f"/api/agreements/{aid}/signing-links-sent",
        headers=_owner("owner-a"),
        json={
            "packet_revision": "rev_v1",
            "document_id": "doc_frozen",
            "portable_packet": portable,
            "frozen_signing_authority": frozen,
            "accepted_review_snapshot_id": accepted["snapshot_id"],
            "accepted_review_snapshot_digest": accepted["corpus_sha256"],
            "targets": [],
        },
    )
    assert sent.status_code == 200, sent.text

    write_signing_lock(aid, {"locked_version_id": "v1"})
    old_tok = mint_recipient_access_token(
        secret=_SECRET.encode("utf-8"),
        agreement_id=aid,
        locked_version_id="v1",
        mode="sign",
        role="signer",
        ttl_seconds=3600,
        recipient_party_id="p2",
    )
    draft = load_draft(aid)
    from backend.services.recipient_delivery_registry import record_invite_sent_cas

    record_invite_sent_cas(
        draft,
        phase="signing",
        participant_id="p2",
        jti=extract_jti_from_token(old_tok),
        email="s@x.com",
        audit_log=draft.setdefault("audit_log", []),
    )

    reissue = client.post(
        f"/api/agreements/{aid}/signing-packet/reissue",
        headers=_owner("owner-a"),
        json={
            "packet_revision": "rev_v2",
            "document_id": "doc_frozen",
            "portable_packet": portable,
            "frozen_signing_authority": frozen,
            "accepted_review_snapshot_id": accepted["snapshot_id"],
            "accepted_review_snapshot_digest": accepted["corpus_sha256"],
        },
    )
    assert reissue.status_code == 200, reissue.text
    assert reissue.json()["packet_state"] == "active"

    old_complete = client.post(
        f"/api/agreements/{aid}/vs01-signer-complete",
        headers={"X-Claw-Recipient-Access-Token": old_tok},
        json={
            "signer_role_id": "role_cp",
            "participant_id": "p2",
            "document_id": "doc_frozen",
        },
    )
    assert old_complete.status_code == 403, old_complete.text

    new_tok = mint_recipient_access_token(
        secret=_SECRET.encode("utf-8"),
        agreement_id=aid,
        locked_version_id="v1",
        mode="sign",
        role="signer",
        ttl_seconds=3600,
        recipient_party_id="p2",
    )
    draft2 = load_draft(aid)
    record_invite_sent_cas(
        draft2,
        phase="signing",
        participant_id="p2",
        jti=extract_jti_from_token(new_tok),
        email="s@x.com",
        audit_log=draft2.setdefault("audit_log", []),
    )
    draft2 = load_draft(aid)
    assert not is_jti_superseded(draft2, extract_jti_from_token(new_tok), "signing", "p2")
    assert is_jti_superseded(draft2, extract_jti_from_token(old_tok), "signing", "p2")

    # New token validates (not superseded); old remains superseded.
    val = client.get(
        "/api/agreements/access/validate",
        params={"token": new_tok, "agreement_id": aid},
    )
    assert val.status_code == 200, val.text


def test_anonymous_legacy_workflow_agreements_esign_fail_commercial(client: TestClient):
    assert client.get("/v1/workflow/agreement/ag_any").status_code == 403
    assert client.post(
        "/v1/workflow/agreement/export",
        json={"agreement_id": "ag_any"},
    ).status_code == 403
    assert client.post(
        "/v1/workflow/state/export",
        json={"agreement_id": "ag_any"},
    ).status_code == 403
    assert client.post(
        "/v1/workflow/bundle/export_zip",
        json={"created_at": "2026-01-01T00:00:00Z", "agreement": {"body": "secret"}},
    ).status_code == 403
    assert client.post(
        "/v1/agreements/create",
        json={
            "agreement_id": "ag_x",
            "title": "t",
            "parties": [{"name": "A", "role": "owner"}],
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
        },
    ).status_code == 403
    assert client.post(
        "/v1/esign/create",
        json={
            "document_base64": base64.b64encode(b"x").decode("ascii"),
            "title": "t",
            "mime": "text/plain",
            "size": 1,
            "signers": [{"name": "A", "email": "a@x.com", "role": "signer"}],
            "created_at": "2026-01-01T00:00:00Z",
        },
    ).status_code == 403


def test_legacy_workflow_allowed_in_explicit_test_without_commercial(monkeypatch, tmp_path):
    """Documented: local/dev/test without CLAW_COMMERCIAL_MODE keeps legacy routers."""
    from backend.usage_economics import store as usage_economics_store_mod

    usage_economics_store_mod._store = None  # noqa: SLF001
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.delenv("CLAW_COMMERCIAL_MODE", raising=False)
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    c = TestClient(app)
    draft = c.post(
        "/v1/workflow/agreement/draft",
        json={
            "agreement_id": "ag_legacy_ok",
            "title": "Legacy",
            "jurisdiction": "TX",
            "parties": ["Alice"],
            "effective_date": "2026-01-01",
            "body_markdown": "Hello",
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
        },
    )
    assert draft.status_code == 200, draft.text
    got = c.get("/v1/workflow/agreement/ag_legacy_ok")
    assert got.status_code == 200, got.text
    assert (got.json().get("detail") or {}).get("code") != "legacy_router_disabled"
