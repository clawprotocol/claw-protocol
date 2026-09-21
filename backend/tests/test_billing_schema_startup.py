"""Production schema startup must be safe before concurrent billing traffic."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

from backend.billing.schema_ready import ensure_billing_schema_ready
from backend.economics.store import EconomicsStore, reset_economics_store_for_tests


def test_concurrent_init_schema_does_not_raise_duplicate_column(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    db = tmp_path / "economics.sqlite"
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(db))
    reset_economics_store_for_tests()
    errors: list[BaseException] = []

    def _init() -> None:
        try:
            EconomicsStore(path=str(db)).init_schema()
        except BaseException as exc:  # noqa: BLE001 — collect any schema race
            errors.append(exc)

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(lambda _i: _init(), range(8)))
    assert errors == []
    eco = EconomicsStore(path=str(db))
    eco.init_schema()
    cols = {str(row[1]) for row in eco._conn().execute("PRAGMA table_info(affiliates)").fetchall()}
    assert "owner_org_id" in cols
    tables = {str(row[0]) for row in eco._conn().execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    assert "billing_checkout_attempts" in tables


def test_production_startup_hook_initializes_checkout_schema(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    db = tmp_path / "economics.sqlite"
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(db))
    reset_economics_store_for_tests()
    assert not db.exists()
    ensure_billing_schema_ready()
    eco = EconomicsStore(path=str(db))
    tables = {str(row[0]) for row in eco._conn().execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    assert "billing_checkout_attempts" in tables
    assert "subscriptions" in tables
