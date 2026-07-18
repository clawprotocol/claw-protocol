import copy
import json
import multiprocessing
import threading
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from urllib.parse import unquote, urlparse

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.security.vs01_recipient_bootstrap_token import (
    token_fingerprint,
    verify_vs01_recipient_bootstrap_token,
)
from backend.services.agreement_draft_store import load_draft, save_draft
from backend.services.vs01_signing_invite_delivery import (
    VS01_SIGNING_INVITE_DELIVERY_FIELD,
    CLAIM_LEASE_SECONDS,
    STATE_CLAIMED,
    STATE_DELIVERED,
    STATE_FAILED,
    STATE_PREPARED,
    STATE_RECONCILIATION_REQUIRED,
    build_signing_url_with_fragment,
    compute_delivery_identity,
    elect_and_persist_delivery_claims,
    execute_provider_for_claim_winners,
    merge_recipient_terminal_outcomes_cas,
    RecipientTerminalOutcome,
)
from backend.tests.test_vs01_signing_packet_activation import (
    _DOCUMENT_ID,
    _ORG_H,
    _activate,
    _prepare_authorities,
)
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit


def _delivery_batch(draft: dict) -> dict | None:
    batch = draft.get(VS01_SIGNING_INVITE_DELIVERY_FIELD)
    return batch if isinstance(batch, dict) else None


def _assert_no_delivery_batch(draft: dict) -> None:
    assert _delivery_batch(draft) is None

