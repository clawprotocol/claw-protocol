"""Production economics persistence and launch config readiness."""

from __future__ import annotations

from pathlib import Path

import pytest

from backend.db.readiness import economics_persistence_readiness, production_launch_config_readiness


def test_economics_persistence_skipped_in_local(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    r = economics_persistence_readiness()
    assert r["status"] == "skipped"


def test_economics_persistence_fails_production_without_explicit_path(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.delenv("CLAW_ECONOMICS_DB_PATH", raising=False)
    r = economics_persistence_readiness()
    assert r["status"] == "error"
    assert r.get("explicit_path_configured") is False


def test_economics_persistence_ok_when_explicit_path_set(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    db = tmp_path / "economics.sqlite"
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(db))
    r = economics_persistence_readiness()
    assert r["status"] == "ok"
    assert r.get("explicit_path_configured") is True


def test_economics_persistence_skipped_on_staging(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "staging")
    r = economics_persistence_readiness()
    assert r["status"] == "skipped"


def test_production_launch_config_lists_missing_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    for key in (
        "CLAW_DATABASE_URL",
        "DATABASE_URL",
        "CLAW_CORS_ALLOW_ORIGINS",
        "CLAW_AGREEMENT_SIGNING_TOKEN_SECRET",
        "CLAW_SIGNING_TOKEN_SECRET",
        "CLAW_ADMIN_SECRET",
        "STRIPE_WEBHOOK_SECRET",
        "STRIPE_SECRET_KEY",
        "STRIPE_PRICE_PRO_MONTHLY",
        "CLAW_API_BASE",
        "LAWDOG_API_ORIGIN",
        "CLAW_ECONOMICS_DB_PATH",
    ):
        monkeypatch.delenv(key, raising=False)
    r = production_launch_config_readiness()
    assert r["status"] == "error"
    missing = r.get("missing_keys") or []
    assert "CLAW_DATABASE_URL" in missing
    assert "CLAW_ECONOMICS_DB_PATH" in missing
    assert "STRIPE_WEBHOOK_SECRET" in missing


def test_production_launch_config_errors_when_postgres_without_production_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    monkeypatch.setenv("CLAW_DATABASE_URL", "postgresql://example")
    monkeypatch.delenv("CLAW_ECONOMICS_DB_PATH", raising=False)
    r = production_launch_config_readiness()
    assert r["status"] == "error"
    assert "CLAW_ENVIRONMENT" in (r.get("missing_keys") or [])


def test_deploy_readiness_fails_production_without_launch_config(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from backend.ops.deploy_readiness import gather_deploy_readiness

    d = tmp_path / "data"
    d.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("CLAW_DATA_DIR", str(d))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.delenv("CLAW_ECONOMICS_DB_PATH", raising=False)
    monkeypatch.delenv("CLAW_DATABASE_URL", raising=False)
    r = gather_deploy_readiness()
    assert r["ok"] is False
    failed = r.get("failed_critical_checks") or []
    assert "economics_persistence" in failed
    assert "production_launch_config" in failed
