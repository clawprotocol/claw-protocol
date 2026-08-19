"""Phase 3C — real API owner-session independence integration."""

from __future__ import annotations

from backend.tests.entitlement_test_support import ensure_headers_entitled, ensure_org_pro_entitlement

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.tests.auth_fixtures import persist_and_accept_review_snapshot

pytestmark = pytest.mark.unit

_ORG_H = {"X-Claw-Org-Id": "test-org-phase3c-integration", "X-Claw-Test-Auth-User-Id": "test-owner"}


@pytest.fixture(autouse=True)
def _entitle_owner_org_after_env(tmp_path, monkeypatch):
    """Grant Pro for module owner headers once tmp_path-backed DBs are configured."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ONRAMP_DB_PATH", str(tmp_path / "onramp.sqlite3"))
    monkeypatch.setenv("CLAW_TREASURY_DB_PATH", str(tmp_path / "treasury.sqlite3"))
    from backend.economics.store import reset_economics_store_for_tests
    reset_economics_store_for_tests()
    ensure_headers_entitled(_ORG_H)
    yield
    reset_economics_store_for_tests()



@pytest.fixture(autouse=True)
def _reset_usage_economics_singleton():
    from backend.usage_economics import store as usage_economics_store_mod

    usage_economics_store_mod._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001


def _env_common(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))


def _frozen_snapshot(aid: str, corpus_hash: str = "abc123") -> dict:
    return {
        "version": 1,
        "agreementId": aid,
        "agreementSessionId": "sess_integration",
        "frozenCorpusHash": corpus_hash,
        "frozenAt": "2026-07-08T00:00:00.000Z",
        "parties": [
            {"agreementPartyId": "party_alpha", "legalEntityName": "Alpha LLC", "canonicalOrder": 0},
            {"agreementPartyId": "party_beta", "legalEntityName": "Beta LLC", "canonicalOrder": 1},
        ],
        "signers": [
            {
                "signerRecordId": "signer:party_alpha:0",
                "agreementPartyId": "party_alpha",
                "signerEmail": "owner@example.com",
                "signerName": "Owner Signer",
                "signingOrder": 0,
                "requiresSignature": True,
                "requiresInitials": True,
            },
            {
                "signerRecordId": "signer:party_beta:0",
                "agreementPartyId": "party_beta",
                "signerEmail": "cp@example.com",
                "signerName": "CP Signer",
                "signingOrder": 1,
                "requiresSignature": True,
                "requiresInitials": False,
            },
        ],
        "recipients": [],
        "execution": {
            "partyOrder": ["party_alpha", "party_beta"],
            "signerOrder": ["signer:party_alpha:0", "signer:party_beta:0"],
            "executionBlockHash": "exec_hash",
        },
    }


def _portable(aid: str, corpus_hash: str = "abc123") -> dict:
    corpus = "SERVICES AGREEMENT\n\nTerms here.\n\nIN WITNESS WHEREOF\n\nCLIENT:\nBeta LLC\n\nSERVICE PROVIDER:\nAlpha LLC"
    return {
        "v": 1,
        "seed": {
            "v": 1,
            "documentId": "doc_phase3c",
            "agreementId": aid,
            "corpusHash": corpus_hash,
            "corpusPlain": corpus + "\n" + ("x" * 1400),
        },
        "fields": [],
        "roles": [
            {
                "roleId": "role_owner",
                "partyId": "party_alpha",
                "vs01CounterpartyId": "party_alpha",
                "partyIndex": 0,
                "entityName": "Alpha LLC",
                "signerEmail": "owner@example.com",
                "requiresSignature": True,
                "kind": "owner",
            },
            {
                "roleId": "role_cp",
                "partyId": "party_beta",
                "vs01CounterpartyId": "party_beta",
                "partyIndex": 1,
                "entityName": "Beta LLC",
                "signerEmail": "cp@example.com",
                "requiresSignature": True,
                "kind": "party",
            },
        ],
        "fieldCount": 0,
        "initialsPolicy": {"enabled": True},
    }


def test_phase3c_owner_session_independence_full_api_lifecycle(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    """Create → persist frozen → activate → read without any browser state."""
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app)
    ensure_headers_entitled(_ORG_H)
    create = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Phase 3C Integration Agreement",
            "jurisdiction": "TX",
            "parties": [
                {"id": "party_alpha", "name": "Alpha LLC", "role": "owner", "email": "owner@example.com"},
                {"id": "party_beta", "name": "Beta LLC", "role": "party", "email": "cp@example.com"},
            ],
            "purpose": "Integration test",
            "payment_terms": "Net 30",
        },
    )
    assert create.status_code == 200
    aid = create.json()["id"]
    snap = _frozen_snapshot(aid)
    portable = _portable(aid)
    corpus = str(portable["seed"]["corpusPlain"])
    accepted = persist_and_accept_review_snapshot(client, aid, corpus, headers=_ORG_H)

    activate = client.post(
        f"/api/agreements/{aid}/signing-links-sent",
        headers=_ORG_H,
        json={
            "packet_revision": "rev_phase3c",
            "document_id": "doc_phase3c",
            "portable_packet": portable,
            "frozen_signing_authority": snap,
            "accepted_review_snapshot_id": accepted["snapshot_id"],
            "accepted_review_snapshot_digest": accepted["corpus_sha256"],
            "targets": [],
        },
    )
    assert activate.status_code == 200

    frozen_get = client.get(f"/api/agreements/{aid}/frozen-signing-authority", headers=_ORG_H)
    assert frozen_get.status_code == 200
    frozen_payload = frozen_get.json()
    assert frozen_payload["status_counts"]["required_signer_count"] == 2
    assert frozen_payload["snapshot"]["signers"][0]["signerName"] == "Owner Signer"

    draft_get = client.get(f"/api/agreements/{aid}", headers=_ORG_H)
    assert draft_get.status_code == 200
    draft = draft_get.json()["draft"]
    assert draft["frozen_signing_authority_v1"]["packetState"] == "active"
    assert draft["vs01_signing_packet_v1"]["packet_state"] == "active"

    public_packet = client.get(
        f"/api/agreements/public/{aid}/vs01-signing-packet",
        params={"document_id": "doc_phase3c", "packet_revision": "rev_phase3c", "participant_id": "party_beta"},
    )
    assert public_packet.status_code == 200
    pub = public_packet.json()
    assert pub["ok"] is True
    assert "recipient_projection" in pub
    assert pub["recipient_projection"]["signerName"] == "CP Signer"

    cancel = client.post(f"/api/agreements/{aid}/signing-packet/cancel", headers=_ORG_H, json={})
    assert cancel.status_code == 200
    blocked = client.get(
        f"/api/agreements/public/{aid}/vs01-signing-packet",
        params={"document_id": "doc_phase3c", "packet_revision": "rev_phase3c"},
    )
    assert blocked.status_code == 403


def test_completed_agreement_parity_rejects_operative_mutation() -> None:
    from backend.services.completed_agreement_parity import validate_completed_agreement_authorized_delta

    frozen = "Agreement body\n\nPayment: $100\n\nIN WITNESS WHEREOF\n\nCLIENT:\nBeta"
    mutated = "Agreement body\n\nPayment: $999\n\nIN WITNESS WHEREOF\n\nCLIENT:\nBeta"
    ok, code, _ = validate_completed_agreement_authorized_delta(
        frozen_corpus=frozen,
        completed_corpus=mutated,
    )
    assert ok is False
    assert code == "operative_clause_mutation"
