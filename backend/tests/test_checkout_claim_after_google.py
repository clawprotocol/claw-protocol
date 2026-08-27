"""Free→Pro checkout after Google: pre-auth leftover-anon persist is payable.

Guest persist 5e79c874 is the conversion agreement. After Google, dest must
not become a stale/foreign UUID (36568b4c). Unpaid checkout-session for the
claimed leftover-anon persist is 200. Genuine other user-* stays 403.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.security.anonymous_session_store import reset_anonymous_session_store_for_tests
from backend.services.agreement_draft_store import load_draft
from backend.tests.conftest_auth_security import auth_secrets, make_authenticated_user_headers, make_test_auth_headers, mint_anonymous_session
from backend.usage_economics.commercial_entitlement import STATE_NONE, resolve_commercial_entitlement
from backend.usage_economics.store import UsageEconomicsStore


@pytest.fixture()
def isolated_usage(tmp_path, monkeypatch: pytest.MonkeyPatch, auth_secrets):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage_eco.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_checkout_claim")
    monkeypatch.setenv("STRIPE_PRICE_PRO_MONTHLY", "price_test_monthly")

    import backend.economics.store as eco_store_mod
    import backend.usage_economics.store as ue_store_mod
    from backend.economics.store import reset_economics_store_for_tests

    ue_store_mod._store = None
    reset_economics_store_for_tests()
    reset_anonymous_session_store_for_tests()
    usage = UsageEconomicsStore(str(tmp_path / "usage_eco.sqlite3"))
    usage.init_schema()
    yield usage
    ue_store_mod._store = None
    eco_store_mod._store = None
    reset_anonymous_session_store_for_tests()


def _fake_stripe_create(**_kwargs: Any) -> Dict[str, Any]:
    return {
        "id": "cs_test_claimed_checkout",
        "url": "https://checkout.stripe.com/c/pay/cs_test_claimed_checkout",
    }


def _guest_draft_payload() -> Dict[str, Any]:
    return {
        "title": "Anonymous Free Agreement",
        "jurisdiction": "Oklahoma",
        "parties": [
            {"name": "Red Mesa Logistics LLC", "role": "Client"},
            {"name": "Harbor Peak Automation LLC", "role": "Service Provider"},
        ],
        "purpose": "Professional technology and consulting services.",
        "payment_terms": "$4,900 per month",
        "duration": "12 months",
    }


def test_returning_google_from_checkout_claims_guest_and_checkout_session_200(
    isolated_usage, monkeypatch: pytest.MonkeyPatch
):
    """Same Incognito tab: returning_sign_in + live anon session claims the persist ID."""
    monkeypatch.setattr(
        "backend.routers.billing_checkout_api.create_checkout_session",
        _fake_stripe_create,
    )
    client = TestClient(app)
    anon_org, _token, headers = mint_anonymous_session(client)
    guest_id = "5e79c874-91bd-4d43-95f1-80a827e8b26a"
    isolated_usage.insert_agreement_owner(
        agreement_id=guest_id,
        subject_ref=f"org:{anon_org}",
        internal_keys_draft=1,
    )
    user_id = "047b01af-claimed-checkout"
    target_org = f"user-{user_id}"

    cont = client.post(
        "/v1/workspace/auth-continuation",
        headers=headers,
        json={
            "destination_path": f"/app/checkout/{guest_id}?tier=pro&cadence=monthly",
            "workflow_stage": "dashboard",
            "auth_purpose": "returning_sign_in",
            "provider": "google",
        },
    )
    assert cont.status_code == 200, cont.text
    continuation_id = cont.json()["continuation_id"]

    finalize = client.post(
        "/v1/workspace/finalize-auth",
        headers={**headers, **make_test_auth_headers(user_id)},
        json={"continuation_id": continuation_id, "claim_method": "google"},
    )
    assert finalize.status_code == 200, finalize.text
    body = finalize.json()
    assert body.get("migrated_agreement_count") == 1
    assert body.get("migrated_agreement_ids") == [guest_id]
    assert f"/app/checkout/{guest_id}" in str(body.get("destination_path") or "")
    assert isolated_usage.owner_subject_for_agreement(guest_id) == f"org:{target_org}"

    assert resolve_commercial_entitlement(f"org:{target_org}").get("state") == STATE_NONE
    checkout = client.post(
        "/v1/billing/checkout-session",
        headers=make_authenticated_user_headers(user_id),
        json={"agreement_id": guest_id, "cadence": "monthly", "return_to": "/app/create"},
    )
    assert checkout.status_code == 200, checkout.text
    assert checkout.json()["ok"] is True
    assert checkout.json()["org_id"] == target_org


def test_claimed_owner_checkout_session_does_not_workspace_mismatch(
    isolated_usage, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(
        "backend.routers.billing_checkout_api.create_checkout_session",
        _fake_stripe_create,
    )
    user_id = "owned-checkout-user"
    aid = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
    isolated_usage.insert_agreement_owner(
        agreement_id=aid,
        subject_ref=f"org:user-{user_id}",
        internal_keys_draft=1,
    )
    assert resolve_commercial_entitlement(f"org:user-{user_id}").get("state") == STATE_NONE
    client = TestClient(app)
    res = client.post(
        "/v1/billing/checkout-session",
        headers=make_authenticated_user_headers(user_id),
        json={"agreement_id": aid, "cadence": "monthly", "return_to": "/app/create"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["ok"] is True


def test_other_workspace_checkout_session_still_403_workspace_mismatch(
    isolated_usage, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(
        "backend.routers.billing_checkout_api.create_checkout_session",
        _fake_stripe_create,
    )
    foreign = "36568b4c-1300-4d62-97eb-826bdf2dd6c0"
    isolated_usage.insert_agreement_owner(
        agreement_id=foreign,
        subject_ref="org:user-other-workspace",
        internal_keys_draft=1,
    )
    client = TestClient(app)
    res = client.post(
        "/v1/billing/checkout-session",
        headers=make_authenticated_user_headers("047b01af-claimed-checkout"),
        json={"agreement_id": foreign, "cadence": "monthly", "return_to": "/app/create"},
    )
    assert res.status_code == 403, res.text
    assert res.json()["detail"]["code"] == "workspace_mismatch"


def test_unclaimed_foreign_id_is_not_silently_paid(isolated_usage, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        "backend.routers.billing_checkout_api.create_checkout_session",
        _fake_stripe_create,
    )
    unclaimed = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
    client = TestClient(app)
    res = client.post(
        "/v1/billing/checkout-session",
        headers=make_authenticated_user_headers("047b01af-claimed-checkout"),
        json={"agreement_id": unclaimed, "cadence": "monthly", "return_to": "/app/create"},
    )
    assert res.status_code == 403, res.text
    assert res.json()["detail"]["code"] == "ownership_not_registered"


def test_returning_sign_in_without_anon_session_does_not_claim_foreign_draft(isolated_usage):
    victim_org, _t, _h = mint_anonymous_session(TestClient(app))
    aid = "cccccccc-3333-4333-8333-cccccccccccc"
    isolated_usage.insert_agreement_owner(
        agreement_id=aid,
        subject_ref=f"org:{victim_org}",
        internal_keys_draft=1,
    )
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
    user_id = "returning-no-anon"
    fin = client.post(
        "/v1/workspace/finalize-auth",
        headers=make_test_auth_headers(user_id),
        json={"continuation_id": cont.json()["continuation_id"], "claim_method": "google"},
    )
    assert fin.status_code == 200, fin.text
    assert fin.json()["destination_path"] == "/app"
    assert fin.json().get("migrated_agreement_count") == 0
    assert isolated_usage.owner_subject_for_agreement(aid) == f"org:{victim_org}"


def test_stale_dest_does_not_replace_pre_auth_leftover_persist(
    isolated_usage, monkeypatch: pytest.MonkeyPatch
):
    """Signed in from 5e79c874; dest_path 36568b4c must not become checkout dest."""
    monkeypatch.setattr(
        "backend.routers.billing_checkout_api.create_checkout_session",
        _fake_stripe_create,
    )
    client = TestClient(app)
    anon_org, _token, headers = mint_anonymous_session(client)
    guest_id = "5e79c874-91bd-4d43-95f1-80a827e8b26a"
    stale = "36568b4c-1300-4d62-97eb-826bdf2dd6c0"
    isolated_usage.insert_agreement_owner(
        agreement_id=guest_id,
        subject_ref=f"org:{anon_org}",
        internal_keys_draft=1,
    )
    isolated_usage.insert_agreement_owner(
        agreement_id=stale,
        subject_ref="org:user-other-workspace",
        internal_keys_draft=1,
    )
    user_id = "pre-auth-wins-stale-dest"
    target_org = f"user-{user_id}"
    cont = client.post(
        "/v1/workspace/auth-continuation",
        headers=headers,
        json={
            "agreement_id": guest_id,
            "destination_path": f"/app/checkout/{stale}?tier=pro&cadence=monthly",
            "workflow_stage": "dashboard",
            "auth_purpose": "returning_sign_in",
            "provider": "google",
        },
    )
    assert cont.status_code == 200, cont.text
    fin = client.post(
        "/v1/workspace/finalize-auth",
        headers={**headers, **make_test_auth_headers(user_id)},
        json={"continuation_id": cont.json()["continuation_id"], "claim_method": "google"},
    )
    assert fin.status_code == 200, fin.text
    dest = str(fin.json().get("destination_path") or "")
    assert guest_id in dest
    assert stale not in dest
    assert isolated_usage.owner_subject_for_agreement(guest_id) == f"org:{target_org}"
    assert isolated_usage.owner_subject_for_agreement(stale) == "org:user-other-workspace"
    assert resolve_commercial_entitlement(f"org:{target_org}").get("state") == STATE_NONE

    checkout = client.post(
        "/v1/billing/checkout-session",
        headers=make_authenticated_user_headers(user_id),
        json={"agreement_id": guest_id, "cadence": "monthly", "return_to": "/app/create"},
    )
    assert checkout.status_code == 200, checkout.text
    assert checkout.json()["ok"] is True

    foreign = client.post(
        "/v1/billing/checkout-session",
        headers=make_authenticated_user_headers(user_id),
        json={"agreement_id": stale, "cadence": "monthly", "return_to": "/app/create"},
    )
    assert foreign.status_code == 403, foreign.text
    assert foreign.json()["detail"]["code"] == "workspace_mismatch"


def test_stale_continuation_id_does_not_become_dest_when_leftover_persist_claimed(
    isolated_usage, monkeypatch: pytest.MonkeyPatch
):
    """Continuation/dest already 36568b4c after the jump — leftover persist still wins."""
    monkeypatch.setattr(
        "backend.routers.billing_checkout_api.create_checkout_session",
        _fake_stripe_create,
    )
    client = TestClient(app)
    anon_org, _token, headers = mint_anonymous_session(client)
    guest_id = "5e79c874-91bd-4d43-95f1-80a827e8b26a"
    stale = "36568b4c-1300-4d62-97eb-826bdf2dd6c0"
    isolated_usage.insert_agreement_owner(
        agreement_id=guest_id,
        subject_ref=f"org:{anon_org}",
        internal_keys_draft=1,
    )
    isolated_usage.insert_agreement_owner(
        agreement_id=stale,
        subject_ref="org:user-other-workspace",
        internal_keys_draft=1,
    )
    user_id = "stale-cont-id-loses"
    dest_path = f"/app/checkout/{stale}?tier=pro&cadence=monthly"
    cont = client.post(
        "/v1/workspace/auth-continuation",
        headers=headers,
        json={
            "agreement_id": stale,
            "destination_path": dest_path,
            "workflow_stage": "dashboard",
            "auth_purpose": "returning_sign_in",
            "provider": "google",
        },
    )
    assert cont.status_code == 200, cont.text
    fin = client.post(
        "/v1/workspace/finalize-auth",
        headers={**headers, **make_test_auth_headers(user_id)},
        json={"continuation_id": cont.json()["continuation_id"], "claim_method": "google"},
    )
    assert fin.status_code == 200, fin.text
    dest = str(fin.json().get("destination_path") or "")
    assert guest_id in dest
    assert stale not in dest
    assert isolated_usage.owner_subject_for_agreement(guest_id) == f"org:user-{user_id}"
    assert isolated_usage.owner_subject_for_agreement(stale) == "org:user-other-workspace"


def test_bind_user_org_claims_leftover_anon_when_previous_already_user(
    isolated_usage, monkeypatch: pytest.MonkeyPatch
):
    """Already-signed-in bind still claims leftover-anon persist. No leftover cookie → no steal."""
    monkeypatch.setattr(
        "backend.routers.billing_checkout_api.create_checkout_session",
        _fake_stripe_create,
    )
    client = TestClient(app)
    anon_org, _token, headers = mint_anonymous_session(client)
    guest_id = "5e79c874-91bd-4d43-95f1-80a827e8b26a"
    isolated_usage.insert_agreement_owner(
        agreement_id=guest_id,
        subject_ref=f"org:{anon_org}",
        internal_keys_draft=1,
    )
    user_id = "bound-then-claim-leftover"
    target_org = f"user-{user_id}"
    res = client.post(
        "/v1/workspace/bind-user-org",
        headers={**headers, **make_test_auth_headers(user_id)},
        json={
            "user_id": user_id,
            "previous_org_id": target_org,
            "claim_method": "google",
        },
    )
    assert res.status_code == 200, res.text
    assert res.json()["migrated_agreement_count"] == 1
    assert guest_id in res.json()["migrated_agreement_ids"]
    assert isolated_usage.owner_subject_for_agreement(guest_id) == f"org:{target_org}"
    assert resolve_commercial_entitlement(f"org:{target_org}").get("state") == STATE_NONE

    checkout = client.post(
        "/v1/billing/checkout-session",
        headers=make_authenticated_user_headers(user_id),
        json={"agreement_id": guest_id, "cadence": "monthly", "return_to": "/app/create"},
    )
    assert checkout.status_code == 200, checkout.text
    assert checkout.json()["ok"] is True


def test_bind_without_leftover_cookie_does_not_steal_foreign_user_owner(
    isolated_usage, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(
        "backend.routers.billing_checkout_api.create_checkout_session",
        _fake_stripe_create,
    )
    foreign = "36568b4c-1300-4d62-97eb-826bdf2dd6c0"
    isolated_usage.insert_agreement_owner(
        agreement_id=foreign,
        subject_ref="org:user-other-workspace",
        internal_keys_draft=1,
    )
    user_id = "no-leftover-no-steal"
    client = TestClient(app)
    res = client.post(
        "/v1/workspace/bind-user-org",
        headers=make_test_auth_headers(user_id),
        json={
            "user_id": user_id,
            "previous_org_id": f"user-{user_id}",
            "claim_method": "google",
        },
    )
    assert res.status_code == 200, res.text
    assert res.json()["migrated_agreement_count"] == 0
    assert isolated_usage.owner_subject_for_agreement(foreign) == "org:user-other-workspace"
    checkout = client.post(
        "/v1/billing/checkout-session",
        headers=make_authenticated_user_headers(user_id),
        json={"agreement_id": foreign, "cadence": "monthly", "return_to": "/app/create"},
    )
    assert checkout.status_code == 403, checkout.text
    assert checkout.json()["detail"]["code"] == "workspace_mismatch"


def test_assert_agreement_accessible_still_requires_owner_equals_subject():
    src = Path("backend/security/workspace_identity.py").read_text()
    start = src.index("def assert_agreement_accessible")
    nxt = src.find("\ndef ", start + 1)
    block = src[start : nxt if nxt > 0 else start + 2000]
    assert "if owner != subject:" in block
    assert '"workspace_mismatch"' in block
    assert '"ownership_not_registered"' in block


def test_conversion_persist_owner_get_and_checkout_metadata_same_id(
    isolated_usage, monkeypatch: pytest.MonkeyPatch
):
    """One POST /draft → Google claim → owner GET 200 → checkout metadata.agreement_id."""
    captured: Dict[str, Any] = {}

    def _capture_stripe_create(**kwargs: Any) -> Dict[str, Any]:
        captured.update(kwargs)
        return {
            "id": "cs_test_conversion_persist",
            "url": "https://checkout.stripe.com/c/pay/cs_test_conversion_persist",
        }

    monkeypatch.setattr(
        "backend.routers.billing_checkout_api.create_checkout_session",
        _capture_stripe_create,
    )
    client = TestClient(app)
    anon_org, _token, headers = mint_anonymous_session(client)

    first = client.post(
        "/api/agreements/draft",
        headers={**headers, "Content-Type": "application/json"},
        json=_guest_draft_payload(),
    )
    assert first.status_code == 200, first.text
    guest_id = first.json()["id"]
    assert guest_id
    assert load_draft(guest_id) is not None
    assert isolated_usage.owner_subject_for_agreement(guest_id) == f"org:{anon_org}"
    assert isolated_usage.list_agreement_ids_for_subject(f"org:{anon_org}") == [guest_id]

    user_id = "conversion-persist-owner"
    target_org = f"user-{user_id}"
    stale = "36568b4c-1300-4d62-97eb-826bdf2dd6c0"
    isolated_usage.insert_agreement_owner(
        agreement_id=stale,
        subject_ref="org:user-other-workspace",
        internal_keys_draft=1,
    )
    cont = client.post(
        "/v1/workspace/auth-continuation",
        headers=headers,
        json={
            "agreement_id": guest_id,
            "destination_path": f"/app/checkout/{stale}?tier=pro&cadence=monthly",
            "workflow_stage": "dashboard",
            "auth_purpose": "returning_sign_in",
            "provider": "google",
        },
    )
    assert cont.status_code == 200, cont.text
    fin = client.post(
        "/v1/workspace/finalize-auth",
        headers={**headers, **make_test_auth_headers(user_id)},
        json={"continuation_id": cont.json()["continuation_id"], "claim_method": "google"},
    )
    assert fin.status_code == 200, fin.text
    dest = str(fin.json().get("destination_path") or "")
    assert guest_id in dest
    assert stale not in dest
    assert fin.json().get("migrated_agreement_ids") == [guest_id]
    assert isolated_usage.owner_subject_for_agreement(guest_id) == f"org:{target_org}"
    assert isolated_usage.list_agreement_ids_for_subject(f"org:{target_org}") == [guest_id]
    assert resolve_commercial_entitlement(f"org:{target_org}").get("state") == STATE_NONE

    owner_headers = make_authenticated_user_headers(user_id)
    owner_get = client.get(f"/api/agreements/{guest_id}", headers=owner_headers)
    assert owner_get.status_code == 200, owner_get.text
    assert owner_get.json().get("id") == guest_id

    foreign_get = client.get(
        f"/api/agreements/{guest_id}",
        headers=make_authenticated_user_headers("foreign-workspace-reader"),
    )
    assert foreign_get.status_code == 403, foreign_get.text

    checkout = client.post(
        "/v1/billing/checkout-session",
        headers=owner_headers,
        json={"agreement_id": guest_id, "cadence": "monthly", "return_to": "/app/create"},
    )
    assert checkout.status_code == 200, checkout.text
    assert checkout.json()["ok"] is True
    metadata = captured.get("metadata") or {}
    assert metadata.get("agreement_id") == guest_id

    foreign_checkout = client.post(
        "/v1/billing/checkout-session",
        headers=owner_headers,
        json={"agreement_id": stale, "cadence": "monthly", "return_to": "/app/create"},
    )
    assert foreign_checkout.status_code == 403, foreign_checkout.text
    assert foreign_checkout.json()["detail"]["code"] == "workspace_mismatch"
