"""Commercial deny for legacy private affiliate / gamification user surfaces."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.affiliates.genesis_referral_service import create_genesis_affiliate
from backend.affiliates import service as affiliate_service
from backend.economics.store import get_economics_store, reset_economics_store_for_tests
from backend.main import app
from backend.security.legacy_affiliate_commercial_gate import LEGACY_AFFILIATE_COMMERCIAL_DISABLED


@pytest.fixture()
def client(monkeypatch, tmp_path):
    from backend.economics import store as eco_store
    from backend import main as main_mod

    eco_store.reset_economics_store_for_tests()
    main_mod._rate_state.clear()  # noqa: SLF001
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_COMMERCIAL_MODE", "1")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_ADMIN_SECRET", "admin-test-secret")
    monkeypatch.setenv("CLAW_RATE_LIMIT_RPS", "1000")
    monkeypatch.setenv("CLAW_RATE_LIMIT_BURST", "1000")
    return TestClient(app)


def _auth(user_id: str) -> dict:
    return {"X-Claw-Test-Auth-User-Id": user_id, "X-Claw-Org-Id": f"user-{user_id}"}


def _assert_commercial_disabled(r) -> None:
    assert r.status_code == 403, r.text
    detail = r.json().get("detail")
    if isinstance(detail, dict):
        assert detail.get("code") == LEGACY_AFFILIATE_COMMERCIAL_DISABLED
    else:
        assert LEGACY_AFFILIATE_COMMERCIAL_DISABLED in str(detail)
    blob = r.text.lower()
    assert "accrual" not in blob or "commercial_disabled" in blob
    assert "commission_amount" not in blob
    assert "pending_commission" not in blob


@pytest.mark.parametrize(
    "method,path,json_body",
    [
        ("POST", "/v1/affiliates", {
            "affiliate_code": "SELF1",
            "wallet_address": "0x" + "a" * 40,
            "display_name": "Self",
            "owner_org_id": "user-ordinary",
        }),
        ("POST", "/v1/affiliates/create-link", {"requested_handle": "selfhandle"}),
        ("GET", "/v1/affiliates/access-request/status", None),
        ("POST", "/v1/affiliates/access-request", {
            "request_type": "other",
            "email": "ord@example.com",
            "note": "please",
        }),
        ("GET", "/v1/orgs/user-ordinary/affiliate/gamification/dashboard", None),
        ("GET", "/v1/orgs/user-ordinary/affiliate/gamification/profile", None),
        ("GET", "/v1/orgs/user-ordinary/affiliate/gamification/leaderboard", None),
        ("PATCH", "/v1/orgs/user-ordinary/affiliate/gamification/payout-wallet", {
            "usdc_wallet_address": "0x" + "b" * 40,
        }),
    ],
)
def test_ordinary_user_denied_legacy_private_affiliate_routes(
    client: TestClient, method: str, path: str, json_body
):
    kwargs = {"method": method, "url": path, "headers": _auth("ordinary")}
    if json_body is not None:
        kwargs["json"] = json_body
    r = client.request(**kwargs)
    _assert_commercial_disabled(r)


def test_unauthenticated_access_request_denied_in_commercial_mode(client: TestClient):
    status = client.get(
        "/v1/affiliates/access-request/status",
        headers={"X-Claw-Org-Id": "user-anyone", "X-Claw-Email": "x@y.com"},
    )
    _assert_commercial_disabled(status)
    submit = client.post(
        "/v1/affiliates/access-request",
        json={"request_type": "other", "email": "x@y.com", "note": "hi"},
    )
    _assert_commercial_disabled(submit)


def test_get_affiliate_and_accruals_denied_including_seeded_row(client: TestClient, tmp_path, monkeypatch):
    reset_economics_store_for_tests()
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    eco = get_economics_store()
    eco.init_schema()
    out = affiliate_service.create_affiliate(
        affiliate_code="OWNED1",
        wallet_address="0x" + "c" * 40,
        display_name="Owned",
        owner_org_id="user-ordinary",
    )
    assert out.get("ok")
    aid = str(out["affiliate_id"])
    h = _auth("ordinary")
    _assert_commercial_disabled(client.get(f"/v1/affiliates/{aid}", headers=h))
    _assert_commercial_disabled(client.get(f"/v1/affiliates/{aid}/accruals", headers=h))


def test_ownerless_affiliate_id_no_cross_org_bypass_in_relaxed_without_commercial(monkeypatch, tmp_path):
    """When commercial gate is off, ownerless rows still must not leak to strangers."""
    from backend.economics import store as eco_store
    from backend import main as main_mod

    eco_store.reset_economics_store_for_tests()
    main_mod._rate_state.clear()  # noqa: SLF001
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.delenv("CLAW_COMMERCIAL_MODE", raising=False)
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "econ2.sqlite3"))
    local = TestClient(app)
    eco = get_economics_store()
    eco.init_schema()
    out = affiliate_service.create_affiliate(
        affiliate_code="ORPH1",
        wallet_address="0x" + "d" * 40,
        display_name="Orphan",
        owner_org_id=None,
    )
    assert out.get("ok")
    aid = str(out["affiliate_id"])
    with eco._conn() as con:
        con.execute("UPDATE affiliates SET owner_org_id = NULL WHERE id = ?", (aid,))
        con.commit()
    r = local.get(f"/v1/affiliates/{aid}", headers=_auth("attacker"))
    assert r.status_code == 404
    r2 = local.get(f"/v1/affiliates/{aid}/accruals", headers=_auth("attacker"))
    assert r2.status_code == 404


def test_active_genesis_me_works_but_legacy_private_apis_denied(client: TestClient, tmp_path, monkeypatch):
    reset_economics_store_for_tests()
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    eco = get_economics_store()
    eco.init_schema()
    create_genesis_affiliate(
        eco,
        user_id="genesis-dog",
        display_name="Genesis Dog",
        referral_code="GDOG1",
        affiliate_status="active",
    )
    h = _auth("genesis-dog")
    me = client.get("/v1/genesis-referral/affiliate/me", headers=h)
    assert me.status_code == 200
    assert me.json().get("ok") is True
    # Must not use legacy private stack
    _assert_commercial_disabled(
        client.get("/v1/orgs/user-genesis-dog/affiliate/gamification/dashboard", headers=h)
    )
    _assert_commercial_disabled(
        client.post(
            "/v1/affiliates/create-link",
            headers=h,
            json={"requested_handle": "genesislink"},
        )
    )


def test_public_capture_redacted_and_usable(client: TestClient, tmp_path, monkeypatch):
    reset_economics_store_for_tests()
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    eco = get_economics_store()
    eco.init_schema()
    create_genesis_affiliate(
        eco,
        user_id="capture-dog",
        display_name="Capture Dog",
        referral_code="CAPOK1",
        affiliate_status="active",
    )
    cap = client.post(
        "/v1/genesis-referral/capture",
        json={
            "referral_code": "CAPOK1",
            "visitor_id": "visitor_public_redact_01",
            "source_path": "/app/create?ref=CAPOK1",
        },
    )
    assert cap.status_code == 200
    body = cap.json()
    assert body == {"ok": True}
    assert "referrer_user_id" not in body
    assert "attribution" not in body


def test_public_attribute_and_trust_click_remain_available(client: TestClient, tmp_path, monkeypatch):
    reset_economics_store_for_tests()
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    eco = get_economics_store()
    eco.init_schema()
    # Attribute requires JWT + org match — create affiliate in DB for code lookup via service path
    affiliate_service.create_affiliate(
        affiliate_code="ATTR1",
        wallet_address="0x" + "e" * 40,
        display_name="Attr",
        owner_org_id="user-referrer",
    )
    attr = client.post(
        "/v1/affiliates/attribute",
        headers=_auth("subscriber"),
        json={
            "org_id": "user-subscriber",
            "affiliate_code": "ATTR1",
            "attribution_type": "signup",
        },
    )
    # May 200 or 400 depending on attribution rules; must not be commercial-disabled
    assert attr.status_code != 403 or (
        isinstance(attr.json().get("detail"), dict)
        and attr.json()["detail"].get("code") != LEGACY_AFFILIATE_COMMERCIAL_DISABLED
    )
    click = client.post(
        "/v1/affiliates/trust/record-click",
        json={
            "referral_code": "ATTR1",
            "idempotency_key": "idem-trust-click-commercial-1",
        },
    )
    assert click.status_code != 403 or (
        isinstance(click.json().get("detail"), dict)
        and click.json()["detail"].get("code") != LEGACY_AFFILIATE_COMMERCIAL_DISABLED
    )


def test_ops_payout_context_still_requires_privileged_operator(client: TestClient):
    denied = client.get(
        "/v1/affiliates/ops/payout-context",
        headers=_auth("ordinary"),
    )
    assert denied.status_code in (401, 403)
    detail = denied.json().get("detail")
    if isinstance(detail, dict):
        assert detail.get("code") != LEGACY_AFFILIATE_COMMERCIAL_DISABLED or denied.status_code == 403

    ok = client.get(
        "/v1/affiliates/ops/payout-context",
        headers={
            "x-claw-admin-secret": "admin-test-secret",
            "X-Claw-Test-Auth-User-Id": "ops_admin",
            "X-Claw-Test-Operator-Role": "admin",
            "x-claw-admin-reason": "ops payout context review",
        },
    )
    # May 200 or 403 if admin secret/env not fully wired — must not be legacy_affiliate_commercial_disabled
    if ok.status_code == 403:
        d = ok.json().get("detail")
        if isinstance(d, dict):
            assert d.get("code") != LEGACY_AFFILIATE_COMMERCIAL_DISABLED
    else:
        assert ok.status_code == 200
