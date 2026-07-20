"""Anonymous create-flow checkout via server-bound checkout intents."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.billing.checkout_intent_store import CREATE_FLOW_CHECKOUT_AGREEMENT_ID, reset_checkout_intent_store_for_tests
from backend.main import app
from backend.tests.commercial_test_helpers import isolated_economics_store
from backend.tests.conftest_auth_security import mint_anonymous_session

_VALID_SESSION = {
    "id": "cs_create_flow_ok",
    "status": "complete",
    "payment_status": "paid",
    "customer": "cus_create",
    "subscription": "sub_create",
    "metadata": {},
}


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture(autouse=True)
def _auth_secrets(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_ANON_SESSION_SECRET", "test-anon-session-secret")
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    reset_checkout_intent_store_for_tests()
    yield
    reset_checkout_intent_store_for_tests()


def test_create_flow_checkout_session_uses_server_intent(client: TestClient, tmp_path, monkeypatch) -> None:
    isolated_economics_store(tmp_path, monkeypatch)
    org_id, _token, headers = mint_anonymous_session(client)
    usage_path = str(tmp_path / "usage_eco.sqlite3")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", usage_path)
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")

    stripe_session = {"id": "cs_new", "url": "https://checkout.stripe.test/cs_new"}
    with patch("backend.routers.billing_checkout_api.is_stripe_checkout_configured", return_value=True):
        with patch("backend.routers.billing_checkout_api.create_checkout_session", return_value=stripe_session) as create_mock:
            res = client.post(
                "/v1/billing/checkout-session",
                headers=headers,
                json={
                    "agreement_id": CREATE_FLOW_CHECKOUT_AGREEMENT_ID,
                    "cadence": "monthly",
                    "return_to": "/app/create",
                },
            )
    assert res.status_code == 200, res.text
    assert res.json()["org_id"] == org_id
    metadata = create_mock.call_args.kwargs["metadata"]
    assert metadata["agreement_id"] == CREATE_FLOW_CHECKOUT_AGREEMENT_ID
    assert metadata["checkout_intent_id"]
    assert metadata["org_id"] == org_id


def test_create_flow_checkout_rejects_without_verified_workspace(client: TestClient, tmp_path, monkeypatch) -> None:
    isolated_economics_store(tmp_path, monkeypatch)
    with patch("backend.routers.billing_checkout_api.is_stripe_checkout_configured", return_value=True):
        res = client.post(
            "/v1/billing/checkout-session",
            headers={"X-Claw-Org-Id": "anon-forged"},
            json={
                "agreement_id": CREATE_FLOW_CHECKOUT_AGREEMENT_ID,
                "cadence": "monthly",
            },
        )
    assert res.status_code in (401, 403)


def test_create_flow_verify_requires_checkout_intent(client: TestClient, tmp_path, monkeypatch) -> None:
    eco = isolated_economics_store(tmp_path, monkeypatch)
    org_id, _token, headers = mint_anonymous_session(client)
    usage_path = str(tmp_path / "usage_eco.sqlite3")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", usage_path)
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")

    session = {
        **_VALID_SESSION,
        "metadata": {
            "org_id": org_id,
            "agreement_id": CREATE_FLOW_CHECKOUT_AGREEMENT_ID,
            "plan_code": "pro",
        },
    }
    with patch("backend.routers.billing_checkout_api.is_stripe_checkout_configured", return_value=True):
        with patch("backend.routers.billing_checkout_api.retrieve_checkout_session", return_value=session):
            res = client.post(
                "/v1/billing/verify-checkout-session",
                headers=headers,
                json={"session_id": "cs_create_flow_ok"},
            )
    assert res.status_code == 403
    assert eco.get_subscription_by_org(org_id) is None


def test_create_flow_verify_succeeds_with_trusted_intent(client: TestClient, tmp_path, monkeypatch) -> None:
    eco = isolated_economics_store(tmp_path, monkeypatch)
    org_id, _token, headers = mint_anonymous_session(client)
    usage_path = str(tmp_path / "usage_eco.sqlite3")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", usage_path)
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")

    stripe_session = {"id": "cs_bound", "url": "https://checkout.stripe.test/cs_bound"}
    with patch("backend.routers.billing_checkout_api.is_stripe_checkout_configured", return_value=True):
        with patch("backend.routers.billing_checkout_api.create_checkout_session", return_value=stripe_session) as create_mock:
            create_res = client.post(
                "/v1/billing/checkout-session",
                headers=headers,
                json={
                    "agreement_id": CREATE_FLOW_CHECKOUT_AGREEMENT_ID,
                    "cadence": "monthly",
                },
            )
    assert create_res.status_code == 200, create_res.text
    intent_id = create_mock.call_args.kwargs["metadata"]["checkout_intent_id"]
    assert intent_id

    session = {
        **_VALID_SESSION,
        "id": "cs_bound",
        "metadata": {
            "org_id": org_id,
            "agreement_id": CREATE_FLOW_CHECKOUT_AGREEMENT_ID,
            "checkout_intent_id": intent_id,
            "plan_code": "pro",
        },
    }
    with patch("backend.routers.billing_checkout_api.is_stripe_checkout_configured", return_value=True):
        with patch("backend.routers.billing_checkout_api.retrieve_checkout_session", return_value=session):
            verify_res = client.post(
                "/v1/billing/verify-checkout-session",
                headers=headers,
                json={"session_id": "cs_bound"},
            )
    assert verify_res.status_code == 200, verify_res.text
    assert eco.get_subscription_by_org(org_id) is not None
