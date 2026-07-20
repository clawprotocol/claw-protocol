"""
Optional integration: set ``CLAW_AGREEMENT_PG_TEST_URL`` to a writable ``postgresql://`` DSN
(schema ``lawdog_agreements`` is created; tables use IF NOT EXISTS).
"""

from __future__ import annotations

import copy
import os
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest

from backend.utils.agreement_version_store import AgreementVersionStore

_PG = os.getenv("CLAW_AGREEMENT_PG_TEST_URL", "").strip()


def _configure_postgres_test_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_AGREEMENT_DATABASE_URL", _PG)
    monkeypatch.setenv("CLAW_AGREEMENT_POSTGRES_DSN", _PG)
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    monkeypatch.delenv("CLAW_DATABASE_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)


def _reset_postgres_migrations() -> None:
    from backend.db import agreement_sql

    agreement_sql._pg_migrations_applied = False  # noqa: SLF001


def _accepted_projection(row: dict) -> dict:
    return {
        "version_id": row["version_id"],
        "corpus_sha256": row["body_sha256"],
    }


def _capture_signing_url_provider(calls: list[dict]):
    def _send(
        _agreement_id: str,
        _delivery_identity: str,
        _recipient_email: str,
        signing_url: str,
        _idempotency_key: str,
    ):
        calls.append({"signing_url": signing_url})
        return True, "msg", None

    return _send


def _pg_field_json(
    field_id: str,
    value: str,
    *,
    expected_revision: int = 0,
    mutation_id: str | None = None,
) -> dict:
    return {
        "field_id": field_id,
        "value": value,
        "expected_revision": expected_revision,
        "mutation_id": mutation_id or f"mut-{uuid.uuid4().hex}",
    }


def _setup_pg_3c1b_delivery_agreement(
    ads,
    als,
    *,
    agreement_id: str,
    document_id: str,
    extra_portable_fields: list[dict] | None = None,
) -> tuple[dict, dict]:
    """Persist accepted corpus, frozen authority, signing lock, and activation in Postgres."""
    from backend.services.vs01_signing_packet_activation import build_canonical_signing_packet_activation
    from backend.tests.test_vs01_signing_packet_activation import (
        _CORPUS,
        _frozen_candidate,
        _portable_candidate,
    )

    parties = [
        {
            "id": "party-owner",
            "name": "Canonical Legal Entity 1 LLC",
            "role": "owner",
            "email": "signer1@example.test",
        },
        {
            "id": "party-signer",
            "name": "Canonical Legal Entity 2 LLC",
            "role": "signer",
            "email": "signer2@example.test",
        },
    ]
    accepted_parties = [
        {
            "ordinal": index,
            "party_id": party["id"],
            "legal_name": party["name"],
            "role": party["role"],
        }
        for index, party in enumerate(parties)
    ]
    draft = {
        "id": agreement_id,
        "title": "PG Signing Invite Delivery",
        "jurisdiction": "TX",
        "parties": parties,
        "purpose": _CORPUS,
        "payment_terms": "Net 30",
        "audit_log": [],
    }
    ads.save_draft(draft)
    store = AgreementVersionStore()
    accepted_row = store.create_accepted_version(
        agreement_id=agreement_id,
        title=draft["title"],
        corpus=_CORPUS,
        parties=accepted_parties,
        accepted_at="2026-07-17T12:00:00Z",
    )
    accepted = _accepted_projection(accepted_row)
    frozen = _frozen_candidate(agreement_id, draft, accepted)
    ads.create_frozen_signing_authority(
        agreement_id,
        frozen_record=frozen,
        audit_event={
            "event_type": "frozen_signing_authority_persisted",
            "at": "2026-07-17T12:00:00Z",
            "field": "frozen_signing_authority_v1",
            "value": {"accepted_version_id": accepted["version_id"]},
        },
        updated_at="2026-07-17T12:00:00Z",
    )
    als.write_signing_lock(
        agreement_id,
        {
            "locked_version_id": accepted["version_id"],
            "content_sha256": accepted["corpus_sha256"],
            "accepted_corpus_sha256": accepted["corpus_sha256"],
            "locked_at": "2026-07-17T12:00:00Z",
            "locked_by": "owner",
        },
    )
    portable = _portable_candidate(agreement_id, draft, accepted)
    if extra_portable_fields:
        portable["fields"].extend(extra_portable_fields)
    activation_record = build_canonical_signing_packet_activation(
        agreement_id=agreement_id,
        document_id=document_id,
        portable_packet=portable,
        draft=ads.load_draft(agreement_id),
        activated_at="2026-07-17T02:00:00Z",
        signing_lock=als.read_signing_lock(agreement_id),
    )
    ads.activate_vs01_signing_packet(
        agreement_id,
        activation_record=activation_record,
        audit_event={
            "event_type": "signing_packet_activated",
            "at": "2026-07-17T02:00:00Z",
            "field": "vs01_signing_packet_activation_v1",
            "value": {"document_id": document_id},
        },
        updated_at="2026-07-17T02:00:00Z",
    )
    return draft, accepted


@pytest.mark.skipif(not _PG, reason="CLAW_AGREEMENT_PG_TEST_URL not set")
def test_agreement_postgres_draft_version_lock_roundtrip(monkeypatch):
    _configure_postgres_test_env(monkeypatch)
    _reset_postgres_migrations()

    from backend.services import agreement_draft_store as ads
    from backend.services import agreement_signing_lock_store as als

    aid = f"test_pg_agreement_{uuid.uuid4().hex}"
    ads.save_draft({"id": aid, "title": "T", "jurisdiction": "TX"})
    got = ads.load_draft(aid)
    assert got["id"] == aid
    assert got["title"] == "T"
    assert ads.draft_exists(aid)

    store = AgreementVersionStore()
    out = store.save_version(
        agreement_id=aid,
        title="T",
        body_markdown="# Hello",
        created_at=None,
        disclaimers=None,
        metadata={"k": "v"},
    )
    assert out["version"] == 1
    assert store.list_versions(agreement_id=aid)[0]["version"] == 1
    v1 = store.get_version(agreement_id=aid, version=1)
    assert v1["body_markdown"] == "# Hello"
    assert v1["metadata"] == {"k": "v"}

    als.write_signing_lock(aid, {"locked_version_id": "lv1"})
    assert als.read_signing_lock(aid) == {"locked_version_id": "lv1"}

    ids = ads.list_draft_agreement_ids_newest_first()
    assert aid in ids


@pytest.mark.skipif(not _PG, reason="CLAW_AGREEMENT_PG_TEST_URL not set")
def test_postgres_atomic_frozen_authority_create_or_return(monkeypatch):
    _configure_postgres_test_env(monkeypatch)
    _reset_postgres_migrations()

    from backend.services import agreement_draft_store as ads

    aid = f"test_pg_frozen_{uuid.uuid4().hex}"
    ads.save_draft({"id": aid, "title": "Latest title", "audit_log": []})
    frozen = {
        "version": 1,
        "agreementId": aid,
        "acceptedVersionId": "av_pg_test",
        "acceptedCorpusSha256": "a" * 64,
        "frozenAt": "2026-07-17T00:00:00Z",
        "parties": [],
        "signers": [],
        "execution": {"partyOrder": [], "signerOrder": [], "executionPartyHash": "b" * 64},
    }
    audit = {
        "event_type": "frozen_signing_authority_persisted",
        "at": "2026-07-17T00:00:00Z",
        "field": "frozen_signing_authority_v1",
        "value": {"accepted_version_id": "av_pg_test"},
    }
    first = ads.create_frozen_signing_authority(
        aid,
        frozen_record=frozen,
        audit_event=audit,
        updated_at="2026-07-17T00:00:00Z",
    )
    retry = ads.create_frozen_signing_authority(
        aid,
        frozen_record={**frozen, "frozenAt": "2026-07-17T00:01:00Z"},
        audit_event=audit,
        updated_at="2026-07-17T00:01:00Z",
    )
    assert retry == first
    changed = {**frozen, "acceptedCorpusSha256": "c" * 64}
    with pytest.raises(ValueError, match="frozen_signing_authority_immutable"):
        ads.create_frozen_signing_authority(
            aid,
            frozen_record=changed,
            audit_event=audit,
            updated_at="2026-07-17T00:02:00Z",
        )
    stored = ads.load_draft(aid)
    assert stored["title"] == "Latest title"
    assert stored["frozen_signing_authority_v1"] == first
    assert sum(
        event.get("event_type") == "frozen_signing_authority_persisted"
        for event in stored["audit_log"]
    ) == 1


@pytest.mark.skipif(not _PG, reason="CLAW_AGREEMENT_PG_TEST_URL not set")
def test_postgres_concurrent_signing_invite_delivery_claim_winner(monkeypatch, tmp_path):
    """Phase 3C1B claim-winner semantics under real Postgres row locking."""
    _configure_postgres_test_env(monkeypatch)
    _reset_postgres_migrations()
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(tmp_path / "agreements.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "pg-test-signing-invite-delivery-secret")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <noreply@example.test>")
    monkeypatch.setenv("CLAW_SIGNING_INVITE_DELIVERY_ENABLED", "1")
    monkeypatch.setenv("CLAW_SIGNING_INVITE_RECIPIENT_BOOTSTRAP_ENABLED", "1")

    from backend.db.agreement_sql import agreement_postgres_connection, pg_execute
    from backend.services import agreement_draft_store as ads
    from backend.services import agreement_signing_lock_store as als
    from backend.services.vs01_signing_invite_delivery import (
        VS01_SIGNING_INVITE_DELIVERY_FIELD,
        RecipientTerminalOutcome,
        STATE_CLAIMED,
        STATE_DELIVERED,
        STATE_FAILED,
        Vs01SigningInviteDeliveryError,
        merge_recipient_terminal_outcomes_cas,
    )
    from backend.tests.test_vs01_signing_packet_activation import _DOCUMENT_ID

    agreement_id = f"test_pg_delivery_{uuid.uuid4().hex}"
    document_id = _DOCUMENT_ID
    _setup_pg_3c1b_delivery_agreement(
        ads,
        als,
        agreement_id=agreement_id,
        document_id=document_id,
    )

    with agreement_postgres_connection() as cx:
        draft_row = pg_execute(
            cx,
            "SELECT id FROM agreement_drafts WHERE id = ?",
            (agreement_id,),
        ).fetchone()
        lock_row = pg_execute(
            cx,
            "SELECT agreement_id FROM agreement_signing_locks WHERE agreement_id = ?",
            (agreement_id,),
        ).fetchone()
    assert draft_row is not None
    assert lock_row is not None

    provider_calls: list[dict] = []
    provider_lock = threading.Lock()
    start_barrier = threading.Barrier(2)

    def _mock_provider_send(
        agreement_id_arg: str,
        delivery_identity: str,
        recipient_email: str,
        signing_url: str,
        idempotency_key: str,
    ):
        stored = ads.load_draft(agreement_id_arg)[VS01_SIGNING_INVITE_DELIVERY_FIELD]
        record = stored["recipients"][delivery_identity]
        assert record["state"] == STATE_CLAIMED
        assert record.get("attempt_id")
        assert "#t=" in signing_url
        with provider_lock:
            provider_calls.append(
                {
                    "delivery_identity": delivery_identity,
                    "attempt_id": str(record["attempt_id"]),
                    "idempotency_key": idempotency_key,
                    "recipient_email": recipient_email,
                }
            )
        return True, f"msg_{delivery_identity}", None

    def _deliver_once():
        start_barrier.wait()
        return ads.deliver_vs01_signing_invites_authoritative(
            agreement_id,
            document_id=document_id,
            attempted_at="2026-07-17T12:00:00Z",
            provider_send_fn=_mock_provider_send,
            delivery_allowed=True,
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: _deliver_once(), range(2)))

    assert all(result["ok"] for result in results)
    assert len(provider_calls) == 2
    assert len({call["delivery_identity"] for call in provider_calls}) == 2

    stored_batch = ads.load_draft(agreement_id)[VS01_SIGNING_INVITE_DELIVERY_FIELD]
    assert len(stored_batch["recipients"]) == 2
    assert all(row["state"] == STATE_DELIVERED for row in stored_batch["recipients"].values())
    for call in provider_calls:
        persisted = stored_batch["recipients"][call["delivery_identity"]]
        assert persisted["attempt_id"] == call["attempt_id"]
        assert persisted["provider_idempotency_key"] == call["idempotency_key"]

    delivery_identities = list(stored_batch["recipients"].keys())
    first_identity = delivery_identities[0]
    winner_attempt = stored_batch["recipients"][first_identity]["attempt_id"]
    reversed_outcomes = [
        RecipientTerminalOutcome(
            delivery_identity=delivery_identities[1],
            attempt_id="loser-attempt",
            new_state=STATE_DELIVERED,
            provider_message_id="msg_loser",
        ),
        RecipientTerminalOutcome(
            delivery_identity=first_identity,
            attempt_id="loser-attempt",
            new_state=STATE_FAILED,
            failure_code="loser_overwrite_attempt",
        ),
        RecipientTerminalOutcome(
            delivery_identity=first_identity,
            attempt_id=winner_attempt,
            new_state=STATE_DELIVERED,
            provider_message_id="msg_winner",
        ),
    ]
    merged = merge_recipient_terminal_outcomes_cas(
        stored_batch,
        outcomes=list(reversed(reversed_outcomes)),
        attempted_at="2026-07-17T12:00:01Z",
    )
    assert merged["recipients"][first_identity]["state"] == STATE_DELIVERED
    assert merged["recipients"][first_identity]["attempt_id"] == winner_attempt

    latest = ads.load_draft(agreement_id)
    loser_persist = ads._merge_delivery_terminal_outcomes_on_latest(
        latest,
        outcomes=[
            RecipientTerminalOutcome(
                delivery_identity=first_identity,
                attempt_id="loser-attempt",
                new_state=STATE_FAILED,
                failure_code="loser_overwrite_attempt",
            )
        ],
        attempted_at="2026-07-17T12:00:02Z",
    )
    ads.save_draft(loser_persist)
    reloaded = ads.load_draft(agreement_id)
    assert reloaded[VS01_SIGNING_INVITE_DELIVERY_FIELD]["recipients"][first_identity]["state"] == STATE_DELIVERED

    delivery_snapshot = copy.deepcopy(reloaded[VS01_SIGNING_INVITE_DELIVERY_FIELD])
    touched = copy.deepcopy(reloaded)
    touched["title"] = "PG title touch preserves delivery"
    ads.save_draft(touched)
    after_touch = ads.load_draft(agreement_id)
    assert after_touch["title"] == "PG title touch preserves delivery"
    assert after_touch[VS01_SIGNING_INVITE_DELIVERY_FIELD] == delivery_snapshot

    with pytest.raises(Vs01SigningInviteDeliveryError) as stale_doc:
        ads.deliver_vs01_signing_invites_authoritative(
            agreement_id,
            document_id="doc_stale_mismatch",
            attempted_at="2026-07-17T12:00:03Z",
            provider_send_fn=_mock_provider_send,
            delivery_allowed=True,
        )
    assert stale_doc.value.code == "document_id_mismatch"

    lock = als.read_signing_lock(agreement_id)
    assert isinstance(lock, dict)
    als.write_signing_lock(
        agreement_id,
        {**lock, "locked_version_id": "av_stale_postgres_delivery"},
    )
    with pytest.raises(Vs01SigningInviteDeliveryError) as stale_lock:
        ads.deliver_vs01_signing_invites_authoritative(
            agreement_id,
            document_id=document_id,
            attempted_at="2026-07-17T12:00:04Z",
            provider_send_fn=_mock_provider_send,
            delivery_allowed=True,
        )
    assert stale_lock.value.code == "signing_lock_version_mismatch"

    final_batch = ads.load_draft(agreement_id)[VS01_SIGNING_INVITE_DELIVERY_FIELD]
    assert final_batch == delivery_snapshot
    assert len(provider_calls) == 2


