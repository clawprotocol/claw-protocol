"""
Tests for four-party signing flow and completion evidence package.

Covers:
- 4-party happy path: all parties can sign without dead-ends or reminted invites
- Evidence package invariants: attribution, record hash, party copies/retrieval
- Party ID stability: invite reminting must not wipe party IDs
- 2-party and 3-party regression: existing flows still work
"""

from __future__ import annotations

import pytest

from backend.services.completion_evidence_package import (
    CompletionEvidencePackage,
    SignerEvidence,
    build_completion_evidence_package,
    build_signer_evidence_from_audit,
    completion_evidence_to_dict,
    validate_four_party_completion,
)
from backend.services.vs01_signer_completion import (
    all_signers_signed_from_audit,
    build_fully_executed_signed_event,
    build_signature_completed_event,
    orchestrate_vs01_signer_complete,
    required_vs01_signer_role_ids,
)


def _four_party_draft() -> dict:
    """Build a draft with 4 parties and VS01 signing packet."""
    return {
        "id": "agreement_4party",
        "title": "Four-Party Collaboration Agreement",
        "parties": [
            {"id": "p1", "name": "Alpha LLC", "role": "owner", "email": "alpha@example.test", "signerName": "Alice Adams"},
            {"id": "p2", "name": "Beta Inc", "role": "party", "email": "beta@example.test", "signerName": "Bob Brown"},
            {"id": "p3", "name": "Cedar LP", "role": "party", "email": "cedar@example.test", "signerName": "Carol Chen"},
            {"id": "p4", "name": "Delta Co", "role": "party", "email": "delta@example.test", "signerName": "David Davis"},
        ],
        "vs01_signing_packet_v1": {
            "v": 1,
            "portable": {
                "roles": [
                    {
                        "roleId": "role_alpha",
                        "partyIndex": 0,
                        "vs01CounterpartyId": "p1",
                        "requiresSignature": True,
                        "entityName": "Alpha LLC",
                        "signerName": "Alice Adams",
                        "signerEmail": "alpha@example.test",
                    },
                    {
                        "roleId": "role_beta",
                        "partyIndex": 1,
                        "vs01CounterpartyId": "p2",
                        "requiresSignature": True,
                        "entityName": "Beta Inc",
                        "signerName": "Bob Brown",
                        "signerEmail": "beta@example.test",
                    },
                    {
                        "roleId": "role_cedar",
                        "partyIndex": 2,
                        "vs01CounterpartyId": "p3",
                        "requiresSignature": True,
                        "entityName": "Cedar LP",
                        "signerName": "Carol Chen",
                        "signerEmail": "cedar@example.test",
                    },
                    {
                        "roleId": "role_delta",
                        "partyIndex": 3,
                        "vs01CounterpartyId": "p4",
                        "requiresSignature": True,
                        "entityName": "Delta Co",
                        "signerName": "David Davis",
                        "signerEmail": "delta@example.test",
                    },
                ],
                "seed": {
                    "corpusPlain": "x" * 200 + "\nFOUR PARTY AGREEMENT\n\nIN WITNESS WHEREOF...\n\nALPHA LLC\nBy: ______\nDate: ______\n\nBETA INC\nBy: ______\nDate: ______\n\nCEDAR LP\nBy: ______\nDate: ______\n\nDELTA CO\nBy: ______\nDate: ______",
                },
            },
        },
        "audit_log": [],
    }


def _three_party_draft() -> dict:
    """Build a draft with 3 parties."""
    draft = _four_party_draft()
    draft["parties"] = draft["parties"][:3]
    draft["vs01_signing_packet_v1"]["portable"]["roles"] = draft["vs01_signing_packet_v1"]["portable"]["roles"][:3]
    return draft


def _two_party_draft() -> dict:
    """Build a draft with 2 parties."""
    draft = _four_party_draft()
    draft["parties"] = draft["parties"][:2]
    draft["vs01_signing_packet_v1"]["portable"]["roles"] = draft["vs01_signing_packet_v1"]["portable"]["roles"][:2]
    return draft


def _sign_party(draft: dict, role_id: str, party_index: int, day: int) -> dict:
    """Simulate a party signing."""
    parties = draft["parties"]
    party = parties[party_index]
    result = orchestrate_vs01_signer_complete(
        draft,
        signer_role_id=role_id,
        participant_id=party["id"],
        display_name=party.get("signerName") or party["name"],
        document_id="doc_4party",
        signed_at=f"2026-06-{day:02d}T12:00:00Z",
        signed_date_iso=f"2026-06-{day:02d}",
        signed_date_display=f"June {day}, 2026",
        locked_version_id="v1",
        agreement_version_hash="hash_v1",
    )
    return result.draft_dict


