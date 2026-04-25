"""
CLAW_STRIPE_WEBHOOK_DEV_UNSIGNED: only honored in local/dev/test (not staging/prod/unknown).
"""

from __future__ import annotations

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.economics.store import reset_economics_store_for_tests
from backend.payments.stripe_webhooks import _dev_bypass_signature, router as stripe_webhook_router

_MIN_EVENT = {
    "id": "evt_test_dev_unsigned_1",
    "type": "product.created",
    "data": {"object": {}},
}


def _make_client() -> TestClient:
    app = FastAPI()
    app.include_router(stripe_webhook_router)
    return TestClient(app)


@pytest.fixture
def eco_db(monkeypatch: pytest.MonkeyPatch, tmp_path):
    p = str(tmp_path / "economics.sqlite")
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", p)
    reset_economics_store_for_tests()
    yield
    reset_economics_store_for_tests()


def test_dev_bypass_flag_off_in_relaxed_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Relaxed env still needs truthy CLAW_STRIPE_WEBHOOK_DEV_UNSIGNED to bypass."""
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    monkeypatch.setenv("CLAW_STRIPE_WEBHOOK_DEV_UNSIGNED", "0")
    assert _dev_bypass_signature() is False


@pytest.mark.parametrize(
    "claw_env",
    ("local", "dev", "test"),
    ids=["1_local_allows", "2_dev_allows", "3_test_allows"],
)
def test_local_dev_test_flag_allows_unsigned_webhook_without_secret(
    monkeypatch: pytest.MonkeyPatch,
    eco_db: None,
    claw_env: str,
) -> None:
    """(1) local, (2) dev, (3) test: unsigned body accepted when flag is set, no STRIPE_WEBHOOK_SECRET."""
    ev = {**_MIN_EVENT, "id": f"evt_rlx_{claw_env}_1"}
    monkeypatch.setenv("CLAW_ENVIRONMENT", claw_env)
    monkeypatch.setenv("CLAW_STRIPE_WEBHOOK_DEV_UNSIGNED", "1")
    monkeypatch.delenv("STRIPE_WEBHOOK_SECRET", raising=False)
    client = _make_client()
    r = client.post(
        "/webhook/stripe",
        content=json.dumps(ev),
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True


@pytest.mark.parametrize(
    "claw_env",
    (
        "staging",
        "production",
        "prod",
        "preprod",
        "qa",
    ),
    ids=["4_staging", "5_production", "5_prod", "6_preprod", "6_unknown_qa"],
)
def test_staging_production_and_unknown_with_flag_does_not_allow_unsigned(
    monkeypatch: pytest.MonkeyPatch,
    eco_db: None,
    claw_env: str,
) -> None:
    """(4) staging, (5) production/prod, (6) preprod/unknown: no bypass — require configured webhook secret."""
    ev = {**_MIN_EVENT, "id": f"evt_deny_{claw_env}"}
    monkeypatch.setenv("CLAW_ENVIRONMENT", claw_env)
    monkeypatch.setenv("CLAW_STRIPE_WEBHOOK_DEV_UNSIGNED", "1")
    monkeypatch.delenv("STRIPE_WEBHOOK_SECRET", raising=False)
    assert _dev_bypass_signature() is False
    client = _make_client()
    r = client.post(
        "/webhook/stripe",
        content=json.dumps(ev),
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code == 503, r.text
    assert r.json().get("detail") == "stripe_webhook_not_configured"
