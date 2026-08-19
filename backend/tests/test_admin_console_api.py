from __future__ import annotations

from fastapi.testclient import TestClient

from backend.main import app
from backend.services.agreement_draft_store import save_draft


def _seed_env(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_ADMIN_SECRET", "admin-test-secret")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ADMIN_CONSOLE_DB_PATH", str(tmp_path / "admin.sqlite3"))

    from backend.economics import store as eco_store
    from backend.usage_economics import store as usage_store
    from backend.admin_console import store as admin_store

    eco_store.reset_economics_store_for_tests()
    usage_store._store = None  # type: ignore[attr-defined]
    admin_store._store = None  # type: ignore[attr-defined]


def _ops_headers(
    *,
    role: str = "admin",
    user_id: str = "ops_admin",
    include_secret: bool = True,
    spoof_actor: str | None = None,
    reason: str = "admin console ops test",
) -> dict[str, str]:
    h = {
        "X-Claw-Test-Auth-User-Id": user_id,
        "X-Claw-Test-Operator-Role": role,
        "x-request-id": "corr-admin-test-1",
        "x-claw-admin-reason": reason,
    }
    if include_secret:
        h["x-claw-admin-secret"] = "admin-test-secret"
    if spoof_actor:
        # Must never be trusted as actor identity.
        h["x-claw-admin-user-id"] = spoof_actor
    return h


def test_admin_console_requires_secret(monkeypatch, tmp_path):
    _seed_env(monkeypatch, tmp_path)
    client = TestClient(app)
    r = client.get("/v1/admin/overview")
    assert r.status_code in (401, 403)


def test_admin_console_rejects_secret_only_without_principal(monkeypatch, tmp_path):
    _seed_env(monkeypatch, tmp_path)
    client = TestClient(app)
    r = client.get("/v1/admin/overview", headers={"x-claw-admin-secret": "admin-test-secret"})
    assert r.status_code == 401


def test_admin_agreements_is_metadata_only(monkeypatch, tmp_path):
    _seed_env(monkeypatch, tmp_path)
    from backend.usage_economics.store import get_usage_economics_store

    ustore = get_usage_economics_store()
    ustore.init_schema()
    ustore.insert_agreement_owner(agreement_id="ag_admin_1", subject_ref="owner@example.com", internal_keys_draft=1)
    save_draft(
        {
            "id": "ag_admin_1",
            "title": "Services Agreement",
            "purpose": "private text not for admin",
            "payment_terms": "private payment terms",
            "parties": [{"name": "A", "role": "owner", "email": "a@example.com"}],
            "versions": [],
            "audit_log": [],
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-02T00:00:00Z",
        }
    )
    client = TestClient(app)
    r = client.get("/v1/admin/agreements", headers=_ops_headers())
    assert r.status_code == 200
    rows = r.json().get("agreements") or []
    assert len(rows) == 1
    row = rows[0]
    assert row["agreement_id"] == "ag_admin_1"
    assert "purpose" not in row
    assert "payment_terms" not in row
    assert row["owner_email"] == "owner@example.com"


def test_admin_affiliates_empty_fresh_economics_db(monkeypatch, tmp_path):
    _seed_env(monkeypatch, tmp_path)
    client = TestClient(app)
    r = client.get("/v1/admin/affiliates", headers=_ops_headers())
    assert r.status_code == 200
    assert r.json() == {"affiliates": []}


def test_admin_affiliates_pg_ledger_without_sqlite_earnings_table(monkeypatch, tmp_path):
    """Regression: CLAW_DATABASE_URL moves earnings to Postgres; admin must not query SQLite affiliate_earnings."""
    _seed_env(monkeypatch, tmp_path)
    from backend.economics import store as eco_store

    monkeypatch.setattr(eco_store, "_affiliate_ledger_pg", lambda: True)
    monkeypatch.setattr(
        "backend.economics.affiliate_ledger_postgres.list_affiliate_earnings_admin_aggregates_by_affiliate",
        lambda: {},
    )
    eco_store.reset_economics_store_for_tests()
    client = TestClient(app)
    r = client.get("/v1/admin/affiliates", headers=_ops_headers())
    assert r.status_code == 200
    assert r.json() == {"affiliates": []}


