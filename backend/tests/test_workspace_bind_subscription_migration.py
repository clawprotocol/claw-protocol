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
