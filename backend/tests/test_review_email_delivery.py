"""Review invitation email delivery on review-sent (mocked Resend)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit

_ORG_H = {"X-Claw-Org-Id": "test-org-review-email"}


@pytest.fixture(autouse=True)
def _reset_usage_economics_singleton():
    usage_economics_store_mod._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001


def _create_agreement_with_reviewers(client: TestClient) -> str:
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Review Email Agreement",
            "jurisdiction": "TX",
            "parties": [
                {"id": "p_owner", "name": "Owner Co", "role": "owner", "email": "owner@example.com"},
                {"id": "p_r1", "name": "R1", "role": "reviewer", "email": "r1@example.com"},
                {"id": "p_r2", "name": "R2", "role": "reviewer", "email": "r2@example.com"},
            ],
            "purpose": "P",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    return create_res.json()["id"]


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


def test_manual_mode_sends_zero_emails(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_REVIEW_DELIVERY_MODE", "manual")
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("EMAIL_FROM", "noreply@example.com")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")

    mock_client = _mock_resend_success()
    client = TestClient(app)
    aid = _create_agreement_with_reviewers(client)

    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        res = client.post(f"/api/agreements/{aid}/review-sent", headers=_ORG_H, json={})

    assert res.status_code == 200
    assert res.json().get("ok") is True
    mock_client.post.assert_not_called()


def test_email_mode_sends_review_invites(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_REVIEW_DELIVERY_MODE", "email")
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <noreply@example.com>")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")

    mock_client = _mock_resend_success()
    client = TestClient(app)
    aid = _create_agreement_with_reviewers(client)

    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        res = client.post(f"/api/agreements/{aid}/review-sent", headers=_ORG_H, json={})

    assert res.status_code == 200
    assert res.json().get("ok") is True
    assert mock_client.post.call_count == 2
    recipients = {call[1]["json"]["to"][0] for call in mock_client.post.call_args_list}
    assert recipients == {"r1@example.com", "r2@example.com"}
    first_payload = mock_client.post.call_args_list[0][1]["json"]
    assert first_payload["subject"].startswith("Review requested:")
    assert "Open review" in first_payload["html"]
    assert "https://app.example.com/agreements/" in first_payload["html"]


def test_resend_failure_does_not_fail_review_sent(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_REVIEW_DELIVERY_MODE", "email")
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("EMAIL_FROM", "noreply@example.com")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")

    mock_response = MagicMock()
    mock_response.status_code = 500
    mock_response.text = "server error"
    mock_client = MagicMock()
    mock_client.post.return_value = mock_response
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)

    client = TestClient(app)
    aid = _create_agreement_with_reviewers(client)

    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        res = client.post(f"/api/agreements/{aid}/review-sent", headers=_ORG_H, json={})

    assert res.status_code == 200
    assert res.json().get("ok") is True
    assert "review_sent_at" in (res.json().get("draft") or {})


def test_missing_email_config_does_not_fail_review_sent(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_REVIEW_DELIVERY_MODE", "email")
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.delenv("EMAIL_FROM", raising=False)
    monkeypatch.delenv("CLAW_APP_PUBLIC_ORIGIN", raising=False)

    mock_client = _mock_resend_success()
    client = TestClient(app)
    aid = _create_agreement_with_reviewers(client)

    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        res = client.post(f"/api/agreements/{aid}/review-sent", headers=_ORG_H, json={})

    assert res.status_code == 200
    assert res.json().get("ok") is True
    mock_client.post.assert_not_called()


def test_duplicate_review_sent_does_not_resend_emails(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_REVIEW_DELIVERY_MODE", "email")
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("EMAIL_FROM", "noreply@example.com")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")

    mock_client = _mock_resend_success()
    client = TestClient(app)
    aid = _create_agreement_with_reviewers(client)

    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        first = client.post(f"/api/agreements/{aid}/review-sent", headers=_ORG_H, json={})
        assert first.status_code == 200
        assert mock_client.post.call_count == 2
        second = client.post(f"/api/agreements/{aid}/review-sent", headers=_ORG_H, json={})
        assert second.status_code == 200
        assert mock_client.post.call_count == 2


def test_review_invite_template_excludes_agreement_body() -> None:
    from backend.services.email.templates.review_invite import build_review_invite_email

    email = build_review_invite_email(
        party_name="Pat",
        agreement_title="NDA",
        review_url="https://app.example.com/agreements/a/review?t=abc",
    )
    assert email.subject == "Review requested: NDA"
    assert "NDA" in email.html
    assert "Pat" in email.html
    assert "Open review" in email.html
    assert "payment_terms" not in email.html.lower()
    assert "purpose" not in email.text.lower()
