"""Commercial entitlement flows against PostgreSQL-backed usage economics."""

from __future__ import annotations

import threading

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.tests.commercial_test_helpers import (
    activate_pro_on_org,
    commercial_postgres_dsn,
    configure_commercial_postgres_usage,
    isolated_economics_store,
    reset_commercial_postgres_usage_schema,
)
from backend.tests.conftest_auth_security import make_authenticated_user_headers, mint_anonymous_session
from backend.usage_economics.store import get_usage_economics_store


def _require_dsn() -> str:
    dsn = commercial_postgres_dsn()
    if not dsn:
        pytest.fail(
            "PostgreSQL DSN required — set CLAW_USAGE_ECONOMICS_DATABASE_URL "
            "(or CLAW_DATABASE_URL / DATABASE_URL) in the test command environment."
        )
    return dsn


@pytest.fixture()
def commercial_postgres_stores(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CLAW_ANON_SESSION_SECRET", "test-anon-session-secret")
    dsn = _require_dsn()
    configure_commercial_postgres_usage(monkeypatch, dsn)
    reset_commercial_postgres_usage_schema()
    eco = isolated_economics_store(tmp_path, monkeypatch)
    usage = get_usage_economics_store()
    usage.init_schema()
    yield eco, usage
    reset_commercial_postgres_usage_schema()


def test_postgres_bind_migrates_verified_anon_subscription(commercial_postgres_stores) -> None:
    eco, _usage = commercial_postgres_stores
    client = TestClient(app)
    anon_org, _token, anon_headers = mint_anonymous_session(client)
    activate_pro_on_org(eco, anon_org)

    user_id = "pg-bind-anon-user"
    res = client.post(
        "/v1/workspace/bind-user-org",
        headers={**make_authenticated_user_headers(user_id), **anon_headers},
        json={
            "user_id": user_id,
            "previous_org_id": anon_org,
        },
    )
    assert res.status_code == 200, res.text
    assert res.json().get("billing_migrated") is True
    assert eco.get_subscription_by_org(f"user-{user_id}") is not None


def test_postgres_bind_denies_ownerless_local_org_theft(commercial_postgres_stores) -> None:
    eco, usage = commercial_postgres_stores
    client = TestClient(app)
    user_id = "pg-local-theft-user"
    stable_org = f"user-{user_id}"

    activate_pro_on_org(eco, "local-org")
    usage.insert_agreement_owner(
        agreement_id="ag-pg-local-theft",
        subject_ref=f"org:{stable_org}",
        internal_keys_draft=1,
    )

    res = client.post(
        "/v1/workspace/bind-user-org",
        headers=make_authenticated_user_headers(user_id),
        json={
            "user_id": user_id,
            "previous_org_id": "local-org",
        },
    )
    assert res.status_code == 200, res.text
    assert res.json().get("billing_migrated") is not True
    assert eco.get_subscription_by_org("local-org") is not None
    assert eco.get_subscription_by_org(stable_org) is None


def test_postgres_agreement_owner_insert_concurrency(commercial_postgres_stores) -> None:
    _eco, usage = commercial_postgres_stores
    errors: list[Exception] = []
    barrier = threading.Barrier(4)

    def _worker(idx: int) -> None:
        try:
            barrier.wait(timeout=5)
            usage.insert_agreement_owner(
                agreement_id=f"ag-pg-concurrent-{idx}",
                subject_ref=f"org:pg-concurrent-{idx}",
                internal_keys_draft=1,
            )
        except Exception as exc:
            errors.append(exc)

    threads = [threading.Thread(target=_worker, args=(i,)) for i in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=10)

    assert not errors
    for i in range(4):
        owner = usage.owner_subject_for_agreement(f"ag-pg-concurrent-{i}")
        assert owner == f"org:pg-concurrent-{i}"