@pytest.fixture(autouse=True)
def _isolated_store(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(tmp_path / "agreements.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-signing-invite-delivery-secret")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <noreply@example.test>")
    monkeypatch.delenv("CLAW_SIGNING_INVITE_DELIVERY_ENABLED", raising=False)
    monkeypatch.delenv("CLAW_SIGNING_INVITE_RECIPIENT_BOOTSTRAP_ENABLED", raising=False)
    usage_economics_store_mod._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001


def _deliver(client: TestClient, agreement_id: str, document_id: str = _DOCUMENT_ID):
    return client.post(
        f"/api/agreements/{agreement_id}/signing-packet/deliver",
        headers=_ORG_H,
        json={"document_id": document_id},
    )


def _enable_delivery_gates(monkeypatch):
    monkeypatch.setenv("CLAW_SIGNING_INVITE_DELIVERY_ENABLED", "1")
    monkeypatch.setenv("CLAW_SIGNING_INVITE_RECIPIENT_BOOTSTRAP_ENABLED", "1")


def _mock_provider():
    calls = []

    def _send(agreement_id, delivery_identity, recipient_email, signing_url, idempotency_key):
        calls.append(
            {
                "agreement_id": agreement_id,
                "delivery_identity": delivery_identity,
                "recipient_email": recipient_email,
                "signing_url": signing_url,
                "idempotency_key": idempotency_key,
            }
        )
        assert "#t=" in signing_url
        assert "?t=" not in signing_url.split("#", 1)[0]
        return True, f"msg_{len(calls)}", None

    _send.calls = calls
    return _send


def _token_from_signing_url(signing_url: str) -> str:
    fragment = urlparse(signing_url).fragment
    assert fragment.startswith("t=")
    return unquote(fragment[2:])


def test_delivery_requires_owner_and_activation():
    client = TestClient(app)
    agreement_id, _, _, portable = _prepare_authorities(client)
    before_activation = _deliver(client, agreement_id)
    assert before_activation.status_code == 409
    assert before_activation.json()["detail"] == "signing_packet_activation_required"

    assert _activate(client, agreement_id, portable).status_code == 200
    disabled = _deliver(client, agreement_id)
    assert disabled.status_code == 200
    body = disabled.json()
    assert body["aggregate_status"] == "delivery_disabled"
    assert body["recipients"] == []
    _assert_no_delivery_batch(load_draft(agreement_id))


def test_disabled_request_creates_no_delivery_record():
    client = TestClient(app)
    agreement_id, _, _, portable = _prepare_authorities(client)
    assert _activate(client, agreement_id, portable).status_code == 200
    response = _deliver(client, agreement_id)
    assert response.status_code == 200
    assert response.json()["aggregate_status"] == "delivery_disabled"
    draft = load_draft(agreement_id)
    _assert_no_delivery_batch(draft)
    audit_types = [
        event.get("event_type")
        for event in (draft.get("audit_log") or [])
        if isinstance(event, dict)
    ]
    assert "signing_invite_delivery_attempted" not in audit_types


def test_disabled_request_does_not_require_token_secret(monkeypatch):
    client = TestClient(app)
    agreement_id, _, _, portable = _prepare_authorities(client)
    assert _activate(client, agreement_id, portable).status_code == 200

    def _secret_unavailable():
        raise RuntimeError("secret_must_not_be_required_when_disabled")

    monkeypatch.setattr(
        "backend.config.agreement_signing_token.resolve_signing_token_secret_raw",
        _secret_unavailable,
    )
    response = _deliver(client, agreement_id)
    assert response.status_code == 200
    assert response.json()["aggregate_status"] == "delivery_disabled"


def test_disabled_request_invokes_no_provider(monkeypatch):
    client = TestClient(app)
    agreement_id, _, _, portable = _prepare_authorities(client)
    assert _activate(client, agreement_id, portable).status_code == 200
    provider = _mock_provider()
    with patch(
        "backend.services.email.signing_delivery.default_authoritative_provider_send_fn",
        lambda draft: provider,
    ):
        response = _deliver(client, agreement_id)
    assert response.status_code == 200
    assert response.json()["aggregate_status"] == "delivery_disabled"
    assert provider.calls == []


def test_disabled_then_enabled_performs_one_clean_delivery_per_signer(monkeypatch):
    client = TestClient(app)
    agreement_id, _, _, portable = _prepare_authorities(client)
    assert _activate(client, agreement_id, portable).status_code == 200

    disabled = _deliver(client, agreement_id)
    assert disabled.status_code == 200
    assert disabled.json()["aggregate_status"] == "delivery_disabled"
    _assert_no_delivery_batch(load_draft(agreement_id))

    _enable_delivery_gates(monkeypatch)
    provider = _mock_provider()
    with patch(
        "backend.services.email.signing_delivery.default_authoritative_provider_send_fn",
        lambda draft: provider,
    ):
        enabled = _deliver(client, agreement_id)
    assert enabled.status_code == 200
    assert enabled.json()["aggregate_status"] == "delivered"
    assert len(provider.calls) == 2
    stored = load_draft(agreement_id)[VS01_SIGNING_INVITE_DELIVERY_FIELD]
    assert len(stored["recipients"]) == 2
    assert all(row["state"] == STATE_DELIVERED for row in stored["recipients"].values())


def test_delivered_token_matches_persisted_jti_and_fingerprint(monkeypatch):
    client = TestClient(app)
    _enable_delivery_gates(monkeypatch)
    agreement_id, _, _, portable = _prepare_authorities(client)
    assert _activate(client, agreement_id, portable).status_code == 200
    provider = _mock_provider()
    secret = b"unit-test-signing-invite-delivery-secret"
    with patch(
        "backend.services.email.signing_delivery.default_authoritative_provider_send_fn",
        lambda draft: provider,
    ):
        assert _deliver(client, agreement_id).status_code == 200
    stored = load_draft(agreement_id)[VS01_SIGNING_INVITE_DELIVERY_FIELD]
    for call in provider.calls:
        token = _token_from_signing_url(call["signing_url"])
        payload = verify_vs01_recipient_bootstrap_token(token=token, secret=secret)
        record = stored["recipients"][call["delivery_identity"]]
        assert payload["jti"] == record["token_jti"]
        assert token_fingerprint(token) == record["token_fp"]


def test_delivery_rejects_unauthenticated_owner():
    client = TestClient(app)
    agreement_id, _, _, portable = _prepare_authorities(client)
    assert _activate(client, agreement_id, portable).status_code == 200
    unauth = client.post(
        f"/api/agreements/{agreement_id}/signing-packet/deliver",
        json={"document_id": _DOCUMENT_ID},
    )
    assert unauth.status_code in (401, 403)


def test_delivery_rejects_client_recipient_overrides():
    client = TestClient(app)
    agreement_id, _, _, portable = _prepare_authorities(client)
    assert _activate(client, agreement_id, portable).status_code == 200
    response = client.post(
        f"/api/agreements/{agreement_id}/signing-packet/deliver",
        headers=_ORG_H,
        json={"document_id": _DOCUMENT_ID, "targets": [{"email": "evil@example.test"}]},
    )
    assert response.status_code == 422


def test_bootstrap_token_scope_and_no_plaintext_persistence(monkeypatch):
    client = TestClient(app)
    _enable_delivery_gates(monkeypatch)
    agreement_id, _, _, portable = _prepare_authorities(client)
    assert _activate(client, agreement_id, portable).status_code == 200
    provider = _mock_provider()
    with patch(
        "backend.services.email.signing_delivery.default_authoritative_provider_send_fn",
        lambda draft: provider,
    ):
        response = _deliver(client, agreement_id)
    assert response.status_code == 200
    stored = load_draft(agreement_id)[VS01_SIGNING_INVITE_DELIVERY_FIELD]
    serialized = json.dumps(stored)
    assert "eyJ" not in serialized
    recipients = list(stored["recipients"].values())
    jtis = {row["token_jti"] for row in recipients}
    assert len(jtis) == len(recipients)


def test_exact_retry_returns_existing_outcomes_and_does_not_resend(monkeypatch):
    client = TestClient(app)
    _enable_delivery_gates(monkeypatch)
    agreement_id, _, _, portable = _prepare_authorities(client)
    assert _activate(client, agreement_id, portable).status_code == 200
    provider = _mock_provider()
    with patch(
        "backend.services.email.signing_delivery.default_authoritative_provider_send_fn",
        lambda draft: provider,
    ):
        first = _deliver(client, agreement_id)
        second = _deliver(client, agreement_id)
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["recipients"] == second.json()["recipients"]
    assert len(provider.calls) == 2
    stored = load_draft(agreement_id)
    audit_types = [
        event.get("event_type")
        for event in (stored.get("audit_log") or [])
        if isinstance(event, dict)
    ]
    assert audit_types.count("signing_invite_delivery_attempted") == 1


def test_concurrent_identical_delivery_creates_one_claim_per_signer(monkeypatch):
    client = TestClient(app)
    _enable_delivery_gates(monkeypatch)
    agreement_id, _, _, portable = _prepare_authorities(client)
    assert _activate(client, agreement_id, portable).status_code == 200
    provider = _mock_provider()
    barrier = threading.Barrier(2)
    claimed_before_provider: list[str] = []

    def _send(agreement_id_arg, delivery_identity, recipient_email, signing_url, idempotency_key):
        stored = load_draft(agreement_id)[VS01_SIGNING_INVITE_DELIVERY_FIELD]
        record = stored["recipients"][delivery_identity]
        assert record["state"] == STATE_CLAIMED
        assert record.get("attempt_id")
        claimed_before_provider.append(delivery_identity)
        return provider(agreement_id_arg, delivery_identity, recipient_email, signing_url, idempotency_key)

    def _call():
        barrier.wait()
        with patch(
            "backend.services.email.signing_delivery.default_authoritative_provider_send_fn",
            lambda draft: _send,
        ):
            return _deliver(client, agreement_id)

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: _call(), range(2)))
    assert all(res.status_code == 200 for res in results)
    stored = load_draft(agreement_id)[VS01_SIGNING_INVITE_DELIVERY_FIELD]
    assert len(stored["recipients"]) == 2
    assert len(provider.calls) == 2
    assert len(set(claimed_before_provider)) == 2
    assert all(row["state"] == STATE_DELIVERED for row in stored["recipients"].values())


