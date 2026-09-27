"""Already-bound bind-user-org is a cheap no-op (no identity/billing store work)."""

from __future__ import annotations

import time
from typing import Any
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.routers.workspace_auth_api import reset_bind_user_org_noop_cache_for_tests
from backend.tests.conftest_auth_security import make_test_auth_headers, mint_anonymous_session


pytestmark = pytest.mark.unit


@pytest.fixture(autouse=True)
def _reset_bind_noop_cache() -> None:
    reset_bind_user_org_noop_cache_for_tests()
    yield
    reset_bind_user_org_noop_cache_for_tests()


@pytest.fixture()
def isolated_bind_env(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ONRAMP_DB_PATH", str(tmp_path / "onramp.sqlite3"))
    monkeypatch.setenv("CLAW_TREASURY_DB_PATH", str(tmp_path / "treasury.sqlite3"))
    monkeypatch.setenv("CLAW_ADMIN_CONSOLE_DB_PATH", str(tmp_path / "admin.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_ANON_SESSION_SECRET", "test-anon-session-secret")

    from backend.admin_console import store as admin_store
    from backend.economics.store import reset_economics_store_for_tests
    from backend.security.anonymous_session_store import reset_anonymous_session_store_for_tests
    import backend.usage_economics.store as usage_store

    reset_economics_store_for_tests()
    usage_store._store = None
    admin_store.reset_admin_console_store_for_tests()
    reset_anonymous_session_store_for_tests()
    reset_bind_user_org_noop_cache_for_tests()

    yield TestClient(app)

    reset_economics_store_for_tests()
    usage_store._store = None
    admin_store.reset_admin_console_store_for_tests()
    reset_anonymous_session_store_for_tests()
    reset_bind_user_org_noop_cache_for_tests()


def test_second_bind_skips_identity_upsert_and_billing_repair(isolated_bind_env) -> None:
    client = isolated_bind_env
    user_id = "supabase-user-noop-rebind"
    payload = {"user_id": user_id, "display_name": "Noop Workspace"}
    headers = make_test_auth_headers(user_id)

    with (
        patch("backend.routers.workspace_auth_api._persist_workspace_user_identity") as persist,
        patch(
            "backend.routers.workspace_auth_api._repair_billing_after_bind",
            return_value=False,
        ) as repair,
    ):
        first = client.post("/v1/workspace/bind-user-org", headers=headers, json=payload)
        assert first.status_code == 200, first.text
        persist.assert_called_once()
        repair.assert_called_once()
        persist.reset_mock()
        repair.reset_mock()

        started = time.monotonic()
        second = client.post("/v1/workspace/bind-user-org", headers=headers, json=payload)
        second_elapsed = time.monotonic() - started

    assert second.status_code == 200, second.text
    body = second.json()
    assert body["ok"] is True
    assert body["org_id"] == f"user-{user_id}"
    assert body["user_id"] == user_id
    assert body["migrated_agreement_count"] == 0
    persist.assert_not_called()
    repair.assert_not_called()
    assert second_elapsed < 0.25


def test_claim_path_with_previous_anon_still_migrates(isolated_bind_env) -> None:
    from backend.usage_economics.store import get_usage_economics_store

    client = isolated_bind_env
    anon_org, _token, anon_headers = mint_anonymous_session(client)
    user_id = "supabase-user-noop-claim"
    aid = "ag-noop-claim-1"
    ustore = get_usage_economics_store()
    ustore.init_schema()
    ustore.insert_agreement_owner(
        agreement_id=aid,
        subject_ref=f"org:{anon_org}",
        internal_keys_draft=1,
    )

    res = client.post(
        "/v1/workspace/bind-user-org",
        headers={**anon_headers, **make_test_auth_headers(user_id)},
        json={
            "user_id": user_id,
            "previous_org_id": anon_org,
            "claim_method": "google",
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["migrated_agreement_count"] == 1
    assert aid in body["migrated_agreement_ids"]
    row = ustore.get_agreement_owner_row(aid)
    assert row is not None
    assert row["subject_ref"] == f"org:user-{user_id}"


def test_bind_still_200_when_ensure_organization_fails(isolated_bind_env) -> None:
    client = isolated_bind_env
    user_id = "supabase-user-noop-org-fail"

    def _boom(*_args: Any, **_kwargs: Any) -> None:
        raise RuntimeError("organizations upsert failed")

    with patch("backend.routers.workspace_auth_api.ensure_organization", side_effect=_boom):
        res = client.post(
            "/v1/workspace/bind-user-org",
            headers=make_test_auth_headers(user_id),
            json={"user_id": user_id, "display_name": "Fail Soft"},
        )

    assert res.status_code == 200, res.text
    assert res.json()["ok"] is True
    assert res.json()["org_id"] == f"user-{user_id}"


def test_health_stays_fast_relative_to_cached_bind(isolated_bind_env) -> None:
    client = isolated_bind_env
    user_id = "supabase-user-noop-health"
    headers = make_test_auth_headers(user_id)
    payload = {"user_id": user_id, "display_name": "Health Workspace"}

    first = client.post("/v1/workspace/bind-user-org", headers=headers, json=payload)
    assert first.status_code == 200, first.text

    bind_started = time.monotonic()
    second = client.post("/v1/workspace/bind-user-org", headers=headers, json=payload)
    bind_elapsed = time.monotonic() - bind_started
    health_started = time.monotonic()
    health = client.get("/health")
    health_elapsed = time.monotonic() - health_started

    assert second.status_code == 200
    assert health.status_code == 200
    assert health.json().get("ok") is True
    assert bind_elapsed < 0.25
    assert health_elapsed < 0.5
