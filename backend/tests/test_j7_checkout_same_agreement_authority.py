"""J7 same-agreement checkout continuity — one continuous production path.

Composite checkout/settlement tests already proved pieces in isolation.
This case is the missing continuous authority:

  persisted owned agreement
  → POST /v1/billing/checkout-session  (production handler; Stripe mocked at _stripe_request)
  → same Checkout Session retrieved as paid with the create-time metadata
  → POST /v1/billing/verify-checkout-session  (production settlement)
  → production Stripe success URL + matchAppPath send-route resume
  → postPaymentAgreementId == preCheckoutAgreementId

Owned-agreement checkout CTAs (SimpleReadyToSendPage, BillingPage, SimpleSendPage)
send return_to=/app/send/{agreementId}?phase=send. SimpleCheckoutPage keeps that
via safeReturnToForAgreement. build_checkout_success_url preserves that path.
After Stripe return, frontend/src/launch/routes.ts matchAppPath selects the
agreement from /app/send/:agreementId. handleCheckoutReturnEntitlement settles
entitlement only and does not choose an agreement.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
from urllib.parse import unquote, urlparse

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.security.anonymous_session_store import reset_anonymous_session_store_for_tests
from backend.services.agreement_draft_store import load_draft
from backend.tests.conftest_auth_security import auth_secrets, make_authenticated_user_headers
from backend.tests.entitlement_test_support import ensure_org_pro_entitlement
from backend.usage_economics.commercial_entitlement import STATE_PRO, resolve_commercial_entitlement
from backend.usage_economics.store import UsageEconomicsStore


@pytest.fixture()
def isolated_usage(tmp_path, monkeypatch: pytest.MonkeyPatch, auth_secrets):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage_eco.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_ONRAMP_DB_PATH", str(tmp_path / "onramp.sqlite3"))
    monkeypatch.setenv("CLAW_TREASURY_DB_PATH", str(tmp_path / "treasury.sqlite3"))
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_same_agreement_authority")
    monkeypatch.setenv("STRIPE_PRICE_PRO_MONTHLY", "price_test_monthly")

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
        "title": "Owned agreement for Pro checkout",
        "jurisdiction": "Oklahoma",
        "parties": [
            {"name": "Red Mesa Logistics LLC", "role": "Client"},
            {"name": "Harbor Peak Automation LLC", "role": "Service Provider"},
        ],
        "purpose": "Professional technology and consulting services.",
        "payment_terms": "$96,000 milestone installments",
        "duration": "12 months",
    }


def _form_metadata(payload: Dict[str, Any]) -> Dict[str, str]:
    out: Dict[str, str] = {}
    prefix = "metadata["
    for key, val in payload.items():
        if key.startswith(prefix) and key.endswith("]"):
            out[key[len(prefix) : -1]] = str(val)
    return out


def _production_resume_agreement_id(landing_url: str) -> Optional[str]:
    """Mirror frontend/src/launch/routes.ts matchAppPath agreement selection.

    Owned-agreement Stripe return lands on /app/send/:agreementId.
    /app/create without agreementId is not an agreement identity.
    """
    parsed = urlparse(landing_url)
    path = parsed.path
    send_m = re.match(r"^/app/send/([^/]+)$", path)
    if send_m:
        return unquote(send_m.group(1))
    checkout_m = re.match(r"^/app/checkout/([^/]+)$", path)
    if checkout_m:
        return unquote(checkout_m.group(1))
    return None


def test_owned_agreement_checkout_settlement_resumes_same_canonical_id(
    isolated_usage, monkeypatch: pytest.MonkeyPatch
):
    user_id = "j7-same-agreement-checkout"
    org_id = f"user-{user_id}"
    # Fixture Pro is required for authenticated draft persistence. Settlement
    # below still runs production Stripe checkout authority on this org.
    ensure_org_pro_entitlement(org_id, user_id=user_id)
    headers = make_authenticated_user_headers(user_id)
    client = TestClient(app)

    created = client.post(
        "/api/agreements/draft",
        headers={**headers, "Content-Type": "application/json"},
        json=_owned_draft_payload(),
    )
    assert created.status_code == 200, created.text
    pre_checkout_agreement_id = created.json()["id"]
    assert pre_checkout_agreement_id
    persisted = load_draft(pre_checkout_agreement_id)
    assert persisted is not None
    assert persisted.get("id") == pre_checkout_agreement_id
    owner = isolated_usage.get_agreement_owner_row(pre_checkout_agreement_id)
    assert owner is not None
    assert owner["subject_ref"] == f"org:{org_id}"
    assert isolated_usage.list_agreement_ids_for_subject(f"org:{org_id}") == [
        pre_checkout_agreement_id
    ]

    # Production owned-agreement CTA return_to (SimpleReadyToSendPage / BillingPage).
    return_to = f"/app/send/{pre_checkout_agreement_id}?phase=send"

    stripe_state: Dict[str, Any] = {}

    def _fake_stripe(method: str, path: str, data: Dict[str, Any]) -> Dict[str, Any]:
        if method == "POST" and path == "/checkout/sessions":
            sid = "cs_test_same_agreement_authority"
            stripe_state["create_payload"] = dict(data)
            stripe_state["session_id"] = sid
            return {
                "id": sid,
                "url": f"https://checkout.stripe.com/c/pay/{sid}",
            }
        if method == "GET" and path.startswith("/checkout/sessions/"):
            sid = path.rsplit("/", 1)[-1]
            assert sid == stripe_state.get("session_id")
            metadata = _form_metadata(stripe_state["create_payload"])
            period_ts = int((datetime.now(timezone.utc) + timedelta(days=30)).timestamp())
            retrieved = {
                "id": sid,
                "status": "complete",
                "payment_status": "paid",
                "customer": "cus_test_same_agreement",
                "subscription": {
                    "id": "sub_test_same_agreement",
                    "status": "active",
                    "customer": "cus_test_same_agreement",
                    "current_period_end": period_ts,
                    "metadata": dict(metadata),
                },
                "metadata": dict(metadata),
            }
            stripe_state["retrieved"] = retrieved
            return retrieved
        raise AssertionError(f"unexpected Stripe call {method} {path}")

    monkeypatch.setattr("backend.billing.stripe_client._stripe_request", _fake_stripe)

    checkout = client.post(
        "/v1/billing/checkout-session",
        headers=headers,
        json={
            "agreement_id": pre_checkout_agreement_id,
            "cadence": "monthly",
            "return_to": return_to,
        },
    )
    assert checkout.status_code == 200, checkout.text
    checkout_body = checkout.json()
    checkout_session_id = checkout_body["session_id"]
    assert checkout_session_id == "cs_test_same_agreement_authority"
    assert checkout_body["org_id"] == org_id

    create_payload = stripe_state["create_payload"]
    create_metadata = _form_metadata(create_payload)
    assert create_metadata.get("agreement_id") == pre_checkout_agreement_id
    assert create_payload.get("subscription_data[metadata][agreement_id]") == pre_checkout_agreement_id
    assert create_metadata.get("org_id") == org_id
    success_url_template = str(create_payload.get("success_url") or "")
    assert "checkout_session_id={CHECKOUT_SESSION_ID}" in success_url_template
    assert pre_checkout_agreement_id in success_url_template

    # Stripe substitutes {CHECKOUT_SESSION_ID} on the production success URL.
    landing_url = success_url_template.replace("{CHECKOUT_SESSION_ID}", checkout_session_id)
    assert "premiumCompletion=1" in landing_url
    assert f"checkout_session_id={checkout_session_id}" in landing_url

    verify = client.post(
        "/v1/billing/verify-checkout-session",
        headers=headers,
        json={"session_id": checkout_session_id},
    )
    assert verify.status_code == 200, verify.text
    verify_body = verify.json()
    assert verify_body.get("ok") is True
    assert verify_body.get("agreement_id") == pre_checkout_agreement_id
    subscription = verify_body.get("subscription") or {}
    assert str(subscription.get("plan_code") or "").lower() == "pro"
    assert str(subscription.get("status") or "").lower() == "active"

    retrieved = stripe_state["retrieved"]
    retrieved_agreement_id = str((retrieved.get("metadata") or {}).get("agreement_id") or "")
    assert retrieved_agreement_id == pre_checkout_agreement_id

    decision = resolve_commercial_entitlement(f"org:{org_id}")
    assert decision["state"] == STATE_PRO
    from backend.economics.store import get_economics_store

    eco_row = get_economics_store().get_subscription_by_org(org_id)
    assert eco_row is not None
    assert str(eco_row.get("plan_code") or "").lower() == "pro"
    assert str(eco_row.get("payment_id") or "") == f"stripe:checkout_session:{checkout_session_id}"

    # Production resume: landing path → matchAppPath simpleSend agreementId.
    # handleCheckoutReturnEntitlement does not select an agreement.
    post_payment_agreement_id = _production_resume_agreement_id(landing_url)
    assert post_payment_agreement_id == pre_checkout_agreement_id
    assert isolated_usage.list_agreement_ids_for_subject(f"org:{org_id}") == [
        pre_checkout_agreement_id
    ]
    assert load_draft(pre_checkout_agreement_id) is not None
    print(
        "J7_SAME_AGREEMENT_CHECKOUT_TRACE "
        f"preCheckoutAgreementId={pre_checkout_agreement_id} "
        f"owner_org={org_id} "
        f"checkoutSessionId={checkout_session_id} "
        f"stripe_metadata_agreement_id={create_metadata.get('agreement_id')} "
        f"retrieved_metadata_agreement_id={retrieved_agreement_id} "
        f"settlement_org={decision.get('org_id') or org_id} "
        f"entitlement_state={decision['state']} "
        f"landing_url={landing_url} "
        f"postPaymentAgreementId={post_payment_agreement_id}"
    )
