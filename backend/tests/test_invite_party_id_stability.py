"""
Regression tests for invite/party-id stability.

Ensures:
- Active JTIs are not reminted unnecessarily during 4-party flow
- Party stable IDs are preserved when invites are resent
- Party 3's stable ID is not lost when invites are reminted for other parties

This addresses the known issue: "reminted invites wiping the others"
"""

from __future__ import annotations

import copy
from datetime import datetime, timezone

import pytest

from backend.services.recipient_delivery_registry import (
    get_registry,
    is_jti_superseded,
    record_invite_sent,
    supersede_active_invite,
)
from backend.services.recipient_party_identity import (
    participant_id_for_party,
    find_party_dict_by_participant_id,
)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _four_party_draft() -> dict:
    """Draft with 4 parties, each having a stable party ID."""
    return {
        "id": "ag_stability_test",
        "parties": [
            {"id": "p1", "name": "Alpha LLC", "role": "owner", "email": "alpha@example.test"},
            {"id": "p2", "name": "Beta Inc", "role": "party", "email": "beta@example.test"},
            {"id": "p3", "name": "Cedar LP", "role": "party", "email": "cedar@example.test"},
            {"id": "p4", "name": "Delta Co", "role": "party", "email": "delta@example.test"},
        ],
        "recipient_delivery_v1": {"v": 1, "recipients": {}},
    }


class TestJtiStabilityAcrossParties:
    """JTI for one party must not affect other parties."""

    def test_initial_invite_sent_per_party(self) -> None:
        """Each party gets their own JTI without affecting others."""
        draft = _four_party_draft()

        record_invite_sent(draft, phase="signing", participant_id="p1", jti="jti_p1_v1")
        record_invite_sent(draft, phase="signing", participant_id="p2", jti="jti_p2_v1")
        record_invite_sent(draft, phase="signing", participant_id="p3", jti="jti_p3_v1")
        record_invite_sent(draft, phase="signing", participant_id="p4", jti="jti_p4_v1")

        registry = get_registry(draft)
        recipients = registry.get("recipients", {})

        assert recipients["signing:p1"]["active_jti"] == "jti_p1_v1"
        assert recipients["signing:p2"]["active_jti"] == "jti_p2_v1"
        assert recipients["signing:p3"]["active_jti"] == "jti_p3_v1"
        assert recipients["signing:p4"]["active_jti"] == "jti_p4_v1"

    def test_resend_to_party_3_does_not_affect_others(self) -> None:
        """Resending invite to party 3 should not wipe party 1, 2, or 4 JTIs."""
        draft = _four_party_draft()

        record_invite_sent(draft, phase="signing", participant_id="p1", jti="jti_p1_v1")
        record_invite_sent(draft, phase="signing", participant_id="p2", jti="jti_p2_v1")
        record_invite_sent(draft, phase="signing", participant_id="p3", jti="jti_p3_v1")
        record_invite_sent(draft, phase="signing", participant_id="p4", jti="jti_p4_v1")

        record_invite_sent(draft, phase="signing", participant_id="p3", jti="jti_p3_v2")

        registry = get_registry(draft)
        recipients = registry.get("recipients", {})

        assert recipients["signing:p1"]["active_jti"] == "jti_p1_v1"
        assert recipients["signing:p2"]["active_jti"] == "jti_p2_v1"
        assert recipients["signing:p3"]["active_jti"] == "jti_p3_v2"
        assert recipients["signing:p4"]["active_jti"] == "jti_p4_v1"

        assert is_jti_superseded(draft, "jti_p3_v1", "signing", "p3") is True
        assert is_jti_superseded(draft, "jti_p1_v1", "signing", "p1") is False

    def test_supersede_one_party_does_not_affect_others(self) -> None:
        """Superseding party 2's invite should not affect other parties."""
        draft = _four_party_draft()

        record_invite_sent(draft, phase="signing", participant_id="p1", jti="jti_p1_v1")
        record_invite_sent(draft, phase="signing", participant_id="p2", jti="jti_p2_v1")
        record_invite_sent(draft, phase="signing", participant_id="p3", jti="jti_p3_v1")
        record_invite_sent(draft, phase="signing", participant_id="p4", jti="jti_p4_v1")

        supersede_active_invite(draft, phase="signing", participant_id="p2")

        registry = get_registry(draft)
        recipients = registry.get("recipients", {})

        assert recipients["signing:p1"]["active_jti"] == "jti_p1_v1"
        assert recipients["signing:p2"]["active_jti"] is None
        assert recipients["signing:p3"]["active_jti"] == "jti_p3_v1"
        assert recipients["signing:p4"]["active_jti"] == "jti_p4_v1"


