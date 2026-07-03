"""TEST488 — subscription org binding after bind-user-org and paid workspace draft create."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from backend.billing.subscription_authority import demo_expiry_iso
from backend.billing.subscriptions import sync_subscription_from_payment
from backend.economics.store import get_economics_store
from backend.main import app
from backend.payments.store import get_onramp_store
from backend.treasury.treasury_store import get_treasury_store
from backend.usage_economics.policy import subject_has_paid_plan
from backend.usage_economics.store import UsageEconomicsStore


@pytest.fixture()
def isolated_stores(tmp_path, monkeypatch: pytest.MonkeyPatch):
    eco_path = str(tmp_path / "economics.sqlite3")
    usage_path = str(tmp_path / "usage_eco.sqlite3")
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", eco_path)
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", usage_path)
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_STRICT_IN_DEV", "1")

    import backend.economics.store as eco_store_mod
    import backend.usage_economics.store as ue_store_mod

    eco_store_mod._store = None
    ue_store_mod._store = None

    eco = get_economics_store()
    eco.init_schema()
    usage = UsageEconomicsStore(usage_path)
    usage.init_schema()

    yield eco, usage

    eco_store_mod._store = None
    ue_store_mod._store = None


def _activate_pro_on_org(eco, org_id: str, user_id: str | None = None) -> None:
    sync_subscription_from_payment(
        economics=eco,
        store=get_onramp_store(),
        treasury=get_treasury_store(),
        payment_id=f"test:pro:{uuid.uuid4().hex[:8]}",
        org_id=org_id,
        user_id=user_id,
        plan_code="pro",
        current_period_end=demo_expiry_iso(30),
    )


def test_bind_user_org_migrates_subscription_from_local_org(isolated_stores):
    eco, _usage = isolated_stores
    client = TestClient(app)
    user_id = "supabase-user-488"
    stable_org = f"user-{user_id}"

    _activate_pro_on_org(eco, "local-org")

    res = client.post(
        "/v1/workspace/bind-user-org",
        json={
            "user_id": user_id,
            "previous_org_id": "local-org",
            "subscription_source_org_id": "local-org",
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["org_id"] == stable_org
    assert body.get("billing_migrated") is True

    assert subject_has_paid_plan(f"org:{stable_org}", economics=eco) is True
    assert eco.get_subscription_by_org("local-org") is None
    assert eco.get_subscription_by_org(stable_org) is not None


def test_paid_user_workspace_org_can_create_draft_after_bind(isolated_stores):
    eco, _usage = isolated_stores
    client = TestClient(app)
    user_id = "supabase-user-488b"
    stable_org = f"user-{user_id}"

    _activate_pro_on_org(eco, "local-org", user_id=user_id)
    client.post(
        "/v1/workspace/bind-user-org",
        json={
            "user_id": user_id,
            "previous_org_id": "local-org",
            "subscription_source_org_id": "local-org",
        },
    )

    # Seed two incomplete drafts — paid users should not hit free cap.
    h = {"X-Claw-Org-Id": stable_org}
    draft_body = {
        "title": "T",
        "jurisdiction": "CA",
        "parties": [{"name": "A", "role": "owner"}],
        "purpose": "p",
        "payment_terms": "pt",
        "duration": None,
        "due_date": None,
        "effective_date": None,
    }
    for _ in range(2):
        r = client.post("/api/agreements/draft", headers=h, json=draft_body)
        assert r.status_code == 200, r.text

    r3 = client.post("/api/agreements/draft", headers=h, json={**draft_body, "title": "T3"})
    assert r3.status_code == 200, r3.text


def test_free_user_still_blocked_at_third_draft(isolated_stores):
    _eco, _usage = isolated_stores
    client = TestClient(app)
    h = {"X-Claw-Org-Id": "test-org-free-488"}

    draft_body = {
        "title": "T",
        "jurisdiction": "CA",
        "parties": [{"name": "A", "role": "owner"}],
        "purpose": "p",
        "payment_terms": "pt",
        "duration": None,
        "due_date": None,
        "effective_date": None,
    }
    for _ in range(2):
        r = client.post("/api/agreements/draft", headers=h, json=draft_body)
        assert r.status_code == 200, r.text

    r3 = client.post("/api/agreements/draft", headers=h, json={**draft_body, "title": "T3"})
    assert r3.status_code == 403
    assert r3.json().get("detail", {}).get("code") == "draft_limit_reached"


def test_lazy_subscription_migration_by_user_id(isolated_stores):
    eco, _usage = isolated_stores
    user_id = "supabase-user-488c"
    stable_org = f"user-{user_id}"

    _activate_pro_on_org(eco, "local-org", user_id=user_id)
    assert subject_has_paid_plan(f"org:{stable_org}", economics=eco) is True
    assert eco.get_subscription_by_org(stable_org) is not None


def test_already_bound_user_repair_from_local_org_on_reload(isolated_stores):
    """TEST489 — subscription stuck on local-org after first bind; reload repair succeeds."""
    eco, usage = isolated_stores
    client = TestClient(app)
    user_id = "supabase-user-489"
    stable_org = f"user-{user_id}"

    _activate_pro_on_org(eco, "local-org")
    usage.insert_agreement_owner(
        agreement_id="ag_existing_services",
        subject_ref=f"org:{stable_org}",
        internal_keys_draft=1,
    )

    res = client.post(
        "/v1/workspace/bind-user-org",
        json={
            "user_id": user_id,
            "previous_org_id": stable_org,
            "entitlement_repair_candidates": ["local-org", "org:local-org"],
        },
    )
    assert res.status_code == 200, res.text
    assert res.json().get("billing_migrated") is True
    assert subject_has_paid_plan(f"org:{stable_org}", economics=eco) is True

    h = {
        "X-Claw-Org-Id": stable_org,
        "X-Claw-Entitlement-Repair-Org": "local-org",
    }
    r = client.post(
        "/api/agreements/draft",
        headers=h,
        json={
            "title": "Red Mesa PSA",
            "jurisdiction": "DE",
            "parties": [{"name": "Red Mesa Logistics LLC", "role": "owner"}],
            "purpose": "Professional services",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert r.status_code == 200, r.text


def test_draft_post_repair_header_normalizes_org_prefix(isolated_stores):
    eco, usage = isolated_stores
    client = TestClient(app)
    user_id = "supabase-user-489b"
    stable_org = f"user-{user_id}"

    _activate_pro_on_org(eco, "local-org")
    usage.insert_agreement_owner(
        agreement_id="ag_bound_draft",
        subject_ref=f"org:{stable_org}",
        internal_keys_draft=1,
    )

    h = {
        "X-Claw-Org-Id": stable_org,
        "X-Claw-Entitlement-Repair-Org": "org:local-org",
    }
    r = client.post(
        "/api/agreements/draft",
        headers=h,
        json={
            "title": "T",
            "jurisdiction": "CA",
            "parties": [{"name": "A", "role": "owner"}],
            "purpose": "p",
            "payment_terms": "pt",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert r.status_code == 200, r.text
    assert subject_has_paid_plan(f"org:{stable_org}", economics=eco) is True


def test_draft_post_auto_repair_without_client_header_when_bound_has_agreements(isolated_stores):
    """TEST489 — existing draft on user org triggers local-org repair on draft POST."""
    eco, usage = isolated_stores
    client = TestClient(app)
    user_id = "supabase-user-489c"
    stable_org = f"user-{user_id}"

    _activate_pro_on_org(eco, "local-org")
    usage.insert_agreement_owner(
        agreement_id="ag_services_existing",
        subject_ref=f"org:{stable_org}",
        internal_keys_draft=1,
    )

    h = {"X-Claw-Org-Id": stable_org}
    r = client.post(
        "/api/agreements/draft",
        headers=h,
        json={
            "title": "Harbor Peak PSA",
            "jurisdiction": "DE",
            "parties": [{"name": "Harbor Peak Automation LLC", "role": "owner"}],
            "purpose": "p",
            "payment_terms": "pt",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert r.status_code == 200, r.text
    assert subject_has_paid_plan(f"org:{stable_org}", economics=eco) is True

    _eco, _usage = isolated_stores
    client = TestClient(app)
    h = {"X-Claw-Org-Id": "test-org-free-489"}

    draft_body = {
        "title": "T",
        "jurisdiction": "CA",
        "parties": [{"name": "A", "role": "owner"}],
        "purpose": "p",
        "payment_terms": "pt",
        "duration": None,
        "due_date": None,
        "effective_date": None,
    }
    for _ in range(2):
        assert client.post("/api/agreements/draft", headers=h, json=draft_body).status_code == 200

    r3 = client.post("/api/agreements/draft", headers=h, json={**draft_body, "title": "T3"})
    assert r3.status_code == 403
    detail = r3.json().get("detail") or {}
    assert detail.get("code") == "draft_limit_reached"
    assert detail.get("paywall") is True
    assert isinstance(detail.get("message"), str)

