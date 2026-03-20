"""
VS01-B04: unit tests for backend.proof (canon, sign_packet.v1, receipt.v1).
"""
from __future__ import annotations

import pytest

from backend.proof.canon import canon_json_bytes, sha256_hex
from backend.proof.receipt import RECEIPT_SCHEMA_VERSION, build_receipt_body_and_hash
from backend.proof.sign_packet import (
    SIGN_PACKET_SCHEMA_VERSION,
    normalize_sign_packet,
    sign_packet_digest_sha256,
)
from backend.utils.canon_json import canon_json_bytes as util_canon_bytes

DOC_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"  # SHA-256 of empty


def _minimal_sign_packet(*, manifest_order: str = "ab") -> dict:
    """Two fields with different insertion orders when manifest_order=='ba'."""
    if manifest_order == "ab":
        manifest = [
            {"field_id": "a", "h": 4, "page_index": 0, "w": 3, "x": 0, "y": 0},
            {"field_id": "b", "h": 4, "page_index": 0, "w": 3, "x": 10, "y": 0},
        ]
    else:
        manifest = [
            {"field_id": "b", "h": 4, "page_index": 0, "w": 3, "x": 10, "y": 0},
            {"field_id": "a", "h": 4, "page_index": 0, "w": 3, "x": 0, "y": 0},
        ]
    return {
        "schema_version": SIGN_PACKET_SCHEMA_VERSION,
        "document_id": "doc-vs01",
        "document_content_sha256": DOC_HASH,
        "signer_ref": "signer-test",
        "intent": "agree_and_sign",
        "signed_at": "2026-02-01T12:00:00.000Z",
        "field_manifest": manifest,
    }


def test_canon_json_matches_utils_and_stable_key_order() -> None:
    a = {"b": 2, "a": 1}
    b = {"a": 1, "b": 2}
    ba = canon_json_bytes(a)
    bb = canon_json_bytes(b)
    assert ba == bb
    assert ba == util_canon_bytes(a)
    assert ba == b'{"a":1,"b":2}'


def test_canon_json_utf8_ensure_ascii_false() -> None:
    obj = {"umlaut": "ü"}
    raw = canon_json_bytes(obj)
    assert raw.decode("utf-8") == '{"umlaut":"ü"}'
    assert b"\\u" not in raw


def test_sha256_hex_lowercase_64() -> None:
    h = sha256_hex(canon_json_bytes({"k": "v"}))
    assert len(h) == 64
    assert h == h.lower()


def test_sign_packet_manifest_permutation_same_digest() -> None:
    p_ab = _minimal_sign_packet(manifest_order="ab")
    p_ba = _minimal_sign_packet(manifest_order="ba")
    assert sign_packet_digest_sha256(p_ab) == sign_packet_digest_sha256(p_ba)
    assert normalize_sign_packet(p_ab) == normalize_sign_packet(p_ba)


def test_sign_packet_digest_golden_vector() -> None:
    """Committed digest for _minimal_sign_packet (manifest order invariant)."""
    sp = _minimal_sign_packet()
    digest = sign_packet_digest_sha256(sp)
    assert digest == (
        "b79517d40133e93033e8695bf113537c69645a3d684bf1a25df49412d9a32cfa"
    )


def test_sign_packet_invalid_document_hash_rejected() -> None:
    sp = _minimal_sign_packet()
    sp["document_content_sha256"] = "GGGG" * 16  # invalid hex
    with pytest.raises(ValueError, match="hexadecimal"):
        sign_packet_digest_sha256(sp)


def test_sign_packet_unknown_key_rejected() -> None:
    sp = _minimal_sign_packet()
    sp["extra"] = "nope"
    with pytest.raises(ValueError, match="unknown keys"):
        normalize_sign_packet(sp)


def test_receipt_build_and_golden_hash() -> None:
    sp = _minimal_sign_packet()
    digest = sign_packet_digest_sha256(sp)
    body, receipt_hash = build_receipt_body_and_hash(
        protocol_version="1.0.0",
        document_id="doc-vs01",
        document_content_sha256=DOC_HASH,
        sign_packet=sp,
        sign_packet_digest_sha256=digest,
    )
    assert body["schema_version"] == RECEIPT_SCHEMA_VERSION
    assert body["protocol_version"] == "1.0.0"
    assert "receipt_id" not in body
    assert "receipt_hash_sha256" not in body
    assert "ingest_packet_digest_sha256" not in body
    assert "timeline_event_id" not in body
    assert body["sign_packet_digest_sha256"] == digest
    assert receipt_hash == (
        "56c71e31f39a07f6f84315f8c270c802ba041af742eae8b56bc3c75d0095e7ac"
    )


def test_receipt_wrong_sign_digest_fails() -> None:
    sp = _minimal_sign_packet()
    bad = "0" * 64
    with pytest.raises(ValueError, match="does not match"):
        build_receipt_body_and_hash(
            protocol_version="1.0.0",
            document_id="doc-vs01",
            document_content_sha256=DOC_HASH,
            sign_packet=sp,
            sign_packet_digest_sha256=bad,
        )


def test_receipt_document_mismatch_fails() -> None:
    sp = _minimal_sign_packet()
    digest = sign_packet_digest_sha256(sp)
    other = "f" * 64
    with pytest.raises(ValueError, match="document_content_sha256"):
        build_receipt_body_and_hash(
            protocol_version="1.0.0",
            document_id="doc-vs01",
            document_content_sha256=other,
            sign_packet=sp,
            sign_packet_digest_sha256=digest,
        )


def test_receipt_document_id_mismatch_fails() -> None:
    sp = _minimal_sign_packet()
    digest = sign_packet_digest_sha256(sp)
    with pytest.raises(ValueError, match="document_id must match"):
        build_receipt_body_and_hash(
            protocol_version="1.0.0",
            document_id="wrong-id",
            document_content_sha256=DOC_HASH,
            sign_packet=sp,
            sign_packet_digest_sha256=digest,
        )


def test_normalize_uppercase_hex_normalized() -> None:
    sp = _minimal_sign_packet()
    upper = DOC_HASH.upper()
    sp["document_content_sha256"] = upper
    n = normalize_sign_packet(sp)
    assert n["document_content_sha256"] == DOC_HASH


def test_receipt_determinism_byte_stable() -> None:
    sp = _minimal_sign_packet()
    digest = sign_packet_digest_sha256(sp)
    _, h1 = build_receipt_body_and_hash(
        protocol_version="1.0.0",
        document_id="doc-vs01",
        document_content_sha256=DOC_HASH,
        sign_packet=sp,
        sign_packet_digest_sha256=digest,
    )
    _, h2 = build_receipt_body_and_hash(
        protocol_version="1.0.0",
        document_id="doc-vs01",
        document_content_sha256=DOC_HASH,
        sign_packet=sp,
        sign_packet_digest_sha256=digest,
    )
    assert h1 == h2
