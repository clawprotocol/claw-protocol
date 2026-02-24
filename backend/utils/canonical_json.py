# backend/utils/canonical_json.py
"""
Canonical JSON serialization for CLAW protocol.

Invariants:
- Deterministic output: same input always produces same bytes
- UTF-8 encoding, no ASCII escaping for non-ASCII chars
- Sorted keys at all nesting levels
- Minimal whitespace (no spaces after separators)

This module re-exports from canon_json.py for backward compatibility
and adds additional utilities for audit-linked outputs.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from backend.utils.canon_json import canon_json_bytes, canon_sha256_hex, sha256_hex

__all__ = [
    "canon_json_bytes",
    "canon_json_str",
    "canon_sha256_hex",
    "sha256_hex",
    "make_content_hash",
    "make_audit_envelope",
]


def canon_json_str(obj: Any) -> str:
    """
    Produce canonical JSON string according to CLAW rules.
    """
    return json.dumps(
        obj,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def make_content_hash(content: str) -> str:
    """
    Hash arbitrary string content (e.g., LLM output) for audit linking.
    """
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def make_audit_envelope(
    *,
    inputs_hash: str,
    output_hash: str,
    model_id: str,
    created_at: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Create an audit envelope that links non-deterministic output to frozen inputs.

    The envelope itself is hashable via canon_sha256_hex for inclusion in receipts.
    """
    envelope = {
        "schema": "claw.audit_envelope.v1",
        "inputs_hash_sha256": inputs_hash,
        "output_hash_sha256": output_hash,
        "model_id": model_id,
        "created_at": created_at or datetime.now(timezone.utc).isoformat(),
    }
    if extra:
        envelope["extra"] = extra
    return envelope
