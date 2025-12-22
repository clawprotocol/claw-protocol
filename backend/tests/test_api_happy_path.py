# backend/tests/test_api_happy_path.py

from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def test_happy_path_sign_proof_receipt():
    # 1) pretend we extracted clauses
    clauses = ["Clause A", "Clause B"]

    # 2) create sign packet
    r_sign = client.post(
        "/sign",
        json={
            "clauses": clauses,
            "role": "author",
            "signer_name": "Ant",
            "signer_wallet": "0x0000000000000000000000000000000000000000",
            "document_title": "Test Doc",
            "chain": "evm",
        },
    )
    assert r_sign.status_code == 200
    sign_packet = r_sign.json()["sign_packet"]
    assert "packet_hash" in sign_packet
    assert sign_packet["signature"] is None

    # 3) generate proof packet
    r_proof = client.post(
        "/proof",
        json={
            "clauses": clauses,
            "sign_packet": sign_packet,
        },
    )
    assert r_proof.status_code == 200
    proof_packet = r_proof.json()["proof_packet"]
    assert "clauses_hash" in proof_packet

    # 4) build receipt directly (no real signature yet)
    r_receipt = client.post(
        "/receipt",
        json={
            "proof_packet": proof_packet,
            "signatures": [
                {
                    "chain": "evm",
                    "address": "0x0000000000000000000000000000000000000000",
                    "role": "author",
                    "message": sign_packet["message"],
                    "signature": "",  # empty is fine for now (preview)
                }
            ],
        },
    )
    assert r_receipt.status_code == 200
    receipt = r_receipt.json()["receipt"]
    assert "receipt_hash" in receipt
    assert len(receipt["receipt_hash"]) == 64
    assert receipt["proof_packet_hash"] == proof_packet["clauses_hash"]
