"""Active Genesis Dog access boundary — adversarial allow/deny for dashboard APIs."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.affiliates.genesis_referral_service import create_genesis_affiliate
from backend.economics.store import get_economics_store, reset_economics_store_for_tests
from backend.main import app
from backend.security.genesis_affiliate_access import GENESIS_AFFILIATE_ACCESS_DENIED


@pytest.fixture()
def client(monkeypatch, tmp_path):
    from backend.economics import store as eco_store
    from backend import main as main_mod

    eco_store.reset_economics_store_for_tests()
    main_mod._rate_state.clear()  # noqa: SLF001
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_RATE_LIMIT_RPS", "1000")
    monkeypatch.setenv("CLAW_RATE_LIMIT_BURST", "1000")
    return TestClient(app)


def _store():
    reset_economics_store_for_tests()
    e = get_economics_store()
    e.init_schema()
    return e


def _auth(user_id: str) -> dict:
    return {"X-Claw-Test-Auth-User-Id": user_id, "X-Claw-Org-Id": f"user-{user_id}"}


def _assert_denied_no_summary(r) -> None:
    assert r.status_code == 403
    body = r.json()
    detail = body.get("detail")
    if isinstance(detail, dict):
        assert detail.get("code") == GENESIS_AFFILIATE_ACCESS_DENIED
    else:
        assert GENESIS_AFFILIATE_ACCESS_DENIED in str(detail)
    blob = r.text.lower()
    assert "pending_commission" not in blob
    assert "payable_commission" not in blob
    assert "converted_referrals" not in blob
    assert "display_name" not in blob


def test_ordinary_authenticated_user_denied_me_and_access(client: TestClient):
    _store()
    h = _auth("ordinary-user")
    me = client.get("/v1/genesis-referral/affiliate/me", headers=h)
    _assert_denied_no_summary(me)
    access = client.get("/v1/genesis-referral/affiliate/access", headers=h)
    assert access.status_code == 200
    assert access.json() == {
        "ok": True,
        "allowed": False,
        "reason": GENESIS_AFFILIATE_ACCESS_DENIED,
    }


@pytest.mark.parametrize("status", ["paused", "revoked"])
def test_inactive_genesis_denied_me_and_access(client: TestClient, status: str):
    e = _store()
    create_genesis_affiliate(
        e,
        user_id="inactive-dog",
        display_name="Inactive Dog",
        referral_code=f"CODE_{status.upper()}",
        affiliate_status=status,
    )
    h = _auth("inactive-dog")
    me = client.get("/v1/genesis-referral/affiliate/me", headers=h)
    _assert_denied_no_summary(me)
    access = client.get("/v1/genesis-referral/affiliate/access", headers=h)
    assert access.status_code == 200
    assert access.json()["allowed"] is False
    assert access.json()["reason"] == GENESIS_AFFILIATE_ACCESS_DENIED
    assert "pending_commission_usd" not in access.json()


def test_active_genesis_allowed_me_and_access(client: TestClient):
    e = _store()
    create_genesis_affiliate(
        e,
        user_id="active-dog",
        display_name="Active Dog",
        referral_code="ACTIVE1",
        affiliate_status="active",
    )
    h = _auth("active-dog")
    access = client.get("/v1/genesis-referral/affiliate/access", headers=h)
    assert access.status_code == 200
    assert access.json() == {"ok": True, "allowed": True}
    me = client.get("/v1/genesis-referral/affiliate/me", headers=h)
    assert me.status_code == 200
    body = me.json()
    assert body.get("ok") is True
    assert body["affiliate"]["referral_code"] == "ACTIVE1"
    assert body["affiliate"]["affiliate_status"] == "active"
    assert "pending_commission_usd" in body


def test_spoofed_user_header_ignored_for_me_and_access(client: TestClient):
    e = _store()
    create_genesis_affiliate(
        e,
        user_id="victim-dog",
        display_name="Victim",
        referral_code="VICTIM1",
        affiliate_status="active",
    )
    # No principal — spoof header alone must not authenticate.
    r = client.get(
        "/v1/genesis-referral/affiliate/me",
        headers={"X-Claw-User-Id": "victim-dog"},
    )
    assert r.status_code == 401
    r2 = client.get(
        "/v1/genesis-referral/affiliate/access",
        headers={"X-Claw-User-Id": "victim-dog"},
    )
    assert r2.status_code == 401
    # Authenticated as other user + spoof victim header still denied for victim's data.
    h = {**_auth("attacker"), "X-Claw-User-Id": "victim-dog"}
    me = client.get("/v1/genesis-referral/affiliate/me", headers=h)
    _assert_denied_no_summary(me)


def test_public_capture_remains_usable_without_auth(client: TestClient):
    e = _store()
    create_genesis_affiliate(
        e,
        user_id="capture-dog",
        display_name="Capture Dog",
        referral_code="CAPDOG1",
        affiliate_status="active",
    )
    cap = client.post(
        "/v1/genesis-referral/capture",
        json={
            "referral_code": "CAPDOG1",
            "visitor_id": "visitor_public_capture_01",
            "source_path": "/app/create?ref=CAPDOG1",
        },
    )
    assert cap.status_code == 200
    assert cap.json() == {"ok": True}
    blob = cap.text.lower()
    assert "referrer_user_id" not in blob
    assert "attribution" not in blob
    assert "pending_commission" not in blob
    assert "payable_commission" not in blob
    assert "payout_rate" not in blob


def test_ops_summary_still_requires_privileged_operator(client: TestClient):
    e = _store()
    create_genesis_affiliate(
        e,
        user_id="active-dog",
        display_name="Active Dog",
        referral_code="OPSGATE1",
        affiliate_status="active",
    )
    # Active Genesis alone must not unlock ops.
    denied = client.get("/v1/genesis-referral/ops/summary", headers=_auth("active-dog"))
    assert denied.status_code in (401, 403)


def _private_convert_fields_absent(payload: dict) -> None:
    blob = str(payload).lower()
    for needle in (
        "referrer_user_id",
        "attribution",
        "referral_code",
        "commission",
        "payout_rate",
        "display_name",
        "converted_at",
        "visitor_id",
    ):
        assert needle not in blob, payload


def test_convert_records_attribution_but_redacts_response(client: TestClient):
    e = _store()
    create_genesis_affiliate(
        e,
        user_id="referrer-dog",
        display_name="Referrer Dog",
        referral_code="CONVOK1",
        affiliate_status="active",
    )
    # Public capture first (side effect), then authenticated convert.
    cap = client.post(
        "/v1/genesis-referral/capture",
        json={
            "referral_code": "CONVOK1",
            "visitor_id": "visitor_convert_privacy_01",
            "source_path": "/app/create?ref=CONVOK1",
        },
    )
    assert cap.status_code == 200
    assert cap.json() == {"ok": True}

    h = _auth("buyer-user")
    conv = client.post(
        "/v1/genesis-referral/convert",
        headers=h,
        json={
            "referral_code": "CONVOK1",
            "visitor_id": "visitor_convert_privacy_01",
            "referred_org_id": "user-buyer-user",
            "referred_user_id": "buyer-user",
        },
    )
    assert conv.status_code == 200
    assert conv.json() == {"ok": True}
    _private_convert_fields_absent(conv.json())

    with e._conn() as con:
        row = con.execute(
            """
            SELECT referrer_user_id, referred_user_id, referred_org_id, converted_at
            FROM referral_attributions
            WHERE visitor_id = ? AND referral_code = ? COLLATE NOCASE
            """,
            ("visitor_convert_privacy_01", "CONVOK1"),
        ).fetchone()
    assert row is not None
    assert row[0] == "referrer-dog"
    assert row[1] == "buyer-user"
    assert row[2] == "user-buyer-user"
    assert row[3]  # converted_at set


def test_convert_inactive_and_self_referral_safe_errors(client: TestClient):
    e = _store()
    create_genesis_affiliate(
        e,
        user_id="paused-dog",
        display_name="Paused",
        referral_code="PAUSEREF",
        affiliate_status="paused",
    )
    create_genesis_affiliate(
        e,
        user_id="self-dog",
        display_name="Self",
        referral_code="SELFREF1",
        affiliate_status="active",
    )

    paused = client.post(
        "/v1/genesis-referral/convert",
        headers=_auth("buyer-user"),
        json={
            "referral_code": "PAUSEREF",
            "visitor_id": "visitor_paused_convert_01",
            "referred_org_id": "user-buyer-user",
            "referred_user_id": "buyer-user",
        },
    )
    assert paused.status_code == 400
    assert "referrer_user_id" not in paused.text.lower()
    assert "attribution" not in paused.text.lower()

    unknown = client.post(
        "/v1/genesis-referral/convert",
        headers=_auth("buyer-user"),
        json={
            "referral_code": "NOSUCHCODE",
            "visitor_id": "visitor_unknown_convert_01",
            "referred_org_id": "user-buyer-user",
            "referred_user_id": "buyer-user",
        },
    )
    assert unknown.status_code == 400
    assert "referrer_user_id" not in unknown.text.lower()

    self_ref = client.post(
        "/v1/genesis-referral/convert",
        headers=_auth("self-dog"),
        json={
            "referral_code": "SELFREF1",
            "visitor_id": "visitor_self_convert_01",
            "referred_org_id": "user-self-dog",
            "referred_user_id": "self-dog",
        },
    )
    assert self_ref.status_code == 409
    detail = self_ref.json().get("detail")
    assert detail == "self_referral" or (
        isinstance(detail, dict) and detail.get("code") == "self_referral"
    )
    assert "referrer_user_id" not in self_ref.text.lower()
    assert "attribution" not in self_ref.text.lower()


def test_convert_redaction_does_not_regress_genesis_dashboard_or_capture(client: TestClient):
    e = _store()
    create_genesis_affiliate(
        e,
        user_id="dash-dog",
        display_name="Dash Dog",
        referral_code="DASHREF1",
        affiliate_status="active",
    )
    h = _auth("dash-dog")
    me = client.get("/v1/genesis-referral/affiliate/me", headers=h)
    assert me.status_code == 200
    assert me.json().get("ok") is True
    assert me.json()["affiliate"]["referral_code"] == "DASHREF1"

    cap = client.post(
        "/v1/genesis-referral/capture",
        json={
            "referral_code": "DASHREF1",
            "visitor_id": "visitor_dash_capture_01",
            "source_path": "/",
        },
    )
    assert cap.json() == {"ok": True}

    ops = client.get("/v1/genesis-referral/ops/summary", headers=h)
    assert ops.status_code in (401, 403)