def test_provider_mock_lifecycle_delivered(monkeypatch):
    client = TestClient(app)
    _enable_delivery_gates(monkeypatch)
    agreement_id, _, _, portable = _prepare_authorities(client)
    assert _activate(client, agreement_id, portable).status_code == 200
    provider = _mock_provider()
    with patch(
        "backend.services.email.signing_delivery.default_authoritative_provider_send_fn",
        lambda draft: provider,
    ):
        response = _deliver(client, agreement_id)
    assert response.status_code == 200
    body = response.json()
    assert body["aggregate_status"] == "delivered"
    assert len(provider.calls) == 2
    stored = load_draft(agreement_id)[VS01_SIGNING_INVITE_DELIVERY_FIELD]
    assert all(row["state"] == STATE_DELIVERED for row in stored["recipients"].values())


def test_partial_delivery_reported_accurately(monkeypatch):
    client = TestClient(app)
    _enable_delivery_gates(monkeypatch)
    agreement_id, _, _, portable = _prepare_authorities(client)
    assert _activate(client, agreement_id, portable).status_code == 200

    def _send(agreement_id, delivery_identity, recipient_email, signing_url, idempotency_key):
        if recipient_email.startswith("signer1@"):
            return True, "msg_ok", None
        return False, None, "provider_send_failed"

    with patch(
        "backend.services.email.signing_delivery.default_authoritative_provider_send_fn",
        lambda draft: _send,
    ):
        response = _deliver(client, agreement_id)
    assert response.status_code == 200
    assert response.json()["aggregate_status"] == "partially_delivered"


