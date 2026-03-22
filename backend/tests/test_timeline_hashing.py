import pytest

from backend.utils.timeline_store import event_sha256, manifest_sha256

pytestmark = pytest.mark.invariant


def test_timeline_event_and_manifest_hash_vectors():
    event_hash = event_sha256(
        timeline_id="tl_abc",
        event_index=0,
        event_type="notice",
        event_time="2026-01-01T00:00:00Z",
        notice={
            "notice_id": "n1",
            "notice_type": "default",
            "subject": "Test",
            "body": "Hello",
            "sender": {"id": "s1", "display_name": "Sender"},
            "recipients": [{"id": "r1", "display_name": "Rec"}],
            "delivery": {"method": "email", "to": "a@b.com", "sent_at": "2026-01-01T00:00:01Z"},
            "attachments": [{"ref": "doc1", "sha256": "00" * 32, "content_type": "text/plain"}],
        },
        marker=None,
    )
    assert event_hash == "0c430c94fdbe8bef1da70eabc86fb2c56daf97b19f3d03faeb7752fc59c20089"

    manifest_hash = manifest_sha256([event_hash])
    assert manifest_hash == "a5d2741280e6c6b2d2b8138b3695988416cd67203feb4f6d88ce5a59451c2298"

