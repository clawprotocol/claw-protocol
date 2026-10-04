"""Consumed anonymous cookies must not fail an already-bound returning owner."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from backend.admin_console.store import get_admin_console_store, reset_admin_console_store_for_tests
from backend.economics.store import reset_economics_store_for_tests
from backend.main import app
from backend.routers.workspace_auth_api import reset_bind_user_org_noop_cache_for_tests
from backend.security.anonymous_session_store import (
    get_anonymous_session_store,
    reset_anonymous_session_store_for_tests,
)
from backend.security.anonymous_session_token import ANON_SESSION_COOKIE
from backend.tests.conftest_auth_security import auth_secrets, make_test_auth_headers
from backend.usage_economics.store import UsageEconomicsStore


pytestmark = pytest.mark.unit


@pytest.fixture()
def isolated_auth(tmp_path, monkeypatch: pytest.MonkeyPatch, auth_secrets):
    usage_path = str(tmp_path / "usage.sqlite3")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", usage_path)
    monkeypatch.setenv("CLAW_ADMIN_CONSOLE_DB_PATH", str(tmp_path / "admin.sqlite3"))
    reset_economics_store_for_tests()
    reset_admin_console_store_for_tests()
    reset_anonymous_session_store_for_tests()
    reset_bind_user_org_noop_cache_for_tests()
    import backend.usage_economics.store as usage_mod

    usage_mod._store = None
    usage = UsageEconomicsStore(usage_path)
    usage.init_schema()
    client = TestClient(app)
    yield {"client": client, "usage": usage}
    usage_mod._store = None
    reset_economics_store_for_tests()
    reset_admin_console_store_for_tests()
    reset_anonymous_session_store_for_tests()
    reset_bind_user_org_noop_cache_for_tests()


def _mint(client: TestClient) -> dict:
    res = client.post("/v1/workspace/anonymous-session")
    assert res.status_code == 200, res.text
    return res.json()


def _returning_continuation(client: TestClient) -> str:
    res = client.post(
        "/v1/workspace/auth-continuation",
        json={
            "destination_path": "/app",
            "workflow_stage": "dashboard",
            "auth_purpose": "returning_sign_in",
        },
    )
    assert res.status_code == 200, res.text
    return res.json()["continuation_id"]


def _bind_owner(user_id: str) -> None:
    get_admin_console_store().upsert_workspace_user_identity(
        user_id=user_id,
        org_id=f"user-{user_id}",
        email="owner@example.test",
        display_name="Returning Owner",
    )


def _consume(session_id: str, claimed_user_id: str) -> None:
    assert get_anonymous_session_store().mark_session_claimed(
        session_id=session_id,
        user_id=claimed_user_id,
    )


def _finalize(client: TestClient, user_id: str | None, continuation_id: str, *, token: str | None = None, origin: str | None = None):
    headers = {}
    if user_id:
        headers.update(make_test_auth_headers(user_id))
    if origin:
        headers["Origin"] = origin
    if token:
        client.cookies.set(ANON_SESSION_COOKIE, token)
    else:
        client.cookies.clear()
    return client.post(
        "/v1/workspace/finalize-auth",
        headers=headers,
        json={"continuation_id": continuation_id, "claim_method": "magic_link"},
    )


def _cookie_header(response) -> str:
    return response.headers.get("set-cookie") or ""


def test_bound_returning_owner_discards_consumed_anon_cookie(isolated_auth):
    client = isolated_auth["client"]
    usage: UsageEconomicsStore = isolated_auth["usage"]
    user_id = "returning-owner"
    _bind_owner(user_id)
    minted = _mint(client)
    aid = f"ag-stale-{uuid.uuid4().hex[:8]}"
    usage.insert_agreement_owner(
        agreement_id=aid,
        subject_ref=f"org:{minted['org_id']}",
        internal_keys_draft=1,
    )
    _consume(minted["session_id"], user_id)
    before_identity = get_admin_console_store().get_workspace_user_identity(user_id)
    continuation_id = _returning_continuation(client)
    before_continuation = get_anonymous_session_store().get_continuation(continuation_id)

    res = _finalize(client, user_id, continuation_id, token=minted["token"])

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["ok"] is True
    assert body["idempotent"] is True
    assert body["migrated_agreement_count"] == 0
    assert body["org_id"] == f"user-{user_id}"
    assert body["destination_path"] == "/app"
    assert minted["token"] not in res.text
    assert minted["org_id"] not in res.text

    after_identity = get_admin_console_store().get_workspace_user_identity(user_id)
    assert after_identity == before_identity
    assert usage.get_agreement_owner_row(aid)["subject_ref"] == f"org:{minted['org_id']}"
    session = get_anonymous_session_store().resolve_token(minted["token"])
    assert int(session["consumed"]) == 1
    assert session["claimed_user_id"] == user_id
    assert get_anonymous_session_store().get_continuation(continuation_id)["consumed_at"] == before_continuation.get(
        "consumed_at"
    )

    set_cookie = _cookie_header(res).lower()
    assert ANON_SESSION_COOKIE in set_cookie
    assert "httponly" in set_cookie
    assert "path=/" in set_cookie
    assert "samesite=lax" in set_cookie
    assert "max-age=0" in set_cookie

    again = _finalize(client, user_id, continuation_id, token=minted["token"])
    assert again.status_code == 200, again.text
    assert again.json()["idempotent"] is True
    assert again.json()["migrated_agreement_count"] == 0
    assert get_admin_console_store().get_workspace_user_identity(user_id) == before_identity
    assert int(get_anonymous_session_store().resolve_token(minted["token"])["consumed"]) == 1


def test_consumed_cookie_for_another_identity_transfers_nothing(isolated_auth):
    client = isolated_auth["client"]
    usage: UsageEconomicsStore = isolated_auth["usage"]
    owner_id = "bound-owner"
    other_id = "other-account"
    _bind_owner(owner_id)
    minted = _mint(client)
    aid = f"ag-other-{uuid.uuid4().hex[:8]}"
    usage.insert_agreement_owner(
        agreement_id=aid,
        subject_ref=f"org:{minted['org_id']}",
        internal_keys_draft=1,
    )
    _consume(minted["session_id"], other_id)
    continuation_id = _returning_continuation(client)

    res = _finalize(client, owner_id, continuation_id, token=minted["token"])

    assert res.status_code == 403, res.text
    assert res.json()["detail"]["code"] == "anonymous_session_consumed"
    assert other_id not in res.text
    assert minted["token"] not in res.text
    assert usage.get_agreement_owner_row(aid)["subject_ref"] == f"org:{minted['org_id']}"
    session = get_anonymous_session_store().resolve_token(minted["token"])
    assert int(session["consumed"]) == 1
    assert session["claimed_user_id"] == other_id
    assert get_admin_console_store().get_workspace_user_identity(other_id) is None


def test_inconsistent_workspace_binding_does_not_get_returning_bypass(isolated_auth):
    client = isolated_auth["client"]
    user_id = "mismatched-owner"
    get_admin_console_store().upsert_workspace_user_identity(
        user_id=user_id,
        org_id="user-other-workspace",
    )
    minted = _mint(client)
    _consume(minted["session_id"], user_id)
    continuation_id = _returning_continuation(client)

    res = _finalize(client, user_id, continuation_id, token=minted["token"])

    assert res.status_code == 403, res.text
    assert res.json()["detail"]["code"] == "anonymous_session_consumed"
    assert get_admin_console_store().get_workspace_user_identity(user_id)["org_id"] == "user-other-workspace"


def test_unbound_authenticated_user_does_not_get_returning_bypass(isolated_auth):
    client = isolated_auth["client"]
    user_id = "new-authenticated-user"
    minted = _mint(client)
    _consume(minted["session_id"], user_id)
    continuation_id = _returning_continuation(client)

    res = _finalize(client, user_id, continuation_id, token=minted["token"])

    assert res.status_code == 403, res.text
    assert res.json()["detail"]["code"] == "anonymous_session_consumed"
    assert get_admin_console_store().get_workspace_user_identity(user_id) is None
    session = get_anonymous_session_store().resolve_token(minted["token"])
    assert int(session["consumed"]) == 1
    assert session["claimed_user_id"] == user_id


def test_unauthenticated_consumed_cookie_stays_rejected(isolated_auth):
    client = isolated_auth["client"]
    minted = _mint(client)
    _consume(minted["session_id"], "someone")
    continuation_id = _returning_continuation(client)

    res = _finalize(
        client,
        None,
        continuation_id,
        token=minted["token"],
        origin="https://evil.example",
    )

    assert res.status_code == 401, res.text
    assert res.json()["detail"]["code"] == "auth_required"
    assert "someone" not in res.text


def test_malformed_anon_cookie_does_not_authorize_bound_owner(isolated_auth):
    client = isolated_auth["client"]
    user_id = "bound-owner"
    _bind_owner(user_id)
    before = get_admin_console_store().get_workspace_user_identity(user_id)
    continuation_id = _returning_continuation(client)

    res = _finalize(client, user_id, continuation_id, token="not-a-session-token")

    assert res.status_code == 401, res.text
    assert res.json()["detail"]["code"] == "invalid_anonymous_session"
    assert get_admin_console_store().get_workspace_user_identity(user_id) == before


def test_expired_anon_cookie_does_not_use_returning_bypass(isolated_auth):
    client = isolated_auth["client"]
    user_id = "bound-owner"
    _bind_owner(user_id)
    minted = _mint(client)
    store = get_anonymous_session_store()
    with store._conn() as con:
        con.execute(
            "UPDATE anonymous_sessions SET expires_at = ? WHERE session_id = ?",
            ("2000-01-01T00:00:00Z", minted["session_id"]),
        )
    continuation_id = _returning_continuation(client)

    res = _finalize(client, user_id, continuation_id, token=minted["token"])

    assert res.status_code == 401, res.text
    assert res.json()["detail"]["code"] == "anonymous_session_expired"
    assert get_admin_console_store().get_workspace_user_identity(user_id)["org_id"] == f"user-{user_id}"


def test_unconsumed_anon_session_still_finalizes_once(isolated_auth):
    from backend.tests.entitlement_test_support import ensure_org_pro_entitlement

    client = isolated_auth["client"]
    usage: UsageEconomicsStore = isolated_auth["usage"]
    user_id = "first-time-owner"
    minted = _mint(client)
    aid = f"ag-live-{uuid.uuid4().hex[:8]}"
    usage.insert_agreement_owner(
        agreement_id=aid,
        subject_ref=f"org:{minted['org_id']}",
        internal_keys_draft=1,
    )
    cont = client.post(
        "/v1/workspace/auth-continuation",
        headers={"X-Claw-Anon-Session": minted["token"], "X-Claw-Org-Id": minted["org_id"]},
        json={
            "agreement_id": aid,
            "destination_path": "/app/create",
            "workflow_stage": "starter",
            "auth_purpose": "claim",
        },
    )
    assert cont.status_code == 200, cont.text
    ensure_org_pro_entitlement(f"user-{user_id}", user_id=user_id)
    client.cookies.clear()
    res = client.post(
        "/v1/workspace/finalize-auth",
        headers={**make_test_auth_headers(user_id), "X-Claw-Anon-Session": minted["token"]},
        json={"continuation_id": cont.json()["continuation_id"], "claim_method": "magic_link"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["migrated_agreement_count"] == 1
    assert usage.get_agreement_owner_row(aid)["subject_ref"] == f"org:user-{user_id}"
    assert int(get_anonymous_session_store().resolve_token(minted["token"])["consumed"]) == 1
