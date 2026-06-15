"""Tests for VS01 signer completion persistence + completion emails."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from backend.services.email.signing_completion_delivery import (
    SIGNING_COMPLETION_EMAILS_SENT_EVENT,
    maybe_send_signing_completion_emails,
)
from backend.services.vs01_signer_completion import (
    all_signers_signed_from_audit,
    build_fully_executed_signed_event,
    build_signature_completed_event,
    completed_vs01_signer_role_ids,
    completion_emails_already_sent,
    count_signature_completed_events,
    fully_executed_signed_already_recorded,
    orchestrate_vs01_signer_complete,
    required_vs01_signer_role_ids,
    signer_role_already_completed,
)


def _draft_with_packet() -> dict:
    return {
        "parties": [
            {"id": "p1", "role": "signer", "name": "Owner", "email": "owner@example.test"},
            {"id": "p2", "role": "signer", "name": "Counterparty", "email": "cp@example.test"},
        ],
        "vs01_signing_packet_v1": {
            "v": 1,
            "portable": {
                "roles": [
                    {"roleId": "role_owner", "requiresSignature": True},
                    {"roleId": "role_cp", "requiresSignature": True},
                ]
            },
        },
    }


def test_signer_role_completion_idempotency() -> None:
    audit = [
        build_signature_completed_event(
            signer_role_id="role_owner",
            participant_id="p1",
            display_name="Owner",
            document_id="doc1",
            signed_at="2026-06-07T00:00:00Z",
            signed_date_iso="2026-06-07",
            signed_date_display="June 7, 2026",
            locked_version_id=None,
            agreement_version_hash=None,
        )
    ]
    assert signer_role_already_completed(audit, "role_owner") is True
    assert signer_role_already_completed(audit, "role_cp") is False


def test_all_signers_signed_by_role_ids() -> None:
    draft = _draft_with_packet()
    audit = [
        build_signature_completed_event(
            signer_role_id="role_owner",
            participant_id="p1",
            display_name="Owner",
            document_id="doc1",
            signed_at="2026-06-07T00:00:00Z",
            signed_date_iso="2026-06-07",
            signed_date_display="June 7, 2026",
            locked_version_id=None,
            agreement_version_hash=None,
        ),
        build_signature_completed_event(
            signer_role_id="role_cp",
            participant_id="p2",
            display_name="Counterparty",
            document_id="doc1",
            signed_at="2026-06-08T00:00:00Z",
            signed_date_iso="2026-06-08",
            signed_date_display="June 8, 2026",
            locked_version_id=None,
            agreement_version_hash=None,
        ),
    ]
    assert required_vs01_signer_role_ids(draft) == {"role_owner", "role_cp"}
    assert completed_vs01_signer_role_ids(audit) == {"role_owner", "role_cp"}
    assert all_signers_signed_from_audit(draft, audit) is True


def test_orchestrate_final_signer_appends_single_signed_event() -> None:
    draft = _draft_with_packet()
    audit = [
        build_signature_completed_event(
            signer_role_id="role_owner",
            participant_id="p1",
            display_name="Owner",
            document_id="doc1",
            signed_at="2026-06-07T00:00:00Z",
            signed_date_iso="2026-06-07",
            signed_date_display="June 7, 2026",
            locked_version_id=None,
            agreement_version_hash=None,
        )
    ]
    draft["audit_log"] = audit
    first = orchestrate_vs01_signer_complete(
        draft,
        signer_role_id="role_cp",
        participant_id="p2",
        display_name="Counterparty",
        document_id="doc1",
        signed_at="2026-06-08T00:00:00Z",
        signed_date_iso="2026-06-08",
        signed_date_display="June 8, 2026",
        locked_version_id=None,
        agreement_version_hash="hash1",
    )
    assert first.fully_executed is True
    assert first.newly_finalized is True
    assert fully_executed_signed_already_recorded(first.audit)

    second = orchestrate_vs01_signer_complete(
        first.draft_dict,
        signer_role_id="role_cp",
        participant_id="p2",
        display_name="Counterparty",
        document_id="doc1",
        signed_at="2026-06-08T00:00:01Z",
        signed_date_iso="2026-06-08",
        signed_date_display="June 8, 2026",
        locked_version_id=None,
        agreement_version_hash="hash1",
    )
    assert second.already_signed is True
    assert second.newly_finalized is False
    assert count_signature_completed_events(second.audit) == 2
    signed_events = [e for e in second.audit if e.get("event_type") == "signed"]
    assert len(signed_events) == 1


def test_completion_email_not_marked_on_partial_send() -> None:
    draft = _draft_with_packet()
    draft["title"] = "Services Agreement"
    draft["audit_log"] = [
        build_fully_executed_signed_event(signed_at="2026-06-08T00:00:00Z", agreement_version_hash="h"),
    ]

    class _Result:
        ok = False

    with patch("backend.services.email.signing_completion_delivery.email_configured", return_value=True), patch(
        "backend.services.email.signing_completion_delivery.send_email_non_fatal",
        return_value=_Result(),
    ):
        event = maybe_send_signing_completion_emails(agreement_id="ag1", draft=draft)
    assert event is None
    assert completion_emails_already_sent(draft["audit_log"]) is False


def test_completion_email_marked_only_after_all_targets_sent() -> None:
    draft = _draft_with_packet()
    draft["title"] = "Services Agreement"
    draft["audit_log"] = [
        build_fully_executed_signed_event(signed_at="2026-06-08T00:00:00Z", agreement_version_hash="h"),
    ]

    class _Ok:
        ok = True

    with patch("backend.services.email.signing_completion_delivery.email_configured", return_value=True), patch(
        "backend.services.email.signing_completion_delivery.send_email_non_fatal",
        return_value=_Ok(),
    ), patch(
        "backend.services.email.signing_completion_delivery.app_public_origin",
        return_value="https://app.example.test",
    ):
        event = maybe_send_signing_completion_emails(agreement_id="ag1", draft=draft)
    assert event is not None
    assert event["event_type"] == SIGNING_COMPLETION_EMAILS_SENT_EVENT
    assert event["value"]["sent_count"] == 2
