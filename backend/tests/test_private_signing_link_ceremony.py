"""Path rule: a private signing link is enough to finish the existing ceremony."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services.agreement_draft_store import load_draft
from backend.tests.entitlement_test_support import ensure_headers_entitled

pytestmark = pytest.mark.unit

_ORG_H = {
    "X-Claw-Org-Id": "test-org-private-ceremony",
    "X-Claw-Test-Auth-User-Id": "owner-private-ceremony",
}

_PAINTED = (
    "SERVICES AGREEMENT\n\nThis Agreement is entered into by Priya Shah of Northline Studio "
    "and Diego Alvarez of Harbor Marks LLC to design a logo and brand kit. Payment $2,400 due "
    "on signing. Term 30 days. Governing law: Texas."
)


@pytest.fixture(autouse=True)
def _reset_usage(tmp_path, monkeypatch):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-private-ceremony-secret")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "0")
    monkeypatch.delenv("CLAW_COMMERCIAL_MODE", raising=False)
    from backend.usage_economics import store as usage_economics_store_mod

    usage_economics_store_mod._store = None  # noqa: SLF001
    from backend.economics.store import reset_economics_store_for_tests

    reset_economics_store_for_tests()
    ensure_headers_entitled(_ORG_H)
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001
    reset_economics_store_for_tests()


def _portable(aid: str, document_id: str) -> dict:
    return {
        "v": 1,
        "seed": {
            "v": 1,
            "documentId": document_id,
            "agreementId": aid,
            "corpusPlain": _PAINTED,
            "corpusHash": "afterpayhash",
            "savedAt": "2026-08-25T00:00:00Z",
        },
        "fields": [
            {
                "id": "priya_sig",
                "type": "signature",
                "page": 0,
                "x": 0.1,
                "y": 0.8,
                "width": 0.3,
                "height": 0.05,
                "counterpartyId": "p_priya",
                "assignedSignerRoleId": "role_priya",
            },
            {
                "id": "diego_sig",
                "type": "signature",
                "page": 0,
                "x": 0.55,
                "y": 0.8,
                "width": 0.3,
                "height": 0.05,
                "counterpartyId": "p_diego",
                "assignedSignerRoleId": "role_diego",
            },
        ],
        "roles": [
            {
                "roleId": "role_priya",
                "partyIndex": 0,
                "partyId": "p_priya",
                "vs01CounterpartyId": "p_priya",
                "entityName": "Priya Shah",
                "partyName": "Priya Shah",
                "signerEmail": "priya.shah.qa@example.com",
                "requiresSignature": True,
                "kind": "owner",
            },
            {
                "roleId": "role_diego",
                "partyIndex": 1,
                "partyId": "p_diego",
                "vs01CounterpartyId": "p_diego",
                "entityName": "Diego Alvarez",
                "partyName": "Diego Alvarez",
                "signerEmail": "diego.alvarez.qa@example.com",
                "requiresSignature": True,
                "kind": "counterparty",
            },
        ],
        "fieldCount": 2,
        "pageCount": 1,
        "initialsPolicy": {"enabled": False, "bodyPagesOnly": True},
    }


def test_after_pay_send_links_persists_packet_and_private_link_completes(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    """Send signing links without review-accept must still store the existing ceremony packet."""
    monkeypatch.setenv("CLAW_COMMERCIAL_MODE", "1")
    monkeypatch.setenv("CLAW_DOCUMENTS_DIR", str(tmp_path / "documents"))
    monkeypatch.setenv("CLAW_STORAGE_BACKEND", "local")
    from backend.services import document_service

    client = TestClient(app, raise_server_exceptions=False)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Services Agreement",
            "jurisdiction": "TX",
            "parties": [
                {
                    "id": "p_priya",
                    "name": "Priya Shah",
                    "role": "owner",
                    "email": "priya.shah.qa@example.com",
                },
                {
                    "id": "p_diego",
                    "name": "Diego Alvarez",
                    "role": "party",
                    "email": "diego.alvarez.qa@example.com",
                },
            ],
            "purpose": "Brand kit",
            "payment_terms": "Due on signing",
            "duration": "30 days",
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200, create_res.text
    aid = create_res.json()["id"]
    meta = document_service.finalize_document(
        b"%PDF-1.4 private-ceremony-packet",
        content_type="application/pdf",
        agreement_id=aid,
        owner_org_id="test-org-private-ceremony",
    )
    document_id = meta["document_id"]
    document_service.merge_document_meta(
        document_id,
        {"esign_handoff_v1": {"agreement_id": aid, "agreement_corpus_text": _PAINTED}},
    )
    portable = _portable(aid, document_id)

    with patch(
        "backend.services.email.signing_delivery.maybe_send_signing_invites_after_packet_prepared",
        return_value=None,
    ):
        sent = client.post(
            f"/api/agreements/{aid}/signing-links-sent",
            headers=_ORG_H,
            json={
                "packet_revision": "afterpay_rev_1",
                "document_id": document_id,
                "portable_packet": portable,
                "targets": [
                    {
                        "email": "priya.shah.qa@example.com",
                        "display_name": "Priya Shah",
                        "signing_url": f"https://lawdog.me/app/esign/{document_id}?vs01_recipient_sign=1",
                        "signer_role_id": "role_priya",
                        "is_owner": True,
                    },
                    {
                        "email": "diego.alvarez.qa@example.com",
                        "display_name": "Diego Alvarez",
                        "signing_url": f"https://lawdog.me/app/esign/{document_id}?vs01_recipient_sign=1",
                        "signer_role_id": "role_diego",
                        "is_owner": False,
                    },
                ],
            },
        )
    assert sent.status_code == 200, sent.text
    draft = load_draft(aid)
    stored = draft.get("vs01_signing_packet_v1")
    assert isinstance(stored, dict), "private-link ceremony requires a durable packet"
    assert stored.get("document_id") == document_id
    assert stored.get("portable", {}).get("fields")
    assert len(stored["portable"]["roles"]) == 2

    public = client.get(
        f"/api/agreements/public/{aid}/vs01-signing-packet",
        params={"document_id": document_id, "packet_revision": "afterpay_rev_1"},
    )
    assert public.status_code == 200, public.text
    assert public.json()["portable"]["fields"][0]["id"] == "priya_sig"

    from backend.services.agreement_signing_lock_store import write_signing_lock

    write_signing_lock(aid, {"locked_version_id": "v1", "locked_at": "2026-08-25T00:00:00Z"})
    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG_H,
        json={"mode": "sign", "role": "signer", "recipient_party_id": "p_priya"},
    )
    assert mint.status_code == 200, mint.text
    token = mint.json()["token"]

    complete = client.post(
        f"/api/agreements/{aid}/vs01-signer-complete",
        headers={"X-Claw-Recipient-Access-Token": token},
        json={
            "signer_role_id": "role_priya",
            "participant_id": "p_priya",
            "document_id": document_id,
            "display_name": "Priya Shah",
        },
    )
    assert complete.status_code == 200, complete.text
    body = complete.json()
    assert body.get("ok") is True
    signed = body.get("signed_count") or body.get("signedCount")
    if signed is not None:
        assert int(signed) >= 1


def test_document_content_accepts_recipient_token_without_workspace_session(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    monkeypatch.setenv("CLAW_COMMERCIAL_MODE", "1")
    monkeypatch.setenv("CLAW_DOCUMENTS_DIR", str(tmp_path / "documents"))
    monkeypatch.setenv("CLAW_STORAGE_BACKEND", "local")
    from backend.services import document_service
    from backend.services.agreement_signing_lock_store import write_signing_lock

    client = TestClient(app, raise_server_exceptions=False)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Services Agreement",
            "jurisdiction": "TX",
            "parties": [
                {"id": "p_priya", "name": "Priya Shah", "role": "owner", "email": "priya.shah.qa@example.com"},
                {"id": "p_diego", "name": "Diego Alvarez", "role": "party", "email": "diego.alvarez.qa@example.com"},
            ],
            "purpose": "Brand kit",
            "payment_terms": "Due on signing",
            "duration": "30 days",
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200, create_res.text
    aid = create_res.json()["id"]
    meta = document_service.finalize_document(
        b"%PDF-1.4 private-ceremony",
        content_type="application/pdf",
        agreement_id=aid,
        owner_org_id="test-org-private-ceremony",
    )
    doc_id = meta["document_id"]
    document_service.merge_document_meta(
        doc_id,
        {"esign_handoff_v1": {"agreement_id": aid, "agreement_corpus_text": _PAINTED}},
    )

    write_signing_lock(aid, {"locked_version_id": "v1", "locked_at": "2026-08-25T00:00:00Z"})
    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG_H,
        json={"mode": "sign", "role": "signer", "recipient_party_id": "p_priya"},
    )
    assert mint.status_code == 200, mint.text
    token = mint.json()["token"]

    # Leftover anon-* org without session must not be required.
    blocked = client.get(
        f"/v1/documents/{doc_id}/content",
        headers={"X-Claw-Org-Id": "anon-leftover-without-session"},
    )
    # Capability (esign_handoff) or explicit deny — never anonymous_session_required once handoff exists.
    if blocked.status_code != 200:
        detail = blocked.json().get("detail") or {}
        assert detail.get("code") != "anonymous_session_required", blocked.text

    content = client.get(
        f"/v1/documents/{doc_id}/content",
        headers={"X-Claw-Recipient-Access-Token": token},
    )
    assert content.status_code == 200, content.text
    assert content.content.startswith(b"%PDF")

    capability = client.get(f"/v1/documents/{doc_id}/content")
    assert capability.status_code == 200, capability.text
    assert capability.content.startswith(b"%PDF")
