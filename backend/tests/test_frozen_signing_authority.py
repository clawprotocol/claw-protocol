"""Phase 3B — durable frozen signing authority persistence and lifecycle."""

from __future__ import annotations

from backend.tests.entitlement_test_support import ensure_headers_entitled, ensure_org_pro_entitlement

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.tests.auth_fixtures import persist_and_accept_review_snapshot

pytestmark = pytest.mark.unit

_ORG_H = {"X-Claw-Org-Id": "test-org-frozen-authority", "X-Claw-Test-Auth-User-Id": "test-owner"}


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

_CORPUS = "x" * 1600


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


def _create_agreement(client: TestClient) -> str:
    ensure_headers_entitled(_ORG_H)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Frozen Authority Agreement",
            "jurisdiction": "TX",
            "parties": [
                {"id": "p_owner", "name": "Alpha LLC", "role": "owner", "email": "owner@example.com"},
                {"id": "p_cp", "name": "Beta LLC", "role": "party", "email": "cp@example.com"},
            ],
            "purpose": "Services",
            "payment_terms": "Net 30",
        },
    )
    assert create_res.status_code == 200
    return create_res.json()["id"]


def _frozen_snapshot(aid: str, corpus_hash: str = "abc123") -> dict:
    return {
        "version": 1,
        "agreementId": aid,
        "agreementSessionId": "sess_test",
        "frozenCorpusHash": corpus_hash,
        "frozenAt": "2026-07-08T00:00:00.000Z",
        "parties": [
            {
                "agreementPartyId": "party_alpha",
                "legalEntityName": "Alpha LLC",
                "canonicalOrder": 0,
            },
            {
                "agreementPartyId": "party_beta",
                "legalEntityName": "Beta LLC",
                "canonicalOrder": 1,
            },
        ],
        "signers": [
            {
                "signerRecordId": "signer:party_alpha:0",
                "agreementPartyId": "party_alpha",
                "signerEmail": "owner@example.com",
                "signingOrder": 0,
                "requiresSignature": True,
                "requiresInitials": True,
            },
            {
                "signerRecordId": "signer:party_beta:0",
                "agreementPartyId": "party_beta",
                "signerEmail": "cp@example.com",
                "signingOrder": 1,
                "requiresSignature": True,
                "requiresInitials": False,
            },
        ],
        "recipients": [
            {
                "recipientRecordId": "recipient:signer:signer:party_alpha:0",
                "agreementPartyId": "party_alpha",
                "signerRecordId": "signer:party_alpha:0",
                "recipientType": "signer",
                "email": "owner@example.com",
            },
            {
                "recipientRecordId": "recipient:signer:signer:party_beta:0",
                "agreementPartyId": "party_beta",
                "signerRecordId": "signer:party_beta:0",
                "recipientType": "signer",
                "email": "cp@example.com",
            },
        ],
        "execution": {
            "partyOrder": ["party_alpha", "party_beta"],
            "signerOrder": ["signer:party_alpha:0", "signer:party_beta:0"],
            "executionBlockHash": "exec_hash",
        },
    }


def _portable_packet(aid: str, corpus_hash: str = "abc123", corpus: str = _CORPUS) -> dict:
    return {
        "v": 1,
        "seed": {
            "v": 1,
            "documentId": "doc_frozen",
            "agreementId": aid,
            "corpusHash": corpus_hash,
            "corpusPlain": corpus,
        },
        "fields": [],
        "roles": [
            {"roleId": "role_owner", "vs01CounterpartyId": "party_alpha", "partyIndex": 0, "requiresSignature": True},
            {"roleId": "role_cp", "vs01CounterpartyId": "party_beta", "partyIndex": 1, "requiresSignature": True},
        ],
        "fieldCount": 0,
        "initialsPolicy": {"enabled": True},
    }


def _accept_default(client: TestClient, aid: str) -> dict:
    return persist_and_accept_review_snapshot(client, aid, _CORPUS, headers=_ORG_H)


