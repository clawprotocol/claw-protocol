"""Break-glass JSONL audit for operator HTTP surfaces."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.ops import break_glass_audit as bga

pytestmark = pytest.mark.unit


def _ops_headers(*, secret: str = "test-admin-secret") -> dict[str, str]:
    return {
        "x-claw-admin-secret": secret,
        "X-Claw-Test-Auth-User-Id": "ops_admin",
        "X-Claw-Test-Operator-Role": "admin",
        "x-claw-admin-reason": "break glass audit unit test",
    }


def test_break_glass_logs_admin_runtime_summary(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_BREAK_GLASS_LOG_PATH", str(tmp_path / "bg.jsonl"))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    monkeypatch.setenv("CLAW_ADMIN_SECRET", "test-admin-secret")
    monkeypatch.setenv("CLAW_ADMIN_CONSOLE_DB_PATH", str(tmp_path / "admin.sqlite3"))
    from backend.admin_console import store as admin_store

    admin_store._store = None  # noqa: SLF001

    client = TestClient(app)
    r = client.get("/admin/runtime-summary", headers=_ops_headers())
    assert r.status_code == 200

    logf = tmp_path / "bg.jsonl"
    assert logf.is_file()
    lines = logf.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) >= 1
    row = json.loads(lines[-1])
    assert row["schema"] == bga.SCHEMA
    assert row["kind"] == "break_glass"
    assert row["action"] == bga.BreakGlassAction.ADMIN_RUNTIME_SUMMARY
    assert row["path"] == "/admin/runtime-summary"
    assert row["auth_channel"] == "x-claw-admin-secret"
    assert "test-admin-secret" not in json.dumps(row)


def test_break_glass_disabled_no_file_growth(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    log_path = tmp_path / "bg2.jsonl"
    log_path.write_text("", encoding="utf-8")
    monkeypatch.setenv("CLAW_BREAK_GLASS_LOG_PATH", str(log_path))
    monkeypatch.setenv("CLAW_BREAK_GLASS_AUDIT", "0")
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    monkeypatch.setenv("CLAW_ADMIN_SECRET", "s2")
    monkeypatch.setenv("CLAW_ADMIN_CONSOLE_DB_PATH", str(tmp_path / "admin.sqlite3"))
    from backend.admin_console import store as admin_store

    admin_store._store = None  # noqa: SLF001

    client = TestClient(app)
    r = client.get("/admin/runtime-summary", headers=_ops_headers(secret="s2"))
    assert r.status_code == 200
    assert log_path.read_text(encoding="utf-8").strip() == ""


def test_break_glass_runtime_summary_rejects_secret_only(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    monkeypatch.setenv("CLAW_ADMIN_SECRET", "test-admin-secret")
    monkeypatch.setenv("CLAW_ADMIN_CONSOLE_DB_PATH", str(tmp_path / "admin.sqlite3"))
    from backend.admin_console import store as admin_store

    admin_store._store = None  # noqa: SLF001

    client = TestClient(app)
    r = client.get(
        "/admin/runtime-summary",
        headers={"x-claw-admin-secret": "test-admin-secret"},
    )
    assert r.status_code in (401, 403)
