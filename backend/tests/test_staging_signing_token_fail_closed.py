"""Staging must fail closed for envelope/token ops without an explicit signing secret."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.config.agreement_signing_token import _DEV_FALLBACK_SIGNING_TOKEN_RAW
from backend.main import app
from backend.services.accepted_review_snapshot import sha256_hex_text
from backend.services.vs01_signing_envelope_provenance import fingerprint_agreement_body

pytestmark = pytest.mark.unit

_ORG_H = {"X-Claw-Org-Id": "test-org-staging-secret"}
_EXPLICIT = "staging-fail-closed-explicit-signing-token"


@pytest.fixture(autouse=True)
def _reset_usage_economics_singleton():
    from backend.usage_economics import store as usage_economics_store_mod

    usage_economics_store_mod._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001


def _env_staging_invalid(monkeypatch: pytest.MonkeyPatch, tmp_path, mode: str) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "staging")
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <notifications@lawdog.me>")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("CLAW_PUBLIC_AGREEMENT_VERIFY", "1")
    monkeypatch.delenv("CLAW_SIGNING_TOKEN_SECRET", raising=False)
    if mode == "missing":
        monkeypatch.delenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", raising=False)
    elif mode == "blank":
        monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "  ")
    elif mode == "fallback":
        monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", _DEV_FALLBACK_SIGNING_TOKEN_RAW)
    else:
        raise AssertionError(mode)


def _env_staging_explicit(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "staging")
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", _EXPLICIT)
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <notifications@lawdog.me>")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("CLAW_PUBLIC_AGREEMENT_VERIFY", "1")


def _create_agreement(client: TestClient) -> str:
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
            "requiresSignature": True,
            "vs01CounterpartyId": "owner",
        },
        {
            "roleId": "role_cp",
            "partyId": "p_cp",
            "partyIndex": 1,
            "kind": "counterparty",
            "entityName": "Harbor Peak Automation LLC",
            "requiresSignature": True,
            "vs01CounterpartyId": "cp",
        },
    ]


def _portable(aid: str, corpus: str) -> dict:
    corpus = corpus.strip()
    return {
        "v": 1,
        "seed": {
            "v": 1,
            "documentId": "doc_staging_secret",
            "agreementId": aid,
            "corpusHash": fingerprint_agreement_body(corpus),
            "corpusPlain": corpus,
        },
        "fields": [],
        "roles": _roles(),
        "fieldCount": 0,
        "initialsPolicy": {"enabled": True},
    }


def _frozen(aid: str, corpus: str) -> dict:
    return {
        "version": 1,
        "agreementId": aid,
        "agreementSessionId": "sess_staging_secret",
        "frozenCorpusHash": fingerprint_agreement_body(corpus),
        "frozenAt": "2026-07-08T00:00:00.000Z",
        "parties": [
            {"agreementPartyId": "p_owner", "legalEntityName": "Red Mesa Logistics LLC", "canonicalOrder": 0},
            {"agreementPartyId": "p_cp", "legalEntityName": "Harbor Peak Automation LLC", "canonicalOrder": 1},
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


def _assert_422_secret(res) -> None:
    assert res.status_code == 422, res.text
    detail = res.json().get("detail")
    assert isinstance(detail, dict)
    assert detail.get("code") == "signing_token_secret_not_configured"
    blob = res.text
    assert _EXPLICIT not in blob
    assert _DEV_FALLBACK_SIGNING_TOKEN_RAW not in blob


def _persist_and_accept(client: TestClient, aid: str, corpus: str) -> None:
    create = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot",
        headers=_ORG_H,
        json={
            "corpus_plain": corpus,
            "generation_session_id": "gen_staging_secret",
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


@pytest.mark.parametrize("mode", ["missing", "blank", "fallback"])
def test_staging_dispatch_fails_closed_without_explicit_secret(
    monkeypatch: pytest.MonkeyPatch, tmp_path, mode: str
) -> None:
    _env_staging_invalid(monkeypatch, tmp_path, mode)
    client = TestClient(app)
    aid = _create_agreement(client)
    corpus = ("OPERATIVE TERMS.\n\n" + ("x" * 1600)).strip()
    body = {
        "packet_revision": "rev_1",
        "document_id": "doc_staging_secret",
        "portable_packet": _portable(aid, corpus),
        "frozen_signing_authority": _frozen(aid, corpus),
        "targets": [],
    }
    res = client.post(f"/api/agreements/{aid}/signing-links-sent", headers=_ORG_H, json=body)
    _assert_422_secret(res)


@pytest.mark.parametrize("mode", ["missing", "blank", "fallback"])
def test_staging_reissue_fails_closed_without_explicit_secret(
    monkeypatch: pytest.MonkeyPatch, tmp_path, mode: str
) -> None:
    _env_staging_explicit(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    corpus = ("OPERATIVE TERMS.\n\n" + ("y" * 1600)).strip()
    _persist_and_accept(client, aid, corpus)
    portable = _portable(aid, corpus)
    body = {
        "packet_revision": "rev_v1",
        "document_id": "doc_staging_secret",
        "portable_packet": portable,
        "frozen_signing_authority": _frozen(aid, corpus),
        "targets": [],
    }
    mock = MagicMock()
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = '{"id":"msg_ok"}'
    mock_response.json.return_value = {"id": "msg_ok"}
    mock.post.return_value = mock_response
    mock.__enter__ = MagicMock(return_value=mock)
    mock.__exit__ = MagicMock(return_value=False)
    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock):
        ok = client.post(f"/api/agreements/{aid}/signing-links-sent", headers=_ORG_H, json=body)
    assert ok.status_code == 200, ok.text

    _env_staging_invalid(monkeypatch, tmp_path, mode)
    reissue = client.post(
        f"/api/agreements/{aid}/signing-packet/reissue",
        headers=_ORG_H,
        json={
            "packet_revision": "rev_v2",
            "document_id": "doc_staging_secret",
            "portable_packet": portable,
            "frozen_signing_authority": _frozen(aid, corpus),
        },
    )
    _assert_422_secret(reissue)


@pytest.mark.parametrize("mode", ["missing", "blank", "fallback"])
def test_staging_signer_complete_fails_closed_without_explicit_secret(
    monkeypatch: pytest.MonkeyPatch, tmp_path, mode: str
) -> None:
    _env_staging_explicit(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    corpus = ("OPERATIVE TERMS.\n\n" + ("z" * 1600)).strip()
    _persist_and_accept(client, aid, corpus)
    portable = _portable(aid, corpus)
    body = {
        "packet_revision": "rev_sign",
        "document_id": "doc_staging_secret",
        "portable_packet": portable,
        "frozen_signing_authority": _frozen(aid, corpus),
        "targets": [],
    }
    mock = MagicMock()
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = '{"id":"msg_ok"}'
    mock_response.json.return_value = {"id": "msg_ok"}
    mock.post.return_value = mock_response
    mock.__enter__ = MagicMock(return_value=mock)
    mock.__exit__ = MagicMock(return_value=False)
    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock):
        ok = client.post(f"/api/agreements/{aid}/signing-links-sent", headers=_ORG_H, json=body)
    assert ok.status_code == 200, ok.text
    stored = ok.json()["draft"]["vs01_signing_packet_v1"]["portable"]

    _env_staging_invalid(monkeypatch, tmp_path, mode)
    complete = client.post(
        f"/api/agreements/{aid}/vs01-signer-complete",
        headers=_ORG_H,
        json={
            "signer_role_id": "role_owner",
            "document_id": "doc_staging_secret",
            "portable_packet": stored,
        },
    )
    _assert_422_secret(complete)


@pytest.mark.parametrize("mode", ["missing", "blank", "fallback"])
def test_staging_public_verify_fails_closed_without_explicit_secret(
    monkeypatch: pytest.MonkeyPatch, tmp_path, mode: str
) -> None:
    _env_staging_explicit(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client)
    corpus = ("OPERATIVE TERMS.\n\n" + ("w" * 1600)).strip()
    _persist_and_accept(client, aid, corpus)
    body = {
        "packet_revision": "rev_verify",
        "document_id": "doc_staging_secret",
        "portable_packet": _portable(aid, corpus),
        "frozen_signing_authority": _frozen(aid, corpus),
        "targets": [],
    }
    mock = MagicMock()
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = '{"id":"msg_ok"}'
    mock_response.json.return_value = {"id": "msg_ok"}
    mock.post.return_value = mock_response
    mock.__enter__ = MagicMock(return_value=mock)
    mock.__exit__ = MagicMock(return_value=False)
    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock):
        ok = client.post(f"/api/agreements/{aid}/signing-links-sent", headers=_ORG_H, json=body)
    assert ok.status_code == 200, ok.text

    _env_staging_invalid(monkeypatch, tmp_path, mode)
    verify = client.get(f"/api/agreements/public/{aid}/verify")
    assert verify.status_code == 200, verify.text
    vfy = verify.json()["verification"]
    assert vfy.get("envelope_attestation_valid") is False
    assert vfy.get("envelope_provenance") is None
    assert vfy.get("envelope_attestation_reason") == "signing_token_secret_not_configured"
    blob = verify.text
    assert _EXPLICIT not in blob
    assert _DEV_FALLBACK_SIGNING_TOKEN_RAW not in blob
    assert "envelopeAttestation" not in blob
    assert '"mac"' not in blob
