"""Anonymous draft claim via bind-user-org from anon-* workspace org."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.security.anonymous_session_store import reset_anonymous_session_store_for_tests
from backend.tests.conftest_auth_security import auth_secrets, mint_anonymous_session, make_test_auth_headers
from backend.usage_economics.store import UsageEconomicsStore


@pytest.fixture()
def isolated_usage(tmp_path, monkeypatch: pytest.MonkeyPatch, auth_secrets):
    usage_path = str(tmp_path / "usage_eco.sqlite3")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", usage_path)
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_STRICT_IN_DEV", "1")

    import backend.usage_economics.store as ue_store_mod

    ue_store_mod._store = None
    reset_anonymous_session_store_for_tests()
    usage = UsageEconomicsStore(usage_path)
    usage.init_schema()
    yield usage
    ue_store_mod._store = None
    reset_anonymous_session_store_for_tests()


def test_bind_user_org_defers_guest_import_without_entitlement(isolated_usage):
    """Guest drafts stay on the anon org until Genesis Dog or Pro is granted."""
    client = TestClient(app)
    anon_org, token, headers = mint_anonymous_session(client)
    user_id = "supabase-user-anon-deferred"
    aid = f"ag-anon-defer-{uuid.uuid4().hex[:8]}"

    isolated_usage.insert_agreement_owner(
        agreement_id=aid,
        subject_ref=f"org:{anon_org}",
        internal_keys_draft=1,
    )

    res = client.post(
        "/v1/workspace/bind-user-org",
        headers={**headers, **make_test_auth_headers(user_id)},
        json={
            "user_id": user_id,
            "previous_org_id": anon_org,
            "claim_method": "google",
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["migrated_agreement_count"] == 0
    row = isolated_usage.get_agreement_owner_row(aid)
    assert row is not None
    assert row["subject_ref"] == f"org:{anon_org}"


def test_bind_user_org_migrates_drafts_from_anon_org(isolated_usage):
    from backend.usage_economics.genesis_dog_entitlement import (
        GRANT_SOURCE_ADMIN,
        grant_entitlement,
    )

    client = TestClient(app)
    anon_org, token, headers = mint_anonymous_session(client)
    user_id = "supabase-user-anon-claim"
    stable_org = f"user-{user_id}"
    aid = f"ag-anon-{uuid.uuid4().hex[:8]}"
    grant_entitlement(user_id=user_id, granted_by="test", grant_source=GRANT_SOURCE_ADMIN)

    isolated_usage.insert_agreement_owner(
        agreement_id=aid,
        subject_ref=f"org:{anon_org}",
        internal_keys_draft=1,
    )

    res = client.post(
        "/v1/workspace/bind-user-org",
        headers={**headers, **make_test_auth_headers(user_id)},
        json={
            "user_id": user_id,
            "previous_org_id": anon_org,
            "claim_method": "google",
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["org_id"] == stable_org
    assert body["migrated_agreement_count"] == 1
    assert aid in body["migrated_agreement_ids"]

    row = isolated_usage.get_agreement_owner_row(aid)
    assert row is not None
    assert row["subject_ref"] == f"org:{stable_org}"
    assert row.get("claim_method") == "google"
    assert row.get("anonymous_source_org") == anon_org


def test_bind_user_org_rejects_authenticated_source_org(isolated_usage):
    client = TestClient(app)
    victim_org = "user-other-user"
    user_id = "supabase-user-attacker"
    aid = f"ag-victim-{uuid.uuid4().hex[:8]}"
    _org, token, headers = mint_anonymous_session(client)

    isolated_usage.insert_agreement_owner(
        agreement_id=aid,
        subject_ref=f"org:{victim_org}",
        internal_keys_draft=1,
    )

    res = client.post(
        "/v1/workspace/bind-user-org",
        headers={**headers, **make_test_auth_headers(user_id)},
        json={
            "user_id": user_id,
            "previous_org_id": victim_org,
            "claim_method": "magic_link",
        },
    )
    assert res.status_code == 403, res.text
    assert res.json()["detail"]["code"] in ("ownership_conflict", "invalid_claim_source")


def test_bind_user_org_idempotent_second_call(isolated_usage):
    from backend.usage_economics.genesis_dog_entitlement import (
        GRANT_SOURCE_ADMIN,
        grant_entitlement,
    )

    client = TestClient(app)
    anon_org, token, headers = mint_anonymous_session(client)
    user_id = "supabase-user-idempotent"
    aid = f"ag-idem-{uuid.uuid4().hex[:8]}"
    grant_entitlement(user_id=user_id, granted_by="test", grant_source=GRANT_SOURCE_ADMIN)

    isolated_usage.insert_agreement_owner(
        agreement_id=aid,
        subject_ref=f"org:{anon_org}",
        internal_keys_draft=1,
    )

    payload = {
        "user_id": user_id,
        "previous_org_id": anon_org,
        "claim_method": "magic_link",
    }
    auth = {**headers, **make_test_auth_headers(user_id)}
    r1 = client.post("/v1/workspace/bind-user-org", headers=auth, json=payload)
    assert r1.status_code == 200
    assert r1.json()["migrated_agreement_count"] == 1

    r2 = client.post("/v1/workspace/bind-user-org", headers=auth, json=payload)
    assert r2.status_code == 200
    assert r2.json()["migrated_agreement_count"] == 0

    row = isolated_usage.get_agreement_owner_row(aid)
    assert row["subject_ref"] == f"org:user-{user_id}"
