"""Authorization identity enforcement — JWT, ownership fail-closed, tokenized routes."""

from __future__ import annotations

from backend.tests.entitlement_test_support import ensure_headers_entitled, ensure_org_pro_entitlement

import hashlib
import hmac
import json
import time
import uuid
from base64 import urlsafe_b64encode

import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(autouse=True)
def _entitle_owner_org_after_env(tmp_path, monkeypatch):
    """Grant Pro for primary owner headers once tmp_path-backed DBs are configured."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ONRAMP_DB_PATH", str(tmp_path / "onramp.sqlite3"))
    monkeypatch.setenv("CLAW_TREASURY_DB_PATH", str(tmp_path / "treasury.sqlite3"))
    from backend.economics.store import reset_economics_store_for_tests
    reset_economics_store_for_tests()
    for _name in ("_ORG_H", "_OWNER_H", "OWNER_HEADERS", "_HEADERS", "ORG_HEADERS", "_OWNER", "_ORG_A", "_ORG", "_STAGING_ORG"):
        h = globals().get(_name)
        if isinstance(h, dict) and h.get("X-Claw-Org-Id"):
            ensure_headers_entitled(h)
    yield
    reset_economics_store_for_tests()

from backend.security.anonymous_session_store import reset_anonymous_session_store_for_tests
from backend.tests.conftest_auth_security import (
    auth_secrets,
    make_authenticated_user_headers,
    make_test_auth_headers,
    mint_anonymous_session,
)
from backend.usage_economics.store import UsageEconomicsStore


@pytest.fixture()
def isolated_usage(tmp_path, monkeypatch: pytest.MonkeyPatch, auth_secrets):
    usage_path = str(tmp_path / "usage_eco.sqlite3")
    eco_path = str(tmp_path / "economics.sqlite3")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", usage_path)
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", eco_path)

    import backend.economics.store as eco_store_mod
    import backend.usage_economics.store as ue_store_mod

    ue_store_mod._store = None
    eco_store_mod._store = None
    reset_anonymous_session_store_for_tests()
    usage = UsageEconomicsStore(usage_path)
    usage.init_schema()
    yield usage
    ue_store_mod._store = None
    eco_store_mod._store = None
    reset_anonymous_session_store_for_tests()


def _draft_payload() -> dict:
    return {
        "title": "T",
        "jurisdiction": "CA",
        "parties": [{"name": "A", "role": "owner"}],
        "purpose": "test purpose for draft",
    }


def _mint_jwt(sub: str, *, secret: str = "test-jwt-secret", expired: bool = False) -> str:
    header = urlsafe_b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()).rstrip(b"=").decode()
    exp = int(time.time()) - 60 if expired else int(time.time()) + 3600
    payload = urlsafe_b64encode(json.dumps({"sub": sub, "exp": exp}).encode()).rstrip(b"=").decode()
    signing = f"{header}.{payload}".encode()
    sig = urlsafe_b64encode(hmac.new(secret.encode(), signing, hashlib.sha256).digest()).rstrip(b"=").decode()
    return f"{header}.{payload}.{sig}"


# --- Authenticated workspace ---


def test_user_org_header_without_jwt_returns_401(isolated_usage):
    client = TestClient(app)
    res = client.post(
        "/api/agreements/draft",
        headers={"X-Claw-Org-Id": "user-no-jwt", "Content-Type": "application/json"},
        json=_draft_payload(),
    )
    assert res.status_code == 401
    assert res.json()["detail"]["code"] == "auth_required"


def test_invalid_jwt_returns_401(isolated_usage, monkeypatch: pytest.MonkeyPatch):
    from backend.tests.auth_fixtures import configure_local_hs256_jwt

    configure_local_hs256_jwt(monkeypatch, secret="test-jwt-secret")
    client = TestClient(app)
    res = client.post(
        "/api/agreements/draft",
        headers={
            "X-Claw-Org-Id": "user-a",
            "Authorization": "Bearer not.a.valid.jwt",
            "Content-Type": "application/json",
        },
        json=_draft_payload(),
    )
    assert res.status_code == 401


def test_expired_jwt_returns_401(isolated_usage, monkeypatch: pytest.MonkeyPatch):
    from backend.tests.auth_fixtures import configure_local_hs256_jwt

    configure_local_hs256_jwt(monkeypatch, secret="test-jwt-secret")
    token = _mint_jwt("user-a", expired=True)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/draft",
        headers={
            "X-Claw-Org-Id": "user-user-a",
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json=_draft_payload(),
    )
    assert res.status_code == 401
    assert "expired" in str(res.json()["detail"].get("message", "")).lower()


def test_jwt_user_a_with_user_b_header_returns_403(isolated_usage):
    client = TestClient(app)
    res = client.post(
        "/api/agreements/draft",
        headers={
            **make_authenticated_user_headers("alice", org_id="user-bob"),
            "Content-Type": "application/json",
        },
        json=_draft_payload(),
    )
    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "user_org_mismatch"


def test_authenticated_user_can_create_draft(isolated_usage):
    client = TestClient(app)
    user = "owner-create"
    headers = ensure_headers_entitled(make_authenticated_user_headers(user))
    res = client.post(
        "/api/agreements/draft",
        headers={**headers, "Content-Type": "application/json"},
        json=_draft_payload(),
    )
    assert res.status_code == 200, res.text
    aid = res.json()["id"]
    row = isolated_usage.get_agreement_owner_row(aid)
    assert row["subject_ref"] == f"org:user-{user}"


def test_anonymous_session_cannot_access_user_workspace(isolated_usage):
    mint_client = TestClient(app)
    org_id, token, _ = mint_anonymous_session(mint_client)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/draft",
        headers={
            "X-Claw-Org-Id": "user-attacker",
            "X-Claw-Anon-Session": token,
            "Content-Type": "application/json",
        },
        json=_draft_payload(),
    )
    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "anonymous_credential_on_user_workspace"


def test_leftover_anonymous_credential_does_not_block_matching_user_workspace(isolated_usage):
    mint_client = TestClient(app)
    _org_id, token, _ = mint_anonymous_session(mint_client)
    client = TestClient(app)
    headers = ensure_headers_entitled(make_authenticated_user_headers("returning-buyer"))
    res = client.get(
        "/api/agreements/usage/summary",
        headers={**headers, "X-Claw-Anon-Session": token},
    )
    assert res.status_code == 200, res.text
    assert res.json().get("commercial") or res.json().get("tier") is not None


def test_authenticated_user_cannot_read_other_owner_agreement(isolated_usage):
    client = TestClient(app)
    owner = "owner-read"
    other = "other-read"
    aid = f"ag-read-{uuid.uuid4().hex[:8]}"
    isolated_usage.insert_agreement_owner(
        agreement_id=aid,
        subject_ref=f"org:user-{owner}",
        internal_keys_draft=1,
    )
    res = client.get(
        f"/api/agreements/{aid}",
        headers=make_authenticated_user_headers(other),
    )
    assert res.status_code == 403


# --- Missing ownership ---


def test_agreement_without_owner_cannot_be_read(isolated_usage):
    client = TestClient(app)
    org_id, _t, headers = mint_anonymous_session(client)
    aid = f"ag-no-owner-{uuid.uuid4().hex[:8]}"
    res = client.get(f"/api/agreements/{aid}", headers=headers)
    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "agreement_read_denied"


def test_agreement_without_owner_cannot_checkout(isolated_usage, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CLAW_STRIPE_CHECKOUT_ENABLED", "0")
    client = TestClient(app)
    org_id, _t, headers = mint_anonymous_session(client)
    aid = f"ag-no-owner-co-{uuid.uuid4().hex[:8]}"
    res = client.post(
        "/v1/billing/checkout-session",
        headers=headers,
        json={"agreement_id": aid, "return_to": "/app/create"},
    )
    assert res.status_code in (403, 503)


def test_org_header_cannot_repair_missing_ownership(isolated_usage):
    client = TestClient(app)
    org_id, _t, headers = mint_anonymous_session(client)
    aid = f"ag-header-repair-{uuid.uuid4().hex[:8]}"
    res = client.get(f"/api/agreements/{aid}", headers=headers)
    assert res.status_code == 403
    row = isolated_usage.get_agreement_owner_row(aid)
    assert row is None


def test_new_draft_registers_ownership(isolated_usage):
    client = TestClient(app)
    headers = ensure_headers_entitled(make_authenticated_user_headers("draft-owner"))
    org_id = headers["X-Claw-Org-Id"]
    res = client.post(
        "/api/agreements/draft",
        headers={**headers, "Content-Type": "application/json"},
        json=_draft_payload(),
    )
    assert res.status_code == 200, res.text
    aid = res.json()["id"]
    row = isolated_usage.get_agreement_owner_row(aid)
    assert row is not None
    assert row["subject_ref"] == f"org:{org_id}"


def test_anonymous_org_header_alone_cannot_create_draft(isolated_usage):
    """Guest create requires a minted anonymous session credential, not org id alone."""
    client = TestClient(app)
    res = client.post(
        "/api/agreements/draft",
        headers={
            "X-Claw-Org-Id": f"anon-{uuid.uuid4().hex[:10]}",
            "Content-Type": "application/json",
        },
        json=_draft_payload(),
    )
    assert res.status_code == 401
    assert res.json()["detail"]["code"] == "anonymous_session_required"


# --- Stripe tampering ---


def test_create_flow_checkout_sentinel_allows_verified_user_without_agreement_row(
    isolated_usage, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_create_flow")
    monkeypatch.setenv("STRIPE_PRICE_PRO_MONTHLY", "price_test_monthly")
    captured: dict = {}

    def _fake_create(**kwargs):
        captured.update(kwargs)
        return {
            "id": "cs_test_create_flow",
            "url": "https://checkout.stripe.com/c/pay/cs_test_create_flow",
        }

    monkeypatch.setattr(
        "backend.routers.billing_checkout_api.create_checkout_session",
        _fake_create,
    )
    client = TestClient(app)
    _org_id, token, _ = mint_anonymous_session(client)
    headers = make_authenticated_user_headers("create-flow-buyer")
    res = client.post(
        "/v1/billing/checkout-session",
        headers={**headers, "X-Claw-Anon-Session": token},
        json={
            "agreement_id": "__claw_create_checkout__",
            "cadence": "monthly",
            "return_to": "/app/create?restore=starterReview",
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["ok"] is True
    assert body["session_id"] == "cs_test_create_flow"
    assert body["checkout_url"].startswith("https://checkout.stripe.com/")
    assert body["org_id"] == "user-create-flow-buyer"
    assert captured["success_url"].startswith("http://localhost:5173/app/create?restore=starterReview")
    assert "checkout_session_id={CHECKOUT_SESSION_ID}" in captured["success_url"]
    assert captured["cancel_url"].startswith("http://localhost:5173/app/checkout/__claw_create_checkout__")


def test_staging_checkout_ignores_localhost_origin_header(isolated_usage, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("backend.billing.checkout_app_origin.claw_environment", lambda: "staging")
    monkeypatch.delenv("LAWDOG_APP_ORIGIN", raising=False)
    monkeypatch.delenv("VITE_LAWDOG_APP_ORIGIN", raising=False)
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_create_flow")
    monkeypatch.setenv("STRIPE_PRICE_PRO_MONTHLY", "price_test_monthly")
    captured: dict = {}

    def _fake_create(**kwargs):
        captured.update(kwargs)
        return {
            "id": "cs_test_staging_origin",
            "url": "https://checkout.stripe.com/c/pay/cs_test_staging_origin",
        }

    monkeypatch.setattr(
        "backend.routers.billing_checkout_api.create_checkout_session",
        _fake_create,
    )
    client = TestClient(app)
    headers = make_authenticated_user_headers("staging-origin-buyer")
    res = client.post(
        "/v1/billing/checkout-session",
        headers={
            **headers,
            "Origin": "http://localhost:5173",
            "Host": "evil.example",
            "X-Forwarded-Host": "evil.example",
            "X-Forwarded-Proto": "http",
        },
        json={
            "agreement_id": "__claw_create_checkout__",
            "cadence": "monthly",
            "return_to": "/app/create?restore=starterReview",
        },
    )
    assert res.status_code == 200, res.text
    assert captured["success_url"].startswith(
        "https://believable-gentleness-staging.up.railway.app/app/create?restore=starterReview"
    )
    assert "localhost" not in captured["success_url"]
    assert "evil.example" not in captured["success_url"]
    assert "checkout_session_id={CHECKOUT_SESSION_ID}" in captured["success_url"]
    assert captured["cancel_url"] == (
        "https://believable-gentleness-staging.up.railway.app/app/checkout/__claw_create_checkout__"
    )


def test_unregistered_agreement_checkout_still_rejected(isolated_usage, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_create_flow")
    monkeypatch.setenv("STRIPE_PRICE_PRO_MONTHLY", "price_test_monthly")
    client = TestClient(app)
    headers = make_authenticated_user_headers("create-flow-buyer")
    res = client.post(
        "/v1/billing/checkout-session",
        headers=headers,
        json={"agreement_id": "ag-not-registered", "cadence": "monthly", "return_to": "/app/create"},
    )
    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "ownership_not_registered"


def test_user_a_cannot_checkout_user_b_agreement(isolated_usage, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CLAW_STRIPE_CHECKOUT_ENABLED", "0")
    client = TestClient(app)
    aid = f"ag-stripe-{uuid.uuid4().hex[:8]}"
    isolated_usage.insert_agreement_owner(
        agreement_id=aid,
        subject_ref="org:user-victim",
        internal_keys_draft=1,
    )
    res = client.post(
        "/v1/billing/checkout-session",
        headers=make_authenticated_user_headers("attacker"),
        json={"agreement_id": aid, "return_to": "/app/create"},
    )
    assert res.status_code in (403, 503)


def test_anon_a_cannot_checkout_anon_b_agreement(isolated_usage, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CLAW_STRIPE_CHECKOUT_ENABLED", "0")
    client = TestClient(app)
    org_a, _t_a, headers_a = mint_anonymous_session(client)
    org_b, _t_b, headers_b = mint_anonymous_session(client)
    aid = f"ag-anon-stripe-{uuid.uuid4().hex[:8]}"
    isolated_usage.insert_agreement_owner(
        agreement_id=aid,
        subject_ref=f"org:{org_a}",
        internal_keys_draft=1,
    )
    res = client.post(
        "/v1/billing/checkout-session",
        headers=headers_b,
        json={"agreement_id": aid, "return_to": "/app/create"},
    )
    assert res.status_code in (403, 503)


# --- Tokenized routes (reviewer/signer without owner JWT) ---


def test_agreement_id_without_token_fails_on_protected_read(isolated_usage):
    client = TestClient(app)
    aid = f"ag-public-{uuid.uuid4().hex[:8]}"
    isolated_usage.insert_agreement_owner(
        agreement_id=aid,
        subject_ref="org:anon-test",
        internal_keys_draft=1,
    )
    res = client.get(f"/api/agreements/{aid}")
    assert res.status_code in (401, 403)


def test_recipient_token_route_without_owner_jwt(isolated_usage, monkeypatch: pytest.MonkeyPatch, tmp_path):
    monkeypatch.setenv("CLAW_SIGNING_TOKEN_SECRET", "test-signing-secret-for-recipient")
    monkeypatch.setenv("CLAW_AGREEMENT_DRAFTS_DIR", str(tmp_path / "drafts"))
    from backend.security.recipient_access_token import mint_recipient_access_token
    from backend.services.agreement_draft_store import save_draft

    aid = f"ag-token-{uuid.uuid4().hex[:8]}"
    isolated_usage.insert_agreement_owner(
        agreement_id=aid,
        subject_ref="org:anon-token",
        internal_keys_draft=1,
    )
    save_draft(
        {
            "id": aid,
            "title": "Token test",
            "parties": [{"id": "party-1", "name": "R", "role": "reviewer"}],
            "versions": [{"id": "v1", "body": "x"}],
            "audit_log": [],
        }
    )
    token = mint_recipient_access_token(
        secret=b"test-signing-secret-for-recipient",
        agreement_id=aid,
        locked_version_id="v1",
        mode="review",
        role="reviewer",
        ttl_seconds=3600,
        recipient_party_id="party-1",
    )
    client = TestClient(app)
    res = client.get(f"/api/agreements/access/validate?token={token}&agreement_id={aid}")
    assert res.status_code == 200, res.text
