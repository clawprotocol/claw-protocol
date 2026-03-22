import base64
import pytest

from backend.services import esign_service

pytestmark = pytest.mark.invariant


def test_packet_determinism_with_signer_order():
    doc_bytes = b"Deterministic doc"
    b64 = base64.b64encode(doc_bytes).decode("utf-8")
    signers_a = [
        {"name": "Bob", "email": "bob@example.com", "role": "signer"},
        {"name": "Alice", "email": "alice@example.com", "role": "signer"},
    ]
    signers_b = list(reversed(signers_a))
    p1 = esign_service.create_packet(
        document_base64=b64,
        document_sha256=None,
        title="Doc",
        mime="text/plain",
        size=len(doc_bytes),
        signers=signers_a,
        created_at="2026-01-01T00:00:00Z",
    )
    p2 = esign_service.create_packet(
        document_base64=b64,
        document_sha256=None,
        title="Doc",
        mime="text/plain",
        size=len(doc_bytes),
        signers=signers_b,
        created_at="2026-01-01T00:00:00Z",
    )
    assert p1["packet_sha256"] == p2["packet_sha256"]
    assert [s["email"] for s in p1["signers"]] == ["alice@example.com", "bob@example.com"]
