"""Trusted-boundary negative tests for VS01 envelope provenance tampering."""

from __future__ import annotations

from backend.tests.entitlement_test_support import ensure_headers_entitled, ensure_org_pro_entitlement

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services.accepted_review_snapshot import sha256_hex_text
from backend.services.vs01_signing_envelope_provenance import (
    attest_portable_envelope_provenance,
    build_vs01_signing_envelope_provenance,
    fingerprint_agreement_body,
)

pytestmark = pytest.mark.unit

_ORG_H = {"X-Claw-Org-Id": "test-org-envelope-tamper", "X-Claw-Test-Auth-User-Id": "test-owner"}


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

_SECRET = "unit-test-envelope-provenance-secret"


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
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <notifications@lawdog.me>")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", _SECRET)
    monkeypatch.setenv("CLAW_PUBLIC_AGREEMENT_VERIFY", "1")


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


def _create_agreement(client: TestClient) -> str:
    ensure_headers_entitled(_ORG_H)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
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
            "duration": None,
            "due_date": None,
            "effective_date": None,
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


def _portable(aid: str, corpus: str, roles: list | None = None, provenance: dict | None = None) -> dict:
    corpus = corpus.strip()
    body = {
        "v": 1,
        "seed": {
            "v": 1,
            "documentId": "doc_env_tamper",
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
        "agreementSessionId": "sess_env_tamper",
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


def _persist_and_accept(client: TestClient, aid: str, corpus: str) -> dict:
    create = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot",
        headers=_ORG_H,
        json={
            "corpus_plain": corpus,
            "generation_session_id": "gen_env_tamper",
            "claimed_digest": sha256_hex_text(corpus),
        },
    )
    assert create.status_code == 200, create.text
    snap = create.json()["snapshot"]
    accept = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot/accept",
        headers=_ORG_H,
        json={
            "snapshot_id": snap["snapshot_id"],
            "expected_digest": snap["corpus_sha256"],
            "expected_accepted_snapshot_id": "",
        },
    )
    assert accept.status_code == 200, accept.text
    return accept.json()["accepted"]


def _dispatch(client: TestClient, aid: str, portable: dict, corpus: str):
    body = {
        "packet_revision": "rev_env_tamper",
        "document_id": "doc_env_tamper",
        "portable_packet": portable,
        "frozen_signing_authority": _frozen(aid, corpus),
        "targets": [],
    }
    with patch(
        "backend.services.email.resend_client.httpx.Client",
        return_value=_mock_resend_success(),
    ):
        return client.post(f"/api/agreements/{aid}/signing-links-sent", headers=_ORG_H, json=body)


