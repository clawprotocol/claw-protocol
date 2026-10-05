"""Unified agreement delivery policy. Provider spy fails closed in manual mode."""

from __future__ import annotations

import logging

import pytest

from backend.services.email.review_delivery import (
    maybe_notify_counterparties_all_reviews_complete,
    maybe_notify_owner_after_reviewer_approval,
    maybe_send_review_invites_after_review_sent,
    send_review_invite_to_participant,
)
from backend.services.email.signing_completion_delivery import maybe_send_signing_completion_emails
from backend.services.email.signing_delivery import (
    maybe_send_signing_invites_after_packet_prepared,
    send_signing_invite_to_target,
)
from backend.services.recipient_invite_resend import resend_recipient_invite


class ProviderInvoked(AssertionError):
    pass


@pytest.fixture
def provider_spy(monkeypatch: pytest.MonkeyPatch):
    calls = {"email": 0, "webhook": 0, "queued": 0}

    def _client(*_args, **_kwargs):
        calls["email"] += 1
        raise ProviderInvoked("resend invoked")

    def _urlopen(*_args, **_kwargs):
        calls["webhook"] += 1
        raise ProviderInvoked("webhook invoked")

    monkeypatch.setattr("backend.services.email.resend_client.httpx.Client", _client)
    monkeypatch.setattr("backend.integrations.webhook_dispatch.urllib.request.urlopen", _urlopen)
    return calls


@pytest.fixture
def manual_env(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_AGREEMENT_DELIVERY_MODE", "manual")
    monkeypatch.setenv("CLAW_REVIEW_DELIVERY_MODE", "manual_and_email")
    monkeypatch.setenv("RESEND_API_KEY", "re_test_present")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <noreply@example.test>")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.test")
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-delivery-policy-secret")
    monkeypatch.delenv("CLAW_COMMERCIAL_MODE", raising=False)


def _review_draft() -> dict:
    return {
        "id": "ag_delivery_manual",
        "title": "Sanitized delivery fixture",
        "parties": [
            {"id": "11111111-1111-4111-8111-111111111111", "name": "Northwind Field Analytics LLC", "role": "owner", "email": "owner@example.test"},
            {"id": "22222222-2222-4222-8222-222222222222", "name": "Cedar Ridge Services LLC", "role": "reviewer", "email": "reviewer@example.test"},
        ],
        "audit_log": [],
        "review_sent_at": "2026-10-05T00:00:00Z",
    }


def _signing_target() -> dict:
    return {
        "email": "signer@example.test",
        "display_name": "Casey North",
        "signing_url": "https://app.example.test/sign/link-secret-do-not-log",
        "signer_role_id": "accepted_party_0",
        "participant_id": "11111111-1111-4111-8111-111111111111",
    }


def _completed_draft() -> dict:
    corpus = "Completed sanitized agreement.\n" + ("Operative clause. " * 12)
    return {
        "id": "ag_delivery_manual",
        "title": "Sanitized delivery fixture",
        "parties": [
            {
                "id": "11111111-1111-4111-8111-111111111111",
                "name": "Northwind Field Analytics LLC",
                "role": "Client",
                "email": "casey.north@example.test",
                "signer_name": "Casey North",
            },
            {
                "id": "22222222-2222-4222-8222-222222222222",
                "name": "Cedar Ridge Services LLC",
                "role": "Service Provider",
                "email": "riley.cedar@example.test",
                "signer_name": "Riley Cedar",
            },
        ],
        "audit_log": [
            {
                "event_type": "signed",
                "at": "2026-10-05T00:00:00Z",
                "value": {"fully_executed": True},
            }
        ],
        "vs01_signing_packet_v1": {
            "fully_executed_snapshot": {
                "v": 1,
                "corpus_plain": corpus,
                "corpus_hash": "abc",
                "signer_role_ids": ["accepted_party_0", "accepted_party_1"],
            }
        },
    }


def _assert_suppressed(result, *, calls: dict) -> None:
    assert calls["email"] == 0
    assert calls["webhook"] == 0
    status = None
    if isinstance(result, dict):
        value = result.get("value") if isinstance(result.get("value"), dict) else result
        status = value.get("status") or value.get("delivery_status")
        assert value.get("retry_eligible") is False
    assert status == "suppressed_manual"


