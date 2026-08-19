"""Signing invite emails after VS01 packet prepare."""

from __future__ import annotations

from backend.tests.entitlement_test_support import ensure_headers_entitled, ensure_org_pro_entitlement

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services.email.review_delivery import COUNTERPARTY_REVIEWS_COMPLETE_NOTIFIED_EVENT
from backend.services.email.signing_delivery import SIGNING_INVITE_EMAILS_SENT_EVENT
from backend.tests.auth_fixtures import persist_and_accept_review_snapshot

pytestmark = pytest.mark.unit

_ORG_H = {"X-Claw-Org-Id": "test-org-signing-invite", "X-Claw-Test-Auth-User-Id": "test-owner"}


@pytest.fixture(autouse=True)
def _entitle_owner_org_after_env(tmp_path, monkeypatch):
    """Grant Pro for module owner headers once tmp_path-backed DBs are configured."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ONRAMP_DB_PATH", str(tmp_path / "onramp.sqlite3"))
    monkeypatch.setenv("CLAW_TREASURY_DB_PATH", str(tmp_path / "treasury.sqlite3"))
    from backend.economics.store import reset_economics_store_for_tests
    reset_economics_store_for_tests()
    ensure_headers_entitled(_ORG_H)
    yield
    reset_economics_store_for_tests()

_CORPUS = "x" * 1600


@pytest.fixture(autouse=True)
def _reset_usage_economics_singleton():
    from backend.usage_economics import store as usage_economics_store_mod

    usage_economics_store_mod._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001


def _mock_resend_success() -> MagicMock:
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = '{"id":"msg_ok"}'
    mock_response.json.return_value = {"id": "msg_ok"}
    mock_client = MagicMock()
    mock_client.post.return_value = mock_response
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    return mock_client


def _env_common(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    # Explicit non-commercial unit fixtures may use tokenless URLs; commercial
    # fail-closed delivery is covered in test_signing_token_jti_registry_fail_closed.
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.delenv("CLAW_COMMERCIAL_MODE", raising=False)
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <notifications@lawdog.me>")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-signing-invite-secret")


def _create_agreement(client: TestClient) -> str:
    ensure_headers_entitled(_ORG_H)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Services Agreement",
            "jurisdiction": "TX",
            "parties": [
                {
                    "id": "p_owner",
                    "name": "Red Mesa Logistics LLC",
                    "role": "owner",
                    "email": "owner@example.com",
                },
                {
                    "id": "p_cp",
                    "name": "Harbor Peak Automation LLC",
                    "role": "party",
                    "email": "cp@example.com",
                },
            ],
            "purpose": "Services",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    return create_res.json()["id"]


def _minimal_frozen_authority(aid: str, corpus_hash: str = "abc123") -> dict:
    return {
        "version": 1,
        "agreementId": aid,
        "agreementSessionId": "sess_invite",
        "frozenCorpusHash": corpus_hash,
        "frozenAt": "2026-07-08T00:00:00.000Z",
        "parties": [
            {"agreementPartyId": "p_owner", "legalEntityName": "Red Mesa Logistics LLC", "canonicalOrder": 0},
            {"agreementPartyId": "p_cp", "legalEntityName": "Harbor Peak Automation LLC", "canonicalOrder": 1},
        ],
        "signers": [
            {
                "signerRecordId": "signer:p_owner:0",
                "agreementPartyId": "p_owner",
                "signerEmail": "owner@example.com",
                "signingOrder": 0,
                "requiresSignature": True,
                "requiresInitials": False,
            },
            {
                "signerRecordId": "signer:p_cp:0",
                "agreementPartyId": "p_cp",
                "signerEmail": "cp@example.com",
                "signingOrder": 1,
                "requiresSignature": True,
                "requiresInitials": False,
            },
        ],
        "recipients": [],
        "execution": {
            "partyOrder": ["p_owner", "p_cp"],
            "signerOrder": ["signer:p_owner:0", "signer:p_cp:0"],
            "executionBlockHash": "exec",
        },
    }


def test_signing_links_sent_emails_all_parties(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    mock_client = _mock_resend_success()
    client = TestClient(app)
    aid = _create_agreement(client)
    body = {
        "packet_revision": "rev_parallel_1",
        "targets": [
            {
                "email": "owner@example.com",
                "display_name": "Red Mesa Logistics LLC",
                "signing_url": "https://app.example.com/sign?vs01_recipient_sign=1&owner=1",
                "signer_role_id": "role_owner",
                "is_owner": True,
            },
            {
                "email": "cp@example.com",
                "display_name": "Harbor Peak Automation LLC",
                "signing_url": "https://app.example.com/sign?vs01_recipient_sign=1&cp=1",
                "signer_role_id": "role_cp",
                "is_owner": False,
            },
        ],
    }
    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        res = client.post(
            f"/api/agreements/{aid}/signing-links-sent",
            headers=_ORG_H,
            json=body,
        )
    assert res.status_code == 200
    payload = res.json()
    assert payload.get("sent_count") == 2
    assert mock_client.post.call_count == 2
    recipients = {call[1]["json"]["to"][0] for call in mock_client.post.call_args_list}
    assert recipients == {"owner@example.com", "cp@example.com"}
    audit_types = [e.get("event_type") for e in payload["draft"].get("audit_log") or []]
    assert SIGNING_INVITE_EMAILS_SENT_EVENT in audit_types


def test_signing_links_sent_is_idempotent_per_packet_revision(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    mock_client = _mock_resend_success()
    client = TestClient(app)
    aid = _create_agreement(client)
    body = {
        "packet_revision": "rev_parallel_2",
        "targets": [
            {
                "email": "owner@example.com",
                "display_name": "Owner",
                "signing_url": "https://app.example.com/sign?vs01_recipient_sign=1",
                "signer_role_id": "role_owner",
                "is_owner": True,
            },
        ],
    }
    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        client.post(f"/api/agreements/{aid}/signing-links-sent", headers=_ORG_H, json=body)
        client.post(f"/api/agreements/{aid}/signing-links-sent", headers=_ORG_H, json=body)
    assert mock_client.post.call_count == 1


def test_signing_links_sent_persists_vs01_portable_packet_for_public_hydration(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    mock_client = _mock_resend_success()
    client = TestClient(app)
    aid = _create_agreement(client)
    accepted = persist_and_accept_review_snapshot(client, aid, _CORPUS, headers=_ORG_H)
    portable = {
        "v": 1,
        "seed": {
            "v": 1,
            "documentId": "doc_test346",
            "agreementId": aid,
            "corpusHash": "abc123",
            "corpusPlain": _CORPUS,
        },
        "fields": [{"id": "f1", "type": "signature", "page": 0, "x": 0.1, "y": 0.1, "width": 0.2, "height": 0.05, "counterpartyId": "owner"}],
        "roles": [{"roleId": "role_owner", "vs01CounterpartyId": "owner", "partyIndex": 0}],
        "fieldCount": 1,
        "initialsPolicy": {"enabled": True},
    }
    body = {
        "packet_revision": "rev_test346",
        "document_id": "doc_test346",
        "portable_packet": portable,
        "frozen_signing_authority": _minimal_frozen_authority(aid, corpus_hash="abc123"),
        "accepted_review_snapshot_id": accepted["snapshot_id"],
        "accepted_review_snapshot_digest": accepted["corpus_sha256"],
        "targets": [
            {
                "email": "owner@example.com",
                "display_name": "Red Mesa Logistics LLC",
                "signing_url": "https://app.example.com/sign?vs01_recipient_sign=1",
                "signer_role_id": "role_owner",
                "is_owner": True,
            },
        ],
    }
    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        res = client.post(
            f"/api/agreements/{aid}/signing-links-sent",
            headers=_ORG_H,
            json=body,
        )
    assert res.status_code == 200
    get_res = client.get(
        f"/api/agreements/public/{aid}/vs01-signing-packet",
        params={"document_id": "doc_test346", "packet_revision": "rev_test346"},
    )
    assert get_res.status_code == 200
    payload = get_res.json()
    assert payload.get("ok") is True
    assert payload.get("portable", {}).get("v") == 1
    assert payload["portable"]["seed"]["documentId"] == "doc_test346"


def test_test370_review_complete_then_signing_invite_owner_gets_only_action_required_email(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    """After all reviews approve, owner gets signing invite only — not legacy prepare email."""
    _env_common(monkeypatch, tmp_path)
    mock_client = _mock_resend_success()
    client = TestClient(app)
    ensure_headers_entitled(_ORG_H)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Services Agreement",
            "jurisdiction": "TX",
            "parties": [
                {
                    "id": "p_owner",
                    "name": "Red Mesa Logistics LLC",
                    "role": "owner",
                    "email": "owner@example.com",
                },
                {
                    "id": "p_cp",
                    "name": "Harbor Peak Automation LLC",
                    "role": "party",
                    "email": "cp@example.com",
                },
            ],
            "purpose": "Services",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    aid = create_res.json()["id"]
    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG_H,
        json={"mode": "review", "role": "reviewer", "recipient_party_id": "p_cp"},
    )
    assert mint.status_code == 200
    review_token = mint.json()["token"]

    signing_url = (
        "https://app.example.com/app/esign/doc_test370?vs01_recipient_sign=1"
        f"&recipient_index=0&signer_role_id=vs01r%3A{aid}"
    )
    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        approve_res = client.post(
            f"/api/agreements/{aid}/recipient-approve",
            headers={"X-Claw-Recipient-Access-Token": review_token},
            json={
                "participant_id": "p_cp",
                "participant_display_name": "Harbor Peak Automation LLC",
            },
        )
        assert approve_res.status_code == 200
        assert mock_client.post.call_count == 1
        counterparty_payload = mock_client.post.call_args_list[0][1]["json"]
        assert counterparty_payload["to"] == ["cp@example.com"]
        assert "prepare_signature_links" not in counterparty_payload["html"]

        send_res = client.post(
            f"/api/agreements/{aid}/signing-links-sent",
            headers=_ORG_H,
            json={
                "packet_revision": "rev_test370",
                "targets": [
                    {
                        "email": "owner@example.com",
                        "display_name": "Red Mesa Logistics LLC",
                        "signing_url": signing_url,
                        "signer_role_id": "role_owner",
                        "is_owner": True,
                    },
                    {
                        "email": "cp@example.com",
                        "display_name": "Harbor Peak Automation LLC",
                        "signing_url": signing_url.replace("recipient_index=0", "recipient_index=1"),
                        "signer_role_id": "role_cp",
                        "is_owner": False,
                    },
                ],
            },
        )
    assert send_res.status_code == 200
    assert send_res.json().get("sent_count") == 2
    assert mock_client.post.call_count == 3

    owner_emails = [
        call[1]["json"]
        for call in mock_client.post.call_args_list
        if call[1]["json"]["to"] == ["owner@example.com"]
    ]
    assert len(owner_emails) == 1
    owner_payload = owner_emails[0]
    assert owner_payload["subject"] == "Action required: Sign Services Agreement"
    assert "Open signing link" in owner_payload["html"]
    assert "vs01_recipient_sign=1" in owner_payload["html"]
    assert "prepare_signature_links" not in owner_payload["html"]
    assert "Prepare signature links" not in owner_payload["html"]

    approve_audit_types = [
        e.get("event_type") for e in approve_res.json()["draft"].get("audit_log") or []
    ]
    assert COUNTERPARTY_REVIEWS_COMPLETE_NOTIFIED_EVENT in approve_audit_types
