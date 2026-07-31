"""Genesis allowance must charge only after successful persisted draft; retries are idempotent."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.usage_economics.commercial_entitlement import (
    STATE_GENESIS,
    resolve_commercial_entitlement,
    utc_month_period_bounds,
)
from backend.usage_economics.genesis_dog_entitlement import GRANT_SOURCE_ADMIN, grant_entitlement
from backend.usage_economics.store import UsageEconomicsStore


@pytest.fixture()
def isolated_env(tmp_path, monkeypatch: pytest.MonkeyPatch):
    from backend.admin_console import store as admin_store
    from backend.economics import store as eco_store
    from backend.usage_economics import store as ue_store

    eco_store.reset_economics_store_for_tests()
    ue_store._store = None
    admin_store.reset_admin_console_store_for_tests()

    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_STRICT_IN_DEV", "1")
    monkeypatch.setenv("CLAW_GENESIS_MONTHLY_AGREEMENT_ALLOWANCE", "5")
    monkeypatch.setenv("CLAW_ADMIN_SECRET", "admin-test-secret")
    monkeypatch.setenv("CLAW_ADMIN_CONSOLE_DB_PATH", str(tmp_path / "admin.sqlite3"))
    monkeypatch.setenv("CLAW_ANON_SESSION_SECRET", "test-anon-session-secret")
    monkeypatch.setenv("CLAW_RATE_LIMIT_RPS", "1000")
    monkeypatch.setenv("CLAW_RATE_LIMIT_BURST", "1000")

    usage = UsageEconomicsStore(str(tmp_path / "usage.sqlite3"))
    usage.init_schema()
    ue_store._store = usage
    eco = eco_store.get_economics_store()
    eco.init_schema()

    client = TestClient(app)
    yield client, usage, eco

    eco_store.reset_economics_store_for_tests()
    ue_store._store = None
    admin_store.reset_admin_console_store_for_tests()


def _auth(uid: str) -> dict:
    return {"X-Claw-Test-Auth-User-Id": uid, "X-Claw-Org-Id": f"user-{uid}"}


def _admin() -> dict:
    return {
        "X-Claw-Test-Auth-User-Id": "ops_admin",
        "X-Claw-Test-Operator-Role": "support_operator",
        "x-claw-admin-secret": "admin-test-secret",
        "x-claw-admin-reason": "staging genesis usage reconcile",
        "x-request-id": "corr-genesis-meter",
    }


def _draft_body(title: str = "T") -> dict:
    return {
        "title": title,
        "jurisdiction": "CA",
        "parties": [{"name": "A", "role": "owner"}],
        "purpose": "p",
        "payment_terms": "pt",
        "duration": None,
        "due_date": None,
        "effective_date": None,
    }


def test_failed_persist_consumes_zero_genesis_allowance(isolated_env, monkeypatch):
    client, usage, _eco = isolated_env
    uid = "genesis-fail-persist"
    subject = f"org:user-{uid}"
    grant_entitlement(user_id=uid, granted_by="ops", grant_source=GRANT_SOURCE_ADMIN)

    def boom(*_a, **_k):
        raise RuntimeError("simulated_persist_failure")

    monkeypatch.setattr(
        "backend.routers.agreements_v2_api._save_draft_sync",
        boom,
    )
    with pytest.raises(RuntimeError, match="simulated_persist_failure"):
        client.post("/api/agreements/draft", headers=_auth(uid), json=_draft_body("fail"))
    assert usage.agreements_created_this_utc_month(subject) == 0
    assert usage.list_agreement_ids_for_subject(subject) == []
    decision = resolve_commercial_entitlement(subject)
    assert decision["state"] == STATE_GENESIS
    assert decision["agreements_used"] == 0
    assert decision["agreements_remaining"] == 5


def test_idempotent_retry_does_not_double_charge(isolated_env):
    client, usage, _eco = isolated_env
    uid = "genesis-idem-persist"
    subject = f"org:user-{uid}"
    grant_entitlement(user_id=uid, granted_by="ops", grant_source=GRANT_SOURCE_ADMIN)
    h = {
        **_auth(uid),
        "X-Claw-Draft-Idempotency-Key": "review-first:gen-session-1",
    }
    r1 = client.post("/api/agreements/draft", headers=h, json=_draft_body("one"))
    assert r1.status_code == 200, r1.text
    aid = r1.json()["id"]
    r2 = client.post("/api/agreements/draft", headers=h, json=_draft_body("two"))
    assert r2.status_code == 200, r2.text
    assert r2.json()["id"] == aid
    assert r2.json().get("idempotent") is True
    assert usage.agreements_created_this_utc_month(subject) == 1
    decision = resolve_commercial_entitlement(subject)
    assert decision["agreements_used"] == 1
    assert decision["agreements_remaining"] == 4


def test_zero_persisted_drafts_but_five_credits_reconcile(isolated_env):
    """
    Reproduce staging mismatch: agreement_owner meters exist without drafts,
    Admin lifetime counters can show 0 while customer used=5.
    """
    from backend.services.agreement_draft_store import draft_exists

    client, usage, _eco = isolated_env
    uid = "eb72e4d2-c803-490d-80ee-d17634b8ebfb"
    subject = f"org:user-{uid}"
    grant_entitlement(user_id=uid, granted_by="ops", grant_source=GRANT_SOURCE_ADMIN)
    period_start, _ = utc_month_period_bounds()
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    # Ghost meters (old bug: charge before durable review-ready persist / failed UI retries).
    with usage._conn() as con:
        for i in range(5):
            con.execute(
                """
                INSERT INTO agreement_owner (
                  agreement_id, subject_ref, created_at, internal_keys_draft, guest_temp
                ) VALUES (?, ?, ?, 3, 0)
                """,
                (f"ghost-{uid}-{i}", subject, now),
            )
        # Intentionally do NOT bump subject_counters — Admin Users showed agreements=0.
        con.commit()

    decision = resolve_commercial_entitlement(subject)
    assert decision["agreements_used"] == 5
    assert decision["agreements_remaining"] == 0
    ghost_ids = usage.list_agreement_ids_for_subject(subject)
    assert len(ghost_ids) == 5
    assert all(not draft_exists(aid) for aid in ghost_ids)

    usage_trace = client.get(f"/v1/admin/users/{uid}/genesis-usage", headers=_admin())
    assert usage_trace.status_code == 200, usage_trace.text
    body = usage_trace.json()
    assert body["commercial"]["agreements_used"] == 5
    assert len(body["meter_records"]) == 5
    assert all(rec["persisted_draft_exists"] is False for rec in body["meter_records"])

    users = client.get("/v1/admin/users", headers=_admin()).json().get("users") or []
    match = [u for u in users if u.get("user_id") == uid]
    # After alignment, Admin Users monthly agreement_count matches customer meter.
    if match:
        assert match[0]["agreement_count"] == 5

    dry = client.post(
        f"/v1/admin/users/{uid}/genesis-usage/reconcile",
        headers=_admin(),
        json={"reason": "staging reconcile lawdogtest2 ghosts", "dry_run": True},
    )
    assert dry.status_code == 200, dry.text
    assert len(dry.json()["candidate_agreement_ids"]) == 5
    assert resolve_commercial_entitlement(subject)["agreements_used"] == 5

    reset = client.post(
        f"/v1/admin/users/{uid}/genesis-usage/reconcile",
        headers=_admin(),
        json={"reason": "staging reconcile lawdogtest2 ghosts", "dry_run": False},
    )
    assert reset.status_code == 200, reset.text
    assert reset.json().get("audit_id")
    assert len(reset.json()["refunded_agreement_ids"]) == 5
    after = resolve_commercial_entitlement(subject)
    assert after["agreements_used"] == 0
    assert after["agreements_remaining"] == 5
    assert after["state"] == STATE_GENESIS

    # Production-like env must reject reconcile.
    import os

    os.environ["CLAW_ENVIRONMENT"] = "production"
    blocked = client.post(
        f"/v1/admin/users/{uid}/genesis-usage/reconcile",
        headers=_admin(),
        json={"reason": "must fail in production", "dry_run": False},
    )
    assert blocked.status_code == 403
    os.environ["CLAW_ENVIRONMENT"] = "test"


def test_successful_persist_then_meter_one_credit(isolated_env):
    client, usage, _eco = isolated_env
    uid = f"genesis-ok-{uuid.uuid4().hex[:8]}"
    subject = f"org:user-{uid}"
    grant_entitlement(user_id=uid, granted_by="ops", grant_source=GRANT_SOURCE_ADMIN)
    r = client.post("/api/agreements/draft", headers=_auth(uid), json=_draft_body("ok"))
    assert r.status_code == 200, r.text
    aid = r.json()["id"]
    from backend.services.agreement_draft_store import draft_exists

    assert draft_exists(aid)
    assert usage.agreements_created_this_utc_month(subject) == 1
    assert resolve_commercial_entitlement(subject)["agreements_remaining"] == 4