@pytest.mark.skipif(not _PG, reason="CLAW_AGREEMENT_PG_TEST_URL not set")
def test_postgres_concurrent_bootstrap_exchange_one_winner(monkeypatch, tmp_path):
    """Phase 3C2A bootstrap exchange under real Postgres row locking."""
    _configure_postgres_test_env(monkeypatch)
    _reset_postgres_migrations()
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(tmp_path / "agreements.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "pg-test-bootstrap-exchange-secret")
    monkeypatch.setenv("CLAW_RECIPIENT_BOOTSTRAP_RATE_LIMIT_DISABLED", "1")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <noreply@example.test>")
    monkeypatch.setenv("CLAW_SIGNING_INVITE_DELIVERY_ENABLED", "1")
    monkeypatch.setenv("CLAW_SIGNING_INVITE_RECIPIENT_BOOTSTRAP_ENABLED", "1")

    from fastapi.testclient import TestClient

    from backend.main import app
    from backend.services import agreement_draft_store as ads
    from backend.services import agreement_signing_lock_store as als
    from backend.services.recipient_bootstrap_session_store import count_sessions_for_agreement
    from backend.services.vs01_signing_invite_delivery import VS01_SIGNING_INVITE_DELIVERY_FIELD
    from backend.tests.test_vs01_signing_invite_delivery import _token_from_signing_url
    from backend.tests.test_vs01_signing_packet_activation import _DOCUMENT_ID

    agreement_id = f"test_pg_bootstrap_{uuid.uuid4().hex}"
    document_id = _DOCUMENT_ID
    _setup_pg_3c1b_delivery_agreement(
        ads,
        als,
        agreement_id=agreement_id,
        document_id=document_id,
    )

    provider_calls: list[dict] = []

    def _mock_provider_send(
        agreement_id_arg: str,
        delivery_identity: str,
        recipient_email: str,
        signing_url: str,
        idempotency_key: str,
    ):
        provider_calls.append(
            {
                "delivery_identity": delivery_identity,
                "signing_url": signing_url,
            }
        )
        return True, f"msg_{delivery_identity}", None

    ads.deliver_vs01_signing_invites_authoritative(
        agreement_id,
        document_id=document_id,
        attempted_at="2026-07-17T12:00:00Z",
        provider_send_fn=_mock_provider_send,
        delivery_allowed=True,
    )
    assert provider_calls
    token = _token_from_signing_url(provider_calls[0]["signing_url"])
    client = TestClient(app)
    barrier = threading.Barrier(2)

    def _exchange_once():
        barrier.wait()
        return client.post(
            "/api/recipient/bootstrap/exchange",
            json={"token": token},
            headers={"Origin": "http://testserver"},
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: _exchange_once(), range(2)))
    ok = [r for r in results if r.status_code == 200]
    fail = [r for r in results if r.status_code == 403]
    assert len(ok) == 1
    assert len(fail) == 1
    assert count_sessions_for_agreement(agreement_id) == 1
    stored = ads.load_draft(agreement_id)[VS01_SIGNING_INVITE_DELIVERY_FIELD]
    exchanged = [
        row
        for row in stored["recipients"].values()
        if row.get("bootstrap_exchanged_at")
    ]
    assert len(exchanged) == 1


