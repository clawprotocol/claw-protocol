import pytest
from backend.handlers.sign_handler import create_sign_packet

pytestmark = pytest.mark.invariant


def test_sign_packet_contains_packet_hash_and_message():
    pkt = create_sign_packet(
        clauses=["A", "B"],
        role="author",
        signer_name="Ant",
        signer_wallet="0x0000000000000000000000000000000000000000",
        document_title="Test Doc",
        chain="evm",
    )

    assert "packet_hash" in pkt
    assert isinstance(pkt["packet_hash"], str)
    assert len(pkt["packet_hash"]) == 64

    assert pkt["message"].startswith("CLAW:")
    assert pkt["signature"] is None

    # proof_packet should be present and NOT contain signatures
    assert "proof_packet" in pkt
    assert "signature" not in pkt["proof_packet"]
