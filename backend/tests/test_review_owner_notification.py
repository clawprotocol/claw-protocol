"""Owner status notification after external reviewer approval."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services.email.review_delivery import OWNER_REVIEW_APPROVAL_NOTIFIED_EVENT
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit

_ORG_H = {"X-Claw-Org-Id": "test-org-owner-notify"}


@pytest.fixture(autouse=True)
def _reset_usage_economics_singleton():
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
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-owner-notify-secret")


def _create_two_party_agreement(client: TestClient) -> str:
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Consulting Agreement",
            "jurisdiction": "TX",
            "parties": [
                {
                    "id": "p_owner",
                    "name": "Blue Canyon Analytics LLC",
                    "role": "owner",
                    "email": "owner@example.com",
                },
                {
                    "id": "p_reviewer",
                    "name": "Iron Vale Systems Inc",
                    "role": "party",
                    "email": "reviewer@example.com",
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


def _mint_reviewer_token(client: TestClient, agreement_id: str, party_id: str = "p_reviewer") -> str:
    mint = client.post(
        f"/api/agreements/{agreement_id}/recipient-access-token",
        headers=_ORG_H,
        json={"mode": "review", "role": "reviewer", "recipient_party_id": party_id},
    )
    assert mint.status_code == 200
    return mint.json()["token"]


def _approve_as_reviewer(
    client: TestClient,
    agreement_id: str,
    token: str,
    *,
    participant_id: str = "p_reviewer",
    display_name: str = "Iron Vale Systems Inc",
) -> dict:
    res = client.post(
        f"/api/agreements/{agreement_id}/recipient-approve",
        headers={"X-Claw-Recipient-Access-Token": token},
        json={"participant_id": participant_id, "participant_display_name": display_name},
    )
    assert res.status_code == 200
    return res.json()


def test_external_reviewer_approval_sends_owner_status_email_once(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    mock_client = _mock_resend_success()
    client = TestClient(app)
    aid = _create_two_party_agreement(client)
    token = _mint_reviewer_token(client, aid)

    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        body = _approve_as_reviewer(client, aid, token)

    assert mock_client.post.call_count == 1
    payload = mock_client.post.call_args_list[0][1]["json"]
    assert payload["to"] == ["owner@example.com"]
    assert payload["subject"] == "Review update: Iron Vale Systems Inc approved Consulting Agreement"
    assert "Open dashboard" in payload["html"]
    assert "https://app.example.com/app?focus=" in payload["html"]
    assert "/review?t=" not in payload["html"]

    audit_types = [e.get("event_type") for e in body["draft"].get("audit_log") or []]
    assert OWNER_REVIEW_APPROVAL_NOTIFIED_EVENT in audit_types


def test_duplicate_approval_does_not_resend_owner_notification(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    mock_client = _mock_resend_success()
    client = TestClient(app)
    aid = _create_two_party_agreement(client)
    token = _mint_reviewer_token(client, aid)

    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        _approve_as_reviewer(client, aid, token)
        _approve_as_reviewer(client, aid, token)

    assert mock_client.post.call_count == 1


def test_missing_owner_email_skips_notification_without_failing_approval(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    mock_client = _mock_resend_success()
    client = TestClient(app)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "No owner email",
            "jurisdiction": "TX",
            "parties": [
                {"id": "p_owner", "name": "Owner Co", "role": "owner"},
                {
                    "id": "p_reviewer",
                    "name": "Reviewer Co",
                    "role": "party",
                    "email": "reviewer@example.com",
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
    token = _mint_reviewer_token(client, aid)

    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        body = _approve_as_reviewer(client, aid, token)

    assert body.get("ok") is True
    mock_client.post.assert_not_called()
    audit_types = [e.get("event_type") for e in body["draft"].get("audit_log") or []]
    assert OWNER_REVIEW_APPROVAL_NOTIFIED_EVENT not in audit_types


def test_owner_party_cannot_recipient_approve(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    _env_common(monkeypatch, tmp_path)
    mock_client = _mock_resend_success()
    client = TestClient(app)
    aid = _create_two_party_agreement(client)
    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG_H,
        json={"mode": "review", "role": "reviewer", "recipient_party_id": "p_owner"},
    )
    assert mint.status_code == 200
    token = mint.json()["token"]

    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        res = client.post(
            f"/api/agreements/{aid}/recipient-approve",
            headers={"X-Claw-Recipient-Access-Token": token},
            json={"participant_id": "p_owner", "participant_display_name": "Owner"},
        )

    assert res.status_code == 403
    mock_client.post.assert_not_called()


def test_initial_review_invite_still_excludes_owner(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    monkeypatch.setenv("CLAW_REVIEW_DELIVERY_MODE", "email")
    mock_client = _mock_resend_success()
    client = TestClient(app)
    aid = _create_two_party_agreement(client)

    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        res = client.post(f"/api/agreements/{aid}/review-sent", headers=_ORG_H, json={})

    assert res.status_code == 200
    assert mock_client.post.call_count == 1
    recipients = {call[1]["json"]["to"][0] for call in mock_client.post.call_args_list}
    assert recipients == {"reviewer@example.com"}
    assert "owner@example.com" not in recipients

    token = _mint_reviewer_token(client, aid)
    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        _approve_as_reviewer(client, aid, token)

    assert mock_client.post.call_count == 2
    owner_payload = mock_client.post.call_args_list[1][1]["json"]
    assert owner_payload["to"] == ["owner@example.com"]
    assert owner_payload["subject"].startswith("Review update:")


def test_client_role_owner_email_receives_notification(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    mock_client = _mock_resend_success()
    client = TestClient(app)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Paid Pro Agreement",
            "jurisdiction": "TX",
            "parties": [
                {
                    "id": "p_client",
                    "name": "Blue Canyon Analytics LLC",
                    "role": "client",
                    "email": "owner@example.com",
                },
                {
                    "id": "p_sp",
                    "name": "Iron Vale Systems Inc",
                    "role": "service_provider",
                    "email": "reviewer@example.com",
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
    token = _mint_reviewer_token(client, aid, party_id="p_sp")

    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        _approve_as_reviewer(
            client,
            aid,
            token,
            participant_id="p_sp",
            display_name="Iron Vale Systems Inc",
        )

    assert mock_client.post.call_count == 1
    assert mock_client.post.call_args_list[0][1]["json"]["to"] == ["owner@example.com"]
