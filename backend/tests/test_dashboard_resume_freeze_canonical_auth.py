"""Dashboard signer-setup resume: durable freeze + canonical snapshot owner auth."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.tests.conftest_auth_security import make_authenticated_user_headers

pytestmark = pytest.mark.unit

_CORPUS = (
    "SERVICES AGREEMENT\n\n"
    + ("Operative clause for durable finalize. " * 80)
    + "\n\nIN WITNESS WHEREOF.\n\nCLIENT:\nAcme\nName: Alice\nTitle: CEO\n"
    + "SERVICE PROVIDER:\nLawDog\nName: Bob\nTitle: GC\n"
)


@pytest.fixture()
def client(monkeypatch, tmp_path):
    from backend.storage.artifact_repository import reset_artifact_repository_singleton
    from backend.usage_economics import store as usage_economics_store_mod
    from backend.economics import store as economics_store_mod

    usage_economics_store_mod._store = None  # noqa: SLF001
    economics_store_mod._store = None  # noqa: SLF001
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("CLAW_BLOB_ROOT", str(tmp_path / "blobs"))
    monkeypatch.setenv("CLAW_ARTIFACT_REGISTRY_DB_PATH", str(tmp_path / "registry.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_COMMERCIAL_MODE", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_NODE_MODE", "api")
    reset_artifact_repository_singleton()
    return TestClient(app)


def _grant_genesis(user_id: str) -> None:
    from backend.tests.entitlement_test_support import ensure_org_pro_entitlement

    ensure_org_pro_entitlement(f\"user-{user_id}\", user_id=user_id)


def _create_owned_draft(client: TestClient, *, user: str) -> str:
    headers = make_authenticated_user_headers(user)
    r = client.post(
        "/api/agreements/draft",
        headers={**headers, "Content-Type": "application/json"},
        json={
            "title": "Resume Durable",
            "jurisdiction": "TX",
            "parties": [
                {"name": "Acme", "role": "Client", "id": "p1", "email": "a@x.com"},
                {"name": "LawDog", "role": "Service Provider", "id": "p2", "email": "b@x.com"},
            ],
            "purpose": "Services",
            "payment_terms": "Net 30",
        },
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _frozen(aid: str) -> dict:
    return {
        "version": 1,
        "agreementId": aid,
        "agreementSessionId": "sess_resume",
        "frozenCorpusHash": "hash_resume",
        "frozenAt": "2026-08-02T00:00:00.000Z",
        "parties": [
            {"agreementPartyId": "party_a", "legalEntityName": "Acme", "canonicalOrder": 0},
            {"agreementPartyId": "party_b", "legalEntityName": "LawDog", "canonicalOrder": 1},
        ],
        "signers": [
            {
                "signerRecordId": "signer:party_a:0",
                "agreementPartyId": "party_a",
                "signerName": "Alice",
                "signerTitle": "CEO",
                "signerEmail": "a@x.com",
                "signingOrder": 0,
                "requiresSignature": True,
                "requiresInitials": False,
            },
            {
                "signerRecordId": "signer:party_b:0",
                "agreementPartyId": "party_b",
                "signerName": "Bob",
                "signerTitle": "GC",
                "signerEmail": "b@x.com",
                "signingOrder": 1,
                "requiresSignature": True,
                "requiresInitials": False,
            },
        ],
        "recipients": [
            {
                "recipientRecordId": "recipient:signer:signer:party_a:0",
                "agreementPartyId": "party_a",
                "signerRecordId": "signer:party_a:0",
                "recipientType": "signer",
                "email": "a@x.com",
            },
            {
                "recipientRecordId": "recipient:signer:signer:party_b:0",
                "agreementPartyId": "party_b",
                "signerRecordId": "signer:party_b:0",
                "recipientType": "signer",
                "email": "b@x.com",
            },
        ],
        "execution": {
            "partyOrder": ["party_a", "party_b"],
            "signerOrder": ["signer:party_a:0", "signer:party_b:0"],
            "executionBlockHash": "exec_hash",
        },
    }


def test_genesis_owner_can_post_freeze_and_canonical_after_ttl_window(client: TestClient):
    """Genesis entitled owners must not get draft_expired on freeze/snapshot mutations."""
    uid = "genesis-resume-owner"
    _grant_genesis(uid)
    headers = make_authenticated_user_headers(uid)
    aid = _create_owned_draft(client, user=uid)

    from backend.usage_economics.store import get_usage_economics_store

    store = get_usage_economics_store()
    store.init_schema()
    # Age the ownership row beyond guest TTL while leaving it incomplete.
    old = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat().replace("+00:00", "Z")
    if store._pg:  # noqa: SLF001
        pytest.skip("sqlite path only for created_at backdate")
    with store._conn() as con:  # noqa: SLF001
        con.execute(
            "UPDATE agreement_owner SET created_at = ? WHERE agreement_id = ?",
            (old, aid),
        )
        con.commit()

    from backend.usage_economics.policy import economics_overlay_for_agreement

    overlay = economics_overlay_for_agreement(aid)
    assert overlay["free_draft_expired"] is False
    assert overlay["tier"] in ("genesis", "paid")

    snap = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot",
        headers={**headers, "Content-Type": "application/json"},
        json={"corpus_plain": _CORPUS, "generation_session_id": "gen_resume"},
    )
    assert snap.status_code == 200, snap.text

    freeze = client.post(
        f"/api/agreements/{aid}/frozen-signing-authority",
        headers={**headers, "Content-Type": "application/json"},
        json={"snapshot": _frozen(aid), "packet_state": "draft"},
    )
    assert freeze.status_code == 200, freeze.text

    got = client.get(f"/api/agreements/{aid}/canonical-review-snapshot", headers=headers)
    assert got.status_code == 200, got.text
    body = got.json()
    assert (body.get("snapshot") or {}).get("corpus_length") == len(_CORPUS.strip())


def test_ownership_repair_from_draft_metadata_allows_freeze(client: TestClient, monkeypatch):
    uid = "repair-resume-owner"
    _grant_genesis(uid)
    headers = make_authenticated_user_headers(uid)
    aid = _create_owned_draft(client, user=uid)

    from backend.services.agreement_draft_store import load_draft, save_draft
    from backend.usage_economics.store import get_usage_economics_store

    store = get_usage_economics_store()
    store.init_schema()
    # Drop ownership row but keep draft metadata pointing at the same subject.
    if store._pg:  # noqa: SLF001
        pytest.skip("sqlite path only")
    with store._conn() as con:  # noqa: SLF001
        con.execute("DELETE FROM agreement_owner WHERE agreement_id = ?", (aid,))
        con.commit()
    assert store.owner_subject_for_agreement(aid) is None

    draft = load_draft(aid)
    assert isinstance(draft, dict)
    draft["workspace_meta"] = {"subject_ref": f"org:user-{uid}", "org_id": f"user-{uid}"}
    save_draft(draft)

    freeze = client.post(
        f"/api/agreements/{aid}/frozen-signing-authority",
        headers={**headers, "Content-Type": "application/json"},
        json={"snapshot": _frozen(aid), "packet_state": "draft"},
    )
    assert freeze.status_code == 200, freeze.text
    assert store.owner_subject_for_agreement(aid) == f"org:user-{uid}"


def test_foreign_user_still_cannot_freeze(client: TestClient):
    uid = "owner-freeze-a"
    attacker = "owner-freeze-b"
    _grant_genesis(uid)
    _grant_genesis(attacker)
    aid = _create_owned_draft(client, user=uid)
    bad = client.post(
        f"/api/agreements/{aid}/frozen-signing-authority",
        headers={**make_authenticated_user_headers(attacker), "Content-Type": "application/json"},
        json={"snapshot": _frozen(aid), "packet_state": "draft"},
    )
    assert bad.status_code == 403
    detail = bad.json().get("detail") or {}
    assert detail.get("code") in {"workspace_mismatch", "ownership_not_registered"}
