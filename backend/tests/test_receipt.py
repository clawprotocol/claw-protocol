# backend/tests/test_receipt.py

import pytest
from backend.handlers.receipt_handler import build_receipt

pytestmark = pytest.mark.invariant


def test_receipt_is_deterministic_across_signature_order():
    proof_packet = {
        "packet_hash": "deadbeef" * 8,  # 64 hex chars
        "algo": "sha256",
        "created_utc": "2025-12-20T00:00:00+00:00",
        "root_hash": "00" * 32,
    }

    sig_a = {
        "chain": "evm",
        "address": "0xAbc0000000000000000000000000000000000000",
        "role": "author",
        "message": "CLAW:aaaaaaaa",
        "signature": "0x" + "11" * 65,
    }

    sig_b = {
        "chain": "solana",
        "address": "7YzQ9oX2u7hJmXk3kV2mYwKxq7mXh8fZpWmYpQe1a2b3",
        "role": "verifier",
        "message": "CLAW:aaaaaaaa",
        "signature": "3" * 88,
    }

    r1 = build_receipt(proof_packet=proof_packet, signatures=[sig_a, sig_b])
    r2 = build_receipt(proof_packet=proof_packet, signatures=[sig_b, sig_a])

    assert r1["receipt_hash"] == r2["receipt_hash"]
    assert r1["proof_packet_hash"] == proof_packet["packet_hash"]
    assert len(r1["receipt_hash"]) == 64


def test_receipt_hash_changes_if_signature_changes():
    proof_packet = {
        "packet_hash": "deadbeef" * 8,
        "algo": "sha256",
        "created_utc": "2025-12-20T00:00:00+00:00",
        "root_hash": "00" * 32,
    }

    sig = {
        "chain": "evm",
        "address": "0xAbc0000000000000000000000000000000000000",
        "role": "author",
        "message": "CLAW:aaaaaaaa",
        "signature": "0x" + "11" * 65,
    }

    r1 = build_receipt(proof_packet=proof_packet, signatures=[sig])

    sig2 = {**sig, "signature": "0x" + "22" * 65}
    r2 = build_receipt(proof_packet=proof_packet, signatures=[sig2])

    assert r1["receipt_hash"] != r2["receipt_hash"]