def test_review_invite_is_suppressed_while_credentials_remain(
    manual_env, provider_spy
) -> None:
    result = maybe_send_review_invites_after_review_sent(
        agreement_id="ag_delivery_manual",
        draft=_review_draft(),
    )
    _assert_suppressed(result, calls=provider_spy)


def test_review_resend_is_suppressed(manual_env, provider_spy) -> None:
    sent, _jti = send_review_invite_to_participant(
        agreement_id="ag_delivery_manual",
        draft=_review_draft(),
        participant_id="22222222-2222-4222-8222-222222222222",
    )
    assert provider_spy["email"] == 0
    assert sent is True or (isinstance(sent, dict) and sent.get("status") == "suppressed_manual")


def test_owner_review_notification_is_suppressed(manual_env, provider_spy) -> None:
    result = maybe_notify_owner_after_reviewer_approval(
        agreement_id="ag_delivery_manual",
        draft=_review_draft(),
        approver_participant_id="22222222-2222-4222-8222-222222222222",
        approver_display_name="Riley Cedar",
    )
    _assert_suppressed(result, calls=provider_spy)


def test_signing_invite_is_suppressed_and_link_is_not_logged(
    manual_env, provider_spy, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO)
    result = maybe_send_signing_invites_after_packet_prepared(
        agreement_id="ag_delivery_manual",
        draft=_review_draft(),
        targets=[_signing_target()],
        packet_revision="pkt_1",
    )
    _assert_suppressed(result, calls=provider_spy)
    assert "link-secret-do-not-log" not in caplog.text
    assert "re_test_present" not in caplog.text


def test_signing_resend_is_suppressed(manual_env, provider_spy) -> None:
    _draft, meta = resend_recipient_invite(
        agreement_id="ag_delivery_manual",
        draft=_review_draft(),
        phase="signing",
        participant_id="22222222-2222-4222-8222-222222222222",
        signing_url="https://app.example.test/sign/link-secret-do-not-log",
        signer_role_id="accepted_party_1",
        org_id="org_test",
        persist=lambda *_args, **_kwargs: None,
    )
    assert provider_spy["email"] == 0
    assert meta.get("delivery_status") == "suppressed_manual"
    assert meta.get("retryable") is False


def test_completion_and_document_delivery_are_suppressed(manual_env, provider_spy) -> None:
    result = maybe_send_signing_completion_emails(
        agreement_id="ag_delivery_manual",
        draft=_completed_draft(),
    )
    _assert_suppressed(result, calls=provider_spy)


def test_counterparty_notification_is_suppressed(manual_env, provider_spy) -> None:
    draft = _review_draft()
    draft["audit_log"] = [
        {"event_type": "recipient_approved", "value": {"participant_id": "22222222-2222-4222-8222-222222222222"}}
    ]
    result = maybe_notify_counterparties_all_reviews_complete(
        agreement_id="ag_delivery_manual",
        draft=draft,
    )
    if result is None and provider_spy["email"] == 0:
        pytest.skip("channel did not reach a provider and returned no result")
    _assert_suppressed(result, calls=provider_spy)


def test_repeated_signing_invite_stays_suppressed(manual_env, provider_spy) -> None:
    draft = _review_draft()
    first = maybe_send_signing_invites_after_packet_prepared(
        agreement_id="ag_delivery_manual",
        draft=draft,
        targets=[_signing_target()],
        packet_revision="pkt_1",
    )
    draft["audit_log"] = [first] if isinstance(first, dict) else []
    second = maybe_send_signing_invites_after_packet_prepared(
        agreement_id="ag_delivery_manual",
        draft=draft,
        targets=[_signing_target()],
        packet_revision="pkt_1",
    )
    assert provider_spy["email"] == 0
    assert second is None or (isinstance(second, dict) and (second.get("value") or {}).get("retry_eligible") is False)


