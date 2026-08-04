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


def test_genesis_dog_candidate_bind_list_and_activate(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from backend.admin_console import store as admin_store
    from backend.tests.conftest_auth_security import make_test_auth_headers

    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_ADMIN_SECRET", "test-admin-secret-qa")
    monkeypatch.setenv("CLAW_ADMIN_CONSOLE_DB_PATH", str(tmp_path / "admin.sqlite3"))
    monkeypatch.setenv("CLAW_ANON_SESSION_SECRET", "test-anon-session-secret")
    admin_store.reset_admin_console_store_for_tests()
    client = _client(tmp_path, monkeypatch)

    uid = "uid-genesis-candidate-1"
    email = "cryptocurated21+lawdogtest2@gmail.com"
    bind = client.post(
        "/v1/workspace/bind-user-org",
        headers=make_test_auth_headers(uid),
        json={
            "user_id": uid,
            "email": email,
            "display_name": "LawDog Test 2",
            "claim_method": "google",
            "community_slug": "genesis-dogs",
            "signup_intent": "genesis-referral",
            "affiliate_candidate": True,
        },
    )
    assert bind.status_code == 200, bind.text

    stored = admin_store.get_admin_console_store().get_workspace_user_identity(uid)
    assert stored is not None
    assert stored["email"] == email
    assert stored["community_slug"] == "genesis-dogs"
    assert stored["signup_intent"] == "genesis-referral"
    assert int(stored["affiliate_candidate"] or 0) == 1

    ops = {
        "x-claw-admin-secret": "test-admin-secret-qa",
        "X-Claw-Test-Auth-User-Id": "ops_admin",
        "X-Claw-Test-Operator-Role": "admin",
        "x-claw-admin-reason": "genesis ops candidates",
    }
    cand = client.get("/v1/genesis-referral/ops/candidates", headers=ops)
    assert cand.status_code == 200, cand.text
    body = cand.json()
    assert body.get("count") == 1
    assert body["candidates"][0]["user_id"] == uid
    assert body["candidates"][0]["email"] == email

    create = client.post(
        "/v1/genesis-referral/ops/affiliates",
        headers={**ops, "x-claw-admin-reason": "gtm genesis dog candidate activate"},
        json={
            "user_id": uid,
            "display_name": "LawDog Test 2",
            "referral_code": "LAWDOGTEST2",
            "community_slug": "genesis-dogs",
            "affiliate_status": "active",
            "payout_rate": 0.3,
            "reason": "gtm genesis dog candidate activate",
        },
    )
    assert create.status_code == 200, create.text
    assert create.json()["affiliate"]["referral_code"] == "LAWDOGTEST2"

    after = admin_store.get_admin_console_store().get_workspace_user_identity(uid)
    assert int(after["affiliate_candidate"] or 0) == 0
    cand2 = client.get("/v1/genesis-referral/ops/candidates", headers=ops)
    assert cand2.status_code == 200
    assert cand2.json().get("count") == 0

    # Second activate with a different code must update the same row (no duplicate).
    create2 = client.post(
        "/v1/genesis-referral/ops/affiliates",
        headers={**ops, "x-claw-admin-reason": "gtm genesis dog candidate activate"},
        json={
            "user_id": uid,
            "display_name": "LawDog Test 2",
            "referral_code": "LAWDOGTEST2B",
            "community_slug": "genesis-dogs",
            "affiliate_status": "active",
            "payout_rate": 0.3,
            "reason": "gtm genesis dog candidate activate",
        },
    )
    assert create2.status_code == 200, create2.text
    assert create2.json()["affiliate"]["referral_code"] == "LAWDOGTEST2"
    assert create2.json()["affiliate"]["id"] == create.json()["affiliate"]["id"]


def test_normal_bind_does_not_stamp_genesis_dog_candidate(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from backend.admin_console import store as admin_store
    from backend.tests.conftest_auth_security import make_test_auth_headers

    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_ADMIN_SECRET", "test-admin-secret-qa")
    monkeypatch.setenv("CLAW_ADMIN_CONSOLE_DB_PATH", str(tmp_path / "admin.sqlite3"))
    monkeypatch.setenv("CLAW_ANON_SESSION_SECRET", "test-anon-session-secret")
    admin_store.reset_admin_console_store_for_tests()
    client = _client(tmp_path, monkeypatch)

    uid = "uid-normal-user-1"
    bind = client.post(
        "/v1/workspace/bind-user-org",
        headers=make_test_auth_headers(uid),
        json={
            "user_id": uid,
            "email": "normal.user@example.com",
            "display_name": "Normal User",
            "claim_method": "google",
        },
    )
    assert bind.status_code == 200, bind.text
    stored = admin_store.get_admin_console_store().get_workspace_user_identity(uid)
    assert stored is not None
    assert stored.get("community_slug") in (None, "")
    assert stored.get("signup_intent") in (None, "")
    assert int(stored.get("affiliate_candidate") or 0) == 0

    # Spoofed partial metadata must not mark candidacy.
    bind2 = client.post(
        "/v1/workspace/bind-user-org",
        headers=make_test_auth_headers(uid),
        json={
            "user_id": uid,
            "email": "normal.user@example.com",
            "affiliate_candidate": True,
            "community_slug": "genesis-dogs",
            # missing signup_intent
        },
    )
    assert bind2.status_code == 200, bind2.text
    stored2 = admin_store.get_admin_console_store().get_workspace_user_identity(uid)
    assert int(stored2.get("affiliate_candidate") or 0) == 0

    ops = {
        "x-claw-admin-secret": "test-admin-secret-qa",
        "X-Claw-Test-Auth-User-Id": "ops_admin",
        "X-Claw-Test-Operator-Role": "admin",
        "x-claw-admin-reason": "genesis ops candidates",
    }
    cand = client.get("/v1/genesis-referral/ops/candidates", headers=ops)
    assert cand.status_code == 200
    assert all(c.get("user_id") != uid for c in (cand.json().get("candidates") or []))


def test_destination_path_allowlist_blocks_open_redirects() -> None:
    from backend.security.safe_redirect import resolve_safe_redirect_path

    # Same allowlist used by auth-continuation / finalize-auth.
    assert resolve_safe_redirect_path("https://evil.example/phish", "/app") == "/app"
    assert resolve_safe_redirect_path("//evil.example", "/app") == "/app"
    assert resolve_safe_redirect_path("/app?join=genesis-dogs", "/app") == "/app?join=genesis-dogs"
    assert resolve_safe_redirect_path("/app", "/app") == "/app"