@pytest.mark.skipif(not _PG, reason="CLAW_AGREEMENT_PG_TEST_URL not set")
def test_postgres_session_packet_read_after_bootstrap_exchange(monkeypatch, tmp_path):
    """Phase 3C2B session packet projection under real Postgres row locking."""
    _configure_postgres_test_env(monkeypatch)
    _reset_postgres_migrations()
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(tmp_path / "agreements.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "pg-test-session-packet-secret")
    monkeypatch.setenv("CLAW_RECIPIENT_BOOTSTRAP_RATE_LIMIT_DISABLED", "1")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <noreply@example.test>")
    monkeypatch.setenv("CLAW_SIGNING_INVITE_DELIVERY_ENABLED", "1")
    monkeypatch.setenv("CLAW_SIGNING_INVITE_RECIPIENT_BOOTSTRAP_ENABLED", "1")

    from fastapi.testclient import TestClient

    from backend.main import app
    from backend.services import agreement_draft_store as ads
    from backend.services import agreement_signing_lock_store as als
    from backend.tests.test_vs01_signing_invite_delivery import _token_from_signing_url
    from backend.tests.test_vs01_signing_packet_activation import _DOCUMENT_ID

    agreement_id = f"test_pg_session_packet_{uuid.uuid4().hex}"
    document_id = _DOCUMENT_ID
    _setup_pg_3c1b_delivery_agreement(
        ads,
        als,
        agreement_id=agreement_id,
        document_id=document_id,
    )

    provider_calls: list[dict] = []

    def _mock_provider_send(
        agreement_id_arg: str,
        delivery_identity: str,
        recipient_email: str,
        signing_url: str,
        idempotency_key: str,
    ):
        provider_calls.append({"signing_url": signing_url})
        return True, f"msg_{delivery_identity}", None

    ads.deliver_vs01_signing_invites_authoritative(
        agreement_id,
        document_id=document_id,
        attempted_at="2026-07-17T12:00:00Z",
        provider_send_fn=_mock_provider_send,
        delivery_allowed=True,
    )
    token = _token_from_signing_url(provider_calls[0]["signing_url"])
    client = TestClient(app)
    exchange = client.post(
        "/api/recipient/bootstrap/exchange",
        json={"token": token},
        headers={"Origin": "http://testserver"},
    )
    assert exchange.status_code == 200
    packet = client.get("/api/recipient/session/packet")
    assert packet.status_code == 200
    body = packet.json()
    assert body["readiness"] == "ready_for_signing"
    assert body["corpus_plain"].strip()
    assert isinstance(body["fields"], list)
    assert packet.headers.get("cache-control") == "no-store, private"


@pytest.mark.skipif(not _PG, reason="CLAW_AGREEMENT_PG_TEST_URL not set")
def test_postgres_recipient_session_signing_field_mutation(monkeypatch, tmp_path):
    """Phase 3C2C signing field mutation under real Postgres row locking."""
    _configure_postgres_test_env(monkeypatch)
    _reset_postgres_migrations()
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(tmp_path / "agreements.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "pg-test-3c2c-signing-secret")
    monkeypatch.setenv("CLAW_RECIPIENT_BOOTSTRAP_RATE_LIMIT_DISABLED", "1")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <noreply@example.test>")
    monkeypatch.setenv("CLAW_SIGNING_INVITE_DELIVERY_ENABLED", "1")
    monkeypatch.setenv("CLAW_SIGNING_INVITE_RECIPIENT_BOOTSTRAP_ENABLED", "1")

    from fastapi.testclient import TestClient

    from backend.main import app
    from backend.services import agreement_draft_store as ads
    from backend.services import agreement_signing_lock_store as als
    from backend.services.recipient_session_signing_mutations import VS01_RECIPIENT_SIGNER_STATE_FIELD
    from backend.tests.test_vs01_signing_invite_delivery import _token_from_signing_url
    from backend.tests.test_vs01_signing_packet_activation import _DOCUMENT_ID

    agreement_id = f"test_pg_3c2c_signing_{uuid.uuid4().hex}"
    document_id = _DOCUMENT_ID
    _setup_pg_3c1b_delivery_agreement(
        ads,
        als,
        agreement_id=agreement_id,
        document_id=document_id,
    )

    provider_calls: list[dict] = []

    def _mock_provider_send(
        agreement_id_arg: str,
        delivery_identity: str,
        recipient_email: str,
        signing_url: str,
        idempotency_key: str,
    ):
        provider_calls.append({"signing_url": signing_url})
        return True, f"msg_{delivery_identity}", None

    ads.deliver_vs01_signing_invites_authoritative(
        agreement_id,
        document_id=document_id,
        attempted_at="2026-07-17T12:00:00Z",
        provider_send_fn=_mock_provider_send,
        delivery_allowed=True,
    )
    token = _token_from_signing_url(provider_calls[0]["signing_url"])
    client = TestClient(app)
    assert client.post(
        "/api/recipient/bootstrap/exchange",
        json={"token": token},
        headers={"Origin": "http://testserver"},
    ).status_code == 200
    field_res = client.post(
        "/api/recipient/session/fields",
        json=_pg_field_json("f1", "Jane Signer"),
        headers={"Origin": "http://testserver"},
    )
    assert field_res.status_code == 200
    complete_res = client.post(
        "/api/recipient/session/complete",
        json={},
        headers={"Origin": "http://testserver"},
    )
    assert complete_res.status_code == 200
    assert complete_res.json()["signer_complete"] is True
    assert complete_res.json()["globally_executed"] is False
    draft = ads.load_draft(agreement_id)
    stored = draft[VS01_RECIPIENT_SIGNER_STATE_FIELD]["by_signer_record_id"]
    assert next(iter(stored.values()))["field_values"]["f1"]["value"] == "Jane Signer"


@pytest.mark.skipif(not _PG, reason="CLAW_AGREEMENT_PG_TEST_URL not set")
def test_postgres_concurrent_distinct_field_mutations_preserve_both(monkeypatch, tmp_path):
    _configure_postgres_test_env(monkeypatch)
    _reset_postgres_migrations()
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(tmp_path / "agreements.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "pg-test-3c2c-concurrency-secret")
    monkeypatch.setenv("CLAW_RECIPIENT_BOOTSTRAP_RATE_LIMIT_DISABLED", "1")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <noreply@example.test>")
    monkeypatch.setenv("CLAW_SIGNING_INVITE_DELIVERY_ENABLED", "1")
    monkeypatch.setenv("CLAW_SIGNING_INVITE_RECIPIENT_BOOTSTRAP_ENABLED", "1")

    from fastapi.testclient import TestClient

    from backend.main import app
    from backend.services import agreement_draft_store as ads
    from backend.services import agreement_signing_lock_store as als
    from backend.services.recipient_session_signing_mutations import VS01_RECIPIENT_SIGNER_STATE_FIELD
    from backend.tests.test_vs01_signing_invite_delivery import _token_from_signing_url
    from backend.tests.test_vs01_signing_packet_activation import _DOCUMENT_ID, _stable_role_id

    agreement_id = f"test_pg_3c2c_distinct_{uuid.uuid4().hex}"
    document_id = _DOCUMENT_ID
    party_id = "party-owner"
    role_id = _stable_role_id(agreement_id, 0, party_id)
    _setup_pg_3c1b_delivery_agreement(
        ads,
        als,
        agreement_id=agreement_id,
        document_id=document_id,
        extra_portable_fields=[
            {
                "id": "init1",
                "type": "initials",
                "page": 1,
                "x": 0.1,
                "y": 0.1,
                "width": 0.1,
                "height": 0.05,
                "counterpartyId": party_id,
                "assignedSignerRoleId": role_id,
            }
        ],
    )

    provider_calls: list[dict] = []

    ads.deliver_vs01_signing_invites_authoritative(
        agreement_id,
        document_id=document_id,
        attempted_at="2026-07-17T12:00:00Z",
        provider_send_fn=_capture_signing_url_provider(provider_calls),
        delivery_allowed=True,
    )
    token = _token_from_signing_url(provider_calls[0]["signing_url"])
    client = TestClient(app)
    assert client.post(
        "/api/recipient/bootstrap/exchange",
        json={"token": token},
        headers={"Origin": "http://testserver"},
    ).status_code == 200
    barrier = threading.Barrier(2)

    def _write(field_id: str, value: str) -> None:
        barrier.wait()
        assert (
            client.post(
                "/api/recipient/session/fields",
                json=_pg_field_json(field_id, value),
                headers={"Origin": "http://testserver"},
            ).status_code
            == 200
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda args: _write(*args), [("f1", "Sig"), ("init1", "JS")]))
    stored = ads.load_draft(agreement_id)[VS01_RECIPIENT_SIGNER_STATE_FIELD]["by_signer_record_id"]
    values = next(iter(stored.values()))["field_values"]
    assert values["f1"]["value"] == "Sig"
    assert values["init1"]["value"] == "JS"


@pytest.mark.skipif(not _PG, reason="CLAW_AGREEMENT_PG_TEST_URL not set")
def test_postgres_concurrent_same_field_identical_mutations_idempotent(monkeypatch, tmp_path):
    _configure_postgres_test_env(monkeypatch)
    _reset_postgres_migrations()
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(tmp_path / "agreements.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "pg-test-3c2c-idempotent-secret")
    monkeypatch.setenv("CLAW_RECIPIENT_BOOTSTRAP_RATE_LIMIT_DISABLED", "1")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <noreply@example.test>")
    monkeypatch.setenv("CLAW_SIGNING_INVITE_DELIVERY_ENABLED", "1")
    monkeypatch.setenv("CLAW_SIGNING_INVITE_RECIPIENT_BOOTSTRAP_ENABLED", "1")

    from fastapi.testclient import TestClient

    from backend.main import app
    from backend.services import agreement_draft_store as ads
    from backend.services import agreement_signing_lock_store as als
    from backend.services.recipient_session_signing_mutations import VS01_RECIPIENT_SIGNER_STATE_FIELD
    from backend.tests.test_vs01_signing_invite_delivery import _token_from_signing_url
    from backend.tests.test_vs01_signing_packet_activation import _DOCUMENT_ID

    agreement_id = f"test_pg_3c2c_idempotent_{uuid.uuid4().hex}"
    document_id = _DOCUMENT_ID
    _setup_pg_3c1b_delivery_agreement(ads, als, agreement_id=agreement_id, document_id=document_id)
    provider_calls: list[dict] = []

    ads.deliver_vs01_signing_invites_authoritative(
        agreement_id,
        document_id=document_id,
        attempted_at="2026-07-17T12:00:00Z",
        provider_send_fn=_capture_signing_url_provider(provider_calls),
        delivery_allowed=True,
    )
    token = _token_from_signing_url(provider_calls[0]["signing_url"])
    client = TestClient(app)
    assert client.post(
        "/api/recipient/bootstrap/exchange",
        json={"token": token},
        headers={"Origin": "http://testserver"},
    ).status_code == 200
    shared_mutation_id = f"mut-{uuid.uuid4().hex}"
    barrier = threading.Barrier(2)

    def _write() -> None:
        barrier.wait()
        assert (
            client.post(
                "/api/recipient/session/fields",
                json=_pg_field_json("f1", "Same", mutation_id=shared_mutation_id),
                headers={"Origin": "http://testserver"},
            ).status_code
            == 200
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda _: _write(), range(2)))
    stored = ads.load_draft(agreement_id)[VS01_RECIPIENT_SIGNER_STATE_FIELD]["by_signer_record_id"]
    assert next(iter(stored.values()))["field_values"]["f1"]["value"] == "Same"


@pytest.mark.skipif(not _PG, reason="CLAW_AGREEMENT_PG_TEST_URL not set")
def test_postgres_completion_racing_with_required_field_mutation_cannot_complete_prematurely(
    monkeypatch, tmp_path
):
    """Postgres row lock serializes completion with in-flight field writes."""
    _configure_postgres_test_env(monkeypatch)
    _reset_postgres_migrations()
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(tmp_path / "agreements.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "pg-test-3c2c-complete-race-secret")
    monkeypatch.setenv("CLAW_RECIPIENT_BOOTSTRAP_RATE_LIMIT_DISABLED", "1")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <noreply@example.test>")
    monkeypatch.setenv("CLAW_SIGNING_INVITE_DELIVERY_ENABLED", "1")
    monkeypatch.setenv("CLAW_SIGNING_INVITE_RECIPIENT_BOOTSTRAP_ENABLED", "1")

    from unittest.mock import patch

    from fastapi.testclient import TestClient

    from backend.db import agreement_sql
    from backend.main import app
    from backend.services import agreement_draft_store as ads
    from backend.services import agreement_signing_lock_store as als
    from backend.services.recipient_session_signing_mutations import VS01_RECIPIENT_SIGNER_STATE_FIELD
    from backend.tests.test_vs01_signing_invite_delivery import _token_from_signing_url
    from backend.tests.test_vs01_signing_packet_activation import _DOCUMENT_ID

    agreement_id = f"test_pg_3c2c_complete_race_{uuid.uuid4().hex}"
    document_id = _DOCUMENT_ID
    _setup_pg_3c1b_delivery_agreement(ads, als, agreement_id=agreement_id, document_id=document_id)
    provider_calls: list[dict] = []

    ads.deliver_vs01_signing_invites_authoritative(
        agreement_id,
        document_id=document_id,
        attempted_at="2026-07-17T12:00:00Z",
        provider_send_fn=_capture_signing_url_provider(provider_calls),
        delivery_allowed=True,
    )
    token = _token_from_signing_url(provider_calls[0]["signing_url"])
    client = TestClient(app)
    assert client.post(
        "/api/recipient/bootstrap/exchange",
        json={"token": token},
        headers={"Origin": "http://testserver"},
    ).status_code == 200
    assert (
        client.post(
            "/api/recipient/session/complete",
            json={},
            headers={"Origin": "http://testserver"},
        ).status_code
        == 400
    )

    write_entered = threading.Event()
    release_write = threading.Event()
    complete_codes: list[int] = []
    original_pg_execute = agreement_sql.pg_execute

    def blocking_pg_execute(cx, sql, params=()):
        if "UPDATE agreement_drafts" in sql:
            write_entered.set()
            release_write.wait(timeout=5)
        return original_pg_execute(cx, sql, params)

    with patch("backend.db.agreement_sql.pg_execute", blocking_pg_execute):
        with ThreadPoolExecutor(max_workers=2) as pool:
            field_future = pool.submit(
                lambda: client.post(
                    "/api/recipient/session/fields",
                    json=_pg_field_json("f1", "Jane Signer"),
                    headers={"Origin": "http://testserver"},
                ).status_code
            )
            assert write_entered.wait(timeout=5)
            complete_future = pool.submit(
                lambda: complete_codes.append(
                    client.post(
                        "/api/recipient/session/complete",
                        json={},
                        headers={"Origin": "http://testserver"},
                    ).status_code
                )
            )
            draft_mid = ads.load_draft(agreement_id)
            signer_state_mid = draft_mid.get(VS01_RECIPIENT_SIGNER_STATE_FIELD, {}).get(
                "by_signer_record_id", {}
            )
            if signer_state_mid:
                field_values_mid = next(iter(signer_state_mid.values())).get("field_values", {})
                assert "f1" not in field_values_mid
            release_write.set()
            assert field_future.result(timeout=5) == 200
            complete_future.result(timeout=5)
    assert complete_codes == [200]
    stored = ads.load_draft(agreement_id)[VS01_RECIPIENT_SIGNER_STATE_FIELD]["by_signer_record_id"]
    assert next(iter(stored.values()))["field_values"]["f1"]["value"] == "Jane Signer"


@pytest.mark.skipif(not _PG, reason="CLAW_AGREEMENT_PG_TEST_URL not set")
def test_postgres_generic_draft_save_preserves_signer_state(monkeypatch, tmp_path):
    _configure_postgres_test_env(monkeypatch)
    _reset_postgres_migrations()
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(tmp_path / "agreements.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "pg-test-3c2c-preserve-secret")
    monkeypatch.setenv("CLAW_RECIPIENT_BOOTSTRAP_RATE_LIMIT_DISABLED", "1")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <noreply@example.test>")
    monkeypatch.setenv("CLAW_SIGNING_INVITE_DELIVERY_ENABLED", "1")
    monkeypatch.setenv("CLAW_SIGNING_INVITE_RECIPIENT_BOOTSTRAP_ENABLED", "1")

    from fastapi.testclient import TestClient

    from backend.main import app
    from backend.services import agreement_draft_store as ads
    from backend.services import agreement_signing_lock_store as als
    from backend.services.recipient_session_signing_mutations import VS01_RECIPIENT_SIGNER_STATE_FIELD
    from backend.tests.test_vs01_signing_invite_delivery import _token_from_signing_url
    from backend.tests.test_vs01_signing_packet_activation import _DOCUMENT_ID

    agreement_id = f"test_pg_3c2c_preserve_{uuid.uuid4().hex}"
    document_id = _DOCUMENT_ID
    _setup_pg_3c1b_delivery_agreement(ads, als, agreement_id=agreement_id, document_id=document_id)
    provider_calls: list[dict] = []

    ads.deliver_vs01_signing_invites_authoritative(
        agreement_id,
        document_id=document_id,
        attempted_at="2026-07-17T12:00:00Z",
        provider_send_fn=_capture_signing_url_provider(provider_calls),
        delivery_allowed=True,
    )
    token = _token_from_signing_url(provider_calls[0]["signing_url"])
    client = TestClient(app)
    assert client.post(
        "/api/recipient/bootstrap/exchange",
        json={"token": token},
        headers={"Origin": "http://testserver"},
    ).status_code == 200
    assert client.post(
        "/api/recipient/session/fields",
        json=_pg_field_json("f1", "Persisted"),
        headers={"Origin": "http://testserver"},
    ).status_code == 200
    draft = ads.load_draft(agreement_id)
    draft["title"] = "Updated title only"
    ads.save_draft(draft)
    after = ads.load_draft(agreement_id)
    stored = after[VS01_RECIPIENT_SIGNER_STATE_FIELD]["by_signer_record_id"]
    assert next(iter(stored.values()))["field_values"]["f1"]["value"] == "Persisted"


def _pg_recipient_client(monkeypatch, tmp_path, *, secret_suffix: str):
    _configure_postgres_test_env(monkeypatch)
    _reset_postgres_migrations()
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(tmp_path / "agreements.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", f"pg-test-3c2c-{secret_suffix}")
    monkeypatch.setenv("CLAW_RECIPIENT_BOOTSTRAP_RATE_LIMIT_DISABLED", "1")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <noreply@example.test>")
    monkeypatch.setenv("CLAW_SIGNING_INVITE_DELIVERY_ENABLED", "1")
    monkeypatch.setenv("CLAW_SIGNING_INVITE_RECIPIENT_BOOTSTRAP_ENABLED", "1")

    from fastapi.testclient import TestClient

    from backend.main import app
    from backend.services import agreement_draft_store as ads
    from backend.services import agreement_signing_lock_store as als
    from backend.tests.test_vs01_signing_invite_delivery import _token_from_signing_url
    from backend.tests.test_vs01_signing_packet_activation import _DOCUMENT_ID

    agreement_id = f"test_pg_3c2c_{secret_suffix}_{uuid.uuid4().hex}"
    document_id = _DOCUMENT_ID
    _setup_pg_3c1b_delivery_agreement(ads, als, agreement_id=agreement_id, document_id=document_id)
    provider_calls: list[dict] = []
    ads.deliver_vs01_signing_invites_authoritative(
        agreement_id,
        document_id=document_id,
        attempted_at="2026-07-17T12:00:00Z",
        provider_send_fn=_capture_signing_url_provider(provider_calls),
        delivery_allowed=True,
    )
    token = _token_from_signing_url(provider_calls[0]["signing_url"])
    client = TestClient(app)
    assert client.post(
        "/api/recipient/bootstrap/exchange",
        json={"token": token},
        headers={"Origin": "http://testserver"},
    ).status_code == 200
    return client, ads, agreement_id


@pytest.mark.skipif(not _PG, reason="CLAW_AGREEMENT_PG_TEST_URL not set")
def test_postgres_same_mutation_id_identical_retry(monkeypatch, tmp_path):
    from backend.services.recipient_session_signing_mutations import VS01_RECIPIENT_SIGNER_STATE_FIELD

    client, ads, agreement_id = _pg_recipient_client(monkeypatch, tmp_path, secret_suffix="mut-retry")
    mid = f"mut-{uuid.uuid4().hex}"
    first = client.post(
        "/api/recipient/session/fields",
        json=_pg_field_json("f1", "Jane", mutation_id=mid),
        headers={"Origin": "http://testserver"},
    )
    assert first.status_code == 200
    second = client.post(
        "/api/recipient/session/fields",
        json=_pg_field_json("f1", "Jane", mutation_id=mid),
        headers={"Origin": "http://testserver"},
    )
    assert second.status_code == 200
    assert second.json()["idempotent"] is True
    stored = ads.load_draft(agreement_id)[VS01_RECIPIENT_SIGNER_STATE_FIELD]["by_signer_record_id"]
    assert next(iter(stored.values()))["field_values"]["f1"]["revision"] == 1


@pytest.mark.skipif(not _PG, reason="CLAW_AGREEMENT_PG_TEST_URL not set")
def test_postgres_same_mutation_id_different_material_conflict(monkeypatch, tmp_path):
    client, _, _ = _pg_recipient_client(monkeypatch, tmp_path, secret_suffix="mut-conflict")
    mid = f"mut-{uuid.uuid4().hex}"
    assert client.post(
        "/api/recipient/session/fields",
        json=_pg_field_json("f1", "First", mutation_id=mid),
        headers={"Origin": "http://testserver"},
    ).status_code == 200
    conflict = client.post(
        "/api/recipient/session/fields",
        json=_pg_field_json("f1", "Different", expected_revision=1, mutation_id=mid),
        headers={"Origin": "http://testserver"},
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "mutation_id_conflict"


@pytest.mark.skipif(not _PG, reason="CLAW_AGREEMENT_PG_TEST_URL not set")
def test_postgres_different_mutation_id_stale_revision(monkeypatch, tmp_path):
    from backend.services.recipient_session_signing_mutations import VS01_RECIPIENT_SIGNER_STATE_FIELD

    client, ads, agreement_id = _pg_recipient_client(monkeypatch, tmp_path, secret_suffix="stale-rev")
    assert client.post(
        "/api/recipient/session/fields",
        json=_pg_field_json("f1", "Current"),
        headers={"Origin": "http://testserver"},
    ).status_code == 200
    stale = client.post(
        "/api/recipient/session/fields",
        json=_pg_field_json("f1", "Stale", expected_revision=0),
        headers={"Origin": "http://testserver"},
    )
    assert stale.status_code == 409
    stored = ads.load_draft(agreement_id)[VS01_RECIPIENT_SIGNER_STATE_FIELD]["by_signer_record_id"]
    assert next(iter(stored.values()))["field_values"]["f1"]["value"] == "Current"


@pytest.mark.skipif(not _PG, reason="CLAW_AGREEMENT_PG_TEST_URL not set")
def test_postgres_concurrent_same_field_different_mutation_ids(monkeypatch, tmp_path):
    from backend.services.recipient_session_signing_mutations import VS01_RECIPIENT_SIGNER_STATE_FIELD

    client, ads, agreement_id = _pg_recipient_client(monkeypatch, tmp_path, secret_suffix="same-field")
    barrier = threading.Barrier(2)
    statuses: list[int] = []

    def _write(value: str) -> None:
        barrier.wait()
        statuses.append(
            client.post(
                "/api/recipient/session/fields",
                json=_pg_field_json("f1", value),
                headers={"Origin": "http://testserver"},
            ).status_code
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(_write, ["Winner", "Loser"]))
    assert 200 in statuses
    assert any(code == 409 for code in statuses)
    stored = ads.load_draft(agreement_id)[VS01_RECIPIENT_SIGNER_STATE_FIELD]["by_signer_record_id"]
    assert next(iter(stored.values()))["field_values"]["f1"]["revision"] == 1


@pytest.mark.skipif(not _PG, reason="CLAW_AGREEMENT_PG_TEST_URL not set")
@pytest.mark.parametrize("attempt", range(5))
def test_postgres_revoked_session_during_mutation_lock_fails_closed(monkeypatch, tmp_path, attempt):
    from unittest.mock import patch

    from backend.services.recipient_session_signing_mutations import VS01_RECIPIENT_SIGNER_STATE_FIELD

    client, ads, agreement_id = _pg_recipient_client(
        monkeypatch, tmp_path, secret_suffix=f"revoke-race-{attempt}"
    )
    before = ads.load_draft(agreement_id)
    before_state = copy.deepcopy(before.get(VS01_RECIPIENT_SIGNER_STATE_FIELD))
    before_audit = len(before.get("audit_log") or [])
    gate_entered = threading.Event()
    release_gate = threading.Event()
    from backend.services import recipient_bootstrap_session_store as session_store_mod

    real_lookup = session_store_mod.get_session_by_token_hash_for_update

    def blocking_lookup(cx, token_hash):
        gate_entered.set()
        release_gate.wait(timeout=5)
        return real_lookup(cx, token_hash)

    with patch.object(session_store_mod, "get_session_by_token_hash_for_update", blocking_lookup):
        with ThreadPoolExecutor(max_workers=2) as pool:
            mutation_future = pool.submit(
                lambda: client.post(
                    "/api/recipient/session/fields",
                    json=_pg_field_json("f1", "Jane"),
                    headers={"Origin": "http://testserver"},
                ).status_code
            )
            assert gate_entered.wait(timeout=5)
            client.post("/api/recipient/session/logout", headers={"Origin": "http://testserver"})
            release_gate.set()
            status = mutation_future.result(timeout=5)
    assert status == 403
    after = ads.load_draft(agreement_id)
    assert after.get(VS01_RECIPIENT_SIGNER_STATE_FIELD) == before_state
    assert len(after.get("audit_log") or []) == before_audit


@pytest.mark.skipif(not _PG, reason="CLAW_AGREEMENT_PG_TEST_URL not set")
def test_postgres_completion_racing_logout_when_logout_wins_completion_fails(monkeypatch, tmp_path):
    from unittest.mock import patch

    from backend.services import recipient_session_signing_mutations as mutations_mod
    from backend.services.recipient_session_signing_mutations import VS01_RECIPIENT_SIGNER_STATE_FIELD

    client, ads, agreement_id = _pg_recipient_client(
        monkeypatch, tmp_path, secret_suffix="complete-logout-wins"
    )
    assert client.post(
        "/api/recipient/session/fields",
        json=_pg_field_json("f1", "Jane Signer"),
        headers={"Origin": "http://testserver"},
    ).status_code == 200
    before_audit = len(ads.load_draft(agreement_id).get("audit_log") or [])

    gate_entered = threading.Event()
    release_gate = threading.Event()
    complete_codes: list[int] = []
    real_with_locked = mutations_mod._with_locked_draft_mutation

    def blocking_with_locked(*, session_secret: str, mutate_fn):
        from backend.services.vs01_recipient_bootstrap_exchange import _lookup_active_session

        if not _lookup_active_session(session_secret):
            raise mutations_mod.RecipientSessionSigningMutationError()
        gate_entered.set()
        release_gate.wait(timeout=5)
        return real_with_locked(session_secret=session_secret, mutate_fn=mutate_fn)

    with patch.object(mutations_mod, "_with_locked_draft_mutation", blocking_with_locked):
        with ThreadPoolExecutor(max_workers=2) as pool:
            complete_future = pool.submit(
                lambda: complete_codes.append(
                    client.post(
                        "/api/recipient/session/complete",
                        json={},
                        headers={"Origin": "http://testserver"},
                    ).status_code
                )
            )
            assert gate_entered.wait(timeout=5)
            assert (
                client.post("/api/recipient/session/logout", headers={"Origin": "http://testserver"}).status_code
                == 200
            )
            release_gate.set()
            complete_future.result(timeout=5)

    assert complete_codes == [403]
    after = ads.load_draft(agreement_id)
    stored = after[VS01_RECIPIENT_SIGNER_STATE_FIELD]["by_signer_record_id"]
    assert not next(iter(stored.values())).get("completed_at")
    assert len(after.get("audit_log") or []) == before_audit


@pytest.mark.skipif(not _PG, reason="CLAW_AGREEMENT_PG_TEST_URL not set")
def test_postgres_completion_racing_logout_when_completion_wins_logout_revokes_after(
    monkeypatch, tmp_path
):
    from unittest.mock import patch

    from backend.services import recipient_session_signing_mutations as mutations_mod
    from backend.services.recipient_session_signing_mutations import VS01_RECIPIENT_SIGNER_STATE_FIELD
    from backend.services.vs01_signer_completion import completed_vs01_signer_role_ids

    client, ads, agreement_id = _pg_recipient_client(
        monkeypatch, tmp_path, secret_suffix="complete-logout-loses"
    )
    assert client.post(
        "/api/recipient/session/fields",
        json=_pg_field_json("f1", "Jane Signer"),
        headers={"Origin": "http://testserver"},
    ).status_code == 200

    gate_entered = threading.Event()
    release_gate = threading.Event()
    logout_codes: list[int] = []
    real_complete = mutations_mod._complete_signer_locked

    def blocking_complete(*args, **kwargs):
        gate_entered.set()
        release_gate.wait(timeout=5)
        return real_complete(*args, **kwargs)

    with patch.object(mutations_mod, "_complete_signer_locked", blocking_complete):
        with ThreadPoolExecutor(max_workers=2) as pool:
            complete_future = pool.submit(
                lambda: client.post(
                    "/api/recipient/session/complete",
                    json={},
                    headers={"Origin": "http://testserver"},
                ).status_code
            )
            assert gate_entered.wait(timeout=5)
            logout_future = pool.submit(
                lambda: logout_codes.append(
                    client.post("/api/recipient/session/logout", headers={"Origin": "http://testserver"}).status_code
                )
            )
            release_gate.set()
            complete_status = complete_future.result(timeout=5)
            logout_future.result(timeout=5)

    assert complete_status == 200
    assert logout_codes == [200]
    draft = ads.load_draft(agreement_id)
    stored = draft[VS01_RECIPIENT_SIGNER_STATE_FIELD]["by_signer_record_id"]
    assert next(iter(stored.values())).get("completed_at")
    assert len(completed_vs01_signer_role_ids(draft.get("audit_log") or [])) == 1
    assert (
        client.post(
            "/api/recipient/session/complete",
            json={},
            headers={"Origin": "http://testserver"},
        ).status_code
        == 403
    )


@pytest.mark.skipif(not _PG, reason="CLAW_AGREEMENT_PG_TEST_URL not set")
def test_postgres_idempotent_retry_no_duplicate_audit(monkeypatch, tmp_path):
    client, ads, agreement_id = _pg_recipient_client(monkeypatch, tmp_path, secret_suffix="audit-dedupe")
    mid = f"mut-{uuid.uuid4().hex}"
    assert client.post(
        "/api/recipient/session/fields",
        json=_pg_field_json("f1", "Jane Signer", mutation_id=mid),
        headers={"Origin": "http://testserver"},
    ).status_code == 200
    before_audit = len(ads.load_draft(agreement_id).get("audit_log") or [])
    assert client.post(
        "/api/recipient/session/fields",
        json=_pg_field_json("f1", "Jane Signer", mutation_id=mid),
        headers={"Origin": "http://testserver"},
    ).status_code == 200
    assert client.post(
        "/api/recipient/session/complete",
        json={},
        headers={"Origin": "http://testserver"},
    ).status_code == 200
    after_audit = len(ads.load_draft(agreement_id).get("audit_log") or [])
    assert after_audit == before_audit + 1