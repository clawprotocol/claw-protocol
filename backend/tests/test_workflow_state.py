from fastapi.testclient import TestClient

from backend.main import app


def test_state_recent_export_import(monkeypatch, tmp_path):
    client = TestClient(app)
    tl_body = {
        "timeline_id": "tl_state_demo",
        "title": "State Demo",
        "network": "testnet",
        "created_at": "2026-01-01T00:00:00Z",
        "parties": [],
    }
    tl = client.post("/v1/workflow/timeline/create", json=tl_body).json()
    client.post(
        "/v1/workflow/timeline/append",
        json={
            "timeline": tl,
            "event_type": "notice",
            "event_time": "2026-01-01T00:00:00Z",
            "notice": {"text": "State event"},
            "marker": None,
        },
    )
    frozen = client.post(
        "/v1/workflow/timeline/freeze",
        json={"timeline": tl, "frozen_at": "2026-01-01T00:00:00Z"},
    ).json()
    client.post(
        "/v1/workflow/receipt/create",
        json={
            "timeline_id": frozen["timeline_id"],
            "frozen_manifest_sha256": frozen["frozen_manifest_sha256"],
            "anchor_network": "bitcoin-testnet",
            "epoch_id": "epoch-demo",
            "issued_at": "2026-01-01T00:00:00Z",
            "btc_txid": "pending",
        },
    )
    client.post(
        "/v1/workflow/agreement/draft",
        json={
            "agreement_id": "ag_state_demo",
            "title": "State Agreement",
            "jurisdiction": "CA",
            "parties": ["Alice"],
            "effective_date": "2026-01-01",
            "body_markdown": "State agreement text.",
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
        },
    )
    client.post(
        "/v1/workflow/attest/esign/create",
        json={
            "signer_id": "signer_demo",
            "signer_name": "Demo Signer",
            "statement": "I attest.",
            "signed_at": "2026-01-01T00:00:00Z",
        },
    )
    client.post(
        "/v1/workflow/attest/liability/create",
        json={
            "subject_id": "subject_demo",
            "role": "operator",
            "capacity": "individual",
            "control_asserted": True,
            "access_asserted": True,
            "valid_from": "2026-01-01T00:00:00Z",
            "valid_to": "2027-01-01T00:00:00Z",
            "exclusions": [],
        },
    )

    recent = client.get("/v1/workflow/state/recent?limit=25").json()
    assert len(recent["timelines"]) >= 1
    assert len(recent["agreements"]) >= 1
    assert len(recent["attestations"]) >= 2

    exported = client.post("/v1/workflow/state/export", json={}).json()["state_json"]

    new_db = tmp_path / "fresh.sqlite3"
    monkeypatch.setenv("CLAW_TIMELINE_DB_PATH", str(new_db))
    client.post("/v1/workflow/state/import", json={"state_json": exported})
    recent2 = client.get("/v1/workflow/state/recent?limit=25").json()
    assert len(recent2["timelines"]) == len(exported["timelines"])
    assert len(recent2["agreements"]) == len(exported["agreements"])
    assert len(recent2["attestations"]) == len(exported["attestations"])
