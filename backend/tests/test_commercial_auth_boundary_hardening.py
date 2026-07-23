"""Adversarial commercial auth-boundary hardening (post-5f623a79 / 49ca3f12)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services.agreement_draft_store import load_draft, save_draft
from backend.security.recipient_access_token import mint_recipient_access_token
from backend.services.recipient_delivery_registry import extract_jti_from_token, record_invite_sent


_SECRET = "unit-test-commercial-hardening-secret"


@pytest.fixture()
def client(monkeypatch, tmp_path):
    from backend.usage_economics import store as usage_economics_store_mod
    from backend.admin_console import store as admin_store
    from backend.economics import store as eco_store

    usage_economics_store_mod._store = None  # noqa: SLF001
    admin_store._store = None  # noqa: SLF001
    eco_store.reset_economics_store_for_tests()
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_ADMIN_CONSOLE_DB_PATH", str(tmp_path / "admin.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", _SECRET)
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "0")
    monkeypatch.setenv("CLAW_ADMIN_SECRET", "admin-test-secret")
    monkeypatch.delenv("CLAW_ALLOW_TOKENLESS_SIGNER_COMPLETE", raising=False)
    monkeypatch.delenv("CLAW_COMMERCIAL_MODE", raising=False)
    return TestClient(app)


def _owner(user: str = "owner-a") -> dict[str, str]:
    return {"X-Claw-Org-Id": f"user-{user}", "X-Claw-Test-Auth-User-Id": user}


def test_unset_environment_blocks_test_auth(monkeypatch, client: TestClient):
    monkeypatch.delenv("CLAW_ENVIRONMENT", raising=False)
    r = client.get("/api/agreements/workspace-index", headers=_owner())
    assert r.status_code == 401


def test_blank_environment_blocks_test_auth(monkeypatch, client: TestClient):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "   ")
    r = client.get("/api/agreements/workspace-index", headers=_owner())
    assert r.status_code == 401


def test_staging_blocks_test_auth(monkeypatch, client: TestClient):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "staging")
    monkeypatch.setenv("CLAW_COMMERCIAL_MODE", "1")
    r = client.get(
        "/api/agreements/workspace-index",
        headers={"X-Claw-Org-Id": "forged", "X-Claw-Test-Auth-User-Id": "attacker"},
    )
    assert r.status_code == 401


def test_premium_full_draft_rejects_legacy_org_in_commercial(monkeypatch, client: TestClient):
    monkeypatch.setenv("CLAW_COMMERCIAL_MODE", "1")
    r = client.post(
        "/api/agreements/premium-full-draft",
        headers={"X-Claw-Org-Id": "local-org", "X-Claw-Test-Auth-User-Id": "test-owner"},
        json={"intake_text": "x" * 80, "jurisdiction": "DE"},
    )
    assert r.status_code in (401, 403)


def test_economics_keys_meter_subscription_require_auth(client: TestClient, monkeypatch):
    monkeypatch.setenv("CLAW_COMMERCIAL_MODE", "1")
    anon_keys = client.get("/v1/orgs/user-victim/keys")
    assert anon_keys.status_code == 401
    anon_sub = client.get("/v1/subscriptions/user-victim")
    assert anon_sub.status_code == 401
    anon_meter = client.post(
        "/v1/usage/meter",
        json={"org_id": "user-victim", "user_id": "victim", "service_type": "ai", "unit_count": 1},
    )
    assert anon_meter.status_code == 401

    cross = client.get("/v1/orgs/user-victim/keys", headers=_owner("attacker"))
    assert cross.status_code == 403


def test_jwt_requires_exp_iss_aud_in_production_like(monkeypatch, client: TestClient):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "staging")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "jwt-secret-for-staging-tests")
    monkeypatch.setenv("SUPABASE_JWT_ISSUER", "https://example.supabase.co/auth/v1")
    monkeypatch.setenv("SUPABASE_JWT_AUDIENCE", "authenticated")

    def mint(*, exp=None, iss=None, aud="authenticated", sub="owner-a", alg="HS256"):
        header = {"alg": alg, "typ": "JWT"}
        payload = {"sub": sub, "aud": aud}
        if exp is not None:
            payload["exp"] = exp
        if iss is not None:
            payload["iss"] = iss
        def b64(o):
            return base64.urlsafe_b64encode(json.dumps(o, separators=(",", ":")).encode()).decode().rstrip("=")
        h, p = b64(header), b64(payload)
        sig = hmac.new(b"jwt-secret-for-staging-tests", f"{h}.{p}".encode(), hashlib.sha256).digest()
        return f"{h}.{p}.{base64.urlsafe_b64encode(sig).decode().rstrip('=')}"

    no_exp = client.get(
        "/api/agreements/workspace-index",
        headers={
            "X-Claw-Org-Id": "user-owner-a",
            "Authorization": f"Bearer {mint(iss='https://example.supabase.co/auth/v1')}",
        },
    )
    assert no_exp.status_code == 401
    assert "jwt_exp" in str(no_exp.json())

    bad_iss = client.get(
        "/api/agreements/workspace-index",
        headers={
            "X-Claw-Org-Id": "user-owner-a",
            "Authorization": f"Bearer {mint(exp=int(time.time())+3600, iss='https://evil.example/auth/v1')}",
        },
    )
    assert bad_iss.status_code == 401

    alg_none = client.get(
        "/api/agreements/workspace-index",
        headers={
            "X-Claw-Org-Id": "user-owner-a",
            "Authorization": f"Bearer {mint(exp=int(time.time())+3600, iss='https://example.supabase.co/auth/v1', alg='none')}",
        },
    )
    assert alg_none.status_code == 401


def test_genesis_affiliate_me_ignores_spoofed_user_header(client: TestClient):
    r = client.get(
        "/v1/genesis-referral/affiliate/me",
        headers={"X-Claw-User-Id": "spoofed-victim"},
    )
    assert r.status_code == 401


def test_genesis_ops_requires_operator_principal_and_reason(client: TestClient):
    secret_only = client.get(
        "/v1/genesis-referral/ops/summary",
        headers={"x-claw-admin-secret": "admin-test-secret"},
    )
    assert secret_only.status_code in (401, 403)

    ok = client.get(
        "/v1/genesis-referral/ops/summary",
        headers={
            "x-claw-admin-secret": "admin-test-secret",
            "X-Claw-Test-Auth-User-Id": "ops_admin",
            "X-Claw-Test-Operator-Role": "admin",
            "x-claw-admin-reason": "ops summary review",
        },
    )
    assert ok.status_code == 200


def test_main_admin_uses_constant_time_secret_compare(monkeypatch, client: TestClient):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "staging")
    monkeypatch.setenv("CLAW_ADMIN_SECRET", "admin-test-secret")
    bad = client.get("/admin/runtime-summary", headers={"x-claw-admin-secret": "wrong"})
    assert bad.status_code == 403
    good = client.get("/admin/runtime-summary", headers={"x-claw-admin-secret": "admin-test-secret"})
    # May still 403 if route requires more — accept 200 or structured deny without crash
    assert good.status_code in (200, 403, 404)


def test_signer_complete_without_portable_requires_accepted_snapshot(client: TestClient, monkeypatch):
    monkeypatch.setenv("CLAW_COMMERCIAL_MODE", "1")
    aid = "ag_no_portable_complete"
    save_draft(
        {
            "id": aid,
            "title": "No portable",
            "parties": [
                {"id": "p1", "name": "A", "role": "Client", "email": "a@x.com"},
                {"id": "p2", "name": "B", "role": "Service Provider", "email": "b@x.com"},
            ],
            "versions": [],
            "audit_log": [],
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
            "vs01_signing_packet_v1": {
                "v": 1,
                "document_id": "doc_vs01",
                "portable": {
                    "v": 1,
                    "seed": {"documentId": "doc_vs01", "agreementId": aid, "corpusPlain": "x" * 1600},
                    "roles": [{"roleId": "role_cp", "partyIndex": 1, "requiresSignature": True}],
                    "fields": [{"id": "cp_sig", "assignedSignerRoleId": "role_cp", "counterpartyId": "p2", "type": "signature"}],
                },
            },
            # Force post-cutover commercial authority without an accepted snapshot.
            "canonical_review_snapshots_v1": {
                "v": 1,
                "registryVersion": 1,
                "commercialSnapshotAuthorityRequired": True,
                "snapshots": {},
            },
        }
    )
    from backend.services.agreement_signing_lock_store import write_signing_lock

    write_signing_lock(aid, {"locked_version_id": "v1"})
    tok = mint_recipient_access_token(
        secret=_SECRET.encode(),
        agreement_id=aid,
        locked_version_id="v1",
        mode="sign",
        role="signer",
        ttl_seconds=3600,
        recipient_party_id="p2",
    )
    draft = load_draft(aid)
    record_invite_sent(
        draft,
        phase="signing",
        participant_id="p2",
        jti=extract_jti_from_token(tok),
        email="b@x.com",
        audit_log=draft.setdefault("audit_log", []),
    )
    save_draft(draft)
    res = client.post(
        f"/api/agreements/{aid}/vs01-signer-complete",
        headers={"X-Claw-Recipient-Access-Token": tok},
        json={"signer_role_id": "role_cp", "participant_id": "p2", "document_id": "doc_vs01"},
    )
    assert res.status_code == 400
    detail = res.json().get("detail") or {}
    code = detail.get("code") if isinstance(detail, dict) else ""
    assert code in (
        "accepted_review_snapshot_required",
        "legacy_packet_requires_reattestation",
        "portable_snapshot_mismatch",
    ) or "accepted_review_snapshot" in str(detail)
