"""Tests for VS01 signer completion persistence + completion emails."""

from __future__ import annotations

import pytest

from backend.services.vs01_signer_completion import (
    all_signers_signed_from_audit,
    build_signature_completed_event,
    completed_vs01_signer_role_ids,
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
