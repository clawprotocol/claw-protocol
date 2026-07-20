"""Subscription migration must not trust client-supplied source org ids."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.tests.commercial_test_helpers import activate_pro_on_org, isolated_economics_store
from backend.tests.conftest_auth_security import make_authenticated_user_headers, mint_anonymous_session

from backend.usage_economics.store import UsageEconomicsStore


@pytest.fixture()
def isolated_stores(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CLAW_ANON_SESSION_SECRET", "test-anon-session-secret")
    usage_path = str(tmp_path / "usage_eco.sqlite3")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", usage_path)
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_STRICT_IN_DEV", "1")
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")

    import backend.usage_economics.store as ue_store_mod

    eco = isolated_economics_store(tmp_path, monkeypatch)
    ue_store_mod._store = None
    usage = UsageEconomicsStore(usage_path)
    usage.init_schema()
    yield eco, usage
    ue_store_mod._store = None


def test_bind_cannot_steal_foreign_anon_subscription(isolated_stores) -> None:
    eco, _usage = isolated_stores
    victim_client = TestClient(app)
    victim_org, _vt, _vh = mint_anonymous_session(victim_client)
    activate_pro_on_org(eco, victim_org)

    attacker_id = "attacker-sub"
    attacker_org = f"user-{attacker_id}"
    attacker_client = TestClient(app)

    res = attacker_client.post(
        "/v1/workspace/bind-user-org",
        headers=make_authenticated_user_headers(attacker_id),
        json={
            "user_id": attacker_id,
            "previous_org_id": victim_org,
            "subscription_source_org_id": victim_org,
            "entitlement_repair_candidates": [victim_org],
        },
    )
    assert res.status_code in (401, 403)
    assert eco.get_subscription_by_org(victim_org) is not None
    assert eco.get_subscription_by_org(attacker_org) is None


def test_bind_migrates_verified_anon_subscription(isolated_stores) -> None:
    eco, _usage = isolated_stores
    client = TestClient(app)
    anon_org, _token, anon_headers = mint_anonymous_session(client)
    activate_pro_on_org(eco, anon_org)

    user_id = "bind-anon-user"
    res = client.post(
        "/v1/workspace/bind-user-org",
        headers={**make_authenticated_user_headers(user_id), "X-Claw-Anon-Session": anon_headers["X-Claw-Anon-Session"]},
        json={
            "user_id": user_id,
            "previous_org_id": anon_org,
        },
    )
    assert res.status_code == 200, res.text
    assert res.json().get("billing_migrated") is True
    assert eco.get_subscription_by_org(f"user-{user_id}") is not None


def test_bind_cannot_steal_ownerless_local_org_subscription(isolated_stores) -> None:
    eco, usage = isolated_stores
    client = TestClient(app)
    user_id = "local-theft-user"
    stable_org = f"user-{user_id}"

    activate_pro_on_org(eco, "local-org")
    usage.insert_agreement_owner(
        agreement_id="ag-local-theft",
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
