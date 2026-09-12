"""Production billing status / portal / checkout-repeat handlers. External Stripe is mocked."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.billing.subscription_authority import demo_expiry_iso
from backend.economics.store import get_economics_store, reset_economics_store_for_tests
from backend.main import app
from backend.tests.auth_fixtures import (
    configure_production_like_jwt,
    owner_headers_production_like,
)


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite"))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.setenv("CLAW_RATE_LIMIT_RPS", "1000")
    monkeypatch.setenv("CLAW_RATE_LIMIT_BURST", "1000")
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    monkeypatch.delenv("STRIPE_PRICE_PRO_MONTHLY", raising=False)
    configure_production_like_jwt(monkeypatch)
    reset_economics_store_for_tests()
    import backend.main as main_mod

    main_mod._rate_state.clear()
    yield TestClient(app, raise_server_exceptions=False)
    reset_economics_store_for_tests()


def _seed_pro(org_id: str, *, customer: str | None = "cus_portal_owner") -> None:
    eco = get_economics_store()
    eco.init_schema()
    eco.upsert_subscription_authority(
        org_id=org_id,
        user_id="portal-owner",
        plan_code="pro",
        status="active",
        expires_at=demo_expiry_iso(30),
        current_period_end=demo_expiry_iso(30),
        canceled_at=None,
        stripe_subscription_id="sub_portal",
        stripe_customer_id=customer,
        payment_id="pay_portal",
        renewed_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        cancel_at_period_end=False,
        billing_interval="month",
    )
    if customer:
        eco.upsert_stripe_customer_org(stripe_customer_id=customer, org_id=org_id)


def test_status_uses_verified_org_not_caller_org(client: TestClient) -> None:
    headers = owner_headers_production_like(user_id="portal-owner")
    _seed_pro(headers["X-Claw-Org-Id"])
    res = client.get("/v1/billing/status", headers={**headers, "Accept": "application/json"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["org_id"] == headers["X-Claw-Org-Id"]
    assert body["display_state"] == "active"
    assert body["entitled"] is True
    assert body["billing_interval"] == "month"
    assert body["plan_label"] == "LawDog Pro"
    assert "cus_portal_owner" not in res.text


def test_status_anonymous_rejected(client: TestClient) -> None:
    res = client.get("/v1/billing/status", headers={"Accept": "application/json"})
    assert res.status_code == 401


def test_status_confirmed_empty(client: TestClient) -> None:
    headers = owner_headers_production_like(user_id="empty-owner")
    res = client.get("/v1/billing/status", headers={**headers, "Accept": "application/json"})
    assert res.status_code == 200, res.text
    assert res.json()["display_state"] == "no_subscription"
    assert res.json()["entitled"] is False


def test_portal_missing_config_is_explicit_blocker(client: TestClient) -> None:
    headers = owner_headers_production_like(user_id="portal-owner")
    _seed_pro(headers["X-Claw-Org-Id"])
    res = client.post(
        "/v1/billing/portal-session",
        headers={**headers, "Content-Type": "application/json"},
        json={"return_to": "/app/billing"},
    )
    assert res.status_code == 503
    assert res.json()["detail"]["code"] == "stripe_portal_not_configured"


def test_portal_rejects_caller_customer_identity(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_portal")
    headers = owner_headers_production_like(user_id="portal-owner")
    _seed_pro(headers["X-Claw-Org-Id"])
    res = client.post(
        "/v1/billing/portal-session",
        headers={**headers, "Content-Type": "application/json"},
        json={"return_to": "/app/billing", "customer_id": "cus_attacker"},
    )
    assert res.status_code == 400
    assert res.json()["detail"]["code"] == "caller_customer_rejected"


def test_portal_uses_server_customer_and_safe_return(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_portal")
    captured: dict = {}

    def _fake_portal(*, customer_id: str, return_url: str):
        captured["customer_id"] = customer_id
        captured["return_url"] = return_url
        return {"id": "bps_test", "url": "https://billing.stripe.com/p/session/test"}

    monkeypatch.setattr(
        "backend.routers.billing_checkout_api.create_billing_portal_session",
        _fake_portal,
    )
    headers = owner_headers_production_like(user_id="portal-owner")
    _seed_pro(headers["X-Claw-Org-Id"])
    res = client.post(
        "/v1/billing/portal-session",
        headers={**headers, "Content-Type": "application/json"},
        json={
            "return_to": "https://evil.example/phish?premiumCompletion=1&checkout_session_id=cs_x",
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["portal_url"].startswith("https://billing.stripe.com/")
    assert captured["customer_id"] == "cus_portal_owner"
    assert "evil.example" not in captured["return_url"]
    assert "premiumCompletion" not in captured["return_url"]
    assert "checkout_session_id" not in captured["return_url"]
    assert captured["return_url"].endswith("/app/billing")


def test_portal_without_customer_is_explicit(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_portal")
    headers = owner_headers_production_like(user_id="no-customer")
    _seed_pro(headers["X-Claw-Org-Id"], customer=None)
    res = client.post(
        "/v1/billing/portal-session",
        headers={**headers, "Content-Type": "application/json"},
        json={"return_to": "/app/billing"},
    )
    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "no_stripe_customer"


def test_checkout_rejects_existing_subscriber(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_checkout")
    monkeypatch.setenv("STRIPE_PRICE_PRO_MONTHLY", "price_test_monthly")
    created = {"n": 0}

    def _boom(**_kwargs):
        created["n"] += 1
        raise AssertionError("must not create a second checkout")

    monkeypatch.setattr("backend.routers.billing_checkout_api.create_checkout_session", _boom)
    headers = owner_headers_production_like(user_id="portal-owner")
    _seed_pro(headers["X-Claw-Org-Id"])
    res = client.post(
        "/v1/billing/checkout-session",
        headers={**headers, "Content-Type": "application/json"},
        json={
            "agreement_id": "__claw_create_checkout__",
            "cadence": "monthly",
            "return_to": "/app/create",
        },
    )
    assert res.status_code == 409, res.text
    assert res.json()["detail"]["code"] == "already_subscribed"
    assert created["n"] == 0


def test_scheduled_cancel_row_still_blocks_repeat_purchase(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_checkout")
    monkeypatch.setenv("STRIPE_PRICE_PRO_MONTHLY", "price_test_monthly")
    headers = owner_headers_production_like(user_id="cancel-soon")
    eco = get_economics_store()
    eco.init_schema()
    end = (datetime.now(timezone.utc) + timedelta(days=10)).isoformat().replace("+00:00", "Z")
    eco.upsert_subscription_authority(
        org_id=headers["X-Claw-Org-Id"],
        user_id="cancel-soon",
        plan_code="pro",
        status="active",
        expires_at=end,
        current_period_end=end,
        canceled_at=None,
        stripe_subscription_id="sub_cancel",
        stripe_customer_id="cus_cancel",
        payment_id="pay_cancel",
        renewed_at=end,
        cancel_at_period_end=True,
        billing_interval="month",
    )
    res = client.get("/v1/billing/status", headers={**headers, "Accept": "application/json"})
    assert res.status_code == 200
    assert res.json()["display_state"] == "scheduled_cancellation"
    assert res.json()["entitled"] is True
    blocked = client.post(
        "/v1/billing/checkout-session",
        headers={**headers, "Content-Type": "application/json"},
        json={"agreement_id": "__claw_create_checkout__", "cadence": "monthly", "return_to": "/app/create"},
    )
    assert blocked.status_code == 409
