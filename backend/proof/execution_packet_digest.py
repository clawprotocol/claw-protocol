"""
Execution packet SHA-256 for agreement_finalized receipts.

Must match ``computeAgreementReceiptHashes`` in ``frontend/src/vs01/executionPacket.ts``:
strip optional ``proof``, recursively sort keys like ``canonicalize`` in ``frontend/src/utils/agreements/hash.ts``,
then UTF-8 SHA-256 of JSON.stringify output (no spaces).
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Dict


def canonicalize_like_frontend(value: Any) -> Any:
    if isinstance(value, list):
        return [canonicalize_like_frontend(v) for v in value]
    if isinstance(value, dict):
        return {k: canonicalize_like_frontend(value[k]) for k in sorted(value.keys())}
    return value


def execution_packet_canonical_json_bytes(packet: Dict[str, Any]) -> bytes:
    stripped = {k: v for k, v in packet.items() if k != "proof"}
    canon = canonicalize_like_frontend(stripped)
    s = json.dumps(
        canon,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )
    return s.encode("utf-8")


def execution_packet_digest_sha256(packet: Dict[str, Any]) -> str:
    return hashlib.sha256(execution_packet_canonical_json_bytes(packet)).hexdigest()


def assert_execution_packet_matches_digest(
    packet: Dict[str, Any], *, declared_sha256_hex: str
) -> None:
    decl = (declared_sha256_hex or "").strip().lower()
    if len(decl) != 64 or any(c not in "0123456789abcdef" for c in decl):
        raise ValueError("invalid execution_packet_sha256")
    got = execution_packet_digest_sha256(packet).lower()
    if got != decl:
        raise ValueError("execution_packet_digest_mismatch")
