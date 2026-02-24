import base64
from fastapi.testclient import TestClient

from backend.main import app
from backend.services import bundle_service, workflow_service


def test_esign_create_sign_finalize_and_bundle_verify(tmp_path):
    client = TestClient(app)
    doc_bytes = b"Demo document"
    packet = client.post(
        "/v1/esign/create",
        json={
            "document_base64": base64.b64encode(doc_bytes).decode("utf-8"),
            "title": "Demo Doc",
            "mime": "text/plain",
            "size": len(doc_bytes),
            "signers": [
                {"name": "Alice", "email": "alice@example.com", "role": "signer"},
                {"name": "Bob", "email": "bob@example.com", "role": "signer"},
            ],
            "created_at": "2026-01-01T00:00:00Z",
        },
    ).json()
    res = client.post(
        "/v1/esign/finalize",
        json={"packet": packet, "finalized_at": "2026-01-01T00:00:00Z"},
    )
    assert res.status_code == 400
    assert res.json().get("error_code") == "ESIGN_INVALID"
    packet = client.post(
        "/v1/esign/sign",
        json={
            "packet": packet,
            "signer_id": packet["signers"][0]["signer_id"],
            "signed_at": "2026-01-01T00:00:00Z",
            "method": "typed",
            "typed_name": "Alice",
        },
    ).json()
    res = client.post(
        "/v1/esign/sign",
        json={
            "packet": packet,
            "signer_id": packet["signers"][0]["signer_id"],
            "signed_at": "2026-01-01T00:00:30Z",
            "method": "typed",
            "typed_name": "Alice",
        },
    )
    assert res.status_code == 400
    assert res.json().get("error_code") == "ESIGN_INVALID"
    packet = client.post(
        "/v1/esign/sign",
        json={
            "packet": packet,
            "signer_id": packet["signers"][1]["signer_id"],
            "signed_at": "2026-01-01T00:01:00Z",
            "method": "typed",
            "typed_name": "Bob",
        },
    ).json()
    att = client.post(
        "/v1/esign/finalize",
        json={"packet": packet, "finalized_at": "2026-01-01T00:02:00Z"},
    ).json()

    timeline = workflow_service.create_timeline(
        timeline_id="tl_esign_demo",
        title="E-Sign Demo",
        network="testnet",
        created_at="2026-01-01T00:00:00Z",
        parties=[],
    )
    timeline = workflow_service.append_event(
        timeline=timeline,
        event_type="notice",
        event_time="2026-01-01T00:00:00Z",
        notice={"text": "E-sign demo"},
        marker=None,
        references=None,
    )
    timeline = workflow_service.freeze_timeline(
        timeline=timeline, frozen_at="2026-01-01T00:00:00Z"
    )
    receipt = workflow_service.create_receipt(
        timeline_id=timeline["timeline_id"],
        frozen_manifest_sha256=timeline["frozen_manifest_sha256"],
        anchor_network="bitcoin-testnet",
        epoch_id="epoch-demo",
        issued_at="2026-01-01T00:00:00Z",
        btc_txid="pending",
    )

    zip_bytes = bundle_service.export_bundle_zip(
        created_at="2026-01-01T00:00:00Z",
        timeline=timeline,
        receipt=receipt,
        attestations=[att],
        agreement=None,
        analysis=None,
        note="demo",
    )
    report = bundle_service.verify_bundle_zip(zip_bytes)
    assert report["ok"] is True