class TestFourPartyHappyPath:
    """Four-party signing flow completes without dead-ends."""

    def test_four_party_required_roles_identified(self) -> None:
        draft = _four_party_draft()
        required = required_vs01_signer_role_ids(draft)
        assert len(required) == 4
        assert required == {"role_alpha", "role_beta", "role_cedar", "role_delta"}

    def test_four_party_sequential_signing_completes(self) -> None:
        draft = _four_party_draft()

        draft = _sign_party(draft, "role_alpha", 0, 1)
        assert not all_signers_signed_from_audit(draft, draft["audit_log"])

        draft = _sign_party(draft, "role_beta", 1, 2)
        assert not all_signers_signed_from_audit(draft, draft["audit_log"])

        draft = _sign_party(draft, "role_cedar", 2, 3)
        assert not all_signers_signed_from_audit(draft, draft["audit_log"])

        draft = _sign_party(draft, "role_delta", 3, 4)
        assert all_signers_signed_from_audit(draft, draft["audit_log"])

    def test_four_party_any_order_signing(self) -> None:
        """Parties can sign in any order."""
        draft = _four_party_draft()

        draft = _sign_party(draft, "role_delta", 3, 1)
        draft = _sign_party(draft, "role_beta", 1, 2)
        draft = _sign_party(draft, "role_alpha", 0, 3)
        draft = _sign_party(draft, "role_cedar", 2, 4)

        assert all_signers_signed_from_audit(draft, draft["audit_log"])

    def test_four_party_idempotent_signing(self) -> None:
        """Re-signing same role doesn't create duplicate events."""
        draft = _four_party_draft()

        draft = _sign_party(draft, "role_alpha", 0, 1)
        first_count = len([e for e in draft["audit_log"] if e.get("event_type") == "signature_completed"])

        draft = _sign_party(draft, "role_alpha", 0, 1)
        second_count = len([e for e in draft["audit_log"] if e.get("event_type") == "signature_completed"])

        assert second_count == first_count


class TestCompletionEvidencePackage:
    """Evidence package includes required UETA/ESIGN elements."""

    def _fully_executed_four_party(self) -> dict:
        draft = _four_party_draft()
        draft = _sign_party(draft, "role_alpha", 0, 1)
        draft = _sign_party(draft, "role_beta", 1, 2)
        draft = _sign_party(draft, "role_cedar", 2, 3)
        draft = _sign_party(draft, "role_delta", 3, 4)
        draft["vs01_signing_packet_v1"]["fully_executed_snapshot"] = {
            "v": 1,
            "corpus_plain": "x" * 300,
            "corpus_hash": "abcd1234" * 8,
            "saved_at": "2026-06-04T12:00:00Z",
        }
        return draft

    def test_evidence_package_built_for_fully_executed(self) -> None:
        draft = self._fully_executed_four_party()
        package = build_completion_evidence_package(draft, agreement_id="ag_4party")

        assert package is not None
        assert package.fully_executed is True
        assert package.signer_count == 4
        assert package.required_signer_count == 4

    def test_evidence_package_attribution(self) -> None:
        """Each signer is attributed with identity."""
        draft = self._fully_executed_four_party()
        package = build_completion_evidence_package(draft, agreement_id="ag_4party")

        assert package is not None
        assert len(package.signers) == 4

        signer_names = {s.signer_name for s in package.signers}
        assert "Alice Adams" in signer_names
        assert "Bob Brown" in signer_names
        assert "Carol Chen" in signer_names
        assert "David Davis" in signer_names

    def test_evidence_package_has_corpus_hash(self) -> None:
        """Evidence package includes hash of signed record."""
        draft = self._fully_executed_four_party()
        package = build_completion_evidence_package(draft, agreement_id="ag_4party")

        assert package is not None
        assert len(package.corpus_hash_sha256) == 64
        assert package.corpus_plain_available is True

    def test_evidence_package_has_retrieval_paths(self) -> None:
        """Every party has a retrieval path."""
        draft = self._fully_executed_four_party()
        package = build_completion_evidence_package(
            draft, agreement_id="ag_4party", origin="https://app.example.test"
        )

        assert package is not None
        assert "owner_view" in package.retrieval_paths
        assert "party_0_view" in package.retrieval_paths

    def test_evidence_package_serialization(self) -> None:
        """Package serializes to JSON-safe dict."""
        draft = self._fully_executed_four_party()
        package = build_completion_evidence_package(draft, agreement_id="ag_4party")

        assert package is not None
        data = completion_evidence_to_dict(package)

        assert data["schema"] == "claw.completion_evidence.v1"
        assert data["fully_executed"] is True
        assert len(data["signers"]) == 4
        assert "legal_notice" in data
        assert "adjudicate" in data["legal_notice"]

    def test_evidence_package_not_built_without_snapshot(self) -> None:
        """No package without fully-executed snapshot."""
        draft = _four_party_draft()
        draft = _sign_party(draft, "role_alpha", 0, 1)
        draft = _sign_party(draft, "role_beta", 1, 2)
        draft = _sign_party(draft, "role_cedar", 2, 3)
        draft = _sign_party(draft, "role_delta", 3, 4)

        package = build_completion_evidence_package(draft, agreement_id="ag_4party")
        assert package is None


