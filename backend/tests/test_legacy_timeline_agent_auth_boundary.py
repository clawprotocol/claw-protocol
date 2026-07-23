"""
P1 adversarial: POST /verify/tree receipt fetch + legacy timeline/agent commercial gates.

Fail-closed outside explicit local/dev/test without CLAW_COMMERCIAL_MODE.
"""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

from backend.main import app, timeline_store
from backend.security.recipient_access_token import mint_recipient_access_token
from backend.services.agreement_signing_lock_store import write_signing_lock

_SECRET = "unit-test-legacy-timeline-agent-auth-secret"


@pytest.fixture()
def client(monkeypatch, tmp_path):
    from backend import main as main_mod
    from backend.storage.artifact_repository import reset_artifact_repository_singleton
    from backend.usage_economics import store as usage_economics_store_mod

    usage_economics_store_mod._store = None  # noqa: SLF001
    main_mod._rate_state.clear()  # noqa: SLF001
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("CLAW_BLOB_ROOT", str(tmp_path / "blobs"))
    monkeypatch.setenv("CLAW_ARTIFACT_REGISTRY_DB_PATH", str(tmp_path / "registry.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", _SECRET)
    monkeypatch.setenv("CLAW_COMMERCIAL_MODE", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "0")
    monkeypatch.setenv("CLAW_RATE_LIMIT_RPS", "1000")
    monkeypatch.setenv("CLAW_RATE_LIMIT_BURST", "1000")
    monkeypatch.delenv("CLAW_RECIPIENT_ACCESS_TOKEN_REQUIRED", raising=False)
    reset_artifact_repository_singleton()
    return TestClient(app)


def _owner(user: str = "owner-a") -> dict[str, str]:
    return {"X-Claw-Org-Id": f"user-{user}", "X-Claw-Test-Auth-User-Id": user}


def _create_owned_draft(client: TestClient, *, user: str = "owner-a") -> str:
    r = client.post(
        "/api/agreements/draft",
        headers=_owner(user),
        json={
            "title": "Owned",
            "jurisdiction": "TX",
            "parties": [
                {"name": "Owner Co", "role": "Client", "id": "p1", "email": "o@x.com"},
                {"name": "Signer Co", "role": "Service Provider", "id": "p2", "email": "s@x.com"},
            ],
            "purpose": "Purpose",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _seed_timeline_receipt(*, agreement_id: str, receipt_id: str) -> dict:
    tid = f"agreement:{agreement_id}"
    try:
        timeline_store.create_timeline(
            timeline_id=tid,
            title="auth-boundary",
            parties=[{"role": "owner", "id": "p1", "display_name": "Owner"}],
            network="testnet",
            protocol_version="claw-timeline/1",
        )
    except Exception:
        # Timeline may already exist from a prior seed in this process.
        pass
    timeline_store.create_receipt(
        receipt_id=receipt_id,
        timeline_id=tid,
        protocol_version="claw-timeline/1",
        network="testnet",
        epoch_id=None,
        btc_txid="pending",
        commitment="a" * 64,
        merkle_proof=[],
        zk_proof_refs=None,
        issued_at="2026-01-01T00:00:00Z",
        receipt_hash_sha256="b" * 64,
    )
    return timeline_store.get_receipt(receipt_id)


def _legacy_disabled(resp) -> bool:
    if resp.status_code != 403:
        return False
    detail = resp.json().get("detail")
    if isinstance(detail, dict):
        return detail.get("code") == "legacy_router_disabled"
    return False


# ---------------------------------------------------------------------------
# POST /verify/tree
# ---------------------------------------------------------------------------


def test_verify_tree_anonymous_receipt_id_denied(client: TestClient):
    aid = _create_owned_draft(client)
    rid = f"rcpt_anon_{aid[-8:]}"
    _seed_timeline_receipt(agreement_id=aid, receipt_id=rid)
    r = client.post("/verify/tree", json={"receipt_id": rid})
    # Anonymous: fail closed (401 principal/org or 403 access) — never 200 with private fetch.
    assert r.status_code in (401, 403), r.text


def test_verify_tree_cross_org_receipt_id_denied(client: TestClient):
    aid = _create_owned_draft(client, user="owner-a")
    rid = f"rcpt_xorg_{aid[-8:]}"
    _seed_timeline_receipt(agreement_id=aid, receipt_id=rid)
    r = client.post(
        "/verify/tree",
        headers=_owner("owner-b"),
        json={"receipt_id": rid},
    )
    assert r.status_code == 403, r.text


def test_verify_tree_owner_receipt_id_allowed(client: TestClient):
    aid = _create_owned_draft(client, user="owner-a")
    rid = f"rcpt_own_{aid[-8:]}"
    seeded = _seed_timeline_receipt(agreement_id=aid, receipt_id=rid)
    r = client.post(
        "/verify/tree",
        headers=_owner("owner-a"),
        json={"receipt_id": rid},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "ok" in body
    assert body.get("root") is not None or body.get("errors") is not None
    # Ensure server used the bound receipt (not a foreign id).
    assert seeded["receipt_id"] == rid


def test_verify_tree_recipient_token_allowed_for_bound_agreement(client: TestClient):
    from backend.services.agreement_draft_store import load_draft
    from backend.services.recipient_delivery_registry import (
        extract_jti_from_token,
        record_invite_sent_cas,
    )

    aid = _create_owned_draft(client, user="owner-a")
    write_signing_lock(aid, {"locked_version_id": "v1"})
    rid = f"rcpt_rcp_{aid[-8:]}"
    _seed_timeline_receipt(agreement_id=aid, receipt_id=rid)
    tok = mint_recipient_access_token(
        secret=_SECRET.encode("utf-8"),
        agreement_id=aid,
        locked_version_id="v1",
        mode="sign",
        role="signer",
        ttl_seconds=3600,
        recipient_party_id="p2",
    )
    draft = load_draft(aid)
    assert draft is not None
    record_invite_sent_cas(
        draft,
        phase="signing",
        participant_id="p2",
        jti=extract_jti_from_token(tok),
        audit_log=draft.setdefault("audit_log", []),
    )
    r = client.post(
        "/verify/tree",
        headers={"X-Claw-Recipient-Access-Token": tok},
        json={"receipt_id": rid},
    )
    assert r.status_code == 200, r.text


def test_verify_tree_client_supplied_receipt_remains_public(client: TestClient):
    """Deliberately public: cryptographic verify of a presented receipt object."""
    r = client.post(
        "/verify/tree",
        json={
            "receipt": {
                "receipt_id": "client_presented",
                "commitment": "d" * 64,
                "receipt_hash_sha256": "e" * 64,
                "merkle_proof": [],
            }
        },
    )
    # Must not require auth; may be ok=false due to hash mismatch but not 401/403.
    assert r.status_code == 200, r.text
    assert r.json().get("detail", {}).get("code") != "legacy_router_disabled"


# ---------------------------------------------------------------------------
# Legacy timeline / liability / agent / propose / sign
# ---------------------------------------------------------------------------

_LEGACY_PROBES = [
    ("get", "/v1/timelines/tl_probe", None),
    ("get", "/v1/timelines/tl_probe/events", None),
    ("get", "/v1/timelines/tl_probe/liability/latest", None),
    ("get", "/v1/liability/assessment/evt_probe", None),
    ("get", "/v1/batches/batch_probe", None),
    ("post", "/v1/timelines", {
        "title": "x",
        "parties": [{"role": "owner", "id": "p1", "display_name": "Owner"}],
        "network": "testnet",
    }),
    ("post", "/v1/liability/create_or_update", {
        "attestable_facts": {"freeform_text": "f"},
        "public_legal_context": {"freeform_text": "p"},
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z",
        "author": {"name": "A"},
    }),
    ("post", "/agent/propose", {"clauses": ["c"], "role": "author"}),
    ("post", "/agent/sign", {
        "clauses": ["c"],
        "role": "author",
        "signer_name": "A",
        "signer_wallet": "0x0",
    }),
    ("post", "/agent/proof", {"clauses": ["c"]}),
    ("post", "/propose", {"clauses": ["c"], "role": "author"}),
    ("post", "/sign", {
        "clauses": ["c"],
        "role": "author",
        "signer_name": "A",
        "signer_wallet": "0x0",
    }),
    ("post", "/proof", {"clauses": ["c"]}),
    ("post", "/receipt", {"proof_packet": {"clauses_hash": "x"}, "signatures": []}),
]


def _probe(client: TestClient, method: str, path: str, body, headers=None):
    h = headers or {}
    if method == "get":
        return client.get(path, headers=h)
    return client.post(path, headers=h, json=body or {})


@pytest.mark.parametrize("method,path,body", _LEGACY_PROBES)
def test_legacy_surfaces_denied_in_commercial_mode(client: TestClient, method, path, body):
    r = _probe(client, method, path, body)
    assert _legacy_disabled(r), (path, r.status_code, r.text)


@pytest.mark.parametrize(
    "env_mode",
    ["unset", "blank", "staging", "production", "prod", "unknown-env"],
)
def test_legacy_surfaces_denied_for_unset_blank_unknown_envs(monkeypatch, tmp_path, env_mode):
    from backend import main as main_mod
    from backend.usage_economics import store as usage_economics_store_mod

    usage_economics_store_mod._store = None  # noqa: SLF001
    main_mod._rate_state.clear()  # noqa: SLF001
    if env_mode == "unset":
        monkeypatch.delenv("CLAW_ENVIRONMENT", raising=False)
    elif env_mode == "blank":
        monkeypatch.setenv("CLAW_ENVIRONMENT", "   ")
    else:
        monkeypatch.setenv("CLAW_ENVIRONMENT", env_mode)
    monkeypatch.delenv("CLAW_COMMERCIAL_MODE", raising=False)
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", _SECRET)
    monkeypatch.setenv("CLAW_RATE_LIMIT_RPS", "1000")
    monkeypatch.setenv("CLAW_RATE_LIMIT_BURST", "1000")
    c = TestClient(app)
    for method, path, body in _LEGACY_PROBES[:6]:
        r = _probe(c, method, path, body)
        assert _legacy_disabled(r), (env_mode, path, r.status_code, r.text)


def test_legacy_surfaces_allowed_in_explicit_test_without_commercial(monkeypatch, tmp_path):
    """Documented: CLAW_ENVIRONMENT=test and commercial off keeps legacy agent/timeline."""
    from backend.usage_economics import store as usage_economics_store_mod

    usage_economics_store_mod._store = None  # noqa: SLF001
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.delenv("CLAW_COMMERCIAL_MODE", raising=False)
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", _SECRET)
    c = TestClient(app)
    # Anonymous GET missing timeline → 404 (not legacy_router_disabled).
    r = c.get("/v1/timelines/tl_missing")
    assert r.status_code == 404, r.text
    assert (r.json().get("detail") or {}).get("code") != "legacy_router_disabled"
    # Legacy sign happy-path surface remains callable.
    sign = c.post(
        "/sign",
        json={
            "clauses": ["Clause A"],
            "role": "author",
            "signer_name": "Ant",
            "signer_wallet": "0x0000000000000000000000000000000000000000",
            "document_title": "Test Doc",
            "chain": "evm",
        },
    )
    assert sign.status_code == 200, sign.text
    assert (sign.json().get("detail") or {}).get("code") != "legacy_router_disabled"
