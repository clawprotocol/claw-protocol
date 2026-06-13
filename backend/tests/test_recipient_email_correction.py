"""Owner recipient/signer email correction without restarting the agreement."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services.recipient_email_correction import (
    REVIEW_EMAIL_RESENT,
    REVIEW_RECIPIENT_EMAIL_CORRECTED,
    SIGNING_INVITE_RESENT,
    SIGNING_INVITE_SUPERSEDED,
    SIGNING_RECIPIENT_EMAIL_CORRECTED,
)
from backend.services.email.signing_delivery import SIGNING_INVITE_EMAILS_SENT_EVENT

pytestmark = pytest.mark.unit

_ORG_H = {"X-Claw-Org-Id": "test-org-email-correction"}


@pytest.fixture(autouse=True)
def _reset_usage_economics_singleton():
    from backend.usage_economics import store as usage_economics_store_mod

    usage_economics_store_mod._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001


def _env_common(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <notifications@lawdog.me>")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-signing-invite-secret")
    monkeypatch.setenv("CLAW_REVIEW_DELIVERY_MODE", "email")


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


def _create_agreement(client: TestClient) -> tuple[str, str, str]:
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
                    "email": "wrong@example.com",
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
    client.post(f"/api/agreements/{aid}/review-sent", headers=_ORG_H)
    return aid, "p_cp", "p_owner"


def _audit_types(draft: dict) -> list[str]:
    return [e.get("event_type") for e in draft.get("audit_log") or []]


def test_review_recipient_email_corrected_before_approval(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app)
    aid, cp_id, _owner = _create_agreement(client)
    with patch("backend.services.email.resend_client.httpx.Client", return_value=_mock_resend_success()):
        res = client.post(
            f"/api/agreements/{aid}/review-recipient-email",
            headers=_ORG_H,
            json={
                "participant_id": cp_id,
                "new_email": "corrected@example.com",
                "resend_invite": True,
            },
        )
    assert res.status_code == 200
    payload = res.json()
    assert payload.get("sent_invite") is True
    parties = payload["draft"]["parties"]
    cp = next(p for p in parties if p["id"] == cp_id)
    assert cp["email"] == "corrected@example.com"
    types = _audit_types(payload["draft"])
    assert REVIEW_RECIPIENT_EMAIL_CORRECTED in types
    assert REVIEW_EMAIL_RESENT in types


def test_signing_recipient_email_corrected_after_invite_sent(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app)
    aid, cp_id, _owner = _create_agreement(client)
    draft = client.get(f"/api/agreements/{aid}", headers=_ORG_H).json()["draft"]
    draft["audit_log"] = [
        *(draft.get("audit_log") or []),
        {
            "event_type": SIGNING_INVITE_EMAILS_SENT_EVENT,
            "at": "2026-06-07T00:00:00Z",
            "field": "signing_invite",
            "value": {"packet_revision": "rev_test", "sent_count": 2},
        },
    ]
    from backend.services.agreement_draft_store import save_draft

    save_draft({**draft, "id": aid})
    with patch("backend.services.email.resend_client.httpx.Client", return_value=_mock_resend_success()):
        res = client.post(
            f"/api/agreements/{aid}/signing-recipient-email",
            headers=_ORG_H,
            json={
                "participant_id": cp_id,
                "new_email": "signer-fixed@example.com",
                "signer_role_id": "role_cp",
                "signing_url": "https://app.example.com/app/sign/doc_test?vs01_recipient_sign=1",
                "resend_invite": True,
            },
        )
    assert res.status_code == 200
    payload = res.json()
    assert payload.get("sent_invite") is True
    types = _audit_types(payload["draft"])
    assert SIGNING_RECIPIENT_EMAIL_CORRECTED in types
    assert SIGNING_INVITE_SUPERSEDED in types
    assert SIGNING_INVITE_RESENT in types


def test_signing_email_correction_blocked_after_signature(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app)
    aid, cp_id, _owner = _create_agreement(client)
    draft = client.get(f"/api/agreements/{aid}", headers=_ORG_H).json()["draft"]
    draft["audit_log"] = [
        *(draft.get("audit_log") or []),
        {
            "event_type": "signature_completed",
            "at": "2026-06-07T00:00:00Z",
            "value": {"participant_id": cp_id},
        },
    ]
    from backend.services.agreement_draft_store import save_draft

    save_draft({**draft, "id": aid})
    res = client.post(
        f"/api/agreements/{aid}/signing-recipient-email",
        headers=_ORG_H,
        json={
            "participant_id": cp_id,
            "new_email": "too-late@example.com",
            "resend_invite": False,
        },
    )
    assert res.status_code == 400
    assert res.json().get("detail") == "signer_already_signed"


def test_review_email_correction_blocked_after_approval(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app)
    aid, cp_id, _owner = _create_agreement(client)
    draft = client.get(f"/api/agreements/{aid}", headers=_ORG_H).json()["draft"]
    draft["audit_log"] = [
        *(draft.get("audit_log") or []),
        {
            "event_type": "recipient_approved",
            "at": "2026-06-07T00:00:00Z",
            "value": {"participant_id": cp_id},
        },
    ]
    from backend.services.agreement_draft_store import save_draft

    save_draft({**draft, "id": aid})
    res = client.post(
        f"/api/agreements/{aid}/review-recipient-email",
        headers=_ORG_H,
        json={
            "participant_id": cp_id,
            "new_email": "too-late@example.com",
            "resend_invite": True,
        },
    )
    assert res.status_code == 400
    assert res.json().get("detail") == "reviewer_already_approved"
