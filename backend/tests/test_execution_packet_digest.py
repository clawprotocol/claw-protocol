"""Parity with frontend execution packet digest (see executionPacket.ts)."""

from backend.proof.execution_packet_digest import (
    assert_execution_packet_matches_digest,
    execution_packet_digest_sha256,
)


def test_execution_packet_digest_matches_ts_fixture():
    packet = {
        "agreementId": "a1",
        "finalizedVersionId": "v1",
        "finalizedAt": "2026-04-01T12:00:00Z",
        "agreement": {"title": "T", "parties": [{"name": "P", "role": "owner"}], "content": "Hi"},
        "signers": [{"name": "S", "role": "owner"}],
        "negotiationSummary": {
            "totalVersions": 1,
            "totalNegotiationEvents": 0,
            "topFrictionClauses": [],
            "finalState": "x",
        },
        "versionHistory": [],
        "audit": {"locked": True, "lockedAt": "2026-04-01T12:00:00Z", "lockedBy": "me"},
        "proof": {"receipt_id": "r1"},
    }
    assert (
        execution_packet_digest_sha256(packet)
        == "2004f456af9769950dbdfcf3ef2dad2815514ab177c7c4a8785f53ba6a3b73d8"
    )


def test_assert_execution_packet_matches_digest_ok():
    packet = {
        "agreementId": "a1",
        "finalizedVersionId": "v1",
        "finalizedAt": "2026-04-01T12:00:00Z",
        "agreement": {"title": "T", "parties": [], "content": ""},
        "signers": [],
        "negotiationSummary": {
            "totalVersions": 0,
            "totalNegotiationEvents": 0,
            "topFrictionClauses": [],
            "finalState": "x",
        },
        "versionHistory": [],
        "audit": {"locked": True, "lockedAt": "2026-04-01T12:00:00Z", "lockedBy": "me"},
    }
    h = execution_packet_digest_sha256(packet)
    assert_execution_packet_matches_digest(packet, declared_sha256_hex=h)


def test_assert_execution_packet_matches_digest_rejects():
    packet = {
        "agreementId": "a1",
        "finalizedVersionId": "v1",
        "finalizedAt": "2026-04-01T12:00:00Z",
        "agreement": {"title": "T", "parties": [], "content": ""},
        "signers": [],
        "negotiationSummary": {
            "totalVersions": 0,
            "totalNegotiationEvents": 0,
            "topFrictionClauses": [],
            "finalState": "x",
        },
        "versionHistory": [],
        "audit": {"locked": True, "lockedAt": "2026-04-01T12:00:00Z", "lockedBy": "me"},
    }
    try:
        assert_execution_packet_matches_digest(packet, declared_sha256_hex="0" * 64)
    except ValueError as e:
        assert "mismatch" in str(e)
    else:
        raise AssertionError("expected ValueError")