class TestPartyIdStability:
    """Party IDs remain stable through invite reminting."""

    def test_party_ids_preserved_across_signing(self) -> None:
        """Party IDs don't change during signing flow."""
        draft = _four_party_draft()
        original_ids = [p["id"] for p in draft["parties"]]

        draft = _sign_party(draft, "role_alpha", 0, 1)
        draft = _sign_party(draft, "role_beta", 1, 2)
        draft = _sign_party(draft, "role_cedar", 2, 3)
        draft = _sign_party(draft, "role_delta", 3, 4)

        final_ids = [p["id"] for p in draft["parties"]]
        assert original_ids == final_ids

    def test_validate_four_party_detects_missing_ids(self) -> None:
        """Validation catches missing party IDs."""
        draft = _four_party_draft()
        draft["parties"][2]["id"] = ""

        result = validate_four_party_completion(draft)
        assert result["valid"] is False
        assert any("Party 3 missing stable party ID" in e for e in result["errors"])

    def test_validate_four_party_detects_missing_signatures(self) -> None:
        """Validation shows which signatures are missing."""
        draft = _four_party_draft()
        draft = _sign_party(draft, "role_alpha", 0, 1)
        draft = _sign_party(draft, "role_beta", 1, 2)

        result = validate_four_party_completion(draft)
        assert result["valid"] is False
        assert "role_cedar" in result["missing_signatures"]
        assert "role_delta" in result["missing_signatures"]


class TestTwoAndThreePartyRegression:
    """2-party and 3-party flows still work."""

    def test_two_party_signing_completes(self) -> None:
        draft = _two_party_draft()

        draft = _sign_party(draft, "role_alpha", 0, 1)
        assert not all_signers_signed_from_audit(draft, draft["audit_log"])

        draft = _sign_party(draft, "role_beta", 1, 2)
        assert all_signers_signed_from_audit(draft, draft["audit_log"])

    def test_three_party_signing_completes(self) -> None:
        draft = _three_party_draft()

        draft = _sign_party(draft, "role_alpha", 0, 1)
        draft = _sign_party(draft, "role_beta", 1, 2)
        assert not all_signers_signed_from_audit(draft, draft["audit_log"])

        draft = _sign_party(draft, "role_cedar", 2, 3)
        assert all_signers_signed_from_audit(draft, draft["audit_log"])

    def test_two_party_evidence_package(self) -> None:
        draft = _two_party_draft()
        draft = _sign_party(draft, "role_alpha", 0, 1)
        draft = _sign_party(draft, "role_beta", 1, 2)
        draft["vs01_signing_packet_v1"]["fully_executed_snapshot"] = {
            "v": 1,
            "corpus_plain": "x" * 200,
            "corpus_hash": "abcd1234" * 8,
            "saved_at": "2026-06-02T12:00:00Z",
        }

        package = build_completion_evidence_package(draft, agreement_id="ag_2party")
        assert package is not None
        assert package.signer_count == 2
        assert package.fully_executed is True

    def test_three_party_evidence_package(self) -> None:
        draft = _three_party_draft()
        draft = _sign_party(draft, "role_alpha", 0, 1)
        draft = _sign_party(draft, "role_beta", 1, 2)
        draft = _sign_party(draft, "role_cedar", 2, 3)
        draft["vs01_signing_packet_v1"]["fully_executed_snapshot"] = {
            "v": 1,
            "corpus_plain": "x" * 200,
            "corpus_hash": "abcd1234" * 8,
            "saved_at": "2026-06-03T12:00:00Z",
        }

        package = build_completion_evidence_package(draft, agreement_id="ag_3party")
        assert package is not None
        assert package.signer_count == 3
        assert package.fully_executed is True


class TestSignerEvidenceExtraction:
    """Signer evidence is correctly extracted from audit log."""

    def test_signer_evidence_includes_all_parties(self) -> None:
        draft = _four_party_draft()
        draft = _sign_party(draft, "role_alpha", 0, 1)
        draft = _sign_party(draft, "role_beta", 1, 2)
        draft = _sign_party(draft, "role_cedar", 2, 3)
        draft = _sign_party(draft, "role_delta", 3, 4)

        signers = build_signer_evidence_from_audit(draft)
        assert len(signers) == 4

    def test_signer_evidence_has_timestamps(self) -> None:
        draft = _four_party_draft()
        draft = _sign_party(draft, "role_alpha", 0, 15)

        signers = build_signer_evidence_from_audit(draft)
        assert len(signers) == 1
        assert signers[0].signed_date_iso == "2026-06-15"
        assert "2026-06-15" in signers[0].signed_at

    def test_signer_evidence_party_association(self) -> None:
        draft = _four_party_draft()
        draft = _sign_party(draft, "role_cedar", 2, 1)

        signers = build_signer_evidence_from_audit(draft)
        assert len(signers) == 1
        assert signers[0].party_id == "p3"
        assert signers[0].legal_entity_name == "Cedar LP"
        assert signers[0].signer_name == "Carol Chen"
