# backend/tests/test_liability_latest.py
from __future__ import annotations

from datetime import datetime, timezone, timedelta

from backend.utils.timeline_store import TimelineStore
from backend.handlers.liability_latest_handler import get_latest_liability_for_timeline


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def test_latest_liability_picks_newest_event() -> None:
    store = TimelineStore()

    # 1) Create timeline (timeline_id is OPTIONAL but must be passed due to kw-only signature)
    tl = store.create_timeline(
        timeline_id=None,
        title="test latest liability",
        parties=[{"id": "pty_test", "display_name": "Test", "role": "subject"}],
        network="testnet",
        protocol_version="claw-timeline/1",
    )
    timeline_id = tl.timeline_id

    base = datetime(2026, 1, 24, 0, 0, 0, tzinfo=timezone.utc)

    def mk_notice(control_flag: str) -> dict:
        return {
            "liability_attestation": {
                "role": "natural_person",
                "capacity": "individual",
                "relationship": "signer",
                "control_flags": [control_flag],
                "valid_from": _iso(base),
                "valid_to": None,
                "declared_exclusions": ["no_authority"],
            }
        }

    # 2) Insert older then newer notice events
    older = store.append_event(
        timeline_id=timeline_id,
        event_type="notice",
        event_time=_iso(base),
        notice=mk_notice("custody_asserted"),
        marker=None,
    )

    newer = store.append_event(
        timeline_id=timeline_id,
        event_type="notice",
        event_time=_iso(base + timedelta(hours=1)),
        notice=mk_notice("control_asserted"),
        marker=None,
    )

    # 3) Call handler
    out = get_latest_liability_for_timeline(store, timeline_id)

    # 4) Assert it picked newest
    assert out["timeline_id"] == timeline_id
    assert out["event_id"] == newer.event_id
    assert out["event_id"] != older.event_id
    assert out["assessment"]["inputs_attested_event_id"] == newer.event_id
