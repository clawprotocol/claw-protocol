from backend.routers.agreements_v2_api import (
    _open_recipient_proposal_payloads,
    _recipient_proposal_closed_from_index,
)


def test_string_audit_value_does_not_crash_open_proposal_scan():
    audit = [
        {"event_type": "created", "value": None},
        {"event_type": "field_updated", "field": "owner_delivery_track", "value": "review"},
        {
            "event_type": "recipient_proposal_pending",
            "value": {"proposal_id": "prop-1", "submitted_at": "2026-09-14T20:52:11Z"},
        },
        {
            "event_type": "field_updated",
            "field": "review_notes",
            "value": "The following are review notes and suggested edits.",
        },
        {"event_type": "recipient_proposal_applied", "value": {"proposal_id": "prop-1"}},
    ]
    assert _recipient_proposal_closed_from_index(audit, "prop-1", 2) is True
    assert _open_recipient_proposal_payloads(audit) == []


def test_string_audit_value_keeps_an_open_proposal_visible():
    audit = [
        {
            "event_type": "recipient_proposal_pending",
            "value": {"proposal_id": "prop-open", "submitted_at": "2026-09-14T20:52:11Z"},
        },
        {"event_type": "field_updated", "value": "review"},
    ]
    assert _recipient_proposal_closed_from_index(audit, "prop-open", 0) is False
    open_vals = _open_recipient_proposal_payloads(audit)
    assert len(open_vals) == 1
    assert open_vals[0]["proposal_id"] == "prop-open"