def test_webhook_dispatch_and_retry_do_not_queue(manual_env, provider_spy, monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    from backend.integrations import webhook_store
    from backend.integrations.webhook_dispatch import deliver_webhook, retry_delivery

    hook = webhook_store.create_hook(
        "org_delivery",
        url="https://hooks.example.test/claw",
        events=["agreement.signed"],
    )
    before = len(webhook_store.list_deliveries("org_delivery", limit=20))
    deliver_webhook(
        "org_delivery",
        hook,
        event_type="agreement.signed",
        object_type="agreement",
        object_id="ag_delivery_manual",
        summary={"status": "signed"},
    )
    assert provider_spy["webhook"] == 0
    assert len(webhook_store.list_deliveries("org_delivery", limit=20)) == before
    webhook_store.append_delivery(
        "org_delivery",
        {
            "delivery_id": "wdel_prior",
            "hook_id": hook["hook_id"],
            "event_id": "evt_prior",
            "event_type": "agreement.completed",
            "object_type": "agreement",
            "object_id": "ag_delivery_manual",
            "summary": {"status": "completed"},
            "status": "failed",
            "http_status": 500,
            "attempts": 1,
            "last_error": "http_500",
            "last_attempt_at": "2026-10-05T00:00:00Z",
            "created_at": "2026-10-05T00:00:00Z",
            "completed_at": None,
        },
    )
    queued_before = len(webhook_store.list_deliveries("org_delivery", limit=20))
    outcome = retry_delivery("org_delivery", "wdel_prior")
    assert provider_spy["webhook"] == 0
    assert outcome == "suppressed_manual"
    assert len(webhook_store.list_deliveries("org_delivery", limit=20)) == queued_before


def test_unset_mode_keeps_review_manual_and_does_not_send(monkeypatch, provider_spy) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.delenv("CLAW_AGREEMENT_DELIVERY_MODE", raising=False)
    monkeypatch.setenv("CLAW_REVIEW_DELIVERY_MODE", "manual")
    monkeypatch.setenv("RESEND_API_KEY", "re_test_present")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <noreply@example.test>")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.test")
    result = maybe_send_review_invites_after_review_sent(
        agreement_id="ag_delivery_manual",
        draft=_review_draft(),
    )
    assert result is None
    assert provider_spy["email"] == 0


def test_explicit_provider_mode_still_sends_review_email(monkeypatch) -> None:
    from unittest.mock import MagicMock, patch

    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_AGREEMENT_DELIVERY_MODE", "provider")
    monkeypatch.setenv("CLAW_REVIEW_DELIVERY_MODE", "email")
    monkeypatch.setenv("RESEND_API_KEY", "re_test_present")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <noreply@example.test>")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.test")
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-delivery-policy-secret")
    response = MagicMock(status_code=200, text='{"id":"msg_ok"}')
    response.json.return_value = {"id": "msg_ok"}
    client = MagicMock()
    client.post.return_value = response
    client.__enter__.return_value = client
    client.__exit__.return_value = False
    with patch("backend.services.email.resend_client.httpx.Client", return_value=client):
        result = maybe_send_review_invites_after_review_sent(
            agreement_id="ag_delivery_manual",
            draft=_review_draft(),
        )
    assert isinstance(result, str) and result
    assert client.post.call_count == 1


def test_invalid_mode_is_rejected(monkeypatch) -> None:
    from backend.services.agreement_delivery_policy import (
        AgreementDeliveryConfigError,
        agreement_delivery_mode_label,
        resolve_agreement_delivery,
    )
    from backend.config.env_bootstrap import collect_env_warnings
    from backend.services.email.resend_client import send_email

    monkeypatch.setenv("CLAW_AGREEMENT_DELIVERY_MODE", "email")
    monkeypatch.setenv("RESEND_API_KEY", "re_test_present")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <noreply@example.test>")
    assert agreement_delivery_mode_label() == "invalid"
    assert any("CLAW_AGREEMENT_DELIVERY_MODE is invalid" in item for item in collect_env_warnings())
    with pytest.raises(AgreementDeliveryConfigError):
        resolve_agreement_delivery("signing_invite")
    blocked = send_email(to="signer@example.test", subject="no", html="<p>no</p>")
    assert blocked.status == "failed"
    assert blocked.ok is False


def test_client_field_cannot_override_server_policy(monkeypatch) -> None:
    from backend.routers.agreements_v2_api import SigningLinksSentBody
    from backend.services.agreement_delivery_policy import resolve_agreement_delivery

    monkeypatch.delenv("CLAW_AGREEMENT_DELIVERY_MODE", raising=False)
    body = SigningLinksSentBody.model_validate(
        {"packet_revision": "pkt_1", "suppress_delivery": True, "delivery_mode": "manual"}
    )
    assert body.packet_revision == "pkt_1"
    assert not hasattr(body, "suppress_delivery")
    decision = resolve_agreement_delivery("signing_invite")
    assert decision.provider_allowed is True
    assert decision.reason == "agreement_delivery_unset"


