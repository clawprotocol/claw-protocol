from __future__ import annotations

from backend.liability.map_liability_assessment import map_liability_assessment


def test_liability_assessment_mapping_basic() -> None:
    notice = {
        "liability_attestation": {
            "role": "natural_person",
            "capacity": "individual",
            "relationship": "signer",
            "control_flags": ["custody_asserted"],
            "valid_from": "2026-01-24T00:00:00Z",
            "valid_to": None,
            "declared_exclusions": ["no_authority"],
        }
    }

    out = map_liability_assessment(
        event_id="evt_test",
        notice=notice,
        created_at="2026-01-01T00:00:00Z",
    )

    assert out["schema"] == "claw.liability_assessment.v1"
    assert out["inputs_attested_event_id"] == "evt_test"

    assert out["subject"]["role"] == "natural_person"
    assert out["subject"]["capacity"] == "individual"
    assert out["subject"]["relationship"] == "signer"
    assert out["subject"]["valid_to"] is None

    assert out["tags"] == [
        "role.natural_person",
        "capacity.individual",
        "relationship.signer",
        "exclusion.no_authority_claimed",
    ]

    assert out["flags"] == [
        "control.custody_asserted",
        "time_window.open_ended",
    ]

    assert out["warnings"] == [
        "Control/access was asserted during the declared window.",
        "No authority was claimed by the user during the declared window.",
        "The declaration window is open-ended (valid_to is null).",
    ]

    assert out["patterns"] == [
        "Maintain contemporaneous records of delegated authority and revocation dates.",
        "Define explicit start/end dates for roles and access where feasible.",
    ]

    assert out["disclaimers"] == [
        "This is not legal advice.",
        "User-provided data may be incomplete or inaccurate.",
        "Outputs are classifications for evidentiary use and may be reviewed by counsel.",
    ]