def test_server_attests_when_client_omits_provenance(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    corpus = ("OPERATIVE TERMS.\n\n" + ("x" * 1600)).strip()
    _persist_and_accept(client, aid, corpus)
    res = _dispatch(client, aid, _portable(aid, corpus), corpus)
    assert res.status_code == 200, res.text
    stored = res.json()["draft"]["vs01_signing_packet_v1"]["portable"]
    assert stored["envelopeProvenance"]["acceptedSoTDigest"]
    assert stored["envelopeAttestation"]["algo"] == "hmac-sha256"
    assert stored["envelopeAttestation"]["mac"]


def test_reject_forged_accepted_sot_digest_before_dispatch(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    corpus = ("OPERATIVE TERMS.\n\n" + ("a" * 1600)).strip()
    _persist_and_accept(client, aid, corpus)
    honest = build_vs01_signing_envelope_provenance(accepted_sot_plain=corpus, roles=_roles())
    forged = {**honest, "acceptedSoTDigest": "0" * 64}
    res = _dispatch(client, aid, _portable(aid, corpus, provenance=forged), corpus)
    assert res.status_code == 400
    # Snapshot bind rejects forged accepted digest before HMAC attest.
    assert res.json()["detail"]["code"] in {
        "forged_accepted_sot_digest",
        "submitted_digest_differs_from_accepted_snapshot",
    }


def test_reject_forged_packet_digest_before_dispatch(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    corpus = ("OPERATIVE TERMS.\n\n" + ("b" * 1600)).strip()
    _persist_and_accept(client, aid, corpus)
    honest = build_vs01_signing_envelope_provenance(accepted_sot_plain=corpus, roles=_roles())
    forged = {**honest, "packetDigest": "f" * 64}
    res = _dispatch(client, aid, _portable(aid, corpus, provenance=forged), corpus)
    assert res.status_code == 400
    assert res.json()["detail"]["code"] == "forged_packet_digest"


def test_reject_provenance_copied_from_other_accepted_sot(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    corpus_a = ("AGREEMENT A BODY.\n\n" + ("a" * 1600)).strip()
    corpus_b = ("AGREEMENT B BODY.\n\n" + ("b" * 1600)).strip()
    _persist_and_accept(client, aid, corpus_a)
    prov_a = build_vs01_signing_envelope_provenance(accepted_sot_plain=corpus_a, roles=_roles())
    # Client posts SoT B bytes with provenance sealed against SoT A.
    res = _dispatch(client, aid, _portable(aid, corpus_b, provenance=prov_a), corpus_b)
    assert res.status_code == 400
    assert res.json()["detail"]["code"] in {
        "forged_accepted_sot_digest",
        "submitted_corpus_differs_from_accepted_snapshot",
    }


def test_reject_reordered_or_altered_signer_manifest(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    corpus = ("OPERATIVE TERMS.\n\n" + ("c" * 1600)).strip()
    _persist_and_accept(client, aid, corpus)
    roles = _roles()
    honest = build_vs01_signing_envelope_provenance(accepted_sot_plain=corpus, roles=roles)
    # Tamper: claim honest digests while sending reordered/altered roles.
    altered = [
        {**roles[1], "partyIndex": 0, "entityName": "TAMPERED ENTITY LLC"},
        {**roles[0], "partyIndex": 1},
    ]
    res = _dispatch(
        client,
        aid,
        _portable(aid, corpus, roles=altered, provenance=honest),
        corpus,
    )
    assert res.status_code == 400
    code = res.json()["detail"]["code"]
    assert code in {
        "forged_signer_manifest_digest",
        "forged_packet_digest",
        "forged_packet_layout_digest",
    }


def test_reject_client_provenance_differing_from_persisted_on_signer_complete(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    corpus = ("OPERATIVE TERMS.\n\n" + ("d" * 1600)).strip()
    _persist_and_accept(client, aid, corpus)
    dispatch = _dispatch(client, aid, _portable(aid, corpus), corpus)
    assert dispatch.status_code == 200, dispatch.text
    stored = dispatch.json()["draft"]["vs01_signing_packet_v1"]["portable"]
    honest = stored["envelopeProvenance"]
    forged_portable = {
        **stored,
        "envelopeProvenance": {**honest, "packetDigest": "e" * 64},
    }
    complete = client.post(
        f"/api/agreements/{aid}/vs01-signer-complete",
        headers=_ORG_H,
        json={
            "signer_role_id": "role_owner",
            "document_id": "doc_env_tamper",
            "portable_packet": forged_portable,
        },
    )
    assert complete.status_code == 400
    assert complete.json()["detail"]["code"] == "forged_packet_digest"


def test_public_verify_serves_server_attested_provenance_not_client_forgery(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    corpus = ("OPERATIVE TERMS.\n\n" + ("e" * 1600)).strip()
    _persist_and_accept(client, aid, corpus)
    dispatch = _dispatch(client, aid, _portable(aid, corpus), corpus)
    assert dispatch.status_code == 200, dispatch.text
    expected = dispatch.json()["draft"]["vs01_signing_packet_v1"]["portable"]["envelopeProvenance"]

    verify = client.get(f"/api/agreements/public/{aid}/verify")
    assert verify.status_code == 200, verify.text
    vfy = verify.json()["verification"]
    assert vfy.get("envelope_attestation_valid") is True
    assert vfy["envelope_provenance"]["acceptedSoTDigest"] == expected["acceptedSoTDigest"]
    assert vfy["envelope_provenance"]["packetDigest"] == expected["packetDigest"]
    assert vfy["envelope_provenance"]["signerManifestDigest"] == expected["signerManifestDigest"]


def test_unit_attest_rejects_forged_fields_without_http() -> None:
    corpus = ("UNIT CORPUS.\n\n" + ("z" * 900)).strip()
    roles = _roles()
    honest = build_vs01_signing_envelope_provenance(accepted_sot_plain=corpus, roles=roles)
    portable = _portable("ag_unit", corpus, provenance={**honest, "acceptedSoTDigest": "1" * 64})
    ok, err, _ = attest_portable_envelope_provenance(
        agreement_id="ag_unit",
        portable=portable,
        secret_raw=_SECRET,
        require_client_match=True,
    )
    assert ok is False
    assert err == "forged_accepted_sot_digest"


def test_public_verify_fails_closed_when_stored_provenance_tampered(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    corpus = ("OPERATIVE TERMS.\n\n" + ("f" * 1600)).strip()
    _persist_and_accept(client, aid, corpus)
    dispatch = _dispatch(client, aid, _portable(aid, corpus), corpus)
    assert dispatch.status_code == 200, dispatch.text

    # Directly corrupt persisted client-visible digests (simulates storage/browser substitution).
    from backend.services.agreement_draft_store import load_draft, save_draft

    draft = load_draft(aid)
    portable = draft["vs01_signing_packet_v1"]["portable"]
    portable["envelopeProvenance"] = {
        **portable["envelopeProvenance"],
        "acceptedSoTDigest": "a" * 64,
        "packetDigest": "b" * 64,
    }
    draft["vs01_signing_packet_v1"]["portable"] = portable
    save_draft({**draft, "id": aid})

    verify = client.get(f"/api/agreements/public/{aid}/verify")
    assert verify.status_code == 200, verify.text
    vfy = verify.json()["verification"]
    assert vfy.get("envelope_attestation_valid") is False
    assert vfy.get("envelope_provenance") is None
    assert vfy.get("envelope_attestation_reason") == "stored_provenance_tamper"
