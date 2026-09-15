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


def _reviewer_stamped_parties(*names: str) -> list[dict]:
    rows = []
    for i, name in enumerate(names):
        rows.append(
            {
                "id": f"p{i + 1}",
                "name": name,
                "role": "owner" if i == 0 else "reviewer",
            }
        )
    return rows


def test_two_party_owner_plus_reviewer_without_packet_counts_two() -> None:
    draft = {
        "parties": _reviewer_stamped_parties("Harbor Peak Analytics LLC", "Ironvale Manufacturing Inc."),
    }
    assert party_requires_signature(draft["parties"][1]) is True
    assert resolve_required_signer_count(draft) == 2


def test_three_party_reviewer_stamped_without_packet_counts_three() -> None:
    draft = {
        "parties": _reviewer_stamped_parties(
            "Stonebridge Wellness LLC",
            "NovaPath Learning Inc.",
            "ClearSpring Distribution LLC",
        ),
    }
    assert resolve_required_signer_count(draft) == 3


def test_four_party_reviewer_stamped_without_packet_counts_four() -> None:
    draft = {
        "parties": _reviewer_stamped_parties(
            "Lumen Bioinformatics Inc.",
            "Thalassa Data Systems LLC",
            "Coastal Meridian Analytics LLC",
            "Vanguard Regulatory Sciences Ltd.",
        ),
    }
    assert resolve_required_signer_count(draft) == 4
    assert all(party_requires_signature(p) for p in draft["parties"])


def test_consultant_client_advisor_without_packet_are_required_signers() -> None:
    draft = {
        "parties": [
            {"id": "p1", "name": "Harbor Peak Analytics LLC", "role": "Consultant"},
            {"id": "p2", "name": "Ironvale Manufacturing Inc.", "role": "Client"},
            {"id": "p3", "name": "Alex Rivera", "role": "Advisor"},
        ],
    }
    assert resolve_required_signer_count(draft) == 3
    assert all(party_requires_signature(p) for p in draft["parties"])
    one = [
        {
            "event_type": "signature_completed",
            "value": {"participant_id": "p1", "typed_name": "Pat Harbor"},
        }
    ]
    two = one + [
        {
            "event_type": "signature_completed",
            "value": {"participant_id": "p2", "typed_name": "Sam Ironvale"},
        }
    ]
    three = two + [
        {
            "event_type": "signature_completed",
            "value": {"participant_id": "p3", "typed_name": "Alex Rivera"},
        }
    ]
    assert all_signers_signed_from_audit(draft, one) is False
    assert all_signers_signed_from_audit(draft, two) is False
    assert all_signers_signed_from_audit(draft, three) is True


def test_explicit_requires_signature_false_excludes_reviewer_only_extra() -> None:
    draft = {
        "parties": [
            {"id": "p1", "name": "Alpha LLC", "role": "owner"},
            {"id": "p2", "name": "Beta Inc", "role": "reviewer"},
            {
                "id": "p-notice",
                "name": "Notice Desk LLC",
                "role": "reviewer",
                "requires_signature": False,
            },
        ],
    }
    assert party_requires_signature(draft["parties"][2]) is False
    assert resolve_required_signer_count(draft) == 2


def test_incomplete_four_party_signatures_are_not_complete() -> None:
    draft = {
        "parties": _reviewer_stamped_parties(
            "Lumen Bioinformatics Inc.",
            "Thalassa Data Systems LLC",
            "Coastal Meridian Analytics LLC",
            "Vanguard Regulatory Sciences Ltd.",
        ),
    }
    three = [
        build_signature_completed_event(
            signer_role_id=f"role_{i}",
            participant_id=f"p{i}",
            display_name=f"Signer {i}",
            document_id="doc1",
            signed_at="2026-06-07T00:00:00Z",
            signed_date_iso="2026-06-07",
            signed_date_display="June 7, 2026",
            locked_version_id=None,
            agreement_version_hash=None,
        )
        for i in range(1, 4)
    ]
    assert resolve_required_signer_count(draft) == 4
    assert all_signers_signed_from_audit(draft, three) is False
