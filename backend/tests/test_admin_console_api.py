from __future__ import annotations

from fastapi.testclient import TestClient

from backend.main import app
from backend.services.agreement_draft_store import save_draft


def _seed_env(monkeypatch, tmp_path):
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


def test_admin_console_requires_secret(monkeypatch, tmp_path):
    _seed_env(monkeypatch, tmp_path)
    client = TestClient(app)
    r = client.get("/v1/admin/overview")
    assert r.status_code == 403


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
    r = client.get("/v1/admin/agreements", headers={"x-claw-admin-secret": "admin-test-secret"})
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
    r = client.get(
        "/v1/admin/affiliates",
        headers={"x-claw-admin-secret": "admin-test-secret"},
    )
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
    r = client.get(
        "/v1/admin/affiliates",
        headers={"x-claw-admin-secret": "admin-test-secret"},
    )
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
        headers={"x-claw-admin-secret": "admin-test-secret", "x-claw-admin-user-id": "ops_admin"},
        json={"flagged": True, "reason": "triage"},
    )
    assert r.status_code == 200
    a = client.get("/v1/admin/audit", headers={"x-claw-admin-secret": "admin-test-secret"})
    assert a.status_code == 200
    actions = a.json().get("actions") or []
    assert any(x.get("action_type") == "flag_agreement" and x.get("target_id") == "ag_admin_2" for x in actions)
