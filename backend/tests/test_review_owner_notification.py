"""Owner status notification after external reviewer approval."""

from __future__ import annotations

from backend.tests.entitlement_test_support import ensure_headers_entitled, ensure_org_pro_entitlement

from unittest.mock import MagicMock, patch

import re

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services.email.review_delivery import (
    COUNTERPARTY_REVIEWS_COMPLETE_NOTIFIED_EVENT,
    OWNER_REVIEW_APPROVAL_NOTIFIED_EVENT,
)
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit

_ORG_H = {"X-Claw-Org-Id": "test-org-owner-notify", "X-Claw-Test-Auth-User-Id": "test-owner"}


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
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <notifications@lawdog.me>")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-owner-notify-secret")


def _create_two_party_agreement(client: TestClient) -> str:
    ensure_headers_entitled(_ORG_H)
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


def _review_token_from_invite_email_payload(payload: dict) -> str:
    html = str(payload.get("html") or "")
    match = re.search(r"/review\?t=([^\"'&]+)", html)
    assert match, "review invite URL missing from email html"
    from urllib.parse import unquote

    return unquote(match.group(1))


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


def test_final_review_approval_sends_counterparty_only_not_legacy_owner_prepare_email(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    """Test370: no owner prepare_signature_links email when all reviews complete."""
    _env_common(monkeypatch, tmp_path)
    mock_client = _mock_resend_success()
    client = TestClient(app)
    aid = _create_two_party_agreement(client)
    token = _mint_reviewer_token(client, aid)

    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        body = _approve_as_reviewer(client, aid, token)

    assert mock_client.post.call_count == 1
    counterparty_payload = mock_client.post.call_args_list[0][1]["json"]
    assert counterparty_payload["to"] == ["reviewer@example.com"]
    assert counterparty_payload["subject"] == "Review complete: Consulting Agreement is ready for signing"
    assert "signing invitation" in counterparty_payload["html"].lower()
    assert "prepare_signature_links" not in counterparty_payload["html"]
    assert "Prepare signature links" not in counterparty_payload["html"]

    audit_types = [e.get("event_type") for e in body["draft"].get("audit_log") or []]
    assert OWNER_REVIEW_APPROVAL_NOTIFIED_EVENT not in audit_types
    assert COUNTERPARTY_REVIEWS_COMPLETE_NOTIFIED_EVENT in audit_types


def test_duplicate_approval_does_not_resend_counterparty_notification(
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
    ensure_headers_entitled(_ORG_H)
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
    assert mock_client.post.call_count == 1
    counterparty_payload = mock_client.post.call_args_list[0][1]["json"]
    assert counterparty_payload["to"] == ["reviewer@example.com"]
    audit_types = [e.get("event_type") for e in body["draft"].get("audit_log") or []]
    assert OWNER_REVIEW_APPROVAL_NOTIFIED_EVENT not in audit_types
    assert COUNTERPARTY_REVIEWS_COMPLETE_NOTIFIED_EVENT in audit_types


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

    invite_payload = mock_client.post.call_args_list[0][1]["json"]
    token = _review_token_from_invite_email_payload(invite_payload)
    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        _approve_as_reviewer(client, aid, token)

    assert mock_client.post.call_count == 2
    counterparty_payload = mock_client.post.call_args_list[1][1]["json"]
    assert counterparty_payload["to"] == ["reviewer@example.com"]
    assert counterparty_payload["subject"] == "Review complete: Consulting Agreement is ready for signing"
    assert "prepare_signature_links" not in counterparty_payload["html"]


def test_client_role_owner_email_receives_notification(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    mock_client = _mock_resend_success()
    client = TestClient(app)
    ensure_headers_entitled(_ORG_H)
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
    assert mock_client.post.call_args_list[0][1]["json"]["to"] == ["reviewer@example.com"]


def test_partial_reviewer_approval_uses_dashboard_notification(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    mock_client = _mock_resend_success()
    client = TestClient(app)
    ensure_headers_entitled(_ORG_H)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Multi Review Agreement",
            "jurisdiction": "TX",
            "parties": [
                {
                    "id": "p_owner",
                    "name": "Blue Canyon Analytics LLC",
                    "role": "owner",
                    "email": "owner@example.com",
                },
                {
                    "id": "p_r1",
                    "name": "Iron Vale Systems Inc",
                    "role": "reviewer",
                    "email": "r1@example.com",
                },
                {
                    "id": "p_r2",
                    "name": "Northwind LLC",
                    "role": "reviewer",
                    "email": "r2@example.com",
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
    token = _mint_reviewer_token(client, aid, party_id="p_r1")

    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        _approve_as_reviewer(client, aid, token, participant_id="p_r1", display_name="Iron Vale Systems Inc")

    assert mock_client.post.call_count == 1
    payload = mock_client.post.call_args_list[0][1]["json"]
    assert payload["subject"].startswith("Review update:")
    assert "Open dashboard" in payload["html"]
    assert f"/app/done/{aid}" not in payload["html"]
