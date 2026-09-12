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


def _canonical_params(data: Dict[str, Any]) -> str:
    items = sorted((str(k), str(v)) for k, v in data.items())
    return repr(items)


def _public_session(rec: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in rec.items() if not str(k).startswith("_")}


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
        "expires": [],
        "sessions": sessions if sessions is not None else {},
        "by_key": {},
        "seq": 0,
        "mismatches": [],
    }

    def _fake_stripe(method: str, path: str, data: Dict[str, Any], **kwargs: Any) -> Dict[str, Any]:
        if method == "POST" and path.endswith("/expire"):
            sid = path.split("/")[-2]
            state["expires"].append(sid)
            rec = state["sessions"].get(sid)
            if not rec:
                raise RuntimeError("stripe_api_404")
            rec["status"] = "expired"
            return _public_session(rec)
        if method == "POST" and path == "/checkout/sessions":
            key = str(kwargs.get("idempotency_key") or "").strip()
            params = _canonical_params(data)
            state["creates"].append({"idempotency_key": key, "data": dict(data), "params": params})
            if key and key in state["by_key"]:
                existing = state["by_key"][key]
                stored = existing.get("_params")
                if stored is None:
                    existing["_params"] = params
                elif stored != params:
                    state["mismatches"].append({"key": key, "stored": stored, "got": params})
                    raise RuntimeError("stripe_api_400")
                return _public_session(existing)
            state["seq"] += 1
            sid = f"cs_retry_{state['seq']}"
            rec = {
                "id": sid,
                "url": f"https://checkout.stripe.com/c/pay/{sid}",
                "status": "open",
                "expires_at": int((datetime.now(timezone.utc) + timedelta(hours=23)).timestamp()),
                "_params": params,
            }
            state["sessions"][sid] = rec
            if key:
                state["by_key"][key] = rec
            return _public_session(rec)
        if method == "GET" and path.startswith("/checkout/sessions/"):
            sid = path.rsplit("/", 1)[-1]
            state["retrieves"].append(sid)
            rec = dict(state["sessions"].get(sid) or {})
            if not rec:
                raise RuntimeError("stripe_api_404")
            rec["status"] = rec.get("status") or session_status
            return _public_session(rec)
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
    from backend.billing.schema_ready import ensure_billing_schema_ready

    ensure_billing_schema_ready()
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