def test_active_claim_is_not_ambiguous_during_lease():
    now_epoch = 2_000_000_000
    batch = {
        "v": 1,
        "batch_key": "aid:av:rev",
        "authority": {"document_id": _DOCUMENT_ID},
        "recipients": {
            "id1": {
                "delivery_identity": "id1",
                "state": STATE_CLAIMED,
                "attempt_id": "attempt-active",
                "claim_lease_expires_at": now_epoch + CLAIM_LEASE_SECONDS,
                "provider_idempotency_key": "id1",
                "attempt_count": 1,
                "audit_events": [],
            }
        },
    }
    canonical = {
        "v": 1,
        "batch_key": "aid:av:rev",
        "authority": {"document_id": _DOCUMENT_ID},
        "recipients": {
            "id1": {
                "delivery_identity": "id1",
                "state": STATE_PREPARED,
                "provider_idempotency_key": "id1",
                "attempt_count": 0,
                "_signing_url": "https://app.example.com/app/esign/doc#t=tok",
                "_recipient_email": "signer@example.test",
            }
        },
    }
    with patch(
        "backend.services.vs01_signing_invite_delivery._utc_epoch",
        lambda: now_epoch,
    ):
        working, _next, _created, winners = elect_and_persist_delivery_claims(
            latest={"vs01_signing_invite_delivery_v1": batch},
            canonical_batch=canonical,
            attempted_at="2026-07-17T12:00:00Z",
            audit_event={"event_type": "signing_invite_delivery_attempted"},
        )
    assert winners == []
    assert working["recipients"]["id1"]["state"] == STATE_CLAIMED
    assert working["recipients"]["id1"]["attempt_id"] == "attempt-active"


