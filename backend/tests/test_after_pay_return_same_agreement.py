"""After-pay return: same persist ID + verify CORS/settlement. No remint."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.security.anonymous_session_store import reset_anonymous_session_store_for_tests
from backend.services.agreement_draft_store import load_draft
from backend.tests.conftest_auth_security import auth_secrets, make_authenticated_user_headers
from backend.tests.entitlement_test_support import ensure_org_pro_entitlement
from backend.usage_economics.commercial_entitlement import STATE_PRO, resolve_commercial_entitlement
from backend.usage_economics.store import UsageEconomicsStore

STAGING_FRONTEND = "https://believable-gentleness-staging.up.railway.app"


@pytest.fixture()
def isolated_usage(tmp_path, monkeypatch: pytest.MonkeyPatch, auth_secrets):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage_eco.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_ONRAMP_DB_PATH", str(tmp_path / "onramp.sqlite3"))
    monkeypatch.setenv("CLAW_TREASURY_DB_PATH", str(tmp_path / "treasury.sqlite3"))
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_after_pay_return")
    monkeypatch.setenv("STRIPE_PRICE_PRO_MONTHLY", "price_test_monthly")
    monkeypatch.setenv("CLAW_CORS_ALLOW_ORIGINS", STAGING_FRONTEND)

    import backend.economics.store as eco_store_mod
    import backend.usage_economics.store as ue_store_mod
    from backend.economics.store import reset_economics_store_for_tests
    from backend.payments.store import reset_onramp_store_for_tests
    import backend.treasury.treasury_store as treasury_mod

    ue_store_mod._store = None
    reset_economics_store_for_tests()
    reset_onramp_store_for_tests()
    treasury_mod._store = None
    reset_anonymous_session_store_for_tests()
    usage = UsageEconomicsStore(str(tmp_path / "usage_eco.sqlite3"))
    usage.init_schema()
    yield usage
    ue_store_mod._store = None
    eco_store_mod._store = None
    reset_onramp_store_for_tests()
    treasury_mod._store = None
    reset_anonymous_session_store_for_tests()


def _owned_draft_payload() -> dict:
    return {
        "title": "Owned agreement for after-pay return",
        "jurisdiction": "Oklahoma",
        "parties": [
            {"name": "Red Mesa Logistics LLC", "role": "Client"},
            {"name": "Harbor Peak Automation LLC", "role": "Service Provider"},
        ],
        "purpose": "Professional technology and consulting services.",
        "payment_terms": "$49 per month",
        "duration": "12 months",
    }


def _form_metadata(payload: Dict[str, Any]) -> Dict[str, str]:
    out: Dict[str, str] = {}
    prefix = "metadata["
    for key, val in payload.items():
        if key.startswith(prefix) and key.endswith("]"):
            out[key[len(prefix) : -1]] = str(val)
    return out


def test_after_pay_success_url_and_verify_restore_same_persist(
    isolated_usage, monkeypatch: pytest.MonkeyPatch
):
    user_id = "after-pay-return-buyer"
    org_id = f"user-{user_id}"
    ensure_org_pro_entitlement(org_id, user_id=user_id)
    headers = make_authenticated_user_headers(user_id)
    client = TestClient(app)

    created = client.post(
        "/api/agreements/draft",
        headers={**headers, "Content-Type": "application/json"},
        json=_owned_draft_payload(),
    )
    assert created.status_code == 200, created.text
    persist_id = created.json()["id"]
    assert persist_id
    assert load_draft(persist_id) is not None

    stripe_state: Dict[str, Any] = {}

    def _fake_stripe(method: str, path: str, data: Dict[str, Any]) -> Dict[str, Any]:
        if method == "POST" and path == "/checkout/sessions":
            sid = "cs_test_after_pay_return"
            stripe_state["create_payload"] = dict(data)
            stripe_state["session_id"] = sid
            return {"id": sid, "url": f"https://checkout.stripe.com/c/pay/{sid}"}
        if method == "GET" and path.startswith("/checkout/sessions/"):
            sid = path.rsplit("/", 1)[-1]
            assert sid == stripe_state.get("session_id")
            metadata = _form_metadata(stripe_state["create_payload"])
            period_ts = int((datetime.now(timezone.utc) + timedelta(days=30)).timestamp())
            return {
                "id": sid,
                "status": "complete",
                "payment_status": "paid",
                "customer": "cus_test_after_pay",
                "subscription": {
                    "id": "sub_test_after_pay",
                    "status": "active",
                    "customer": "cus_test_after_pay",
                    "current_period_end": period_ts,
                    "metadata": dict(metadata),
                },
                "metadata": dict(metadata),
            }
        raise AssertionError(f"unexpected Stripe call {method} {path}")

    monkeypatch.setattr("backend.billing.stripe_client._stripe_request", _fake_stripe)

    # Walk sent restore=starterReview even when checkout path held the persist ID.
    checkout = client.post(
        "/v1/billing/checkout-session",
        headers={**headers, "Origin": STAGING_FRONTEND},
        json={
            "agreement_id": persist_id,
            "cadence": "monthly",
            "return_to": "/app/create?restore=starterReview",
        },
    )
    assert checkout.status_code == 200, checkout.text
    success_url = str(stripe_state["create_payload"].get("success_url") or "")
    parsed = urlparse(success_url)
    qs = parse_qs(parsed.query)
    assert parsed.path == "/app/create"
    assert "starterReview" not in (qs.get("restore") or [])
    assert qs.get("premiumCompletion") == ["1"]
    assert qs.get("checkout_session_id") == ["{CHECKOUT_SESSION_ID}"]
    assert "restoreAgreementId=" not in success_url
    assert "restore=starterReview" not in success_url
    assert persist_id == created.json()["id"]

    origin_headers = {
        **headers,
        "Origin": STAGING_FRONTEND,
        "X-Claw-Entitlement-Repair-Org": "local-org",
    }
    verify = client.post(
        "/v1/billing/verify-checkout-session",
        headers=origin_headers,
        json={"session_id": "cs_test_after_pay_return"},
    )
    assert verify.status_code == 200, verify.text
    assert verify.headers.get("access-control-allow-origin") == STAGING_FRONTEND
    assert verify.headers.get("access-control-allow-credentials") == "true"
    body = verify.json()
    assert body.get("ok") is True
    subscription = body.get("subscription") or {}
    assert str(subscription.get("plan_code") or "").lower() == "pro"
    assert str(subscription.get("status") or "").lower() == "active"

    decision = resolve_commercial_entitlement(f"org:{org_id}")
    assert decision["state"] == STATE_PRO
    assert isolated_usage.list_agreement_ids_for_subject(f"org:{org_id}") == [persist_id]
    assert load_draft(persist_id) is not None

    foreign = client.post(
        "/v1/billing/verify-checkout-session",
        headers={
            **make_authenticated_user_headers("foreign-owner"),
            "Origin": STAGING_FRONTEND,
        },
        json={"session_id": "cs_test_after_pay_return"},
    )
    assert foreign.status_code == 403
    assert foreign.headers.get("access-control-allow-origin") == STAGING_FRONTEND
