import hashlib
from fastapi.testclient import TestClient

from backend.main import app


def test_agreement_draft_redline_export_deterministic():
    client = TestClient(app)
    draft_body = {
        "agreement_id": "ag_demo_001",
        "title": "Demo Agreement",
        "jurisdiction": "CA",
        "parties": ["Alice", "Bob"],
        "effective_date": "2026-01-01",
        "body_markdown": "This is a demo agreement.",
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z",
    }
    res = client.post("/v1/workflow/agreement/draft", json=draft_body)
    assert res.status_code == 200
    draft = res.json()
    assert draft["agreement_id"] == "ag_demo_001"

    redline_body = {
        "agreement_id": "ag_demo_001",
        "change_text": "Replace clause 2",
        "rationale": "Clarify scope",
        "author": "Alice",
        "created_at": "2026-01-02T00:00:00Z",
    }
    res = client.post("/v1/workflow/agreement/redline", json=redline_body)
    assert res.status_code == 200
    updated = res.json()
    assert len(updated.get("redlines") or []) == 1

    res = client.get("/v1/workflow/agreement/ag_demo_001")
    assert res.status_code == 200
    fetched = res.json()
    assert fetched["agreement_id"] == "ag_demo_001"

    export_body = {"agreement_id": "ag_demo_001"}
    res1 = client.post("/v1/workflow/agreement/export", json=export_body)
    res2 = client.post("/v1/workflow/agreement/export", json=export_body)
    assert res1.status_code == 200
    assert res2.status_code == 200
    assert res1.json()["agreement_json"] == res2.json()["agreement_json"]
    assert res1.json()["agreement_markdown"] == res2.json()["agreement_markdown"]
    export_json = res1.json()["agreement_json"]
    assert "Draft / non-binding by default." in res1.json()["agreement_markdown"]
    assert "No legal advice." in res1.json()["agreement_markdown"]
    assert "Verify jurisdictional enforceability separately." in res1.json()[
        "agreement_markdown"
    ]
    body_hash = hashlib.sha256(
        "This is a demo agreement.".encode("utf-8")
    ).hexdigest()
    assert f"\"body_markdown_sha256\":\"{body_hash}\"" in export_json
