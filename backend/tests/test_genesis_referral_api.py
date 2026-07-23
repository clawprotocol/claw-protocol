"""Genesis Referral API — ops auth and public capture soft-fail."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.economics.store import reset_economics_store_for_tests
from backend.main import app


def _client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    root = tmp_path / "econ"
    root.mkdir()
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(root / "economics.sqlite3"))
    reset_economics_store_for_tests()
    return TestClient(app)


def test_ops_endpoints_require_admin_secret(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_ADMIN_SECRET", "test-admin-secret-qa")
    monkeypatch.setenv("CLAW_ADMIN_CONSOLE_DB_PATH", str(tmp_path / "admin.sqlite3"))
    from backend.admin_console import store as admin_store

    admin_store._store = None  # noqa: SLF001
    client = _client(tmp_path, monkeypatch)

    assert client.get("/v1/genesis-referral/ops/summary").status_code in (401, 403)
    assert client.get("/v1/genesis-referral/ops/commissions/export.csv").status_code in (401, 403)

    headers = {"x-claw-admin-secret": "wrong"}
    assert client.get("/v1/genesis-referral/ops/summary", headers=headers).status_code in (401, 403)

    # Secret alone is insufficient — operator principal + reason required.
    secret_only = {"x-claw-admin-secret": "test-admin-secret-qa"}
    assert client.get("/v1/genesis-referral/ops/summary", headers=secret_only).status_code in (401, 403)

    ok_headers = {
        "x-claw-admin-secret": "test-admin-secret-qa",
        "X-Claw-Test-Auth-User-Id": "ops_admin",
        "X-Claw-Test-Operator-Role": "admin",
        "x-claw-admin-reason": "genesis ops summary",
    }
    assert client.get("/v1/genesis-referral/ops/summary", headers=ok_headers).status_code == 200


def test_capture_returns_200_on_unknown_code(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_ADMIN_SECRET", "unused")
    client = _client(tmp_path, monkeypatch)
    res = client.post(
        "/v1/genesis-referral/capture",
        json={
            "referral_code": "NOTAREALCODE",
            "visitor_id": "visitor_public_qa_001",
            "source_path": "/app/create",
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body.get("ok") is False
    assert body.get("error") == "unknown_referral_code"


def test_checkout_metadata_endpoint(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    client = _client(tmp_path, monkeypatch)
    res = client.post(
        "/v1/genesis-referral/checkout-metadata",
        headers={"X-Claw-Test-Auth-User-Id": "user_qa_checkout"},
        json={
            "org_id": "org_qa",
            "referral_code": "DOG1",
            "visitor_id": "vis_qa_12345678",
            "plan_code": "pro",
        },
    )
    assert res.status_code == 200
    md = res.json()["metadata"]
    assert md["org_id"] == "org_qa"
    assert md["claw_org_id"] == "org_qa"
    assert md["plan_code"] == "pro"
    assert md["referral_code"] == "DOG1"
    assert md["visitor_id"] == "vis_qa_12345678"
    assert md["user_id"] == "user_qa_checkout"