def test_stale_claim_becomes_reconciliation_required_via_lease_expiry():
    now_epoch = 2_000_000_000
    batch = {
        "v": 1,
        "batch_key": "aid:av:rev",
        "authority": {"document_id": _DOCUMENT_ID},
        "recipients": {
            "id1": {
                "delivery_identity": "id1",
                "state": STATE_CLAIMED,
                "attempt_id": "attempt-stale",
                "claim_lease_expires_at": now_epoch - 1,
                "provider_idempotency_key": "id1",
                "attempt_count": 1,
                "audit_events": [],
            }
        },
    }
    canonical = {
        "v": 1,
        "batch_key": "aid:av:rev",
        "authority": {"document_id": _DOCUMENT_ID},
        "recipients": {
            "id1": {
                "delivery_identity": "id1",
                "state": STATE_PREPARED,
                "provider_idempotency_key": "id1",
                "attempt_count": 0,
                "_signing_url": "https://app.example.com/app/esign/doc#t=tok",
                "_recipient_email": "signer@example.test",
            }
        },
    }
    with patch(
        "backend.services.vs01_signing_invite_delivery._utc_epoch",
        lambda: now_epoch,
    ):
        working, _next, _created, winners = elect_and_persist_delivery_claims(
            latest={"vs01_signing_invite_delivery_v1": batch},
            canonical_batch=canonical,
            attempted_at="2026-07-17T12:00:00Z",
            audit_event={"event_type": "signing_invite_delivery_attempted"},
        )
    assert winners == []
    assert working["recipients"]["id1"]["state"] == STATE_RECONCILIATION_REQUIRED
    assert working["recipients"]["id1"]["failure_code"] == "stale_claim_abandoned"


def test_crash_after_durable_claim_does_not_auto_resend(monkeypatch):
    client = TestClient(app)
    _enable_delivery_gates(monkeypatch)
    agreement_id, _, _, portable = _prepare_authorities(client)
    assert _activate(client, agreement_id, portable).status_code == 200

    provider = _mock_provider()
    phase_calls = {"count": 0}
    original_phase = execute_provider_for_claim_winners

    def _simulate_crash_before_provider(*args, **kwargs):
        phase_calls["count"] += 1
        if phase_calls["count"] == 1:
            return []
        return original_phase(*args, **kwargs)

    with patch(
        "backend.services.vs01_signing_invite_delivery.execute_provider_for_claim_winners",
        _simulate_crash_before_provider,
    ):
        first = _deliver(client, agreement_id)
    assert first.status_code == 200
    stored = load_draft(agreement_id)[VS01_SIGNING_INVITE_DELIVERY_FIELD]
    assert all(row["state"] == STATE_CLAIMED for row in stored["recipients"].values())
    assert provider.calls == []

    with patch(
        "backend.services.email.signing_delivery.default_authoritative_provider_send_fn",
        lambda draft: provider,
    ):
        second = _deliver(client, agreement_id)
    assert second.status_code == 200
    assert provider.calls == []
    stored = load_draft(agreement_id)[VS01_SIGNING_INVITE_DELIVERY_FIELD]
    assert all(row["state"] == STATE_CLAIMED for row in stored["recipients"].values())


def test_persisted_prepared_without_durable_claim_becomes_reconciliation_required():
    now_epoch = 2_000_000_000
    batch = {
        "v": 1,
        "batch_key": "aid:av:rev",
        "authority": {"document_id": _DOCUMENT_ID},
        "recipients": {
            "id1": {
                "delivery_identity": "id1",
                "state": STATE_PREPARED,
                "provider_idempotency_key": "id1",
                "attempt_count": 0,
                "audit_events": [],
            }
        },
    }
    canonical = {
        "v": 1,
        "batch_key": "aid:av:rev",
        "authority": {"document_id": _DOCUMENT_ID},
        "recipients": {
            "id1": {
                "delivery_identity": "id1",
                "state": STATE_PREPARED,
                "provider_idempotency_key": "id1",
                "attempt_count": 0,
                "_signing_url": "https://app.example.com/app/esign/doc#t=tok",
                "_recipient_email": "signer@example.test",
            }
        },
    }
    with patch(
        "backend.services.vs01_signing_invite_delivery._utc_epoch",
        lambda: now_epoch,
    ):
        working, _next, _created, winners = elect_and_persist_delivery_claims(
            latest={"vs01_signing_invite_delivery_v1": batch},
            canonical_batch=canonical,
            attempted_at="2026-07-17T12:00:00Z",
            audit_event={"event_type": "signing_invite_delivery_attempted"},
        )
    assert winners == []
    assert working["recipients"]["id1"]["state"] == STATE_RECONCILIATION_REQUIRED
    assert working["recipients"]["id1"]["failure_code"] == "prepared_without_durable_claim"


