from backend.proof.agreement_receipt import (
    agreement_commitment_sha256_from_body,
    build_agreement_receipt_body,
    create_agreement_receipt_response,
)


def test_agreement_receipt_body_sorted_and_stable_commitment():
    body = build_agreement_receipt_body(
        agreement_id="a1",
        finalized_version_id="v1",
        finalized_at="2026-04-01T12:00:00Z",
        content_sha256="aa" * 32,
        execution_packet_sha256="bb" * 32,
        parties_sha256="cc" * 32,
        signer_count=2,
    )
    assert list(body.keys()) == sorted(body.keys())
    c1 = agreement_commitment_sha256_from_body(body)
    c2 = agreement_commitment_sha256_from_body(body)
    assert c1 == c2 and len(c1) == 64


def test_create_agreement_receipt_has_verifier_fields():
    receipt, body = create_agreement_receipt_response(
        agreement_id="agr_1",
        finalized_version_id="ver_x",
        finalized_at="2026-04-01T12:00:00Z",
        content_sha256="aa" * 32,
        execution_packet_sha256="bb" * 32,
        anchor_network="bitcoin-testnet",
    )
    assert receipt["timeline_id"] == "agreement:agr_1"
    assert receipt["protocol_version"]
    assert receipt["receipt_hash_sha256"]
    assert receipt["commitment"] == agreement_commitment_sha256_from_body(body)
    assert body["receipt_type"] == "agreement_finalized"