def test_frozen_signing_authority_persist_and_read(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    snap = _frozen_snapshot(aid)
    res = client.post(
        f"/api/agreements/{aid}/frozen-signing-authority",
        headers=_ORG_H,
        json={"snapshot": snap, "packet_state": "draft"},
    )
    assert res.status_code == 200
    get_res = client.get(f"/api/agreements/{aid}/frozen-signing-authority", headers=_ORG_H)
    assert get_res.status_code == 200
    payload = get_res.json()
    assert payload["snapshot"]["frozenCorpusHash"] == "abc123"
    assert payload["status_counts"]["required_signer_count"] == 2
    assert payload["status_counts"]["legal_party_count"] == 2


def test_signing_links_sent_requires_frozen_authority_for_portable_packet(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    accepted = _accept_default(client, aid)
    body = {
        "packet_revision": "rev_1",
        "document_id": "doc_frozen",
        "portable_packet": _portable_packet(aid),
        "accepted_review_snapshot_id": accepted["snapshot_id"],
        "accepted_review_snapshot_digest": accepted["corpus_sha256"],
        "targets": [],
    }
    res = client.post(f"/api/agreements/{aid}/signing-links-sent", headers=_ORG_H, json=body)
    assert res.status_code == 400
    detail = res.json().get("detail")
    assert isinstance(detail, dict)
    assert detail.get("code") == "frozen_signing_authority_required"


def test_signing_links_sent_rejects_corpus_hash_mismatch(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    accepted = _accept_default(client, aid)
    snap = _frozen_snapshot(aid, corpus_hash="wrong_hash")
    body = {
        "packet_revision": "rev_1",
        "document_id": "doc_frozen",
        "portable_packet": _portable_packet(aid, corpus_hash="abc123"),
        "frozen_signing_authority": snap,
        "accepted_review_snapshot_id": accepted["snapshot_id"],
        "accepted_review_snapshot_digest": accepted["corpus_sha256"],
        "targets": [],
    }
    res = client.post(f"/api/agreements/{aid}/signing-links-sent", headers=_ORG_H, json=body)
    assert res.status_code == 400
    detail = res.json().get("detail")
    assert isinstance(detail, dict)
    assert detail.get("code") == "corpus_hash_mismatch"


def test_signing_links_sent_persists_frozen_authority_atomically(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    accepted = _accept_default(client, aid)
    snap = _frozen_snapshot(aid)
    body = {
        "packet_revision": "rev_active",
        "document_id": "doc_frozen",
        "portable_packet": _portable_packet(aid),
        "frozen_signing_authority": snap,
        "accepted_review_snapshot_id": accepted["snapshot_id"],
        "accepted_review_snapshot_digest": accepted["corpus_sha256"],
        "targets": [],
    }
    res = client.post(f"/api/agreements/{aid}/signing-links-sent", headers=_ORG_H, json=body)
    assert res.status_code == 200
    draft = res.json()["draft"]
    assert draft["frozen_signing_authority_v1"]["packetState"] == "active"
    assert draft["vs01_signing_packet_v1"]["packet_state"] == "active"
    get_res = client.get(f"/api/agreements/{aid}/frozen-signing-authority", headers=_ORG_H)
    assert get_res.status_code == 200


def test_cancelled_packet_public_endpoint_fails_closed(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    accepted = _accept_default(client, aid)
    snap = _frozen_snapshot(aid)
    body = {
        "packet_revision": "rev_cancel",
        "document_id": "doc_frozen",
        "portable_packet": _portable_packet(aid),
        "frozen_signing_authority": snap,
        "accepted_review_snapshot_id": accepted["snapshot_id"],
        "accepted_review_snapshot_digest": accepted["corpus_sha256"],
        "targets": [],
    }
    client.post(f"/api/agreements/{aid}/signing-links-sent", headers=_ORG_H, json=body)
    cancel = client.post(f"/api/agreements/{aid}/signing-packet/cancel", headers=_ORG_H, json={})
    assert cancel.status_code == 200
    get_res = client.get(
        f"/api/agreements/public/{aid}/vs01-signing-packet",
        params={"document_id": "doc_frozen", "packet_revision": "rev_cancel"},
    )
    assert get_res.status_code == 403
    detail = get_res.json().get("detail")
    assert isinstance(detail, dict)
    assert detail.get("code") == "packet_cancelled"


def test_reissue_supersedes_prior_revision(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    accepted = _accept_default(client, aid)
    snap = _frozen_snapshot(aid)
    body = {
        "packet_revision": "rev_v1",
        "document_id": "doc_frozen",
        "portable_packet": _portable_packet(aid),
        "frozen_signing_authority": snap,
        "accepted_review_snapshot_id": accepted["snapshot_id"],
        "accepted_review_snapshot_digest": accepted["corpus_sha256"],
        "targets": [],
    }
    client.post(f"/api/agreements/{aid}/signing-links-sent", headers=_ORG_H, json=body)
    reissue = client.post(
        f"/api/agreements/{aid}/signing-packet/reissue",
        headers=_ORG_H,
        json={
            "packet_revision": "rev_v2",
            "document_id": "doc_frozen",
            "portable_packet": _portable_packet(aid),
            "frozen_signing_authority": snap,
            "accepted_review_snapshot_id": accepted["snapshot_id"],
            "accepted_review_snapshot_digest": accepted["corpus_sha256"],
        },
    )
    assert reissue.status_code == 200
    payload = reissue.json()
    assert payload["packet_state"] == "active"
    assert payload["superseded_revision"] == "rev_v1"
    draft = payload["draft"]
    assert draft["vs01_signing_packet_v1"]["packet_revision"] == "rev_v2"
    assert draft["frozen_signing_authority_v1"]["activePacketRevision"] == "rev_v2"


def test_unsupported_snapshot_version_rejected(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    snap = _frozen_snapshot(aid)
    snap["version"] = 99
    res = client.post(
        f"/api/agreements/{aid}/frozen-signing-authority",
        headers=_ORG_H,
        json={"snapshot": snap},
    )
    assert res.status_code == 400
    detail = res.json().get("detail")
    assert isinstance(detail, dict)
    assert detail.get("code") == "unsupported_version"
