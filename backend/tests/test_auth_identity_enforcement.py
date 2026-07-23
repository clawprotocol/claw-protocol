"""Authorization identity enforcement — JWT, ownership fail-closed, tokenized routes."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
import uuid
from base64 import urlsafe_b64encode

import pytest
from fastapi.testclient import TestClient

from backend.main import app
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
    res = client.post(
        "/api/agreements/draft",
        headers={**make_authenticated_user_headers(user), "Content-Type": "application/json"},
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
            **make_test_auth_headers("attacker"),
            "Content-Type": "application/json",
        },
        json=_draft_payload(),
    )
    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "anonymous_credential_on_user_workspace"


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
    headers = make_authenticated_user_headers("draft-owner")
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


def test_anonymous_session_cannot_create_draft_without_principal(isolated_usage):
    """Commercial principal enforcement: anon org cookie alone is insufficient."""
    client = TestClient(app)
    _org_id, _t, headers = mint_anonymous_session(client)
    res = client.post(
        "/api/agreements/draft",
        headers={**headers, "Content-Type": "application/json"},
        json=_draft_payload(),
    )
    assert res.status_code == 401
    assert res.json()["detail"]["code"] == "auth_required"


# --- Stripe tampering ---


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
