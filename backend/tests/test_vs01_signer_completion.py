"""Tests for VS01 signer completion persistence + completion emails."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from backend.services.email.signing_completion_delivery import (
    SIGNING_COMPLETION_EMAILS_SENT_EVENT,
    _signing_completion_party_summary_lines,
    maybe_send_signing_completion_emails,
    resolve_signing_completion_email_targets,
)
from backend.services.vs01_signer_completion import (
    all_signers_signed_from_audit,
    build_fully_executed_signed_event,
    build_signature_completed_event,
    completed_vs01_signer_role_ids,
    completion_emails_already_sent,
    count_signature_completed_events,
    extract_fully_executed_snapshot_from_portable,
    fully_executed_snapshot_ready,
    fully_executed_signed_already_recorded,
    merge_portable_packet_corpus,
    orchestrate_vs01_signer_complete,
    required_vs01_signer_role_ids,
    signer_role_already_completed,
    vs01_open_signing_link_completion_allowed,
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


def _draft_fully_executed_with_snapshot() -> dict:
    draft = _draft_with_packet()
    draft["audit_log"] = [
        build_fully_executed_signed_event(signed_at="2026-06-08T00:00:00Z", agreement_version_hash="h"),
    ]
    draft["vs01_signing_packet_v1"]["fully_executed_snapshot"] = {
        "v": 1,
        "corpus_plain": "x" * 200,
        "corpus_hash": "h",
        "saved_at": "2026-06-08T00:00:00Z",
    }
    return draft


def test_completion_email_not_marked_on_partial_send() -> None:
    draft = _draft_fully_executed_with_snapshot()
    draft["title"] = "Services Agreement"

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
    draft = _draft_fully_executed_with_snapshot()
    draft["title"] = "Services Agreement"

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


def test_merge_portable_packet_persists_fully_executed_snapshot() -> None:
    corpus = "x" * 200 + "\nBy: Owner\nDate: June 15, 2026\nBy: Counterparty\nDate: June 16, 2026"
    portable = {
        "v": 1,
        "fullyExecutedSnapshot": {
            "v": 1,
            "corpusPlain": corpus,
            "corpusHash": "hash123",
            "savedAt": "2026-06-16T00:00:00Z",
            "signerRoleIds": ["role_owner", "role_cp"],
        },
    }
    snap = extract_fully_executed_snapshot_from_portable(portable)
    assert snap is not None
    assert snap["corpus_plain"] == corpus

    draft = _draft_with_packet()
    merged = merge_portable_packet_corpus(draft, portable)
    stored = merged["vs01_signing_packet_v1"]
    assert stored["fully_executed_snapshot"]["corpus_plain"] == corpus
    assert fully_executed_snapshot_ready(merged) is True


def test_completion_email_skipped_without_signed_snapshot() -> None:
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
    assert event is None


def test_completion_email_targets_owner_and_party_roles() -> None:
    draft = {
        "parties": [
            {"id": "p1", "name": "Owner LLC", "role": "owner", "email": "owner@example.test"},
            {"id": "p2", "name": "Counterparty LLC", "role": "party", "email": "cp@example.test"},
        ],
        "vs01_signing_packet_v1": {
            "v": 1,
            "portable": {
                "roles": [
                    {
                        "roleId": "role_owner",
                        "partyIndex": 0,
                        "requiresSignature": True,
                        "signerEmail": "owner@example.test",
                        "entityName": "Owner LLC",
                        "signerName": "Pat Owner",
                    },
                    {
                        "roleId": "role_cp",
                        "partyIndex": 1,
                        "requiresSignature": True,
                        "signerEmail": "cp@example.test",
                        "entityName": "Counterparty LLC",
                        "signerName": "Pat Counterparty",
                    },
                ]
            },
        },
    }
    targets = resolve_signing_completion_email_targets(draft)
    emails = sorted(t["email"] for t in targets)
    assert emails == ["cp@example.test", "owner@example.test"]


def test_completion_email_party_summary_uses_human_signer_not_entity_echo() -> None:
    """Audit participant_display_name is often the legal entity; email should show human signer."""
    draft = {
        "parties": [
            {
                "id": "p1",
                "name": "Harbor Peak Automation LLC",
                "role": "owner",
                "email": "rasta@example.test",
                "signerName": "Rasta Benning",
            },
            {
                "id": "p2",
                "name": "Red Mesa Logistics LLC",
                "role": "party",
                "email": "rand@example.test",
                "signerName": "Rand Mann",
            },
        ],
        "audit_log": [
            build_signature_completed_event(
                signer_role_id="role_owner",
                participant_id="p1",
                display_name="Harbor Peak Automation LLC",
                document_id="doc1",
                signed_at="2026-06-17T14:48:00Z",
                signed_date_iso="2026-06-17",
                signed_date_display="June 17, 2026",
                locked_version_id=None,
                agreement_version_hash=None,
            ),
            build_signature_completed_event(
                signer_role_id="role_cp",
                participant_id="p2",
                display_name="Red Mesa Logistics LLC",
                document_id="doc1",
                signed_at="2026-06-17T14:48:01Z",
                signed_date_iso="2026-06-17",
                signed_date_display="June 17, 2026",
                locked_version_id=None,
                agreement_version_hash=None,
            ),
        ],
        "vs01_signing_packet_v1": {
            "v": 1,
            "portable": {
                "roles": [
                    {
                        "roleId": "role_owner",
                        "partyIndex": 0,
                        "requiresSignature": True,
                        "entityName": "Harbor Peak Automation LLC",
                        "signerName": "Rasta Benning",
                    },
                    {
                        "roleId": "role_cp",
                        "partyIndex": 1,
                        "requiresSignature": True,
                        "entityName": "Red Mesa Logistics LLC",
                        "signerName": "Rand Mann",
                    },
                ]
            },
        },
    }

    lines = _signing_completion_party_summary_lines(draft)
    assert len(lines) == 2
    assert "Harbor Peak Automation LLC — signed by Rasta Benning" in lines[0]
    assert "Red Mesa Logistics LLC — signed by Rand Mann" in lines[1]
    assert "signed by Harbor Peak Automation LLC" not in "\n".join(lines)
    assert "signed by Red Mesa Logistics LLC" not in "\n".join(lines)


def test_completion_email_party_summary_n_party_one_row_per_signer() -> None:
    draft = {
        "audit_log": [
            build_signature_completed_event(
                signer_role_id=f"role_{i}",
                participant_id=f"p{i}",
                display_name=f"Entity {i} LLC",
                document_id="doc1",
                signed_at=f"2026-06-0{i}T12:00:00Z",
                signed_date_iso=f"2026-06-0{i}",
                signed_date_display=f"June {i}, 2026",
                locked_version_id=None,
                agreement_version_hash=None,
            )
            for i in range(1, 4)
        ],
        "vs01_signing_packet_v1": {
            "v": 1,
            "portable": {
                "roles": [
                    {
                        "roleId": f"role_{i}",
                        "partyIndex": i - 1,
                        "requiresSignature": True,
                        "entityName": f"Entity {i} LLC",
                        "signerName": f"Signer {i}",
                    }
                    for i in range(1, 4)
                ]
            },
        },
    }

    lines = _signing_completion_party_summary_lines(draft)
    assert len(lines) == 3
    for i in range(1, 4):
        assert any(
            line.startswith(f"Entity {i} LLC — signed by Signer {i} at")
            for line in lines
        )


def test_completion_email_party_summary_falls_back_when_human_signer_missing() -> None:
    draft = {
        "audit_log": [
            build_signature_completed_event(
                signer_role_id="role_only",
                participant_id="",
                display_name="Solo Entity LLC",
                document_id="doc1",
                signed_at="2026-06-17T14:48:00Z",
                signed_date_iso="2026-06-17",
                signed_date_display="June 17, 2026",
                locked_version_id=None,
                agreement_version_hash=None,
            ),
        ],
        "vs01_signing_packet_v1": {
            "v": 1,
            "portable": {
                "roles": [
                    {
                        "roleId": "role_only",
                        "requiresSignature": True,
                        "entityName": "Solo Entity LLC",
                    },
                ]
            },
        },
    }

    lines = _signing_completion_party_summary_lines(draft)
    assert lines == ["Solo Entity LLC — signed by Solo Entity LLC at June 17, 2026"]


def test_completion_email_body_includes_entity_and_human_signer_in_parties() -> None:
    draft = _draft_fully_executed_with_snapshot()
    draft["title"] = "Services Agreement"
    draft["parties"] = [
        {
            "id": "p1",
            "name": "Harbor Peak Automation LLC",
            "role": "owner",
            "email": "owner@example.test",
            "signerName": "Rasta Benning",
        },
        {
            "id": "p2",
            "name": "Red Mesa Logistics LLC",
            "role": "party",
            "email": "cp@example.test",
            "signerName": "Rand Mann",
        },
    ]
    draft["vs01_signing_packet_v1"]["portable"]["roles"] = [
        {
            "roleId": "role_owner",
            "partyIndex": 0,
            "requiresSignature": True,
            "signerEmail": "owner@example.test",
            "entityName": "Harbor Peak Automation LLC",
            "signerName": "Rasta Benning",
        },
        {
            "roleId": "role_cp",
            "partyIndex": 1,
            "requiresSignature": True,
            "signerEmail": "cp@example.test",
            "entityName": "Red Mesa Logistics LLC",
            "signerName": "Rand Mann",
        },
    ]
    draft["audit_log"] = [
        build_signature_completed_event(
            signer_role_id="role_owner",
            participant_id="p1",
            display_name="Harbor Peak Automation LLC",
            document_id="doc1",
            signed_at="2026-06-07T15:30:00Z",
            signed_date_iso="2026-06-07",
            signed_date_display="June 7, 2026",
            locked_version_id=None,
            agreement_version_hash=None,
        ),
        build_signature_completed_event(
            signer_role_id="role_cp",
            participant_id="p2",
            display_name="Red Mesa Logistics LLC",
            document_id="doc1",
            signed_at="2026-06-08T16:45:00Z",
            signed_date_iso="2026-06-08",
            signed_date_display="June 8, 2026",
            locked_version_id=None,
            agreement_version_hash=None,
        ),
        build_fully_executed_signed_event(signed_at="2026-06-08T16:45:01Z", agreement_version_hash="h"),
    ]

    captured: list[dict] = []

    class _Ok:
        ok = True

    def _capture(**kwargs: object) -> _Ok:
        captured.append(dict(kwargs))
        return _Ok()

    with patch("backend.services.email.signing_completion_delivery.email_configured", return_value=True), patch(
        "backend.services.email.signing_completion_delivery.send_email_non_fatal",
        side_effect=_capture,
    ), patch(
        "backend.services.email.signing_completion_delivery.app_public_origin",
        return_value="https://app.example.test",
    ):
        event = maybe_send_signing_completion_emails(agreement_id="ag1", draft=draft)
    assert event is not None
    assert captured
    text = str(captured[0].get("text") or "")
    assert "Harbor Peak Automation LLC — signed by Rasta Benning" in text
    assert "Red Mesa Logistics LLC — signed by Rand Mann" in text
    assert "signed by Harbor Peak Automation LLC" not in text
    assert "signed by Red Mesa Logistics LLC" not in text


def test_completion_email_body_includes_completed_timestamp_and_view_link() -> None:
    draft = _draft_fully_executed_with_snapshot()
    draft["title"] = "Services Agreement"
    draft["audit_log"] = [
        build_signature_completed_event(
            signer_role_id="role_owner",
            participant_id="p1",
            display_name="Pat Owner",
            document_id="doc1",
            signed_at="2026-06-07T15:30:00Z",
            signed_date_iso="2026-06-07",
            signed_date_display="June 7, 2026",
            locked_version_id=None,
            agreement_version_hash=None,
        ),
        build_signature_completed_event(
            signer_role_id="role_cp",
            participant_id="p2",
            display_name="Pat Counterparty",
            document_id="doc1",
            signed_at="2026-06-08T16:45:00Z",
            signed_date_iso="2026-06-08",
            signed_date_display="June 8, 2026",
            locked_version_id=None,
            agreement_version_hash=None,
        ),
        build_fully_executed_signed_event(signed_at="2026-06-08T16:45:01Z", agreement_version_hash="h"),
    ]

    captured: list[dict] = []

    class _Ok:
        ok = True

    def _capture(**kwargs: object) -> _Ok:
        captured.append(dict(kwargs))
        return _Ok()

    with patch("backend.services.email.signing_completion_delivery.email_configured", return_value=True), patch(
        "backend.services.email.signing_completion_delivery.send_email_non_fatal",
        side_effect=_capture,
    ), patch(
        "backend.services.email.signing_completion_delivery.app_public_origin",
        return_value="https://app.example.test",
    ):
        event = maybe_send_signing_completion_emails(agreement_id="ag1", draft=draft)
    assert event is not None
    assert captured
    subject = str(captured[0].get("subject") or "")
    html = str(captured[0].get("html") or "")
    text = str(captured[0].get("text") or "")
    assert subject == "Completed agreement: Services Agreement"
    assert "view-signed" in html
    assert "Your agreement is fully signed." in text
    assert "Completed:" in text
    assert "Pat Owner" in text or "Owner" in text


def test_completion_email_uses_view_signed_url_when_snapshot_ready() -> None:
    draft = _draft_fully_executed_with_snapshot()
    draft["title"] = "Services Agreement"

    captured: list[dict] = []

    class _Ok:
        ok = True

    def _capture(**kwargs: object) -> _Ok:
        captured.append(dict(kwargs))
        return _Ok()

    with patch("backend.services.email.signing_completion_delivery.email_configured", return_value=True), patch(
        "backend.services.email.signing_completion_delivery.send_email_non_fatal",
        side_effect=_capture,
    ), patch(
        "backend.services.email.signing_completion_delivery.app_public_origin",
        return_value="https://app.example.test",
    ):
        event = maybe_send_signing_completion_emails(agreement_id="ag1", draft=draft)
    assert event is not None
    assert captured
    assert "view-signed" in str(captured[0].get("html", ""))


def test_vs01_open_signing_link_completion_allowed_matches_prepared_packet() -> None:
    draft = {
        **_draft_with_packet(),
        "vs01_signing_packet_v1": {
            "v": 1,
            "document_id": "doc_vs01",
            "portable": _draft_with_packet()["vs01_signing_packet_v1"]["portable"],
        },
    }
    assert vs01_open_signing_link_completion_allowed(
        draft,
        signer_role_id="role_cp",
        document_id="doc_vs01",
    )
    assert not vs01_open_signing_link_completion_allowed(
        draft,
        signer_role_id="role_unknown",
        document_id="doc_vs01",
    )
    assert not vs01_open_signing_link_completion_allowed(
        draft,
        signer_role_id="role_cp",
        document_id="doc_other",
    )
