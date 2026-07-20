"""POST /v1/billing/verify-checkout-session authority boundary tests."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.tests.commercial_test_helpers import activate_pro_on_org, isolated_economics_store
from backend.tests.conftest_auth_security import make_authenticated_user_headers, mint_anonymous_session

_VALID_SESSION = {
    "id": "cs_test_verify_ok",
    "status": "complete",
    "payment_status": "paid",
    "customer": "cus_verify",
    "subscription": "sub_verify",
    "metadata": {
        "org_id": "org-verify-a",
        "plan_code": "pro",
    },
}


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture(autouse=True)
def _auth_secrets(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_ANON_SESSION_SECRET", "test-anon-session-secret")
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")


def _verify(client: TestClient, session_id: str, headers: dict):
    with patch("backend.routers.billing_checkout_api.is_stripe_checkout_configured", return_value=True):
        return client.post(
            "/v1/billing/verify-checkout-session",
            headers=headers,
            json={"session_id": session_id},
        )


def test_verify_checkout_valid_paid_session(client: TestClient, tmp_path, monkeypatch) -> None:
    eco = isolated_economics_store(tmp_path, monkeypatch)
    org_id, _token, headers = mint_anonymous_session(client)
    session = {**_VALID_SESSION, "id": "cs_valid", "metadata": {**_VALID_SESSION["metadata"], "org_id": org_id}}
    with patch("backend.routers.billing_checkout_api.retrieve_checkout_session", return_value=session):
        res = _verify(client, "cs_valid", headers)
    assert res.status_code == 200, res.text
    row = eco.get_subscription_by_org(org_id)
    assert row is not None
    assert row["plan_code"] == "pro"


def test_verify_checkout_incomplete_unpaid(client: TestClient, tmp_path, monkeypatch) -> None:
    isolated_economics_store(tmp_path, monkeypatch)
    org_id, _token, headers = mint_anonymous_session(client)
    session = {
        "id": "cs_open",
        "status": "open",
        "payment_status": "unpaid",
        "metadata": {"org_id": org_id},
    }
    with patch("backend.routers.billing_checkout_api.retrieve_checkout_session", return_value=session):
        res = _verify(client, "cs_open", headers)
    assert res.status_code == 403


def test_verify_checkout_wrong_workspace(client: TestClient, tmp_path, monkeypatch) -> None:
    isolated_economics_store(tmp_path, monkeypatch)
    _org_a, _t_a, headers_a = mint_anonymous_session(client)
    org_b, _t_b, _headers_b = mint_anonymous_session(client)
    session = {**_VALID_SESSION, "metadata": {**_VALID_SESSION["metadata"], "org_id": org_b}}
    with patch("backend.routers.billing_checkout_api.retrieve_checkout_session", return_value=session):
        res = _verify(client, "cs_wrong_org", headers_a)
    assert res.status_code == 403


def test_verify_checkout_missing_metadata_org(client: TestClient, tmp_path, monkeypatch) -> None:
    isolated_economics_store(tmp_path, monkeypatch)
    org_id, _token, headers = mint_anonymous_session(client)
    session = {"id": "cs_no_md", "status": "complete", "payment_status": "paid", "metadata": {}}
    with patch("backend.routers.billing_checkout_api.retrieve_checkout_session", return_value=session):
        res = _verify(client, "cs_no_md", headers)
    assert res.status_code == 403


def test_verify_checkout_wrong_authenticated_user(client: TestClient, tmp_path, monkeypatch) -> None:
    isolated_economics_store(tmp_path, monkeypatch)
    user_id = "checkout-owner"
    headers = make_authenticated_user_headers(user_id)
    session = {
        **_VALID_SESSION,
        "metadata": {
            **_VALID_SESSION["metadata"],
            "org_id": f"user-{user_id}",
            "user_id": "other-user",
        },
    }
    with patch("backend.routers.billing_checkout_api.retrieve_checkout_session", return_value=session):
        res = _verify(client, "cs_user_mismatch", headers)
    assert res.status_code == 403


def test_verify_checkout_idempotent_replay(client: TestClient, tmp_path, monkeypatch) -> None:
    isolated_economics_store(tmp_path, monkeypatch)
    org_id, _token, headers = mint_anonymous_session(client)
    session = {**_VALID_SESSION, "id": "cs_replay", "metadata": {**_VALID_SESSION["metadata"], "org_id": org_id}}
    with patch("backend.routers.billing_checkout_api.retrieve_checkout_session", return_value=session):
        first = _verify(client, "cs_replay", headers)
        second = _verify(client, "cs_replay", headers)
    assert first.status_code == 200
    assert second.status_code == 200


def test_verify_checkout_provider_error_no_grant(client: TestClient, tmp_path, monkeypatch) -> None:
    isolated_economics_store(tmp_path, monkeypatch)
    org_id, _token, headers = mint_anonymous_session(client)
    with patch(
        "backend.routers.billing_checkout_api.retrieve_checkout_session",
        side_effect=RuntimeError("stripe_down"),
    ):
        res = _verify(client, "cs_err", headers)
    assert res.status_code == 502


def test_verify_checkout_webhook_before_return_same_authority(client: TestClient, tmp_path, monkeypatch) -> None:
    from backend.billing.stripe_subscription_sync import sync_subscription_from_stripe_checkout_session

    eco = isolated_economics_store(tmp_path, monkeypatch)
    org_id, _token, headers = mint_anonymous_session(client)
    session = {**_VALID_SESSION, "id": "cs_wh_first", "metadata": {**_VALID_SESSION["metadata"], "org_id": org_id}}
    sync_subscription_from_stripe_checkout_session(eco, session)
    with patch("backend.routers.billing_checkout_api.retrieve_checkout_session", return_value=session):
        res = _verify(client, "cs_wh_first", headers)
    assert res.status_code == 200
    assert eco.get_subscription_by_org(org_id) is not None


def test_verify_checkout_return_before_webhook(client: TestClient, tmp_path, monkeypatch) -> None:
    eco = isolated_economics_store(tmp_path, monkeypatch)
    org_id, _token, headers = mint_anonymous_session(client)
    session = {**_VALID_SESSION, "id": "cs_ret_first", "metadata": {**_VALID_SESSION["metadata"], "org_id": org_id}}
    with patch("backend.routers.billing_checkout_api.retrieve_checkout_session", return_value=session):
        res = _verify(client, "cs_ret_first", headers)
    assert res.status_code == 200
    assert eco.get_subscription_by_org(org_id) is not None
