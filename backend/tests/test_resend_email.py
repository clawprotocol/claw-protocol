"""Unit tests for Resend client (mocked httpx)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx
import pytest

from backend.services.email.resend_client import RESEND_API_URL, send_email

pytestmark = pytest.mark.unit


def test_send_email_returns_not_configured_without_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.delenv("EMAIL_FROM", raising=False)
    result = send_email(to="r@example.com", subject="Hi", html="<p>Hi</p>")
    assert result.ok is False
    assert result.error == "email_not_configured"


def test_send_email_success(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <noreply@example.com>")

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = '{"id":"msg_123"}'
    mock_response.json.return_value = {"id": "msg_123"}

    mock_client = MagicMock()
    mock_client.post.return_value = mock_response
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)

    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        result = send_email(to="r@example.com", subject="Review requested: T", html="<p>Hi</p>")

    assert result.ok is True
    assert result.provider_id == "msg_123"
    mock_client.post.assert_called_once()
    call = mock_client.post.call_args
    assert call[0][0] == RESEND_API_URL
    headers = call[1]["headers"]
    assert headers["Authorization"] == "Bearer re_test_key"
    assert "re_test_key" not in str(call[1]["json"])


def test_send_email_non_fatal_on_http_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <noreply@example.com>")

    mock_client = MagicMock()
    mock_client.post.side_effect = httpx.ConnectError("network down")
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)

    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        result = send_email(to="r@example.com", subject="S", html="<p>x</p>")

    assert result.ok is False
    assert result.error == "transport_error"


def test_send_email_non_fatal_on_4xx(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <noreply@example.com>")

    mock_response = MagicMock()
    mock_response.status_code = 422
    mock_response.text = '{"message":"invalid from"}'

    mock_client = MagicMock()
    mock_client.post.return_value = mock_response
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)

    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        result = send_email(to="r@example.com", subject="S", html="<p>x</p>")

    assert result.ok is False
    assert result.status_code == 422
