import base64

import pytest
from fastapi.testclient import TestClient

from backend.main import app

pytestmark = pytest.mark.e2e


def test_demo_run_e2e():
    client = TestClient(app)
    r = client.post(
        "/v1/workflow/demo/run",
        json={"created_at": "2026-01-01T00:00:00Z", "anchor_network": "bitcoin-testnet", "epoch_id": "epoch-demo"},
    )
    assert r.status_code == 200
    payload = r.json()
    assert payload.get("ok") is True
    assert payload.get("verify_report", {}).get("ok") is True
    zip_b64 = payload.get("zip_b64") or ""
    data = base64.b64decode(zip_b64.encode("ascii"))
    assert len(data) > 0

    # Tamper test: flip one byte and expect verify fail
    tampered = bytearray(data)
    tampered[0] ^= 0x01
    bad = client.post("/v1/workflow/bundle/verify", files={"bundle_zip": ("bundle.zip", bytes(tampered))})
    assert bad.status_code == 200
    assert bad.json().get("ok") is False
