"""TEST431 — Stripe checkout session subscription sync."""

from __future__ import annotations

import pytest

from backend.billing.stripe_subscription_sync import sync_subscription_from_stripe_checkout_session
from backend.economics.store import get_economics_store
from backend.payments.store import get_onramp_store
from backend.treasury.treasury_store import get_treasury_store


@pytest.fixture()
def economics_store(tmp_path, monkeypatch):
    db = tmp_path / "econ.sqlite"
    monkeypatch.setenv("CLAW_ECONOMICS_DB", str(db))
    eco = get_economics_store()
    eco.init_schema()
    return eco


def test_checkout_session_completed_syncs_subscription(economics_store) -> None:
    session = {
        "id": "cs_test_431",
        "status": "complete",
        "payment_status": "paid",
        "customer": "cus_test_431",
        "subscription": "sub_test_431",
        "metadata": {
            "org_id": "org-test431",
            "plan_code": "pro",
            "user_id": "user-test431",
        },
    }
    result = sync_subscription_from_stripe_checkout_session(economics_store, session)
    assert result.get("ok") is True
    row = economics_store.get_subscription_by_org("org-test431")
    assert row is not None
    assert row["plan_code"] == "pro"
    assert row["status"] == "active"


def test_checkout_session_ignored_when_not_paid(economics_store) -> None:
    session = {
        "id": "cs_open",
        "status": "open",
        "payment_status": "unpaid",
        "metadata": {"org_id": "org-open"},
    }
    result = sync_subscription_from_stripe_checkout_session(economics_store, session)
    assert result.get("ignored") is True
    assert economics_store.get_subscription_by_org("org-open") is None
