"""Phase 3C2A API hygiene: origin enforcement, cookie lifetime, production cookie names."""

from __future__ import annotations

import re
import time
from datetime import datetime, timezone
import pytest
from fastapi import HTTPException, Request
from fastapi.testclient import TestClient

from backend.main import app
from backend.routers import recipient_bootstrap_api as api
from backend.security.recipient_bootstrap_session_cookie import (
    RECIPIENT_BOOTSTRAP_SESSION_COOKIE,
    RECIPIENT_BOOTSTRAP_SESSION_COOKIE_HOST,
)
from backend.tests.test_vs01_recipient_bootstrap_exchange import (
    _exchange,
    _logout,
    _setup_delivered,
    _status,
)
from backend.services.recipient_bootstrap_session_store import (
    reset_recipient_bootstrap_session_store_for_tests,
)
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit


@pytest.fixture(autouse=True)
def _isolated_store(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(tmp_path / "agreements.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-bootstrap-exchange-secret")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("CLAW_RECIPIENT_BOOTSTRAP_RATE_LIMIT_DISABLED", "1")
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <noreply@example.test>")
    monkeypatch.delenv("CLAW_SIGNING_INVITE_DELIVERY_ENABLED", raising=False)
    monkeypatch.delenv("CLAW_SIGNING_INVITE_RECIPIENT_BOOTSTRAP_ENABLED", raising=False)
    usage_economics_store_mod._store = None  # noqa: SLF001
    reset_recipient_bootstrap_session_store_for_tests()
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001
    reset_recipient_bootstrap_session_store_for_tests()


def _request_with_headers(*, method: str, path: str, headers: dict[str, str]) -> Request:
    header_lines = [f"{key.lower()}: {value}" for key, value in headers.items()]
    scope = {
        "type": "http",
        "method": method,
        "path": path,
        "headers": [(line.split(": ", 1)[0], line.split(": ", 1)[1].encode()) for line in header_lines],
        "scheme": "http",
        "server": ("testserver", 80),
        "client": ("testclient", 50000),
    }
    return Request(scope)


def test_committed_cookie_max_age_seconds_no_floor():
    exp = datetime.fromtimestamp(int(time.time()) + 30, tz=timezone.utc).isoformat().replace("+00:00", "Z")
    committed = int(time.time())
    assert api._committed_cookie_max_age_seconds(expires_at=exp, committed_now_ts=committed) == 30


def test_committed_cookie_max_age_seconds_one_second_remaining():
    exp = datetime.fromtimestamp(int(time.time()) + 1, tz=timezone.utc).isoformat().replace("+00:00", "Z")
    committed = int(time.time())
    assert api._committed_cookie_max_age_seconds(expires_at=exp, committed_now_ts=committed) == 1


def test_committed_cookie_max_age_seconds_survives_one_second_advance():
    committed = int(time.time())
    exp = datetime.fromtimestamp(committed + 30, tz=timezone.utc).isoformat().replace("+00:00", "Z")
    assert api._committed_cookie_max_age_seconds(expires_at=exp, committed_now_ts=committed) == 30
    assert api._committed_cookie_max_age_seconds(expires_at=exp, committed_now_ts=committed + 1) == 29


def test_valid_same_origin_allows_exchange(monkeypatch):
    client, _, token, _ = _setup_delivered(monkeypatch)
    assert _exchange(client, token, origin="http://testserver").status_code == 200


def test_wrong_scheme_origin_rejected(monkeypatch):
    client, _, token, _ = _setup_delivered(monkeypatch)
    assert _exchange(client, token, origin="https://testserver").status_code == 403


def test_wrong_host_origin_rejected(monkeypatch):
    client, _, token, _ = _setup_delivered(monkeypatch)
    assert _exchange(client, token, origin="http://evil.example.com").status_code == 403


def test_wrong_port_origin_rejected(monkeypatch):
    client, _, token, _ = _setup_delivered(monkeypatch)
    assert _exchange(client, token, origin="http://testserver:9999").status_code == 403


def test_missing_origin_and_referer_rejected_in_production(monkeypatch):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    client, _, token, _ = _setup_delivered(monkeypatch)
    res = client.post(
        "/api/recipient/bootstrap/exchange",
        json={"token": token},
    )
    assert res.status_code == 403


def test_missing_origin_allowed_with_same_origin_referer_in_local(monkeypatch):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    client, _, token, _ = _setup_delivered(monkeypatch)
    res = client.post(
        "/api/recipient/bootstrap/exchange",
        json={"token": token},
        headers={"Referer": "http://testserver/app/esign/doc"},
    )
    assert res.status_code == 200


def test_malformed_origin_rejected(monkeypatch):
    request = _request_with_headers(
        method="POST",
        path="/api/recipient/bootstrap/exchange",
        headers={"Origin": "not-a-valid-origin"},
    )
    with pytest.raises(HTTPException) as exc:
        api._assert_same_origin(request)
    assert exc.value.status_code == 403


def test_null_origin_rejected(monkeypatch):
    request = _request_with_headers(
        method="POST",
        path="/api/recipient/bootstrap/exchange",
        headers={"Origin": "null"},
    )
    with pytest.raises(HTTPException) as exc:
        api._assert_same_origin(request)
    assert exc.value.status_code == 403


def test_logout_cross_origin_rejected(monkeypatch):
    client, _, token, _ = _setup_delivered(monkeypatch)
    assert _exchange(client, token).status_code == 200
    assert _logout(client, origin="https://evil.example.com").status_code == 403


def test_logout_missing_origin_rejected_in_production(monkeypatch):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    client, _, token, _ = _setup_delivered(monkeypatch)
    assert _exchange(client, token, origin="http://testserver").status_code == 200
    res = client.post("/api/recipient/session/logout")
    assert res.status_code == 403


def test_cookie_max_age_matches_session_remaining(monkeypatch):
    client, _, token, _ = _setup_delivered(monkeypatch)
    res = _exchange(client, token)
    assert res.status_code == 200
    set_cookie = res.headers.get("set-cookie") or ""
    match = re.search(r"Max-Age=(\d+)", set_cookie, re.IGNORECASE)
    assert match is not None
    max_age = int(match.group(1))
    expires_at = res.json()["expires_at"]
    exp_ts = int(datetime.fromisoformat(expires_at.replace("Z", "+00:00")).timestamp())
    assert max_age <= exp_ts - int(time.time())
    assert max_age >= exp_ts - int(time.time()) - 1
    assert max_age > 0
    assert "expires=" in set_cookie.lower()


def test_production_ignores_weaker_cookie_name(monkeypatch):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    client, _, token, _ = _setup_delivered(monkeypatch)
    res = _exchange(client, token, origin="http://testserver")
    assert res.status_code == 200
    host_secret = client.cookies.get(RECIPIENT_BOOTSTRAP_SESSION_COOKIE_HOST)
    assert host_secret
    weaker_client = TestClient(app)
    weaker_client.cookies.set(RECIPIENT_BOOTSTRAP_SESSION_COOKIE, host_secret)
    assert _status(weaker_client).json()["authenticated"] is False
    host_client = TestClient(app)
    host_client.cookies.set(RECIPIENT_BOOTSTRAP_SESSION_COOKIE_HOST, host_secret)
    assert _status(host_client).json()["authenticated"] is True
