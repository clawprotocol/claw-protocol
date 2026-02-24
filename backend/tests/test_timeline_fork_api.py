from fastapi.testclient import TestClient

from backend.main import app


def test_timeline_append_after_freeze_fails_and_fork_works():
    client = TestClient(app)
    tl = client.post(
        "/v1/workflow/timeline/create",
        json={
            "timeline_id": "tl_api_demo",
            "title": "API Demo",
            "network": "testnet",
            "created_at": "2026-01-01T00:00:00Z",
            "parties": [],
        },
    ).json()
    tl = client.post(
        "/v1/workflow/timeline/append",
        json={
            "timeline": tl,
            "event_type": "notice",
            "event_time": "2026-01-01T00:00:00Z",
            "notice": {"text": "Event one"},
            "marker": None,
        },
    ).json()
    frozen = client.post(
        "/v1/workflow/timeline/freeze",
        json={"timeline": tl, "frozen_at": "2026-01-02T00:00:00Z"},
    ).json()

    res = client.post(
        "/v1/workflow/timeline/append",
        json={
            "timeline": frozen,
            "event_type": "notice",
            "event_time": "2026-01-03T00:00:00Z",
            "notice": {"text": "Event two"},
            "marker": None,
        },
    )
    assert res.status_code == 409
    assert res.json().get("error_code") == "TIMELINE_FROZEN"

    forked = client.post(
        "/v1/workflow/timeline/fork",
        json={
            "timeline": frozen,
            "created_at": "2026-01-03T00:00:00Z",
            "title": "API Demo (v2)",
        },
    ).json()
    assert forked.get("frozen") is False
    assert forked.get("prev_frozen_manifest_sha256") == frozen.get(
        "frozen_manifest_sha256"
    )