def test_merge_cas_never_regresses_delivered_or_overwrites_other_attempts():
    batch = {
        "v": 1,
        "batch_key": "aid:av:rev",
        "recipients": {
            "id1": {
                "delivery_identity": "id1",
                "state": STATE_DELIVERED,
                "attempt_id": "winner-attempt",
                "provider_message_id": "msg_winner",
                "attempt_count": 1,
                "audit_events": [],
            },
            "id2": {
                "delivery_identity": "id2",
                "state": STATE_CLAIMED,
                "attempt_id": "active-attempt",
                "attempt_count": 1,
                "audit_events": [],
            },
        },
    }
    merged = merge_recipient_terminal_outcomes_cas(
        batch,
        outcomes=[
            RecipientTerminalOutcome(
                delivery_identity="id1",
                attempt_id="loser-attempt",
                new_state=STATE_FAILED,
                failure_code="loser_overwrite_attempt",
            ),
            RecipientTerminalOutcome(
                delivery_identity="id2",
                attempt_id="wrong-attempt",
                new_state=STATE_DELIVERED,
                provider_message_id="msg_loser",
            ),
            RecipientTerminalOutcome(
                delivery_identity="id2",
                attempt_id="active-attempt",
                new_state=STATE_DELIVERED,
                provider_message_id="msg_ok",
            ),
        ],
        attempted_at="2026-07-17T12:00:01Z",
    )
    assert merged["recipients"]["id1"]["state"] == STATE_DELIVERED
    assert merged["recipients"]["id1"]["provider_message_id"] == "msg_winner"
    assert merged["recipients"]["id2"]["state"] == STATE_DELIVERED
    assert merged["recipients"]["id2"]["provider_message_id"] == "msg_ok"


def test_provider_observes_durably_persisted_claim_before_return(monkeypatch):
    client = TestClient(app)
    _enable_delivery_gates(monkeypatch)
    agreement_id, _, _, portable = _prepare_authorities(client)
    assert _activate(client, agreement_id, portable).status_code == 200

    observed: list[tuple[str, str]] = []

    def _send(agreement_id_arg, delivery_identity, recipient_email, signing_url, idempotency_key):
        stored = load_draft(agreement_id)[VS01_SIGNING_INVITE_DELIVERY_FIELD]
        record = stored["recipients"][delivery_identity]
        observed.append((delivery_identity, str(record.get("attempt_id") or "")))
        assert record["state"] == STATE_CLAIMED
        assert record.get("token_jti")
        assert record.get("token_fp")
        assert record.get("claim_lease_expires_at")
        return True, f"msg_{delivery_identity}", None

    with patch(
        "backend.services.email.signing_delivery.default_authoritative_provider_send_fn",
        lambda draft: _send,
    ):
        response = _deliver(client, agreement_id)
    assert response.status_code == 200
    assert len(observed) == 2
    stored = load_draft(agreement_id)[VS01_SIGNING_INVITE_DELIVERY_FIELD]
    for delivery_identity, attempt_id in observed:
        assert stored["recipients"][delivery_identity]["state"] == STATE_DELIVERED
        assert stored["recipients"][delivery_identity]["attempt_id"] == attempt_id


def test_generic_draft_save_preserves_delivery_records(monkeypatch):
    client = TestClient(app)
    _enable_delivery_gates(monkeypatch)
    agreement_id, _, _, portable = _prepare_authorities(client)
    assert _activate(client, agreement_id, portable).status_code == 200
    provider = _mock_provider()
    with patch(
        "backend.services.email.signing_delivery.default_authoritative_provider_send_fn",
        lambda draft: provider,
    ):
        assert _deliver(client, agreement_id).status_code == 200
    before = copy.deepcopy(load_draft(agreement_id))
    mutated = copy.deepcopy(before)
    mutated["title"] = "Updated title only"
    save_draft(mutated)
    after = load_draft(agreement_id)
    assert after[VS01_SIGNING_INVITE_DELIVERY_FIELD] == before[VS01_SIGNING_INVITE_DELIVERY_FIELD]
    assert after["title"] == "Updated title only"


