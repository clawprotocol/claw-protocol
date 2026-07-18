"""Signing invite emails after VS01 packet prepare."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services.email.review_delivery import COUNTERPARTY_REVIEWS_COMPLETE_NOTIFIED_EVENT
from backend.services.email.signing_delivery import SIGNING_INVITE_EMAILS_SENT_EVENT
from backend.utils.agreement_version_store import AgreementVersionStore

pytestmark = pytest.mark.unit

_ORG_H = {"X-Claw-Org-Id": "test-org-signing-invite"}


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
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <notifications@lawdog.me>")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-signing-invite-secret")


def _create_agreement(client: TestClient) -> str:
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
    accepted = client.post(
        f"/api/agreements/{aid}/accepted-corpus",
        headers={**_ORG_H, "X-Claw-Review-First-Persist": "1"},
        json={},
    )
    assert accepted.status_code == 200
    accepted_version = accepted.json()["accepted_version"]
    draft = client.get(f"/api/agreements/{aid}", headers=_ORG_H).json()["draft"]
    from backend.services.vs01_signing_packet_activation import _fingerprint_agreement_body
    from backend.routers import agreements_v2_api

    monkeypatch.setattr(agreements_v2_api, "_signing_approval_gate_errors", lambda _draft: [])
    parties = [
        {
            "agreementPartyId": party["id"],
            "legalEntityName": party["name"],
            "agreementRole": party["role"],
            "canonicalOrder": index,
        }
        for index, party in enumerate(draft["parties"])
    ]
    signers = [
        {
            "signerRecordId": f"signer:{party['id']}:0",
            "agreementPartyId": party["id"],
            "signerName": party["name"],
            "signerTitle": "Authorized Signer",
            "signerEmail": party["email"],
            "signingOrder": index,
        }
        for index, party in enumerate(draft["parties"])
    ]
    party_order = [party["agreementPartyId"] for party in parties]
    frozen = {
        "version": 1,
        "agreementId": aid,
        "acceptedVersionId": accepted_version["version_id"],
        "acceptedCorpusSha256": accepted_version["corpus_sha256"],
        "parties": parties,
        "signers": signers,
        "execution": {
            "partyOrder": party_order,
            "signerOrder": [signer["signerRecordId"] for signer in signers],
            "executionPartyHash": __import__("hashlib")
            .sha256(__import__("json").dumps(party_order, separators=(",", ":"), sort_keys=True).encode())
            .hexdigest(),
        },
    }
    assert (
        client.post(
            f"/api/agreements/{aid}/frozen-signing-authority",
            headers=_ORG_H,
            json={"snapshot": frozen},
        ).status_code
        == 200
    )
    assert (
        client.put(
            f"/api/agreements/{aid}/signing-lock",
            headers=_ORG_H,
            json={
                "accepted_version_id": accepted_version["version_id"],
                "corpus_sha256": accepted_version["corpus_sha256"],
                "locked_at": "2026-07-17T12:00:00Z",
                "locked_by": "owner",
            },
        ).status_code
        == 200
    )
    corpus_plain = str(
        AgreementVersionStore().get_version_by_id(version_id=accepted_version["version_id"]).get(
            "body_markdown"
        )
        or draft.get("purpose")
        or "Services"
    )
    portable = {
        "v": 1,
        "seed": {
            "v": 1,
            "documentId": "doc_test346",
            "agreementId": aid,
            "corpusPlain": corpus_plain,
            "corpusHash": _fingerprint_agreement_body(corpus_plain),
            "savedAt": "2026-07-17T12:00:00Z",
        },
        "fields": [
            {
                "id": "f1",
                "type": "signature",
                "page": 0,
                "x": 0.1,
                "y": 0.1,
                "width": 0.2,
                "height": 0.05,
                "counterpartyId": draft["parties"][0]["id"],
            }
        ],
        "roles": [
            {
                "roleId": f"role_{party['id']}",
                "signerRecordId": f"signer:{party['id']}:0",
                "partyIndex": index,
                "partyId": party["id"],
                "entityName": party["name"],
                "partyName": party["name"],
                "signerName": party["name"],
                "signerEmail": party["email"],
                "requiresSignature": True,
            }
            for index, party in enumerate(draft["parties"])
        ],
        "pageCount": 10,
        "witnessPageIndex": 9,
        "initialsPolicy": {"enabled": True, "bodyPagesOnly": True},
        "fieldCount": 1,
    }
    activate_res = client.post(
        f"/api/agreements/{aid}/signing-packet/activate",
        headers=_ORG_H,
        json={"document_id": "doc_test346", "portable_packet": portable},
    )
    assert activate_res.status_code == 200
    activation = activate_res.json()["activation"]
    body = {
        "packet_revision": activation["packet_revision"],
        "document_id": "doc_test346",
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
    assert res.status_code == 409
    assert res.json()["detail"] == "signing_invite_delivery_deferred_until_3c1b"
    assert mock_client.post.call_count == 0
    get_res = client.get(
        f"/api/agreements/public/{aid}/vs01-signing-packet",
        params={"document_id": "doc_test346", "packet_revision": activation["packet_revision"]},
    )
    assert get_res.status_code == 404


def test_test370_review_complete_then_signing_invite_owner_gets_only_action_required_email(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    """After all reviews approve, owner gets signing invite only — not legacy prepare email."""
    _env_common(monkeypatch, tmp_path)
    mock_client = _mock_resend_success()
    client = TestClient(app)
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