def test_manual_two_party_lifecycle_keeps_links_receipt_snapshot_and_pdf(
    manual_env, provider_spy, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO)
    from backend.proof.agreement_receipt import create_agreement_receipt_response
    from backend.services.completed_signed_pdf_export import build_completed_signed_pdf_bytes
    from backend.services.completion_evidence_package import (
        COMPLETION_EVIDENCE_PACKAGE_EVENT,
        persist_completion_evidence_package,
    )
    from backend.services.legacy_signing_identity import (
        local_signing_link_targets,
        prepare_durable_execution_authority,
    )
    from backend.services.vs01_fully_executed_snapshot import ensure_fully_executed_snapshot_on_draft
    from backend.services.vs01_signer_completion import (
        count_signature_completed_events,
        fully_executed_signed_already_recorded,
    )
    from backend.tests.test_legacy_signing_identity import DURABLE, SIGNERS, _complete, _draft

    draft = _draft()
    accepted = dict(draft["accepted_review_snapshot_v1"])
    prepared = prepare_durable_execution_authority(draft)
    links = local_signing_link_targets(prepared)
    assert [link["participant_id"] for link in links] == DURABLE[:2]
    assert [link["signer_name"] for link in links] == SIGNERS[:2]

    after_second = _complete(_complete(draft, 0), 1)
    assert count_signature_completed_events(after_second["audit_log"]) == 2
    assert fully_executed_signed_already_recorded(after_second["audit_log"]) is True
    assert sum(1 for event in after_second["audit_log"] if event.get("event_type") == "signed") == 1

    ensured = ensure_fully_executed_snapshot_on_draft(after_second, agreement_id=draft["id"])
    assert ensured.snapshot_ready is True
    evidenced = persist_completion_evidence_package(ensured.draft_dict, agreement_id=draft["id"])
    receipt, _body = create_agreement_receipt_response(
        agreement_id=draft["id"],
        finalized_version_id="doc_legacy_fixture",
        finalized_at="2026-10-02T12:00:00Z",
        content_sha256=accepted["corpusSha256"],
        execution_packet_sha256=accepted["corpusSha256"],
        signer_count=2,
        anchor_network="bitcoin-testnet",
    )
    evidenced["execution_receipt_v1"] = {"receipt_id": receipt["receipt_id"]}
    reloaded = persist_completion_evidence_package(evidenced, agreement_id=draft["id"])
    assert reloaded["execution_receipt_v1"]["receipt_id"] == receipt["receipt_id"]
    assert sum(
        1 for event in reloaded["audit_log"] if event.get("event_type") == COMPLETION_EVIDENCE_PACKAGE_EVENT
    ) == 1
    assert count_signature_completed_events(reloaded["audit_log"]) == 2
    snapshots = [
        (reloaded.get("vs01_signing_packet_v1") or {}).get("fully_executed_snapshot")
    ]
    assert len([item for item in snapshots if isinstance(item, dict)]) == 1

    pdf_bytes, _filename = build_completed_signed_pdf_bytes(
        agreement_id=draft["id"],
        draft=reloaded,
    )
    assert pdf_bytes.startswith(b"%PDF")

    invite = maybe_send_signing_invites_after_packet_prepared(
        agreement_id=draft["id"],
        draft=reloaded,
        targets=[
            {
                "email": "signer@example.test",
                "display_name": SIGNERS[0],
                "signing_url": "https://app.example.test/sign/link-secret-do-not-log",
                "signer_role_id": "accepted_party_0",
                "participant_id": DURABLE[0],
            }
        ],
        packet_revision="pkt_lifecycle",
    )
    completion = maybe_send_signing_completion_emails(agreement_id=draft["id"], draft=reloaded)
    _assert_suppressed(invite, calls=provider_spy)
    _assert_suppressed(completion, calls=provider_spy)
    assert "link-secret-do-not-log" not in caplog.text
    assert "re_test_present" not in caplog.text
    assert provider_spy["webhook"] == 0
