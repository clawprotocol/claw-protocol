"""
CLAW v1 proof package (VS01-B01–B04).

Deterministic canonical JSON + sign_packet.v1 / receipt.v1 digests per
docs/architecture/RECEIPT_SCHEMAS.md. No LLM / network.
"""
from __future__ import annotations

from backend.proof.canon import canon_json_bytes, sha256_hex
from backend.proof.receipt import build_receipt_body_and_hash
from backend.proof.sign_packet import normalize_sign_packet, sign_packet_digest_sha256

__all__ = [
    "build_receipt_body_and_hash",
    "canon_json_bytes",
    "normalize_sign_packet",
    "sha256_hex",
    "sign_packet_digest_sha256",
]
