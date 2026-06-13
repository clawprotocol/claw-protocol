"""Signing invite emails after VS01 packet prepare."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services.email.signing_delivery import SIGNING_INVITE_EMAILS_SENT_EVENT

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