def test_admin_flag_action_is_audited(monkeypatch, tmp_path):
    _seed_env(monkeypatch, tmp_path)
    from backend.usage_economics.store import get_usage_economics_store

    ustore = get_usage_economics_store()
    ustore.init_schema()
    ustore.insert_agreement_owner(agreement_id="ag_admin_2", subject_ref="subject_ops", internal_keys_draft=1)
    save_draft(
        {
            "id": "ag_admin_2",
            "title": "NDA",
            "parties": [],
            "versions": [],
            "audit_log": [],
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-02T00:00:00Z",
        }
    )
    client = TestClient(app)
    r = client.post(
        "/v1/admin/agreements/ag_admin_2/flag",
        headers=_ops_headers(spoof_actor="spoofed_attacker"),
        json={"flagged": True, "reason": "triage abuse report"},
    )
    assert r.status_code == 200
    a = client.get("/v1/admin/audit", headers=_ops_headers())
    assert a.status_code == 200
    actions = a.json().get("actions") or []
    match = [
        x
        for x in actions
        if x.get("action_type") == "flag_agreement" and x.get("target_id") == "ag_admin_2"
    ]
    assert match
    assert match[0].get("admin_user_id") == "ops_admin"
    assert match[0].get("admin_user_id") != "spoofed_attacker"
    assert match[0].get("actor_role") in ("admin", "support_operator")
    assert (match[0].get("reason") or "").strip()
    assert match[0].get("correlation_id") == "corr-admin-test-1"


def test_admin_flag_rejects_missing_reason_and_spoofed_only_actor(monkeypatch, tmp_path):
    _seed_env(monkeypatch, tmp_path)
    from backend.usage_economics.store import get_usage_economics_store

    ustore = get_usage_economics_store()
    ustore.init_schema()
    ustore.insert_agreement_owner(agreement_id="ag_admin_3", subject_ref="subject_ops", internal_keys_draft=1)
    save_draft(
        {
            "id": "ag_admin_3",
            "title": "NDA",
            "parties": [],
            "versions": [],
            "audit_log": [],
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-02T00:00:00Z",
        }
    )
    client = TestClient(app)
    spoof_only = client.post(
        "/v1/admin/agreements/ag_admin_3/flag",
        headers={
            "x-claw-admin-secret": "admin-test-secret",
            "x-claw-admin-user-id": "spoofed_attacker",
        },
        json={"flagged": True, "reason": "should not work"},
    )
    assert spoof_only.status_code == 401

    missing_reason = client.post(
        "/v1/admin/agreements/ag_admin_3/flag",
        headers=_ops_headers(),
        json={"flagged": True, "reason": ""},
    )
    # Pydantic min_length rejects empty reason before handler (422).
    assert missing_reason.status_code in (400, 422)


def _admin_draft_slice(agreement_id: str, *, title: str = "Agreement") -> dict:
    return {
        "id": agreement_id,
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-02T00:00:00Z",
        "title": title,
        "review_sent_at": "",
        "parties": [{"name": "A", "role": "owner", "email": "a@example.com"}],
        "audit_log": [],
        "versions": [],
    }


def test_admin_agreements_pg_path_does_not_call_load_draft(monkeypatch, tmp_path):
    _seed_env(monkeypatch, tmp_path)
    from backend.services import agreement_draft_store as ads

    many = [_admin_draft_slice(f"ag_pg_{i}") for i in range(300)]
    batch_limits: list[int] = []
    load_draft_calls: list[str] = []

    monkeypatch.setattr(ads, "_use_postgres", lambda: True)
    monkeypatch.setattr(
        "backend.routers.admin_console_api.list_draft_admin_metadata_newest_first",
        lambda limit=200: batch_limits.append(limit) or many[:limit],
    )
    monkeypatch.setattr(ads, "load_draft", lambda aid: load_draft_calls.append(aid) or {})

    client = TestClient(app)
    r = client.get(
        "/v1/admin/agreements?limit=50",
        headers=_ops_headers(),
    )
    assert r.status_code == 200
    assert len(r.json().get("agreements") or []) == 50
    assert batch_limits == [50]
    assert load_draft_calls == []


def test_admin_overview_pg_path_does_not_call_load_draft(monkeypatch, tmp_path):
    _seed_env(monkeypatch, tmp_path)
    from backend.services import agreement_draft_store as ads

    many = [_admin_draft_slice(f"ag_ov_{i}") for i in range(400)]
    batch_limits: list[int] = []
    load_draft_calls: list[str] = []

    monkeypatch.setattr(ads, "_use_postgres", lambda: True)
    monkeypatch.setattr(
        "backend.routers.admin_console_api.list_draft_admin_metadata_newest_first",
        lambda limit=200: batch_limits.append(limit) or many[:limit],
    )
    monkeypatch.setattr(ads, "load_draft", lambda aid: load_draft_calls.append(aid) or {})

    client = TestClient(app)
    r = client.get("/v1/admin/overview", headers=_ops_headers())
    assert r.status_code == 200
    assert batch_limits == [250]
    assert load_draft_calls == []


