"""Checkout retry safety through production handlers. External Stripe is mocked."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List

import pytest
from fastapi.testclient import TestClient

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
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_checkout_retry")
    monkeypatch.setenv("STRIPE_PRICE_PRO_MONTHLY", "price_test_monthly")
    monkeypatch.setenv("STRIPE_PRICE_PRO_ANNUAL", "price_test_annual")
    configure_production_like_jwt(monkeypatch)
    reset_economics_store_for_tests()
    import backend.main as main_mod

    main_mod._rate_state.clear()
    yield TestClient(app, raise_server_exceptions=False)
    reset_economics_store_for_tests()


def _checkout_body(*, agreement_id: str = "__claw_create_checkout__", cadence: str = "monthly") -> dict:
    return {
        "agreement_id": agreement_id,
        "cadence": cadence,
        "return_to": "/app/send/ag-retry-orion?phase=send",
    }


def _install_idempotent_stripe(
    monkeypatch: pytest.MonkeyPatch,
    *,
    sessions: Dict[str, Dict[str, Any]] | None = None,
    creates: List[Dict[str, Any]] | None = None,
    retrieves: List[str] | None = None,
    session_status: str = "open",
) -> Dict[str, Any]:
    state: Dict[str, Any] = {
        "creates": creates if creates is not None else [],
        "retrieves": retrieves if retrieves is not None else [],
        "sessions": sessions if sessions is not None else {},
        "by_key": {},
        "seq": 0,
    }

    def _fake_stripe(method: str, path: str, data: Dict[str, Any], **kwargs: Any) -> Dict[str, Any]:
        if method == "POST" and path == "/checkout/sessions":
            key = str(kwargs.get("idempotency_key") or "").strip()
            state["creates"].append({"idempotency_key": key, "data": dict(data)})
            if key and key in state["by_key"]:
                return dict(state["by_key"][key])
            state["seq"] += 1
            sid = f"cs_retry_{state['seq']}"
            rec = {
                "id": sid,
                "url": f"https://checkout.stripe.com/c/pay/{sid}",
                "status": "open",
                "expires_at": int((datetime.now(timezone.utc) + timedelta(hours=23)).timestamp()),
            }
            state["sessions"][sid] = rec
            if key:
                state["by_key"][key] = rec
            return dict(rec)
        if method == "GET" and path.startswith("/checkout/sessions/"):
            sid = path.rsplit("/", 1)[-1]
            state["retrieves"].append(sid)
            rec = dict(state["sessions"].get(sid) or {})
            if not rec:
                raise RuntimeError("stripe_api_404")
            rec["status"] = rec.get("status") or session_status
            return rec
        raise AssertionError(f"unexpected Stripe call {method} {path}")

    monkeypatch.setattr("backend.billing.stripe_client._stripe_request", _fake_stripe)
    return state


def test_duplicate_authenticated_checkout_reuses_one_session(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    state = _install_idempotent_stripe(monkeypatch)
    headers = owner_headers_production_like(user_id="retry-owner")
    first = client.post(
        "/v1/billing/checkout-session",
        headers={**headers, "Content-Type": "application/json"},
        json=_checkout_body(),
    )
    second = client.post(
        "/v1/billing/checkout-session",
        headers={**headers, "Content-Type": "application/json"},
        json=_checkout_body(),
    )
    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert first.json()["session_id"] == second.json()["session_id"]
    assert first.json()["checkout_url"] == second.json()["checkout_url"]
    assert len(state["creates"]) == 1
    assert state["creates"][0]["idempotency_key"].startswith("claw:checkout:")
    assert state["creates"][0]["data"].get("metadata[agreement_id]") == "__claw_create_checkout__"


def test_concurrent_checkout_requests_share_one_payable_session(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    state = _install_idempotent_stripe(monkeypatch)
    headers = owner_headers_production_like(user_id="concurrent-owner")
    eco = get_economics_store()
    eco.init_schema()
    payload = _checkout_body()

    def _post() -> dict:
        res = client.post(
            "/v1/billing/checkout-session",
            headers={**headers, "Content-Type": "application/json"},
            json=payload,
        )
        assert res.status_code == 200, res.text
        return res.json()

    with ThreadPoolExecutor(max_workers=2) as pool:
        bodies = list(pool.map(lambda _i: _post(), range(2)))
    ids = {body["session_id"] for body in bodies}
    assert len(ids) == 1
    keys = {row["idempotency_key"] for row in state["creates"]}
    assert len(keys) == 1
    assert len(state["sessions"]) == 1


def test_provider_success_local_response_loss_retries_same_key(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    headers = owner_headers_production_like(user_id="loss-owner")
    org_id = headers["X-Claw-Org-Id"]
    eco = get_economics_store()
    eco.init_schema()
    prior = eco.claim_or_reuse_checkout_attempt(
        org_id=org_id,
        user_id="loss-owner",
        agreement_id="__claw_create_checkout__",
        cadence="monthly",
        return_to="/app/create",
        price_id="price_test_monthly",
    )
    assert prior["status"] == "creating"
    assert not prior.get("stripe_session_id")
    key = prior["idempotency_key"]
    existing = {
        "id": "cs_already_created",
        "url": "https://checkout.stripe.com/c/pay/cs_already_created",
        "status": "open",
        "expires_at": int((datetime.now(timezone.utc) + timedelta(hours=23)).timestamp()),
    }
    state = _install_idempotent_stripe(monkeypatch)
    state["by_key"][key] = existing
    state["sessions"][existing["id"]] = existing

    res = client.post(
        "/v1/billing/checkout-session",
        headers={**headers, "Content-Type": "application/json"},
        json=_checkout_body(),
    )
    assert res.status_code == 200, res.text
    assert res.json()["session_id"] == "cs_already_created"
    assert [row["idempotency_key"] for row in state["creates"]] == [key]
    opened = eco.get_open_checkout_attempt(
        org_id=org_id,
        agreement_id="__claw_create_checkout__",
        cadence="monthly",
    )
    assert opened is not None
    assert opened["stripe_session_id"] == "cs_already_created"
    assert opened["status"] == "open"


def test_expired_or_canceled_attempt_allows_a_new_purchase(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    headers = owner_headers_production_like(user_id="expired-owner")
    org_id = headers["X-Claw-Org-Id"]
    eco = get_economics_store()
    eco.init_schema()
    stale = eco.claim_or_reuse_checkout_attempt(
        org_id=org_id,
        user_id="expired-owner",
        agreement_id="__claw_create_checkout__",
        cadence="monthly",
        return_to="/app/create",
        price_id="price_test_monthly",
    )
    eco.record_checkout_attempt_session(
        stale["id"],
        stripe_session_id="cs_stale",
        checkout_url="https://checkout.stripe.com/c/pay/cs_stale",
        expires_at=(datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat().replace("+00:00", "Z"),
        status="open",
    )
    state = _install_idempotent_stripe(monkeypatch)
    state["sessions"]["cs_stale"] = {
        "id": "cs_stale",
        "url": "https://checkout.stripe.com/c/pay/cs_stale",
        "status": "expired",
    }
    res = client.post(
        "/v1/billing/checkout-session",
        headers={**headers, "Content-Type": "application/json"},
        json=_checkout_body(),
    )
    assert res.status_code == 200, res.text
    assert res.json()["session_id"] != "cs_stale"
    assert len(state["creates"]) == 1
    assert state["creates"][0]["idempotency_key"] != stale["idempotency_key"]


def test_canceled_open_attempt_does_not_block_later_purchase(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    headers = owner_headers_production_like(user_id="canceled-owner")
    org_id = headers["X-Claw-Org-Id"]
    eco = get_economics_store()
    eco.init_schema()
    prior = eco.claim_or_reuse_checkout_attempt(
        org_id=org_id,
        user_id="canceled-owner",
        agreement_id="__claw_create_checkout__",
        cadence="monthly",
        return_to="/app/create",
        price_id="price_test_monthly",
    )
    eco.record_checkout_attempt_session(
        prior["id"],
        stripe_session_id="cs_canceled",
        checkout_url="https://checkout.stripe.com/c/pay/cs_canceled",
        expires_at=(datetime.now(timezone.utc) + timedelta(hours=20)).isoformat().replace("+00:00", "Z"),
        status="open",
    )
    state = _install_idempotent_stripe(monkeypatch)
    state["sessions"]["cs_canceled"] = {
        "id": "cs_canceled",
        "url": "https://checkout.stripe.com/c/pay/cs_canceled",
        "status": "canceled",
    }
    res = client.post(
        "/v1/billing/checkout-session",
        headers={**headers, "Content-Type": "application/json"},
        json=_checkout_body(),
    )
    assert res.status_code == 200, res.text
    assert res.json()["session_id"] != "cs_canceled"
    assert len(state["creates"]) == 1
    assert state["creates"][0]["idempotency_key"] != prior["idempotency_key"]


def test_cadence_change_is_a_different_pending_purchase(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    state = _install_idempotent_stripe(monkeypatch)
    headers = owner_headers_production_like(user_id="cadence-owner")
    monthly = client.post(
        "/v1/billing/checkout-session",
        headers={**headers, "Content-Type": "application/json"},
        json=_checkout_body(cadence="monthly"),
    )
    annual = client.post(
        "/v1/billing/checkout-session",
        headers={**headers, "Content-Type": "application/json"},
        json=_checkout_body(cadence="annual"),
    )
    assert monthly.status_code == 200, monthly.text
    assert annual.status_code == 200, annual.text
    assert monthly.json()["session_id"] != annual.json()["session_id"]
    assert len(state["creates"]) == 2


def test_already_subscribed_still_blocks_retry_after_attempt_reuse(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from backend.billing.subscription_authority import demo_expiry_iso

    state = _install_idempotent_stripe(monkeypatch)
    headers = owner_headers_production_like(user_id="entitled-owner")
    eco = get_economics_store()
    eco.init_schema()
    eco.upsert_subscription_authority(
        org_id=headers["X-Claw-Org-Id"],
        user_id="entitled-owner",
        plan_code="pro",
        status="active",
        expires_at=demo_expiry_iso(30),
        current_period_end=demo_expiry_iso(30),
        canceled_at=None,
        stripe_subscription_id="sub_entitled",
        stripe_customer_id="cus_entitled",
        payment_id="pay_entitled",
        renewed_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        cancel_at_period_end=False,
        billing_interval="month",
    )
    res = client.post(
        "/v1/billing/checkout-session",
        headers={**headers, "Content-Type": "application/json"},
        json=_checkout_body(),
    )
    assert res.status_code == 409, res.text
    assert res.json()["detail"]["code"] == "already_subscribed"
    assert state["creates"] == []
