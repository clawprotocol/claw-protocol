"""Checkout Session payload must carry org authority on Session and Subscription."""

from __future__ import annotations

from typing import Any, Dict

from backend.billing.stripe_client import create_checkout_session
from backend.payments.stripe_checkout_helpers import lawdog_pro_checkout_metadata


def test_create_checkout_session_writes_org_identity_on_session_and_subscription(
    monkeypatch,
) -> None:
    captured: Dict[str, Any] = {}

    def _fake_request(method: str, path: str, data: Dict[str, Any], **kwargs: Any) -> Dict[str, Any]:
        captured["method"] = method
        captured["path"] = path
        captured["data"] = dict(data)
        captured["idempotency_key"] = kwargs.get("idempotency_key")
        return {"id": "cs_test_payload", "url": "https://checkout.stripe.com/c/pay/cs_test_payload"}

    monkeypatch.setattr("backend.billing.stripe_client._stripe_request", _fake_request)
    metadata = lawdog_pro_checkout_metadata(
        org_id="org-payload-1",
        referral_code="FOUNDERTEST",
        visitor_id="vis-payload-1",
        user_id="user-payload-1",
    )
    metadata["agreement_id"] = "agr-payload-1"

    session = create_checkout_session(
        price_id="price_test_monthly",
        success_url="https://example.test/app/create?premiumCompletion=1",
        cancel_url="https://example.test/app/checkout/agr-payload-1",
        customer_email="buyer@example.test",
        metadata=metadata,
    )
    assert session["id"] == "cs_test_payload"
    assert captured["idempotency_key"] is None
    assert captured["method"] == "POST"
    assert captured["path"] == "/checkout/sessions"
    data = captured["data"]
    for key in ("org_id", "claw_org_id", "plan_code", "user_id", "agreement_id", "referral_code", "visitor_id"):
        assert data.get(f"metadata[{key}]"), key
        assert data.get(f"subscription_data[metadata][{key}]"), key
    assert data["metadata[org_id]"] == "org-payload-1"
    assert data["metadata[claw_org_id]"] == "org-payload-1"
    assert data["metadata[plan_code]"] == "pro"
    assert data["metadata[user_id]"] == "user-payload-1"
    assert data["subscription_data[metadata][org_id]"] == "org-payload-1"
    assert data["subscription_data[metadata][claw_org_id]"] == "org-payload-1"
    assert data["subscription_data[metadata][plan_code]"] == "pro"
    assert data["subscription_data[metadata][user_id]"] == "user-payload-1"
    assert data["subscription_data[metadata][agreement_id]"] == "agr-payload-1"
    assert data["customer_email"] == "buyer@example.test"


def test_retrieve_checkout_session_expands_subscription(monkeypatch) -> None:
    captured: Dict[str, Any] = {}

    def _fake_request(method: str, path: str, data: Dict[str, Any], **_kwargs: Any) -> Dict[str, Any]:
        captured["method"] = method
        captured["path"] = path
        captured["data"] = dict(data)
        return {"id": "cs_expand", "subscription": {"id": "sub_expand"}}

    monkeypatch.setattr("backend.billing.stripe_client._stripe_request", _fake_request)
    from backend.billing.stripe_client import retrieve_checkout_session

    session = retrieve_checkout_session("cs_expand")
    assert session["id"] == "cs_expand"
    assert captured["method"] == "GET"
    assert captured["path"] == "/checkout/sessions/cs_expand"
    assert captured["data"].get("expand[]") == "subscription"


def test_create_checkout_session_forwards_idempotency_key(monkeypatch) -> None:
    captured: Dict[str, Any] = {}

    def _fake_request(method: str, path: str, data: Dict[str, Any], **kwargs: Any) -> Dict[str, Any]:
        captured["idempotency_key"] = kwargs.get("idempotency_key")
        return {"id": "cs_idem", "url": "https://checkout.stripe.com/c/pay/cs_idem"}

    monkeypatch.setattr("backend.billing.stripe_client._stripe_request", _fake_request)
    metadata = lawdog_pro_checkout_metadata(org_id="org-idem-1")
    create_checkout_session(
        price_id="price_test_monthly",
        success_url="https://example.test/app/create",
        cancel_url="https://example.test/app/create",
        metadata=metadata,
        idempotency_key="claw:checkout:org-idem-1:monthly:ag-1:attempt-1",
    )
    assert captured["idempotency_key"] == "claw:checkout:org-idem-1:monthly:ag-1:attempt-1"