def test_cadence_change_supersedes_the_previous_unpaid_session(
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
    assert monthly.json()["session_id"] in state["expires"]
    assert state["sessions"][monthly.json()["session_id"]]["status"] == "expired"
    assert state["sessions"][annual.json()["session_id"]]["status"] == "open"
    pending = get_economics_store().get_pending_checkout_attempt_for_org(headers["X-Claw-Org-Id"])
    assert pending is not None
    assert pending["cadence"] == "annual"
    assert pending["stripe_session_id"] == annual.json()["session_id"]


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


def _post_checkout(client: TestClient, headers: dict, **overrides: Any):
    body = _checkout_body()
    body.update(overrides)
    return client.post(
        "/v1/billing/checkout-session",
        headers={**headers, "Content-Type": "application/json"},
        json=body,
    )


def test_completed_unresolved_session_cannot_mint_a_second_payable_session(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    state = _install_idempotent_stripe(monkeypatch)
    headers = owner_headers_production_like(user_id="complete-pending")
    first = _post_checkout(client, headers)
    assert first.status_code == 200, first.text
    sid = first.json()["session_id"]
    state["sessions"][sid]["status"] = "complete"
    state["sessions"][sid]["payment_status"] = "paid"
    second = _post_checkout(client, headers)
    third = _post_checkout(client, headers, customer_email="other@example.test", return_to="/app/create")
    assert second.status_code == 409, second.text
    assert second.json()["detail"]["code"] == "payment_processing"
    assert second.json()["detail"]["session_id"] == sid
    assert third.status_code == 409, third.text
    assert third.json()["detail"]["code"] == "payment_processing"
    assert {row["id"] for row in state["sessions"].values() if not str(row.get("id", "")).startswith("_")} == {sid}
    assert len(state["creates"]) == 1
    assert get_economics_store().get_subscription_by_org(headers["X-Claw-Org-Id"]) is None


def test_completed_paid_session_reconciles_through_server_authority(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    state = _install_idempotent_stripe(monkeypatch)
    headers = owner_headers_production_like(user_id="complete-recover")
    first = _post_checkout(client, headers)
    assert first.status_code == 200, first.text
    sid = first.json()["session_id"]
    org_id = headers["X-Claw-Org-Id"]
    period_ts = int((datetime.now(timezone.utc) + timedelta(days=30)).timestamp())
    state["sessions"][sid].update(
        {
            "status": "complete",
            "payment_status": "paid",
            "customer": "cus_complete_recover",
            "metadata": {
                "org_id": org_id,
                "claw_org_id": org_id,
                "plan_code": "pro",
                "agreement_id": "__claw_create_checkout__",
            },
            "subscription": {
                "id": "sub_complete_recover",
                "status": "active",
                "customer": "cus_complete_recover",
                "current_period_end": period_ts,
                "metadata": {"org_id": org_id, "plan_code": "pro"},
            },
        }
    )
    second = _post_checkout(client, headers)
    assert second.status_code == 409, second.text
    assert second.json()["detail"]["code"] == "already_subscribed"
    assert len(state["creates"]) == 1
    row = get_economics_store().get_subscription_by_org(org_id)
    assert row is not None
    assert row["status"] == "active"


def test_response_loss_replays_stored_request_not_changed_optional_inputs(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    state = _install_idempotent_stripe(monkeypatch)
    headers = owner_headers_production_like(user_id="replay-owner")
    first = _post_checkout(client, headers, customer_email="first@example.test")
    assert first.status_code == 200, first.text
    sid = first.json()["session_id"]
    eco = get_economics_store()
    pending = eco.get_pending_checkout_attempt_for_org(headers["X-Claw-Org-Id"])
    assert pending is not None
    with eco._conn() as con:
        con.execute(
            """
            UPDATE billing_checkout_attempts
            SET stripe_session_id = NULL, checkout_url = NULL, status = 'creating'
            WHERE id = ?
            """,
            (pending["id"],),
        )
    second = _post_checkout(
        client,
        headers,
        customer_email="changed@example.test",
        return_to="/app/create?restore=other",
        referral_code="CHANGEDCODE",
        visitor_id="vis-changed",
    )
    assert second.status_code == 200, second.text
    assert second.json()["session_id"] == sid
    assert state["mismatches"] == []
    assert [row["params"] for row in state["creates"]] == [state["creates"][0]["params"], state["creates"][0]["params"]]
    assert state["creates"][1]["data"].get("customer_email") == "first@example.test"
    assert "CHANGEDCODE" not in str(state["creates"][1]["data"])


def test_cadence_change_after_completed_unresolved_session_is_blocked(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    state = _install_idempotent_stripe(monkeypatch)
    headers = owner_headers_production_like(user_id="complete-cadence")
    first = _post_checkout(client, headers, cadence="monthly")
    assert first.status_code == 200, first.text
    sid = first.json()["session_id"]
    state["sessions"][sid]["status"] = "complete"
    state["sessions"][sid]["payment_status"] = "paid"
    changed = _post_checkout(client, headers, cadence="annual")
    assert changed.status_code == 409, changed.text
    assert changed.json()["detail"]["code"] == "payment_processing"
    assert len(state["creates"]) == 1
    assert state["expires"] == []


def test_concurrent_checkout_without_test_schema_preinit(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    state = _install_idempotent_stripe(monkeypatch)
    headers = owner_headers_production_like(user_id="race-owner")
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
    assert {body["session_id"] for body in bodies} == {bodies[0]["session_id"]}
    assert len({row["idempotency_key"] for row in state["creates"]}) == 1
    assert state["mismatches"] == []
