"""N-party signing and non-party coordinator support."""

from __future__ import annotations

from backend.services.vs01_signer_completion import (
    all_signers_signed_from_audit,
    build_signature_completed_event,
    party_requires_signature,
    resolve_required_signer_count,
    required_vs01_signer_role_ids,
)


def _three_party_draft() -> dict:
    return {
        "parties": [
            {"id": "p1", "name": "Alpha LLC", "role": "owner", "email": "a@example.test"},
            {"id": "p2", "name": "Beta Inc", "role": "party", "email": "b@example.test"},
            {"id": "p3", "name": "Gamma Corp", "role": "party", "email": "c@example.test"},
        ],
        "vs01_signing_packet_v1": {
            "v": 1,
            "portable": {
                "roles": [
                    {"roleId": "role_a", "requiresSignature": True},
                    {"roleId": "role_b", "requiresSignature": True},
                    {"roleId": "role_c", "requiresSignature": True},
                ]
            },
        },
    }


def test_resolve_required_signer_count_three_party_packet() -> None:
    draft = _three_party_draft()
    assert resolve_required_signer_count(draft) == 3
    assert len(required_vs01_signer_role_ids(draft)) == 3


def test_three_party_not_complete_until_all_signatures() -> None:
    draft = _three_party_draft()
    one = [
        build_signature_completed_event(
            signer_role_id="role_a",
            participant_id="p1",
            display_name="Alpha Signer",
            document_id="doc1",
            signed_at="2026-06-07T00:00:00Z",
            signed_date_iso="2026-06-07",
            signed_date_display="June 7, 2026",
            locked_version_id=None,
            agreement_version_hash=None,
        )
    ]
    two = one + [
        build_signature_completed_event(
            signer_role_id="role_b",
            participant_id="p2",
            display_name="Beta Signer",
            document_id="doc1",
            signed_at="2026-06-08T00:00:00Z",
            signed_date_iso="2026-06-08",
            signed_date_display="June 8, 2026",
            locked_version_id=None,
            agreement_version_hash=None,
        )
    ]
    three = two + [
        build_signature_completed_event(
            signer_role_id="role_c",
            participant_id="p3",
            display_name="Gamma Signer",
            document_id="doc1",
            signed_at="2026-06-09T00:00:00Z",
            signed_date_iso="2026-06-09",
            signed_date_display="June 9, 2026",
            locked_version_id=None,
            agreement_version_hash=None,
        )
    ]
    assert all_signers_signed_from_audit(draft, one) is False
    assert all_signers_signed_from_audit(draft, two) is False
    assert all_signers_signed_from_audit(draft, three) is True


def test_non_party_coordinator_excluded_from_signing_count() -> None:
    draft = {
        "creator_coordinator_only": True,
        "parties": [
            {"id": "p1", "name": "Alpha LLC", "role": "party", "email": "a@example.test"},
            {"id": "p2", "name": "Beta Inc", "role": "party", "email": "b@example.test"},
            {
                "id": "coord",
                "name": "LawDog Coordinator",
                "role": "coordinator",
                "email": "admin@example.test",
            },
        ],
        "vs01_signing_packet_v1": {
            "v": 1,
            "portable": {
                "roles": [
                    {"roleId": "role_a", "requiresSignature": True},
                    {"roleId": "role_b", "requiresSignature": True},
                ]
            },
        },
    }
    assert party_requires_signature(draft["parties"][2]) is False
    assert resolve_required_signer_count(draft) == 2


def test_two_party_backward_compat_unchanged() -> None:
    draft = {
        "parties": [
            {"id": "p1", "name": "Owner", "role": "owner"},
            {"id": "p2", "name": "Counterparty", "role": "party"},
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
    assert resolve_required_signer_count(draft) == 2