class TestPartyIdStability:
    """Party stable IDs must be preserved throughout the signing flow."""

    def test_party_ids_stable_in_draft(self) -> None:
        """Party IDs should not change during registry operations."""
        draft = _four_party_draft()
        original_ids = [p["id"] for p in draft["parties"]]

        record_invite_sent(draft, phase="signing", participant_id="p1", jti="jti1")
        record_invite_sent(draft, phase="signing", participant_id="p2", jti="jti2")
        record_invite_sent(draft, phase="signing", participant_id="p3", jti="jti3")
        record_invite_sent(draft, phase="signing", participant_id="p4", jti="jti4")

        final_ids = [p["id"] for p in draft["parties"]]
        assert original_ids == final_ids

    def test_find_party_by_participant_id(self) -> None:
        """Party lookup by participant ID should work for all 4 parties."""
        draft = _four_party_draft()

        for i, expected_id in enumerate(["p1", "p2", "p3", "p4"]):
            party = find_party_dict_by_participant_id(draft, expected_id)
            assert party is not None
            assert party["id"] == expected_id

    def test_participant_id_for_party_preserves_stable_id(self) -> None:
        """participant_id_for_party should use existing ID, not generate new one."""
        draft = _four_party_draft()

        for i, party in enumerate(draft["parties"]):
            pid = participant_id_for_party(party, i)
            assert pid == party["id"]

    def test_party_without_id_gets_index_based_id(self) -> None:
        """Party without ID gets fallback index-based ID."""
        party = {"name": "Nameless Corp", "email": "nameless@example.test"}
        pid = participant_id_for_party(party, 5)
        assert pid == "party_index_5"


class TestInviteRemintRegression:
    """Regression: reminting invites must not wipe other party data."""

    def test_sequential_invite_minting_preserves_all(self) -> None:
        """Minting invites sequentially for 4 parties preserves all."""
        draft = _four_party_draft()

        for i, party_id in enumerate(["p1", "p2", "p3", "p4"]):
            record_invite_sent(draft, phase="review", participant_id=party_id, jti=f"review_jti_{i}")

        registry = get_registry(draft)
        assert len(registry["recipients"]) == 4

        for party_id in ["p1", "p2", "p3", "p4"]:
            key = f"review:{party_id}"
            assert key in registry["recipients"]
            assert registry["recipients"][key]["active_jti"] is not None

    def test_resend_to_middle_party_preserves_others(self) -> None:
        """Resending to party 2 (middle) preserves parties 1, 3, 4."""
        draft = _four_party_draft()

        for i, party_id in enumerate(["p1", "p2", "p3", "p4"]):
            record_invite_sent(draft, phase="signing", participant_id=party_id, jti=f"jti_v1_{i}")

        original_p1 = get_registry(draft)["recipients"]["signing:p1"]["active_jti"]
        original_p3 = get_registry(draft)["recipients"]["signing:p3"]["active_jti"]
        original_p4 = get_registry(draft)["recipients"]["signing:p4"]["active_jti"]

        record_invite_sent(draft, phase="signing", participant_id="p2", jti="jti_v2_resend")

        registry = get_registry(draft)
        assert registry["recipients"]["signing:p1"]["active_jti"] == original_p1
        assert registry["recipients"]["signing:p2"]["active_jti"] == "jti_v2_resend"
        assert registry["recipients"]["signing:p3"]["active_jti"] == original_p3
        assert registry["recipients"]["signing:p4"]["active_jti"] == original_p4

    def test_resend_all_parties_sequentially(self) -> None:
        """Resending to all parties sequentially preserves correct state."""
        draft = _four_party_draft()

        for i, party_id in enumerate(["p1", "p2", "p3", "p4"]):
            record_invite_sent(draft, phase="signing", participant_id=party_id, jti=f"jti_v1_{i}")

        for i, party_id in enumerate(["p1", "p2", "p3", "p4"]):
            record_invite_sent(draft, phase="signing", participant_id=party_id, jti=f"jti_v2_{i}")

        registry = get_registry(draft)
        for i, party_id in enumerate(["p1", "p2", "p3", "p4"]):
            key = f"signing:{party_id}"
            assert registry["recipients"][key]["active_jti"] == f"jti_v2_{i}"
            assert f"jti_v1_{i}" in registry["recipients"][key]["superseded_jtis"]


class TestReviewAndSigningPhaseIsolation:
    """Review and signing phases should be isolated per party."""

    def test_phases_isolated_for_same_party(self) -> None:
        """Review JTI for party 1 should not affect signing JTI for party 1."""
        draft = _four_party_draft()

        record_invite_sent(draft, phase="review", participant_id="p1", jti="review_jti_p1")
        record_invite_sent(draft, phase="signing", participant_id="p1", jti="signing_jti_p1")

        registry = get_registry(draft)
        assert registry["recipients"]["review:p1"]["active_jti"] == "review_jti_p1"
        assert registry["recipients"]["signing:p1"]["active_jti"] == "signing_jti_p1"

    def test_supersede_review_does_not_affect_signing(self) -> None:
        """Superseding review invite should not affect signing invite."""
        draft = _four_party_draft()

        record_invite_sent(draft, phase="review", participant_id="p1", jti="review_jti_p1")
        record_invite_sent(draft, phase="signing", participant_id="p1", jti="signing_jti_p1")

        supersede_active_invite(draft, phase="review", participant_id="p1")

        registry = get_registry(draft)
        assert registry["recipients"]["review:p1"]["active_jti"] is None
        assert registry["recipients"]["signing:p1"]["active_jti"] == "signing_jti_p1"
