"""Adversarial tests: server-accepted review snapshot is commercial first-seal authority."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services.accepted_review_snapshot import sha256_hex_text
from backend.services.vs01_signing_envelope_provenance import (
    build_vs01_signing_envelope_provenance,
    fingerprint_agreement_body,
)

pytestmark = pytest.mark.unit

_ORG_H = {
    "X-Claw-Org-Id": "test-org-accepted-snapshot",
    "X-Claw-Test-Auth-User-Id": "owner-accepted-snapshot",
}
_ORG_B = {
    "X-Claw-Org-Id": "test-org-other-customer",
    "X-Claw-Test-Auth-User-Id": "other-customer",
}
_SECRET = "unit-test-accepted-review-snapshot-secret"


@pytest.fixture(autouse=True)
def _reset_usage_economics_singleton():
    from backend.usage_economics import store as usage_economics_store_mod

    usage_economics_store_mod._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001


def _env(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <notifications@lawdog.me>")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", _SECRET)
    monkeypatch.setenv("CLAW_PUBLIC_AGREEMENT_VERIFY", "1")
    monkeypatch.delenv("CLAW_COMMERCIAL_MODE", raising=False)


def _mock_resend_success() -> MagicMock:
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = '{"id":"msg_ok"}'
    mock_response.json.return_value = {"id": "msg_ok"}
    mock_client = MagicMock()
    mock_client.post.return_value = mock_response
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    return mock_client


def _create_agreement(client: TestClient, headers=None) -> str:
    create_res = client.post(
        "/api/agreements/draft",
        headers=headers or _ORG_H,
        json={
            "title": "Services Agreement",
            "jurisdiction": "TX",
            "parties": [
                {
                    "id": "p_owner",
                    "name": "Red Mesa Logistics LLC",
                    "role": "owner",
                    "email": "owner@example.com",
                },
                {
                    "id": "p_cp",
                    "name": "Harbor Peak Automation LLC",
                    "role": "party",
                    "email": "cp@example.com",
                },
            ],
            "purpose": "Services",
            "payment_terms": "Net 30",
        },
    )
    assert create_res.status_code == 200
    return create_res.json()["id"]


def _roles() -> list:
    return [
        {
            "roleId": "role_owner",
            "partyId": "p_owner",
            "partyIndex": 0,
            "kind": "owner",
            "entityName": "Red Mesa Logistics LLC",
            "partyName": "Red Mesa Logistics LLC",
            "requiresSignature": True,
            "vs01CounterpartyId": "owner",
        },
        {
            "roleId": "role_cp",
            "partyId": "p_cp",
            "partyIndex": 1,
            "kind": "counterparty",
            "entityName": "Harbor Peak Automation LLC",
            "partyName": "Harbor Peak Automation LLC",
            "requiresSignature": True,
            "vs01CounterpartyId": "cp",
        },
    ]


def _corpus(tag: str = "A") -> str:
    return (f"OPERATIVE TERMS {tag}.\n\n" + (tag * 1600)).strip()


def _portable(aid: str, corpus: str, roles=None, provenance=None) -> dict:
    corpus = corpus.strip()
    body = {
        "v": 1,
        "seed": {
            "v": 1,
            "documentId": "doc_snap_auth",
            "agreementId": aid,
            "corpusHash": fingerprint_agreement_body(corpus),
            "corpusPlain": corpus,
        },
        "fields": [],
        "roles": roles if roles is not None else _roles(),
        "fieldCount": 0,
        "initialsPolicy": {"enabled": True},
    }
    if provenance is not None:
        body["envelopeProvenance"] = provenance
    return body


def _frozen(aid: str, corpus: str) -> dict:
    return {
        "version": 1,
        "agreementId": aid,
        "agreementSessionId": "sess_snap_auth",
        "frozenCorpusHash": fingerprint_agreement_body(corpus),
        "frozenAt": "2026-07-08T00:00:00.000Z",
        "parties": [
            {
                "agreementPartyId": "p_owner",
                "legalEntityName": "Red Mesa Logistics LLC",
                "canonicalOrder": 0,
            },
            {
                "agreementPartyId": "p_cp",
                "legalEntityName": "Harbor Peak Automation LLC",
                "canonicalOrder": 1,
            },
        ],
        "signers": [
            {
                "signerRecordId": "signer:p_owner:0",
                "agreementPartyId": "p_owner",
                "signerEmail": "owner@example.com",
                "signingOrder": 0,
                "requiresSignature": True,
                "requiresInitials": False,
            },
            {
                "signerRecordId": "signer:p_cp:0",
                "agreementPartyId": "p_cp",
                "signerEmail": "cp@example.com",
                "signingOrder": 1,
                "requiresSignature": True,
                "requiresInitials": False,
            },
        ],
        "recipients": [],
        "execution": {
            "partyOrder": ["p_owner", "p_cp"],
            "signerOrder": ["signer:p_owner:0", "signer:p_cp:0"],
            "executionBlockHash": "exec",
        },
    }


def _persist_and_accept(client: TestClient, aid: str, corpus: str, headers=None) -> dict:
    h = headers or _ORG_H
    create = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot",
        headers=h,
        json={
            "corpus_plain": corpus,
            "generation_session_id": "gen_snap_auth",
            "claimed_digest": sha256_hex_text(corpus),
        },
    )
    assert create.status_code == 200, create.text
    snap = create.json()["snapshot"]
    accept = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot/accept",
        headers=h,
        json={
            "snapshot_id": snap["snapshot_id"],
            "expected_digest": snap["corpus_sha256"],
            "expected_accepted_snapshot_id": "",
            "accepting_session": "gen_snap_auth",
        },
    )
    assert accept.status_code == 200, accept.text
    return accept.json()["accepted"]


def _dispatch(client: TestClient, aid: str, portable: dict, corpus: str, **extra):
    body = {
        "packet_revision": "rev_snap_auth",
        "document_id": "doc_snap_auth",
        "portable_packet": portable,
        "frozen_signing_authority": _frozen(aid, corpus),
        "targets": [],
        **extra,
    }
    with patch(
        "backend.services.email.resend_client.httpx.Client",
        return_value=_mock_resend_success(),
    ):
        return client.post(f"/api/agreements/{aid}/signing-links-sent", headers=_ORG_H, json=body)


def test_first_dispatch_rejects_altered_corpus_plain(monkeypatch, tmp_path):
    _env(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    corpus_a = _corpus("A")
    corpus_b = _corpus("B")
    accepted = _persist_and_accept(client, aid, corpus_a)
    portable = _portable(aid, corpus_b)
    res = _dispatch(
        client,
        aid,
        portable,
        corpus_b,
        accepted_review_snapshot_id=accepted["snapshot_id"],
        accepted_review_snapshot_digest=accepted["corpus_sha256"],
    )
    assert res.status_code == 400
    assert res.json()["detail"]["code"] == "submitted_corpus_differs_from_accepted_snapshot"


def test_dispatch_without_accepted_snapshot_fails_closed(monkeypatch, tmp_path):
    _env(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    corpus = _corpus("A")
    res = _dispatch(client, aid, _portable(aid, corpus), corpus)
    assert res.status_code == 400
    assert res.json()["detail"]["code"] == "accepted_review_snapshot_required"


def test_snapshot_id_from_other_agreement_rejected(monkeypatch, tmp_path):
    _env(monkeypatch, tmp_path)
    client = TestClient(app)
    aid_a = _create_agreement(client)
    aid_b = _create_agreement(client)
    corpus = _corpus("A")
    accepted_b = _persist_and_accept(client, aid_b, corpus)
    _persist_and_accept(client, aid_a, corpus)
    # Try to correlate A's dispatch to B's snapshot id while using A's accepted corpus.
    portable = _portable(aid_a, corpus)
    portable["acceptedReviewSnapshotId"] = accepted_b["snapshot_id"]
    res = _dispatch(
        client,
        aid_a,
        portable,
        corpus,
        accepted_review_snapshot_id=accepted_b["snapshot_id"],
        accepted_review_snapshot_digest=accepted_b["corpus_sha256"],
    )
    assert res.status_code == 400
    assert res.json()["detail"]["code"] in {
        "submitted_snapshot_id_mismatch",
        "submitted_digest_differs_from_accepted_snapshot",
    }


def test_accepted_digest_with_different_bytes_rejected(monkeypatch, tmp_path):
    _env(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    corpus = _corpus("A")
    accepted = _persist_and_accept(client, aid, corpus)
    # Honest digest in provenance but different seed bytes — bind rejects before attest.
    honest = build_vs01_signing_envelope_provenance(accepted_sot_plain=corpus, roles=_roles())
    tampered_bytes = (corpus + "\nTAMPER").strip()
    portable = _portable(aid, tampered_bytes, provenance=honest)
    res = _dispatch(
        client,
        aid,
        portable,
        tampered_bytes,
        accepted_review_snapshot_id=accepted["snapshot_id"],
        accepted_review_snapshot_digest=accepted["corpus_sha256"],
    )
    assert res.status_code == 400
    assert res.json()["detail"]["code"] == "submitted_corpus_differs_from_accepted_snapshot"


def test_concurrent_accept_of_two_snapshots_fails_closed(monkeypatch, tmp_path):
    _env(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    c1 = _corpus("A")
    c2 = _corpus("B")
    s1 = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot",
        headers=_ORG_H,
        json={"corpus_plain": c1, "generation_session_id": "g1"},
    ).json()["snapshot"]
    s2 = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot",
        headers=_ORG_H,
        json={"corpus_plain": c2, "generation_session_id": "g2"},
    ).json()["snapshot"]
    a1 = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot/accept",
        headers=_ORG_H,
        json={
            "snapshot_id": s1["snapshot_id"],
            "expected_digest": s1["corpus_sha256"],
            "expected_accepted_snapshot_id": "",
        },
    )
    assert a1.status_code == 200
    a2 = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot/accept",
        headers=_ORG_H,
        json={
            "snapshot_id": s2["snapshot_id"],
            "expected_digest": s2["corpus_sha256"],
            "expected_accepted_snapshot_id": "",
        },
    )
    assert a2.status_code == 409
    assert a2.json()["detail"]["code"] in {
        "different_snapshot_already_accepted",
        "accept_concurrency_conflict",
    }


def test_post_accept_snapshot_mutation_rejected(monkeypatch, tmp_path):
    _env(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    corpus = _corpus("A")
    accepted = _persist_and_accept(client, aid, corpus)
    # Directly corrupt persisted accepted corpus bytes.
    from backend.services.agreement_draft_store import load_draft, save_draft

    draft = load_draft(aid)
    snap = dict(draft["accepted_review_snapshot_v1"])
    snap["corpusPlain"] = (corpus + "\nMUTATED").strip()
    # Keep old digest intentionally — integrity must fail.
    draft["accepted_review_snapshot_v1"] = snap
    reg = draft["canonical_review_snapshots_v1"]
    reg["snapshots"][accepted["snapshot_id"]] = snap
    draft["canonical_review_snapshots_v1"] = reg
    save_draft({**draft, "id": aid})

    res = _dispatch(client, aid, _portable(aid, corpus), corpus)
    assert res.status_code == 400
    assert res.json()["detail"]["code"] in {
        "accepted_snapshot_digest_mismatch",
        "accepted_snapshot_length_mismatch",
    }


def test_reissue_substitution_rejected(monkeypatch, tmp_path):
    _env(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    corpus = _corpus("A")
    accepted = _persist_and_accept(client, aid, corpus)
    d1 = _dispatch(
        client,
        aid,
        _portable(aid, corpus),
        corpus,
        accepted_review_snapshot_id=accepted["snapshot_id"],
        accepted_review_snapshot_digest=accepted["corpus_sha256"],
    )
    assert d1.status_code == 200, d1.text
    other = _corpus("B")
    reissue = client.post(
        f"/api/agreements/{aid}/signing-packet/reissue",
        headers=_ORG_H,
        json={
            "packet_revision": "rev_2",
            "document_id": "doc_snap_auth",
            "portable_packet": _portable(aid, other),
            "frozen_signing_authority": _frozen(aid, other),
        },
    )
    assert reissue.status_code == 400
    assert reissue.json()["detail"]["code"] == "submitted_corpus_differs_from_accepted_snapshot"


def test_signer_complete_substitution_rejected(monkeypatch, tmp_path):
    _env(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    corpus = _corpus("A")
    accepted = _persist_and_accept(client, aid, corpus)
    d1 = _dispatch(
        client,
        aid,
        _portable(aid, corpus),
        corpus,
        accepted_review_snapshot_id=accepted["snapshot_id"],
        accepted_review_snapshot_digest=accepted["corpus_sha256"],
    )
    assert d1.status_code == 200, d1.text
    stored = d1.json()["draft"]["vs01_signing_packet_v1"]["portable"]
    forged = {
        **stored,
        "seed": {**stored["seed"], "corpusPlain": _corpus("B")},
    }
    complete = client.post(
        f"/api/agreements/{aid}/vs01-signer-complete",
        headers=_ORG_H,
        json={
            "signer_role_id": "role_owner",
            "document_id": "doc_snap_auth",
            "portable_packet": forged,
        },
    )
    assert complete.status_code == 400
    assert complete.json()["detail"]["code"] in {
        "submitted_corpus_differs_from_accepted_snapshot",
        "accepted_sot_substitution_rejected",
        "forged_accepted_sot_digest",
    }


def test_public_verify_links_accepted_snapshot_digest(monkeypatch, tmp_path):
    _env(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    corpus = _corpus("A")
    accepted = _persist_and_accept(client, aid, corpus)
    d1 = _dispatch(
        client,
        aid,
        _portable(aid, corpus),
        corpus,
        accepted_review_snapshot_id=accepted["snapshot_id"],
        accepted_review_snapshot_digest=accepted["corpus_sha256"],
    )
    assert d1.status_code == 200, d1.text
    verify = client.get(f"/api/agreements/public/{aid}/verify")
    assert verify.status_code == 200
    vfy = verify.json()["verification"]
    assert vfy.get("envelope_attestation_valid") is True
    assert vfy["accepted_review_snapshot"]["snapshot_id"] == accepted["snapshot_id"]
    assert vfy["accepted_review_snapshot"]["corpus_sha256"] == accepted["corpus_sha256"]
    assert vfy["envelope_provenance"]["acceptedSoTDigest"] == accepted["corpus_sha256"]
    assert "corpus_plain" not in str(vfy.get("accepted_review_snapshot"))
    assert "mac" not in str(vfy).lower() or "hmac" not in str(vfy.get("envelope_provenance") or {}).lower()


def test_public_verify_wrong_snapshot_linkage_fails_closed(monkeypatch, tmp_path):
    _env(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    corpus = _corpus("A")
    accepted = _persist_and_accept(client, aid, corpus)
    d1 = _dispatch(
        client,
        aid,
        _portable(aid, corpus),
        corpus,
        accepted_review_snapshot_id=accepted["snapshot_id"],
        accepted_review_snapshot_digest=accepted["corpus_sha256"],
    )
    assert d1.status_code == 200, d1.text
    from backend.services.agreement_draft_store import load_draft, save_draft

    draft = load_draft(aid)
    # Swap accepted snapshot to a different valid corpus while leaving packet provenance on A.
    other = _corpus("WRONG")
    snap = dict(draft["accepted_review_snapshot_v1"])
    snap["corpusPlain"] = other
    snap["corpusSha256"] = sha256_hex_text(other)
    snap["corpusLength"] = len(other)
    draft["accepted_review_snapshot_v1"] = snap
    reg = draft["canonical_review_snapshots_v1"]
    reg["snapshots"][accepted["snapshot_id"]] = snap
    draft["canonical_review_snapshots_v1"] = reg
    save_draft({**draft, "id": aid})
    verify = client.get(f"/api/agreements/public/{aid}/verify")
    assert verify.status_code == 200
    vfy = verify.json()["verification"]
    assert vfy.get("envelope_attestation_valid") is False
    assert vfy.get("envelope_provenance") is None
    assert vfy.get("envelope_attestation_reason") == "accepted_snapshot_digest_mismatch"
    assert vfy.get("accepted_review_snapshot") is None


def test_unauthorized_org_cannot_accept(monkeypatch, tmp_path):
    _env(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client, headers=_ORG_H)
    corpus = _corpus("A")
    create = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot",
        headers=_ORG_H,
        json={"corpus_plain": corpus},
    )
    assert create.status_code == 200
    snap = create.json()["snapshot"]
    # Different org cannot accept.
    bad = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot/accept",
        headers=_ORG_B,
        json={
            "snapshot_id": snap["snapshot_id"],
            "expected_digest": snap["corpus_sha256"],
            "expected_accepted_snapshot_id": "",
        },
    )
    assert bad.status_code in {403, 404}


def test_idempotent_repeat_accept_identical_snapshot(monkeypatch, tmp_path):
    _env(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    corpus = _corpus("A")
    accepted = _persist_and_accept(client, aid, corpus)
    again = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot/accept",
        headers=_ORG_H,
        json={
            "snapshot_id": accepted["snapshot_id"],
            "expected_digest": accepted["corpus_sha256"],
            "expected_accepted_snapshot_id": accepted["snapshot_id"],
        },
    )
    assert again.status_code == 200
    assert again.json()["accepted"]["snapshot_id"] == accepted["snapshot_id"]
    assert again.json()["accepted"]["corpus_sha256"] == accepted["corpus_sha256"]


def test_review_accept_reload_dispatch_verify_parity(monkeypatch, tmp_path):
    _env(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    corpus = _corpus("PARITY")
    # Review persist
    pending = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot",
        headers=_ORG_H,
        json={"corpus_plain": corpus, "generation_session_id": "parity_gen"},
    )
    assert pending.status_code == 200
    snap = pending.json()["snapshot"]
    assert snap["corpus_plain"] == corpus.strip()
    assert snap["corpus_sha256"] == sha256_hex_text(corpus.strip())
    # Accept
    accepted = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot/accept",
        headers=_ORG_H,
        json={
            "snapshot_id": snap["snapshot_id"],
            "expected_digest": snap["corpus_sha256"],
            "expected_accepted_snapshot_id": "",
        },
    ).json()["accepted"]
    # Reload
    reloaded = client.get(f"/api/agreements/{aid}/canonical-review-snapshot", headers=_ORG_H)
    assert reloaded.status_code == 200
    assert reloaded.json()["snapshot"]["corpus_sha256"] == accepted["corpus_sha256"]
    assert reloaded.json()["snapshot"]["corpus_plain"] == corpus.strip()
    # Dispatch uses server bytes even if client omits/mismatches display fingerprint
    portable = _portable(aid, corpus)
    d1 = _dispatch(
        client,
        aid,
        portable,
        corpus,
        accepted_review_snapshot_id=accepted["snapshot_id"],
        accepted_review_snapshot_digest=accepted["corpus_sha256"],
    )
    assert d1.status_code == 200, d1.text
    stored_corpus = d1.json()["draft"]["vs01_signing_packet_v1"]["portable"]["seed"]["corpusPlain"]
    assert stored_corpus == corpus.strip()
    assert (
        d1.json()["draft"]["vs01_signing_packet_v1"]["portable"]["envelopeProvenance"][
            "acceptedSoTDigest"
        ]
        == accepted["corpus_sha256"]
    )
    verify = client.get(f"/api/agreements/public/{aid}/verify")
    assert verify.status_code == 200
    vfy = verify.json()["verification"]
    assert vfy["envelope_attestation_valid"] is True
    assert vfy["accepted_review_snapshot"]["corpus_sha256"] == accepted["corpus_sha256"]


def test_client_sot_overwrite_exceptions_cannot_change_server_accepted_snapshot(
    monkeypatch, tmp_path
):
    """allowShorterOverwrite / execution-append are client-only; server snapshot stays immutable."""
    _env(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    corpus = _corpus("A")
    accepted = _persist_and_accept(client, aid, corpus)
    # Client "revision" bytes that would be allowed by differsOnlyByExecutionAppend locally.
    client_mutated = (corpus + "\n\nIN WITNESS WHEREOF\nBy: ______________________").strip()
    # Creating a new pending is fine; accepting without allow_revision must fail.
    pending = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot",
        headers=_ORG_H,
        json={"corpus_plain": client_mutated, "generation_session_id": "rev_attempt"},
    )
    assert pending.status_code == 200
    new_snap = pending.json()["snapshot"]
    reject = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot/accept",
        headers=_ORG_H,
        json={
            "snapshot_id": new_snap["snapshot_id"],
            "expected_digest": new_snap["corpus_sha256"],
            "expected_accepted_snapshot_id": accepted["snapshot_id"],
            "allow_revision": False,
        },
    )
    assert reject.status_code == 409
    assert reject.json()["detail"]["code"] == "different_snapshot_already_accepted"
    # Dispatch still seals original accepted corpus, not client-mutated bytes.
    res = _dispatch(
        client,
        aid,
        _portable(aid, client_mutated),
        client_mutated,
        accepted_review_snapshot_id=accepted["snapshot_id"],
        accepted_review_snapshot_digest=accepted["corpus_sha256"],
    )
    assert res.status_code == 400
    assert res.json()["detail"]["code"] == "submitted_corpus_differs_from_accepted_snapshot"
    # Honest dispatch of original accepted bytes still works.
    ok = _dispatch(
        client,
        aid,
        _portable(aid, corpus),
        corpus,
        accepted_review_snapshot_id=accepted["snapshot_id"],
        accepted_review_snapshot_digest=accepted["corpus_sha256"],
    )
    assert ok.status_code == 200, ok.text
    stored = ok.json()["draft"]["vs01_signing_packet_v1"]["portable"]["seed"]["corpusPlain"]
    assert stored == corpus.strip()


def test_accept_fails_when_display_authority_mismatches_snapshot(monkeypatch, tmp_path):
    """Server snapshot A rendered; client attempts to accept corpus/snapshot B."""
    _env(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    corpus_a = _corpus("A")
    corpus_b = _corpus("B")
    s_a = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot",
        headers=_ORG_H,
        json={"corpus_plain": corpus_a},
    ).json()["snapshot"]
    s_b = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot",
        headers=_ORG_H,
        json={"corpus_plain": corpus_b},
    ).json()["snapshot"]
    # Display claims A, accept targets B.
    bad = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot/accept",
        headers=_ORG_H,
        json={
            "snapshot_id": s_b["snapshot_id"],
            "expected_digest": s_b["corpus_sha256"],
            "expected_accepted_snapshot_id": "",
            "display_snapshot_id": s_a["snapshot_id"],
            "display_digest": s_a["corpus_sha256"],
            "display_length": s_a["corpus_length"],
        },
    )
    assert bad.status_code == 409
    assert bad.json()["detail"]["code"] == "display_authority_mismatch"


def test_reload_get_returns_exact_persisted_bytes_digest_length(monkeypatch, tmp_path):
    _env(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    corpus = _corpus("RELOAD")
    pending = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot",
        headers=_ORG_H,
        json={"corpus_plain": corpus},
    ).json()["snapshot"]
    got = client.get(f"/api/agreements/{aid}/canonical-review-snapshot", headers=_ORG_H)
    assert got.status_code == 200
    body = got.json()["snapshot"]
    assert body["snapshot_id"] == pending["snapshot_id"]
    assert body["corpus_plain"] == corpus.strip()
    assert body["corpus_sha256"] == sha256_hex_text(corpus.strip())
    assert body["corpus_length"] == len(corpus.strip())
    assert body["corpus_length"] == len(body["corpus_plain"])


def test_registry_version_conflict_on_parallel_accept(monkeypatch, tmp_path):
    _env(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    corpus = _corpus("A")
    created = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot",
        headers=_ORG_H,
        json={"corpus_plain": corpus, "expected_registry_version": 0},
    )
    assert created.status_code == 200, created.text
    snap = created.json()["snapshot"]
    reg_ver = created.json().get("registry_version")
    assert reg_ver == 1
    # Stale version loses.
    stale = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot/accept",
        headers=_ORG_H,
        json={
            "snapshot_id": snap["snapshot_id"],
            "expected_digest": snap["corpus_sha256"],
            "expected_accepted_snapshot_id": "",
            "expected_registry_version": 0,
            "display_snapshot_id": snap["snapshot_id"],
            "display_digest": snap["corpus_sha256"],
            "display_length": snap["corpus_length"],
        },
    )
    assert stale.status_code == 409
    assert stale.json()["detail"]["code"] == "registry_version_conflict"
    ok = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot/accept",
        headers=_ORG_H,
        json={
            "snapshot_id": snap["snapshot_id"],
            "expected_digest": snap["corpus_sha256"],
            "expected_accepted_snapshot_id": "",
            "expected_registry_version": 1,
            "display_snapshot_id": snap["snapshot_id"],
            "display_digest": snap["corpus_sha256"],
            "display_length": snap["corpus_length"],
        },
    )
    assert ok.status_code == 200, ok.text


def test_post_cutover_reissue_requires_accepted_snapshot(monkeypatch, tmp_path):
    """Post-cutover (registry touched) cannot reissue under legacy continuation."""
    _env(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    corpus = _corpus("A")
    # Touch snapshot registry (cutover) but do not accept.
    client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot",
        headers=_ORG_H,
        json={"corpus_plain": corpus},
    )
    from backend.services.agreement_draft_store import load_draft, save_draft

    draft = load_draft(aid)
    # Inject a sealed packet without accepted snapshot (adversarial / partial state).
    draft["vs01_signing_packet_v1"] = {
        "document_id": "doc_snap_auth",
        "packet_revision": "rev_1",
        "packet_state": "active",
        "portable": _portable(aid, corpus),
    }
    save_draft({**draft, "id": aid})
    reissue = client.post(
        f"/api/agreements/{aid}/signing-packet/reissue",
        headers=_ORG_H,
        json={
            "packet_revision": "rev_2",
            "document_id": "doc_snap_auth",
            "portable_packet": _portable(aid, corpus),
            "frozen_signing_authority": _frozen(aid, corpus),
        },
    )
    assert reissue.status_code == 400
    assert reissue.json()["detail"]["code"] in {
        "accepted_review_snapshot_required",
        "legacy_packet_requires_reattestation",
    }


def test_post_cutover_signer_complete_requires_accepted_snapshot(monkeypatch, tmp_path):
    _env(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    corpus = _corpus("A")
    client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot",
        headers=_ORG_H,
        json={"corpus_plain": corpus},
    )
    from backend.services.agreement_draft_store import load_draft, save_draft

    draft = load_draft(aid)
    portable = _portable(aid, corpus)
    draft["vs01_signing_packet_v1"] = {
        "document_id": "doc_snap_auth",
        "packet_revision": "rev_1",
        "packet_state": "active",
        "portable": portable,
    }
    save_draft({**draft, "id": aid})
    complete = client.post(
        f"/api/agreements/{aid}/vs01-signer-complete",
        headers=_ORG_H,
        json={
            "signer_role_id": "role_owner",
            "document_id": "doc_snap_auth",
            "portable_packet": portable,
        },
    )
    assert complete.status_code == 400
    assert complete.json()["detail"]["code"] in {
        "accepted_review_snapshot_required",
        "legacy_packet_requires_reattestation",
    }


def test_legacy_migration_requires_exact_sealed_corpus_reattestation(monkeypatch, tmp_path):
    _env(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    sealed = _corpus("LEGACY")
    from backend.services.agreement_draft_store import load_draft, save_draft

    draft = load_draft(aid)
    # Pure pre-cutover: sealed packet, empty snapshot registry.
    draft["vs01_signing_packet_v1"] = {
        "document_id": "doc_snap_auth",
        "packet_revision": "rev_1",
        "packet_state": "active",
        "portable": _portable(aid, sealed),
    }
    draft["canonical_review_snapshots_v1"] = None
    draft["accepted_review_snapshot_v1"] = None
    save_draft({**draft, "id": aid})

    wrong = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot/migrate-legacy",
        headers=_ORG_H,
        json={"sealed_corpus_plain": _corpus("WRONG")},
    )
    assert wrong.status_code == 409
    assert wrong.json()["detail"]["code"] == "legacy_sealed_corpus_mismatch"

    ok = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot/migrate-legacy",
        headers=_ORG_H,
        json={
            "sealed_corpus_plain": sealed,
            "claimed_digest": sha256_hex_text(sealed.strip()),
        },
    )
    assert ok.status_code == 200, ok.text
    accepted = ok.json()["accepted"]
    assert accepted["corpus_sha256"] == sha256_hex_text(sealed.strip())
    assert accepted["status"] == "accepted"
    got = client.get(f"/api/agreements/{aid}/canonical-review-snapshot", headers=_ORG_H)
    assert got.status_code == 200
    assert got.json()["snapshot"]["corpus_plain"] == sealed.strip()


def test_dispatch_before_accept_fails_closed_even_with_pending(monkeypatch, tmp_path):
    """Prepare/dispatch cannot proceed before awaited server acceptance."""
    _env(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    corpus = _corpus("A")
    pending = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot",
        headers=_ORG_H,
        json={"corpus_plain": corpus},
    )
    assert pending.status_code == 200
    res = _dispatch(client, aid, _portable(aid, corpus), corpus)
    assert res.status_code == 400
    assert res.json()["detail"]["code"] == "accepted_review_snapshot_required"


def test_immutability_assertion_wired_on_registry_write(monkeypatch, tmp_path):
    """Mutating accepted corpus in registry via create path fails closed."""
    _env(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    corpus = _corpus("A")
    accepted = _persist_and_accept(client, aid, corpus)
    from backend.services.agreement_draft_store import load_draft, save_draft
    from backend.services.accepted_review_snapshot import assert_snapshot_immutable_post_accept

    draft = load_draft(aid)
    reg = dict(draft["canonical_review_snapshots_v1"])
    mutated = dict(reg["snapshots"][accepted["snapshot_id"]])
    mutated["corpusPlain"] = (corpus + "\nMUTATED").strip()
    reg["snapshots"] = {**reg["snapshots"], accepted["snapshot_id"]: mutated}
    ok, err = assert_snapshot_immutable_post_accept(draft=draft, incoming_registry=reg)
    assert ok is False
    assert err == "accepted_snapshot_mutation_rejected"
    # Creating a new pending must not be able to smuggle mutated accepted bytes through apply.
    # (Service create keeps prior accepted intact; apply asserts immutability.)
    other = _corpus("B")
    create = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot",
        headers=_ORG_H,
        json={"corpus_plain": other},
    )
    assert create.status_code == 200
    reloaded = load_draft(aid)
    prior = reloaded["accepted_review_snapshot_v1"]
    assert prior["corpusPlain"] == corpus.strip()
    assert prior["corpusSha256"] == accepted["corpus_sha256"]
