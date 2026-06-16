"""Tests for server-side fully executed signed snapshot ensure/repair."""

from __future__ import annotations

from backend.services.vs01_fully_executed_snapshot import (
    ensure_fully_executed_snapshot_on_draft,
    reconstruct_corpus_from_audit_and_portable,
    stamp_witness_block_party_signature,
    stamp_witness_block_party_signing_date,
)
from backend.services.vs01_signer_completion import (
    build_fully_executed_signed_event,
    build_signature_completed_event,
    fully_executed_snapshot_ready,
)


def _witness_corpus() -> str:
    return (
        "x" * 1600
        + "\nIN WITNESS WHEREOF, the Parties execute this Agreement.\n\n"
        "CLIENT:\nOwner LLC\nBy: __________________________\nDate: _____________________________\n\n"
        "SERVICE PROVIDER:\nCounterparty LLC\nBy: __________________________\nDate: _____________________________"
    )


def _draft_with_portable(aid: str = "ag_test363") -> dict:
    return {
        "id": aid,
        "vs01_signing_packet_v1": {
            "v": 1,
            "portable": {
                "v": 1,
                "seed": {
                    "v": 1,
                    "documentId": "doc1",
                    "agreementId": aid,
                    "corpusPlain": _witness_corpus(),
                    "corpusHash": "h",
                    "savedAt": "2026-06-15T00:00:00Z",
                },
                "fields": [],
                "roles": [
                    {"roleId": "role_owner", "partyIndex": 0, "requiresSignature": True},
                    {"roleId": "role_cp", "partyIndex": 1, "requiresSignature": True},
                ],
                "pageCount": 10,
                "witnessPageIndex": 9,
                "initialsPolicy": {"enabled": False, "bodyPagesOnly": True},
                "fieldCount": 0,
            },
        },
    }


def test_reconstruct_corpus_stamps_both_signers() -> None:
    draft = _draft_with_portable()
    draft["audit_log"] = [
        build_signature_completed_event(
            signer_role_id="role_owner",
            participant_id="p1",
            display_name="Owner Signer",
            document_id="doc1",
            signed_at="2026-06-15T00:00:00Z",
            signed_date_iso="2026-06-15",
            signed_date_display="June 15, 2026",
            locked_version_id=None,
            agreement_version_hash=None,
        ),
        build_signature_completed_event(
            signer_role_id="role_cp",
            participant_id="p2",
            display_name="Counterparty Signer",
            document_id="doc1",
            signed_at="2026-06-16T00:00:00Z",
            signed_date_iso="2026-06-16",
            signed_date_display="June 16, 2026",
            locked_version_id=None,
            agreement_version_hash=None,
        ),
        build_fully_executed_signed_event(signed_at="2026-06-16T00:00:00Z", agreement_version_hash="h"),
    ]
    corpus = reconstruct_corpus_from_audit_and_portable(draft)
    assert corpus is not None
    assert "By: Owner Signer" in corpus
    assert "By: Counterparty Signer" in corpus
    assert "June 15, 2026" in corpus
    assert "June 16, 2026" in corpus


def test_ensure_persists_fully_executed_snapshot_when_missing() -> None:
    draft = _draft_with_portable()
    draft["audit_log"] = [
        build_signature_completed_event(
            signer_role_id="role_owner",
            participant_id="p1",
            display_name="Owner Signer",
            document_id="doc1",
            signed_at="2026-06-15T00:00:00Z",
            signed_date_iso="2026-06-15",
            signed_date_display="June 15, 2026",
            locked_version_id=None,
            agreement_version_hash=None,
        ),
        build_signature_completed_event(
            signer_role_id="role_cp",
            participant_id="p2",
            display_name="Counterparty Signer",
            document_id="doc1",
            signed_at="2026-06-16T00:00:00Z",
            signed_date_iso="2026-06-16",
            signed_date_display="June 16, 2026",
            locked_version_id=None,
            agreement_version_hash=None,
        ),
        build_fully_executed_signed_event(signed_at="2026-06-16T00:00:00Z", agreement_version_hash="h"),
    ]
    assert fully_executed_snapshot_ready(draft) is False
    result = ensure_fully_executed_snapshot_on_draft(draft, agreement_id="ag_test363")
    assert result.mutated is True
    assert result.snapshot_ready is True
    assert result.source == "reconstructed"
    assert fully_executed_snapshot_ready(result.draft_dict) is True
    snap = result.draft_dict["vs01_signing_packet_v1"]["fully_executed_snapshot"]
    assert "By: Owner Signer" in snap["corpus_plain"]


def test_stamp_witness_signature_and_date() -> None:
    corpus = _witness_corpus()
    signed, ok = stamp_witness_block_party_signature(corpus, 0, "Owner Signer")
    assert ok is True
    dated, ok2 = stamp_witness_block_party_signing_date(signed, 0, "2026-06-15")
    assert ok2 is True
    assert "By: Owner Signer" in dated
    assert "June 15, 2026" in dated
