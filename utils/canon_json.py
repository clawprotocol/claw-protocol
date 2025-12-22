from __future__ import annotations

import hashlib
import json
from typing import Any


def canon_json_bytes(obj: Any) -> bytes:
    """
    Canonical JSON bytes for CLAW (v0.1):
      - UTF-8
      - keys sorted lexicographically
      - minimal separators , :
      - reject NaN/Infinity
    """
    s = json.dumps(
        obj,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )
    return s.encode("utf-8")


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canon_sha256_hex(obj: Any) -> str:
    return sha256_hex(canon_json_bytes(obj))
