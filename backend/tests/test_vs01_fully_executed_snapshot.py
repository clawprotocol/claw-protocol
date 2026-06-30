"""Tests for server-side fully executed signed snapshot ensure/repair."""

from __future__ import annotations

from backend.services.vs01_fully_executed_snapshot import (
    completed_execution_by_name_violations,
    ensure_fully_executed_snapshot_on_draft,
    reconstruct_corpus_from_audit_and_portable,
    stamp_witness_block_party_signature,
    stamp_witness_block_party_signing_date,
    strip_witness_execution_overlays,
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


def test_signature_text_for_signer_role_requires_exact_role_match() -> None:
    fields = [
        {
            "type": "signature",
            "assignedSignerRoleId": "role_owner",
            "value": "Owner Signer",
        },
        {
            "type": "signature",
            "assignedSignerRoleId": "",
            "value": "Owner Signer",
        },
    ]
    assert signature_text_for_signer_role(fields, "role_owner") == "Owner Signer"
    assert signature_text_for_signer_role(fields, "role_cp") == ""


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


def _four_party_entity_witness_corpus() -> str:
    entities = [
        "Evergreen Outdoor Brands LLC",
        "Atlas Consumer Products Inc.",
        "Horizon Wholesale Group LLC",
        "BrightPeak Retail Solutions LLC",
    ]
    blocks = []
    for entity in entities:
        blocks.append(
            f"{entity}:\nBy: __________________________\nName: Signer\nTitle: CEO\n"
            "Date: _____________________________\n"
        )
    return (
        "x" * 1600
        + "\nIN WITNESS WHEREOF, the Parties execute this Agreement.\n\n"
        + "\n".join(blocks)
    )


def test_four_party_entity_witness_blocks_stamp_and_snapshot() -> None:
    from backend.services.vs01_fully_executed_snapshot import (
        build_snapshot_record,
        count_signed_witness_blocks,
    )

    entities = [
        "Evergreen Outdoor Brands LLC",
        "Atlas Consumer Products Inc.",
        "Horizon Wholesale Group LLC",
        "BrightPeak Retail Solutions LLC",
    ]
    signers = ["Alice Owner", "Bob Atlas", "Carol Horizon", "Dan Bright"]
    corpus = _four_party_entity_witness_corpus()
    role_names = entities
    for idx, signer in enumerate(signers):
        corpus, ok = stamp_witness_block_party_signature(corpus, idx, signer, role_names)
        assert ok is True
        corpus, ok2 = stamp_witness_block_party_signing_date(corpus, idx, f"2026-06-{15 + idx}", role_names)
        assert ok2 is True

    signed, total = count_signed_witness_blocks(corpus, role_names)
    assert signed == 4
    assert total == 4
    for signer in signers:
        assert f"By: {signer}" in corpus

    portable = {
        "roles": [
            {
                "roleId": f"role_{i}",
                "partyIndex": i,
                "entityName": entities[i],
                "requiresSignature": True,
            }
            for i in range(4)
        ],
        "fields": [],
    }
    snap = build_snapshot_record(corpus, portable)
    assert snap is not None
    assert len(snap["corpus_plain"]) >= 80


def _three_party_witness_corpus() -> str:
    entities = [
        "Stonebridge Wellness LLC",
        "NovaPath Learning Inc",
        "ClearSpring Distribution LLC",
    ]
    names = ["Sandra Wells", "Caleb Price", "Maya Coleman"]
    blocks = []
    for entity, name in zip(entities, names):
        blocks.append(
            f"{entity}:\nBy: __________________________\nName: {name}\nTitle: Officer\n"
            "Date: _____________________________\n"
        )
    return (
        "x" * 1600
        + "\nIN WITNESS WHEREOF, the Parties execute this Agreement.\n\n"
        + "\n".join(blocks)
    )


def test_reconstruct_three_party_strips_corrupted_party2_by() -> None:
    """TEST499/TEST475: party 2 By must not inherit party 1 after audit replay."""
    entities = [
        "Stonebridge Wellness LLC",
        "NovaPath Learning Inc",
        "ClearSpring Distribution LLC",
    ]
    role_ids = ["role_stonebridge", "role_novapath", "role_clearspring"]
    signers = ["Sandra Wells", "Caleb Price", "Maya Coleman"]
    corpus = _three_party_witness_corpus()
    for idx, signer in enumerate(signers[:2]):
        corpus, _ = stamp_witness_block_party_signature(corpus, idx, signer, entities)
        corpus, _ = stamp_witness_block_party_signing_date(corpus, idx, "2026-06-30", entities)
    corpus, _ = stamp_witness_block_party_signature(corpus, 2, "Caleb Price", entities)
    assert "ClearSpring Distribution LLC" in corpus
    violations = completed_execution_by_name_violations(corpus)
    assert violations

    draft = {
        "id": "ag_test499",
        "vs01_signing_packet_v1": {
            "v": 1,
            "portable": {
                "v": 1,
                "seed": {
                    "v": 1,
                    "documentId": "doc_test499",
                    "agreementId": "ag_test499",
                    "corpusPlain": corpus,
                    "corpusHash": "h",
                    "savedAt": "2026-06-30T00:00:00Z",
                },
                "fields": [
                    {
                        "type": "signature",
                        "assignedSignerRoleId": "role_stonebridge",
                        "value": "Sandra Wells",
                    },
                    {"type": "signature", "assignedSignerRoleId": "", "value": "Caleb Price"},
                    {"type": "signature", "assignedSignerRoleId": "", "value": "Caleb Price"},
                ],
                "roles": [
                    {
                        "roleId": role_ids[i],
                        "partyIndex": i,
                        "entityName": entities[i],
                        "signerName": signers[i],
                        "requiresSignature": True,
                    }
                    for i in range(3)
                ],
                "pageCount": 15,
                "witnessPageIndex": 14,
                "initialsPolicy": {"enabled": False, "bodyPagesOnly": True},
                "fieldCount": 3,
            },
        },
        "audit_log": [
            build_signature_completed_event(
                signer_role_id=role_ids[i],
                participant_id=f"p{i}",
                display_name=signers[i],
                document_id="doc_test499",
                signed_at=f"2026-06-30T1{i}:00:00.000Z",
                signed_date_iso="2026-06-30",
                signed_date_display="June 30, 2026",
                locked_version_id=None,
                agreement_version_hash=None,
            )
            for i in range(3)
        ],
    }
    rebuilt = reconstruct_corpus_from_audit_and_portable(draft)
    assert rebuilt is not None
    assert "By: Maya Coleman" in rebuilt
    assert completed_execution_by_name_violations(rebuilt) == []
    stripped = strip_witness_execution_overlays(corpus)
    assert "By: Caleb Price" not in stripped.split("ClearSpring Distribution LLC")[-1]