def test_legacy_signing_links_sent_remains_denied_after_activation():
    client = TestClient(app)
    agreement_id, _, _, portable = _prepare_authorities(client)
    assert _activate(client, agreement_id, portable).status_code == 200
    response = client.post(
        f"/api/agreements/{agreement_id}/signing-links-sent",
        headers=_ORG_H,
        json={"targets": []},
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "signing_invite_delivery_deferred_until_3c1b"


def test_delivery_get_requires_owner_workspace(monkeypatch):
    client = TestClient(app)
    _enable_delivery_gates(monkeypatch)
    agreement_id, _, _, portable = _prepare_authorities(client)
    assert _activate(client, agreement_id, portable).status_code == 200
    provider = _mock_provider()
    with patch(
        "backend.services.email.signing_delivery.default_authoritative_provider_send_fn",
        lambda draft: provider,
    ):
        assert _deliver(client, agreement_id).status_code == 200
    ok = client.get(f"/api/agreements/{agreement_id}/signing-packet/delivery", headers=_ORG_H)
    assert ok.status_code == 200
    payload = ok.json()
    for recipient in payload.get("recipients") or []:
        assert "token" not in recipient
        assert "signing_url" not in recipient
    anon = client.get(f"/api/agreements/{agreement_id}/signing-packet/delivery")
    assert anon.status_code in (401, 403)


def test_stale_document_id_rejected():
    client = TestClient(app)
    agreement_id, _, _, portable = _prepare_authorities(client)
    assert _activate(client, agreement_id, portable).status_code == 200
    response = _deliver(client, agreement_id, document_id="doc_wrong")
    assert response.status_code == 409
    assert response.json()["detail"] == "document_id_mismatch"


def test_token_generation_failure_fails_closed(monkeypatch):
    client = TestClient(app)
    _enable_delivery_gates(monkeypatch)
    agreement_id, _, _, portable = _prepare_authorities(client)
    assert _activate(client, agreement_id, portable).status_code == 200

    def _boom(**kwargs):
        raise RuntimeError("mint_failed")

    monkeypatch.setattr(
        "backend.services.vs01_signing_invite_delivery.mint_vs01_recipient_bootstrap_token",
        _boom,
    )
    response = _deliver(client, agreement_id)
    assert response.status_code == 500
    assert response.json()["detail"] == "token_generation_failed"
    _assert_no_delivery_batch(load_draft(agreement_id))


def test_signing_url_uses_fragment_not_query():
    from backend.security.vs01_recipient_bootstrap_token import mint_vs01_recipient_bootstrap_token

    secret = b"unit-test-signing-invite-delivery-secret"
    token, _, _ = mint_vs01_recipient_bootstrap_token(
        secret=secret,
        agreement_id="aid",
        accepted_version_id="av_test",
        accepted_corpus_sha256="a" * 64,
        packet_revision="rev",
        frozen_authority_material_hash="b" * 64,
        signer_record_id="signer:1:0",
        party_id="party-1",
        locked_version_id="av_test",
    )
    url = build_signing_url_with_fragment(document_id=_DOCUMENT_ID, token=token)
    assert "#t=" in url
    assert "?t=" not in url.split("#", 1)[0]


def test_delivery_identity_is_deterministic():
    identity = compute_delivery_identity(
        agreement_id="aid",
        accepted_version_id="av_1",
        packet_revision="rev",
        signer_record_id="signer:1:0",
    )
    assert identity == "aid:av_1:rev:signer:1:0"


def _delivery_process_worker(start_event, result_queue, agreement_id: str, document_id: str):
    start_event.wait()
    try:
        from backend.services.agreement_draft_store import deliver_vs01_signing_invites_authoritative

        payload = deliver_vs01_signing_invites_authoritative(
            agreement_id,
            document_id=document_id,
            attempted_at="2026-07-17T12:00:00Z",
            provider_send_fn=None,
            delivery_allowed=False,
        )
        result_queue.put(("ok", payload))
    except Exception as exc:  # pragma: no cover
        result_queue.put(("error", str(exc)))


def test_cross_process_disabled_delivery_creates_no_records():
    client = TestClient(app)
    agreement_id, _, _, portable = _prepare_authorities(client)
    assert _activate(client, agreement_id, portable).status_code == 200
    ctx = multiprocessing.get_context("fork")
    start = ctx.Event()
    queue: multiprocessing.Queue = ctx.Queue()
    workers = [
        ctx.Process(
            target=_delivery_process_worker,
            args=(start, queue, agreement_id, _DOCUMENT_ID),
        )
        for _ in range(2)
    ]
    for worker in workers:
        worker.start()
    start.set()
    for worker in workers:
        worker.join(timeout=30)
        assert worker.exitcode == 0
    outcomes = [queue.get_nowait() for _ in workers]
    assert all(item[0] == "ok" for item in outcomes)
    assert all(item[1]["aggregate_status"] == "delivery_disabled" for item in outcomes)
    _assert_no_delivery_batch(load_draft(agreement_id))


def test_cross_process_file_lock_serializes_delivery_claims(monkeypatch):
    client = TestClient(app)
    _enable_delivery_gates(monkeypatch)
    agreement_id, _, _, portable = _prepare_authorities(client)
    assert _activate(client, agreement_id, portable).status_code == 200
    provider_calls = multiprocessing.Value("i", 0)

    def _delivery_process_worker(start_event, result_queue, agreement_id_arg: str):
        start_event.wait()
        try:
            from backend.services.agreement_draft_store import (
                deliver_vs01_signing_invites_authoritative,
                load_draft,
            )

            def _send(agreement_id, delivery_identity, recipient_email, signing_url, idempotency_key):
                with provider_calls.get_lock():
                    provider_calls.value += 1
                stored = load_draft(agreement_id)[VS01_SIGNING_INVITE_DELIVERY_FIELD]
                assert stored["recipients"][delivery_identity]["state"] == STATE_CLAIMED
                return True, f"msg_{provider_calls.value}", None

            payload = deliver_vs01_signing_invites_authoritative(
                agreement_id_arg,
                document_id=_DOCUMENT_ID,
                attempted_at="2026-07-17T12:00:00Z",
                provider_send_fn=_send,
                delivery_allowed=True,
            )
            result_queue.put(("ok", payload))
        except Exception as exc:  # pragma: no cover
            result_queue.put(("error", str(exc)))

    ctx = multiprocessing.get_context("fork")
    start = ctx.Event()
    queue: multiprocessing.Queue = ctx.Queue()
    workers = [
        ctx.Process(
            target=_delivery_process_worker,
            args=(start, queue, agreement_id),
        )
        for _ in range(2)
    ]
    for worker in workers:
        worker.start()
    start.set()
    for worker in workers:
        worker.join(timeout=60)
        assert worker.exitcode == 0
    outcomes = [queue.get_nowait() for _ in workers]
    assert all(item[0] == "ok" for item in outcomes)
    assert provider_calls.value == 2
    stored = _delivery_batch(load_draft(agreement_id))
    assert stored is not None
    assert len(stored["recipients"]) == 2
    assert all(row["state"] == STATE_DELIVERED for row in stored["recipients"].values())


def test_activation_failure_invokes_no_delivery():
    client = TestClient(app)
    agreement_id, _, _, portable = _prepare_authorities(client)
    bad = copy.deepcopy(portable)
    bad["roles"] = list(reversed(bad["roles"]))
    assert _activate(client, agreement_id, bad).status_code == 409
    response = _deliver(client, agreement_id)
    assert response.status_code == 409
    assert response.json()["detail"] == "signing_packet_activation_required"