def test_admin_users_returns_safe_identity_fields(monkeypatch, tmp_path):
    """Admin Users lists email / user_id / display_name — no agreement bodies; Genesis grant is 410."""
    _seed_env(monkeypatch, tmp_path)
    from backend.admin_console.store import get_admin_console_store
    from backend.economics.genesis_referral_store import (
        ensure_genesis_referral_schema,
        upsert_genesis_affiliate,
    )
    from backend.economics.store import get_economics_store
    from backend.usage_economics.store import get_usage_economics_store

    ustore = get_usage_economics_store()
    ustore.init_schema()
    uid = "uid-safe-grant-21"
    org_ref = f"org:user-{uid}"
    ustore.incr_ai_calls(org_ref, 1)
    ustore.insert_agreement_owner(
        agreement_id="ag_admin_users_1",
        subject_ref=org_ref,
        internal_keys_draft=1,
    )

    admin_store = get_admin_console_store()
    admin_store.init_schema()
    admin_store.touch_admin_user(
        admin_user_id=uid,
        email="cryptocurated21@example.com",
        role="support_operator",
    )

    eco = get_economics_store()
    eco.init_schema()
    with eco._conn() as con:
        ensure_genesis_referral_schema(con)
        upsert_genesis_affiliate(
            con,
            user_id=uid,
            display_name="Crypto Curated",
            referral_code="SAFEGRANT21",
        )

    client = TestClient(app)
    r = client.get("/v1/admin/users", headers=_ops_headers())
    assert r.status_code == 200
    users = r.json().get("users") or []
    match = [u for u in users if u.get("user_id") == uid]
    assert len(match) == 1
    row = match[0]
    assert row["org_id"] == org_ref
    assert row["email"] == "cryptocurated21@example.com"
    assert row["display_name"] == "Crypto Curated"
    assert row["user_id"] == uid
    assert "access_type" in row
    assert "commercial_state" in row
    assert row["access_type"] in ("free", "genesis_dog", "paid_pro", "pending_genesis", "guest")
    assert row["commercial_state"] in ("none", "guest", "pro", "genesis", "pending_genesis")
    assert row.get("can_create_persisted_agreement") is False
    assert "purpose" not in row
    assert "payment_terms" not in row
    assert "parties" not in row
    assert "versions" not in row

    grant = client.post(
        f"/v1/admin/users/{uid}/genesis-entitlement/grant",
        headers=_ops_headers(reason="admin users access badge grant"),
        json={"reason": "admin users access badge grant"},
    )
    assert grant.status_code == 410, grant.text
    detail = grant.json().get("detail") or {}
    assert detail.get("code") == "genesis_create_grant_issuance_retired"

    after = client.get("/v1/admin/users", headers=_ops_headers())
    assert after.status_code == 200
    granted = [u for u in (after.json().get("users") or []) if u.get("user_id") == uid]
    assert len(granted) == 1
    # Affiliate remains a partner badge path; grant must not create a buyer create tier.
    assert granted[0]["commercial_state"] == "none"
    assert granted[0].get("can_create_persisted_agreement") is False
    assert int(granted[0].get("agreement_allowance") or 0) == 0

    history = client.get(
        f"/v1/admin/users/{uid}/action-history",
        headers=_ops_headers(reason="admin console read"),
    )
    assert history.status_code == 200, history.text
    body = history.json()
    actions = body.get("actions") or []
    types = [str(a.get("action_type") or "") for a in actions]
    assert "genesis_entitlement_grant_denied" in types or "user_created" in types
    assert body.get("user_created_at")
    created_row = next(a for a in actions if a.get("action_type") == "user_created")
    assert created_row.get("created_at") == body.get("user_created_at")
    # Newest-first: account created is the trailing landmark.
    assert actions[-1]["action_type"] == "user_created"


def test_admin_agreements_local_respects_limit_bounded_load_draft(monkeypatch, tmp_path):
    _seed_env(monkeypatch, tmp_path)
    from backend.services import agreement_draft_store as ads

    load_draft_calls: list[str] = []
    real_load = ads.load_draft

    def counting_load(aid: str):
        load_draft_calls.append(aid)
        return real_load(aid)

    monkeypatch.setattr(ads, "load_draft", counting_load)

    for i in range(8):
        save_draft(
            {
                "id": f"ag_local_{i}",
                "title": f"Agreement {i}",
                "purpose": "private body",
                "parties": [{"name": "A", "role": "owner"}],
                "versions": [],
                "audit_log": [],
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": f"2026-01-0{i + 1}T00:00:00Z",
            }
        )

    client = TestClient(app)
    r = client.get(
        "/v1/admin/agreements?limit=3",
        headers=_ops_headers(),
    )
    assert r.status_code == 200
    assert len(r.json().get("agreements") or []) == 3
    assert len(load_draft_calls) == 3
    assert "purpose" not in (r.json().get("agreements") or [{}])[0]
