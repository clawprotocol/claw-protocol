"""P0 commercial auth: dashboard principal, tokenless complete, cross-org denial."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.security.recipient_access_token import mint_recipient_access_token
from backend.services.agreement_draft_store import load_draft, save_draft
from backend.services.recipient_delivery_registry import (
    extract_jti_from_token,
    record_invite_sent,
    supersede_active_invite,
)


_SECRET = "unit-test-commercial-p0-signing-secret"


@pytest.fixture()
def client(monkeypatch, tmp_path):
    from backend.usage_economics import store as usage_economics_store_mod
    from backend.admin_console import store as admin_store

    usage_economics_store_mod._store = None  # noqa: SLF001
    admin_store._store = None  # noqa: SLF001
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ADMIN_CONSOLE_DB_PATH", str(tmp_path / "admin.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", _SECRET)
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "0")
    monkeypatch.delenv("CLAW_ALLOW_TOKENLESS_SIGNER_COMPLETE", raising=False)
    monkeypatch.delenv("CLAW_COMMERCIAL_MODE", raising=False)
    return TestClient(app)


def _owner_headers(user_id: str = "owner-a") -> dict[str, str]:
    return {
        "X-Claw-Org-Id": f"user-{user_id}",
        "X-Claw-Test-Auth-User-Id": user_id,
    }


def _mint(
    *,
    agreement_id: str,
    recipient_party_id: str,
    ttl_seconds: int = 3600,
    mode: str = "sign",
) -> str:
    return mint_recipient_access_token(
        secret=_SECRET.encode("utf-8"),
        agreement_id=agreement_id,
        locked_version_id="v1",
        mode=mode,  # type: ignore[arg-type]
        role="signer",
        ttl_seconds=ttl_seconds,
        recipient_party_id=recipient_party_id,
    )


def _seed_signing_draft(aid: str) -> None:
    save_draft(
        {
            "id": aid,
            "title": "Token bind",
            "parties": [
                {"name": "Owner LLC", "role": "Client", "email": "o@example.com", "id": "p1"},
                {"name": "CP LLC", "role": "Service Provider", "email": "c@example.com", "id": "p2"},
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
                    "roles": [
                        {"roleId": "role_owner", "partyIndex": 0, "requiresSignature": True},
                        {"roleId": "role_cp", "partyIndex": 1, "requiresSignature": True},
                    ],
                    "fields": [
                        {
                            "id": "cp_sig",
                            "assignedSignerRoleId": "role_cp",
                            "counterpartyId": "p2",
                            "type": "signature",
                        }
                    ],
                },
            },
        }
    )


def test_workspace_index_rejects_anonymous_and_forged_org(client: TestClient, monkeypatch):
    monkeypatch.setenv("CLAW_COMMERCIAL_MODE", "1")
    anon = client.get("/api/agreements/workspace-index", headers={"X-Claw-Org-Id": "forged-org"})
    assert anon.status_code == 401

    forged = client.get(
        "/api/agreements/workspace-index",
        headers={
            "X-Claw-Org-Id": "forged-org",
            "X-Claw-Test-Auth-User-Id": "attacker",
        },
    )
    assert forged.status_code == 401


def test_workspace_index_rejects_cross_user_org(client: TestClient):
    r = client.get(
        "/api/agreements/workspace-index",
        headers={
            "X-Claw-Org-Id": "user-victim",
            "X-Claw-Test-Auth-User-Id": "attacker",
        },
    )
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "user_org_mismatch"


def test_workspace_index_returns_accepted_snapshot_fragment_from_server(client: TestClient):
    create = client.post(
        "/api/agreements/draft",
        headers=_owner_headers(),
        json={
            "title": "Snapshot status",
            "jurisdiction": "DE",
            "parties": [{"name": "A", "role": "Client", "email": "a@example.com"}],
        },
    )
    assert create.status_code == 200, create.text
    aid = create.json()["draft"]["id"]
    draft = load_draft(aid)
    draft["accepted_review_snapshot_v1"] = {
        "status": "accepted",
        "snapshotId": "snap_server_abc",
        "corpusSha256": "a" * 64,
        "corpusLength": 2048,
        "acceptedAt": "2026-07-22T00:00:00Z",
        "corpusPlain": "SECRET_CORPUS_MUST_NOT_LEAK",
    }
    save_draft(draft)

    idx = client.get("/api/agreements/workspace-index", headers=_owner_headers())
    assert idx.status_code == 200
    rows = idx.json().get("agreements") or []
    row = next(x for x in rows if x["id"] == aid)
    frag = row.get("accepted_review_snapshot") or {}
    assert frag.get("snapshot_id") == "snap_server_abc"
    assert frag.get("corpus_sha256") == "a" * 64
    assert frag.get("corpus_length") == 2048
    assert "corpusPlain" not in frag
    assert "SECRET_CORPUS" not in str(idx.json())


def test_tokenless_signer_complete_fails_by_default(client: TestClient, monkeypatch):
    monkeypatch.setenv("CLAW_COMMERCIAL_MODE", "1")
    aid = "ag_tokenless_deny"
    _seed_signing_draft(aid)
    res = client.post(
        f"/api/agreements/{aid}/vs01-signer-complete",
        json={"signer_role_id": "role_cp", "participant_id": "p2", "document_id": "doc_vs01"},
    )
    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "signing_token_required"


def test_expired_cross_recipient_and_cross_document_tokens_fail(client: TestClient):
    aid = "ag_token_bind"
    _seed_signing_draft(aid)

    expired = _mint(agreement_id=aid, recipient_party_id="p2", ttl_seconds=60)
    # Force expiry by rewriting exp via remint with negative — mint clamps ttl min 60.
    # Use verify path by patching time through a token with past exp via raw mint override.
    from backend.security import recipient_access_token as rat

    raw = rat.mint_recipient_access_token(
        secret=_SECRET.encode("utf-8"),
        agreement_id=aid,
        locked_version_id="v1",
        mode="sign",
        role="signer",
        ttl_seconds=60,
        recipient_party_id="p2",
    )
    # Manually build expired token
    import base64
    import hashlib
    import hmac
    import json
    import time as _time

    body = {
        "aid": aid,
        "v": "v1",
        "m": "sign",
        "r": "signer",
        "iat": int(_time.time()) - 120,
        "exp": int(_time.time()) - 60,
        "jti": "deadbeefdeadbeefdeadbeefdeadbeef",
        "pid": "p2",
    }
    raw_body = json.dumps(body, sort_keys=True, separators=(",", ":")).encode("utf-8")
    sig = hmac.new(_SECRET.encode("utf-8"), raw_body, hashlib.sha256).digest()
    expired = (
        base64.urlsafe_b64encode(raw_body).decode("ascii").rstrip("=")
        + "."
        + base64.urlsafe_b64encode(sig).decode("ascii").rstrip("=")
    )
    r_exp = client.post(
        f"/api/agreements/{aid}/vs01-signer-complete",
        headers={"X-Claw-Recipient-Access-Token": expired},
        json={"signer_role_id": "role_cp", "participant_id": "p2", "document_id": "doc_vs01"},
    )
    assert r_exp.status_code in (401, 403, 422)

    cross = _mint(agreement_id=aid, recipient_party_id="p1")
    r_cross = client.post(
        f"/api/agreements/{aid}/vs01-signer-complete",
        headers={"X-Claw-Recipient-Access-Token": cross},
        json={"signer_role_id": "role_cp", "participant_id": "p2", "document_id": "doc_vs01"},
    )
    assert r_cross.status_code in (401, 403)

    cross_doc = _mint(agreement_id="ag_other_doc", recipient_party_id="p2")
    r_doc = client.post(
        f"/api/agreements/{aid}/vs01-signer-complete",
        headers={"X-Claw-Recipient-Access-Token": cross_doc},
        json={"signer_role_id": "role_cp", "participant_id": "p2", "document_id": "doc_vs01"},
    )
    assert r_doc.status_code in (401, 403)
    del raw  # silence unused


def test_superseded_invite_token_fails_signer_complete(client: TestClient):
    from backend.services.agreement_signing_lock_store import write_signing_lock

    aid = "ag_revoke_token"
    _seed_signing_draft(aid)
    write_signing_lock(aid, {"locked_version_id": "v1"})
    token = _mint(agreement_id=aid, recipient_party_id="p2")
    jti = extract_jti_from_token(token)
    draft = load_draft(aid)
    # Token validation uses phase "signing" for mode=sign.
    record_invite_sent(
        draft,
        phase="signing",
        participant_id="p2",
        jti=jti,
        email="c@example.com",
        audit_log=draft.setdefault("audit_log", []),
    )
    supersede_active_invite(
        draft, phase="signing", participant_id="p2", audit_log=draft["audit_log"]
    )
    save_draft(draft)

    revoked = client.post(
        f"/api/agreements/{aid}/vs01-signer-complete",
        headers={"X-Claw-Recipient-Access-Token": token},
        json={"signer_role_id": "role_cp", "participant_id": "p2", "document_id": "doc_vs01"},
    )
    assert revoked.status_code == 403
    detail = revoked.json().get("detail") or {}
    assert detail.get("code") == "invite_superseded"
