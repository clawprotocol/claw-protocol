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


def _setup_pg_3c1b_delivery_agreement(
    ads,
    als,
    *,
    agreement_id: str,
    document_id: str,
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
        parties=parties,
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

    aid = "test_pg_agreement_unit_id"
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
    assert body["readiness"] == "ready_for_review"
    assert body["corpus_plain"].strip()
    assert isinstance(body["fields"], list)
    assert packet.headers.get("cache-control") == "no-store, private"
