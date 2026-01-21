from fastapi.testclient import TestClient

from backend.main import app


def test_verify_tree_accepts_receipt_id_and_fetches():
    c = TestClient(app)

    # 1) create timeline
    r = c.post(
        "/v1/timelines",
        json={
            "title": "tree test",
            "parties": [
                {"role": "author", "id": "a", "display_name": "A"},
                {"role": "counterparty", "id": "b", "display_name": "B"},
            ],
            "network": "testnet",
        },
    )
    assert r.status_code == 200
    tl = r.json()
    tid = tl["timeline_id"]

    # 2) append event
    r = c.post(
        f"/v1/timelines/{tid}/events",
        json={
            "event_type": "notice",
            "event_time": "2026-01-01T00:00:00Z",
            "notice": {"message": "hello"},
        },
    )
    assert r.status_code == 200

    # 3) freeze
    r = c.get(f"/v1/timelines/{tid}")
    assert r.status_code == 200
    manifest_sha = r.json()["manifest"]["manifest_sha256"]

    r = c.post(f"/v1/timelines/{tid}/freeze", json={"manifest_sha256": manifest_sha})
    assert r.status_code == 200

    # 4) anchor (batch mode => pending txid is fine)
    r = c.post(
        f"/v1/timelines/{tid}/anchor",
        json={
            "frozen_manifest_sha256": manifest_sha,
            "anchor_network": "bitcoin-testnet",
            "epoch_id": None,
        },
    )
    assert r.status_code == 200
    receipt_id = r.json()["receipt_id"]

    # 5) verify/tree with receipt_id only
    r = c.post("/verify/tree", json={"receipt_id": receipt_id})
    assert r.status_code == 200
    out = r.json()

    assert out["ok"] is True
    assert out["tree_skipped"] is True
    assert out["children"] == []
    assert out["root"]["ok"] is True
