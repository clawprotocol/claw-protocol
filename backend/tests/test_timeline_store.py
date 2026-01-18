import sqlite3

import pytest

from backend.utils.timeline_store import TimelineStore, manifest_sha256


def _store(tmp_path):
    return TimelineStore(db_path=str(tmp_path / "timeline.sqlite3"))


def _create_timeline(store: TimelineStore):
    return store.create_timeline(
        timeline_id=None,
        title="Test Timeline",
        parties=[{"role": "sender", "id": "p1", "display_name": "Party 1"}],
        network="testnet",
        protocol_version="claw-timeline/1",
    )


def test_append_event_discriminated_union(tmp_path):
    store = _store(tmp_path)
    tl = _create_timeline(store)

    with pytest.raises(ValueError):
        store.append_event(
            timeline_id=tl.timeline_id,
            event_type="notice",
            event_time="2026-01-01T00:00:00Z",
            notice=None,
            marker=None,
        )

    with pytest.raises(ValueError):
        store.append_event(
            timeline_id=tl.timeline_id,
            event_type="marker",
            event_time="2026-01-01T00:00:00Z",
            notice={"x": 1},
            marker={"y": 2},
        )


def test_freeze_rejects_manifest_mismatch(tmp_path):
    store = _store(tmp_path)
    tl = _create_timeline(store)
    ev = store.append_event(
        timeline_id=tl.timeline_id,
        event_type="marker",
        event_time="2026-01-01T00:00:00Z",
        notice=None,
        marker={"marker_type": "test", "label": "t", "details": "d"},
    )
    assert ev.event_index == 0
    wrong_hash = "00" * 32
    with pytest.raises(RuntimeError):
        store.freeze_timeline(tl.timeline_id, wrong_hash)

    correct_hash = manifest_sha256([ev.event_sha256])
    frozen_hash, _frozen_at = store.freeze_timeline(tl.timeline_id, correct_hash)
    assert frozen_hash == correct_hash


def test_unique_event_index_constraint(tmp_path):
    store = _store(tmp_path)
    tl = _create_timeline(store)
    ev = store.append_event(
        timeline_id=tl.timeline_id,
        event_type="marker",
        event_time="2026-01-01T00:00:00Z",
        notice=None,
        marker={"marker_type": "test", "label": "a", "details": "b"},
    )
    assert ev.event_index == 0

    with store._conn() as conn:
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                """
                INSERT INTO events
                (event_id, timeline_id, event_index, event_type, event_time, notice_json, marker_json, event_sha256, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "evt_dup",
                    tl.timeline_id,
                    0,
                    "marker",
                    "2026-01-01T00:00:00Z",
                    None,
                    '{"marker_type":"dup","label":"dup","details":"dup"}',
                    "00" * 32,
                    "2026-01-01T00:00:00Z",
                ),
            )

