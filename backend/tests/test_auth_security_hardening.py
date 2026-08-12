"""Security hardening tests — anonymous session authority and continuation."""

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
    eco_path = str(tmp_path / "economics.sqlite3")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", usage_path)
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", eco_path)

    import backend.economics.store as eco_store_mod
    import backend.usage_economics.store as ue_store_mod

    ue_store_mod._store = None
    eco_store_mod._store = None
    reset_anonymous_session_store_for_tests()
    usage = UsageEconomicsStore(usage_path)
    usage.init_schema()
    yield usage
    ue_store_mod._store = None
    eco_store_mod._store = None
    reset_anonymous_session_store_for_tests()


def test_client_cannot_access_anon_org_without_session_token(isolated_usage):
    mint_client = TestClient(app)
    org_id, _token, _headers = mint_anonymous_session(mint_client)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/draft",
        headers={"X-Claw-Org-Id": org_id, "Content-Type": "application/json"},
        json={
            "title": "T",
            "jurisdiction": "CA",
            "parties": [{"name": "A", "role": "owner"}],
            "purpose": "test purpose for draft",
        },
    )
    assert res.status_code == 401


def test_guessed_anon_org_id_cannot_claim(isolated_usage):
    client = TestClient(app)
    victim_org, victim_token, victim_headers = mint_anonymous_session(client)
    aid = f"ag-victim-{uuid.uuid4().hex[:8]}"
    isolated_usage.insert_agreement_owner(
        agreement_id=aid,
        subject_ref=f"org:{victim_org}",
        internal_keys_draft=1,
    )
    attacker_org, attacker_token, _ = mint_anonymous_session(client)
    user_id = "attacker-user"
    res = client.post(
        "/v1/workspace/bind-user-org",
        headers={
            **make_test_auth_headers(user_id),
            "X-Claw-Org-Id": attacker_org,
            "X-Claw-Anon-Session": attacker_token,
        },
        json={
            "user_id": user_id,
            "previous_org_id": victim_org,
            "claim_method": "google",
        },
    )
    assert res.status_code == 403, res.text
    row = isolated_usage.get_agreement_owner_row(aid)
    assert row["subject_ref"] == f"org:{victim_org}"


def test_bind_requires_authenticated_user(isolated_usage):
    client = TestClient(app)
    org_id, token, _ = mint_anonymous_session(client)
    res = client.post(
        "/v1/workspace/bind-user-org",
        headers={"X-Claw-Org-Id": org_id, "X-Claw-Anon-Session": token},
        json={"user_id": "someone", "previous_org_id": org_id},
    )
    assert res.status_code == 401


def test_continuation_finalize_without_session_storage(isolated_usage):
    """Finalize migrates guest drafts only when target has Genesis/Pro (product contract)."""
    from backend.usage_economics.genesis_dog_entitlement import (
        GRANT_SOURCE_ADMIN,
        grant_entitlement,
    )

    client = TestClient(app)
    org_id, token, headers = mint_anonymous_session(client)
    aid = f"ag-cont-{uuid.uuid4().hex[:8]}"
    isolated_usage.insert_agreement_owner(
        agreement_id=aid,
        subject_ref=f"org:{org_id}",
        internal_keys_draft=1,
    )
    cont = client.post(
        "/v1/workspace/auth-continuation",
        headers=headers,
        json={
            "agreement_id": aid,
            "destination_path": "/app/create",
            "workflow_stage": "starter",
            "auth_purpose": "claim",
        },
    )
    assert cont.status_code == 200, cont.text
    continuation_id = cont.json()["continuation_id"]
    user_id = "magic-link-user"
    ensure_org_pro_entitlement(f\"user-{user_id}\", user_id=user_id)
    fin = client.post(
        "/v1/workspace/finalize-auth",
        headers={**headers, **make_test_auth_headers(user_id)},
        json={"continuation_id": continuation_id, "claim_method": "magic_link"},
    )
    assert fin.status_code == 200, fin.text
    body = fin.json()
    assert body["migrated_agreement_count"] == 1
    assert "agreementId=" in body["destination_path"] or aid in body.get("migrated_agreement_ids", [])
    row = isolated_usage.get_agreement_owner_row(aid)
    assert row["subject_ref"] == f"org:user-{user_id}"


def test_returning_sign_in_continuation_goes_to_dashboard(isolated_usage):
    client = TestClient(app)
    cont = client.post(
        "/v1/workspace/auth-continuation",
        json={
            "destination_path": "/app",
            "workflow_stage": "dashboard",
            "auth_purpose": "returning_sign_in",
        },
    )
    assert cont.status_code == 200, cont.text
    continuation_id = cont.json()["continuation_id"]
    user_id = "returning-user"
    fin = client.post(
        "/v1/workspace/finalize-auth",
        headers=make_test_auth_headers(user_id),
        json={"continuation_id": continuation_id, "claim_method": "magic_link"},
    )
    assert fin.status_code == 200, fin.text
    assert fin.json()["destination_path"] == "/app"


def test_checkout_rejects_unauthorized_agreement(isolated_usage, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CLAW_STRIPE_CHECKOUT_ENABLED", "0")
    client = TestClient(app)
    org_a, _t_a, headers_a = mint_anonymous_session(client)
    org_b, _t_b, headers_b = mint_anonymous_session(client)
    aid = f"ag-checkout-{uuid.uuid4().hex[:8]}"
    isolated_usage.insert_agreement_owner(
        agreement_id=aid,
        subject_ref=f"org:{org_a}",
        internal_keys_draft=1,
    )
    res = client.post(
        "/v1/billing/checkout-session",
        headers=headers_b,
        json={"agreement_id": aid, "return_to": "/app/create"},
    )
    assert res.status_code in (403, 503)
