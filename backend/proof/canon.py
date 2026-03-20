"""
VS01-B01: canonical JSON bytes + SHA-256 hex for proof hashing.

Delegates to backend.utils.canon_json (same rules as RECEIPT_SCHEMAS.md / ADR-001):
UTF-8, sort_keys=True, separators=(',', ':'), ensure_ascii=False.
"""
from __future__ import annotations

from typing import Any

from backend.utils.canon_json import canon_json_bytes, sha256_hex

__all__ = ["canon_json_bytes", "sha256_hex"]
