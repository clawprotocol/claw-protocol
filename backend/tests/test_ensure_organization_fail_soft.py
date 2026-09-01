"""Fail-soft organizations upsert: PGRST205 / 404 must not starve bind-user-org or /health."""

from __future__ import annotations

import logging
import time
from typing import Any, Dict, List

import httpx
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch

from backend.lawdog_dashboard.supabase_service import (
    _ORGANIZATION_UPSERT_TIMEOUT_SECONDS,
    ensure_organization,
    reset_organization_sync_circuit_for_tests,
)
from backend.main import app
from backend.tests.conftest_auth_security import make_test_auth_headers

pytestmark = pytest.mark.unit

_PGRST205_BODY = (
    '{"code":"PGRST205","details":null,"hint":null,'
    '"message":"Could not find the table \'public.organizations\' in the schema cache"}'
)


@pytest.fixture(autouse=True)
def _reset_org_sync_circuit() -> None:
    reset_organization_sync_circuit_for_tests()
    yield
    reset_organization_sync_circuit_for_tests()


def _enable_supabase(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-key")


class _FakeResponse:
    def __init__(self, status_code: int = 200, text: str = "") -> None:
        self.status_code = status_code
        self.text = text

    def json(self) -> List[Dict[str, Any]]:
        return []


class _FakeSupabaseClient:
    def __init__(
        self,
        *args: object,
        status_code: int = 200,
        text: str = "",
        **kwargs: object,
    ) -> None:
        self.calls: List[Dict[str, Any]] = []
        self._status_code = status_code
        self._text = text
        self.timeouts: List[Any] = []

    def __enter__(self) -> "_FakeSupabaseClient":
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def request(self, method: str, url: str, **kwargs: Any) -> _FakeResponse:
        self.calls.append({"method": method, "url": url, **kwargs})
        return _FakeResponse(self._status_code, self._text)


def _client_factory(fake: _FakeSupabaseClient):
    def _factory(*args: object, **kwargs: object) -> _FakeSupabaseClient:
        fake.timeouts.append(kwargs.get("timeout"))
        return fake

    return _factory


def test_ensure_organization_success_upserts_each_call(monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_supabase(monkeypatch)
    fake = _FakeSupabaseClient(status_code=201)

    with patch("backend.lawdog_dashboard.supabase_service.httpx.Client", _client_factory(fake)):
        ensure_organization("org-success-1", name="Acme Workspace")
        ensure_organization("org-success-1", name="Acme Workspace")

    org_posts = [c for c in fake.calls if "organizations" in c.get("url", "") and c.get("method") == "POST"]
    assert len(org_posts) == 2
    body = org_posts[0].get("json") or {}
    assert body["id"] == "org-success-1"
    assert body["name"] == "Acme Workspace"
    assert body.get("updated_at")
    assert (org_posts[0].get("params") or {}).get("on_conflict") == "id"
    assert fake.timeouts == [
        _ORGANIZATION_UPSERT_TIMEOUT_SECONDS,
        _ORGANIZATION_UPSERT_TIMEOUT_SECONDS,
    ]


def test_ensure_organization_pgrst205_logs_once_and_skips_retry(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    _enable_supabase(monkeypatch)
    fake = _FakeSupabaseClient(status_code=404, text=_PGRST205_BODY)

    with caplog.at_level(logging.WARNING, logger="claw.lawdog_dashboard.supabase"):
        with patch("backend.lawdog_dashboard.supabase_service.httpx.Client", _client_factory(fake)):
            ensure_organization("org-missing-table")
            ensure_organization("org-missing-table")
            ensure_organization("org-other")

    assert len(fake.calls) == 1
    assert "organizations" in fake.calls[0]["url"]
    fail_soft = [r for r in caplog.records if "organization_sync_unavailable" in r.getMessage()]
    assert len(fail_soft) == 1
    request_failed = [r for r in caplog.records if "request_failed" in r.getMessage()]
    assert len(request_failed) <= 1


def test_ensure_organization_404_does_not_hang(monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_supabase(monkeypatch)
    fake = _FakeSupabaseClient(status_code=404, text=_PGRST205_BODY)

    with patch("backend.lawdog_dashboard.supabase_service.httpx.Client", _client_factory(fake)):
        started = time.monotonic()
        ensure_organization("org-slow-404")
        first_elapsed = time.monotonic() - started
        started = time.monotonic()
        ensure_organization("org-slow-404")
        second_elapsed = time.monotonic() - started

    assert first_elapsed < 0.5
    assert second_elapsed < 0.25
    assert len(fake.calls) == 1
    assert fake.timeouts == [_ORGANIZATION_UPSERT_TIMEOUT_SECONDS]


def test_ensure_organization_timeout_fail_soft_skips_retry(monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_supabase(monkeypatch)
    calls: List[Dict[str, Any]] = []

    class _TimeoutClient:
        def __init__(self, *args: object, **kwargs: object) -> None:
            self.timeout = kwargs.get("timeout")

        def __enter__(self) -> "_TimeoutClient":
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def request(self, method: str, url: str, **kwargs: Any) -> _FakeResponse:
            calls.append({"method": method, "url": url, "timeout": self.timeout, **kwargs})
            raise httpx.TimeoutException("organizations upsert timed out")

    with patch("backend.lawdog_dashboard.supabase_service.httpx.Client", _TimeoutClient):
        started = time.monotonic()
        ensure_organization("org-timeout")
        ensure_organization("org-timeout")
        elapsed = time.monotonic() - started

    assert elapsed < 0.5
    assert len(calls) == 1
    assert calls[0]["timeout"] == _ORGANIZATION_UPSERT_TIMEOUT_SECONDS


def test_bind_user_org_200_when_organizations_table_missing(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ONRAMP_DB_PATH", str(tmp_path / "onramp.sqlite3"))
    monkeypatch.setenv("CLAW_TREASURY_DB_PATH", str(tmp_path / "treasury.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    _enable_supabase(monkeypatch)

    from backend.economics.store import reset_economics_store_for_tests

    reset_economics_store_for_tests()
    fake = _FakeSupabaseClient(status_code=404, text=_PGRST205_BODY)
    user_id = "supabase-user-org-schema-miss"
    client = TestClient(app)

    with patch("backend.lawdog_dashboard.supabase_service.httpx.Client", _client_factory(fake)):
        started = time.monotonic()
        res = client.post(
            "/v1/workspace/bind-user-org",
            headers=make_test_auth_headers(user_id),
            json={"user_id": user_id, "display_name": "Schema Miss Workspace"},
        )
        bind_elapsed = time.monotonic() - started
        health_started = time.monotonic()
        health = client.get("/health")
        health_elapsed = time.monotonic() - health_started
        res2 = client.post(
            "/v1/workspace/bind-user-org",
            headers=make_test_auth_headers(user_id),
            json={"user_id": user_id, "display_name": "Schema Miss Workspace"},
        )

    reset_economics_store_for_tests()

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["ok"] is True
    assert body["org_id"] == f"user-{user_id}"
    assert body["user_id"] == user_id
    assert res2.status_code == 200, res2.text
    assert health.status_code == 200
    assert health.json().get("ok") is True
    assert bind_elapsed < 5.0
    assert health_elapsed < 2.0
    org_posts = [c for c in fake.calls if "organizations" in c.get("url", "")]
    assert len(org_posts) == 1


def test_bind_user_org_success_still_upserts_organization(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ONRAMP_DB_PATH", str(tmp_path / "onramp.sqlite3"))
    monkeypatch.setenv("CLAW_TREASURY_DB_PATH", str(tmp_path / "treasury.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    _enable_supabase(monkeypatch)

    from backend.economics.store import reset_economics_store_for_tests

    reset_economics_store_for_tests()
    fake = _FakeSupabaseClient(status_code=201)
    user_id = "supabase-user-org-schema-ok"
    client = TestClient(app)

    with patch("backend.lawdog_dashboard.supabase_service.httpx.Client", _client_factory(fake)):
        res = client.post(
            "/v1/workspace/bind-user-org",
            headers=make_test_auth_headers(user_id),
            json={"user_id": user_id, "display_name": "Healthy Workspace"},
        )

    reset_economics_store_for_tests()

    assert res.status_code == 200, res.text
    org_posts = [c for c in fake.calls if "organizations" in c.get("url", "") and c.get("method") == "POST"]
    assert len(org_posts) == 1
    body = org_posts[0].get("json") or {}
    assert body["id"] == f"user-{user_id}"
    assert body["name"] == "Healthy Workspace"
    assert (org_posts[0].get("params") or {}).get("on_conflict") == "id"
