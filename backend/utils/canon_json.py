from typing import Any
import json
import hashlib


def canon_json_bytes(obj: Any) -> bytes:
    """
    Produce canonical JSON bytes according to CLAW rules.
    """
    return json.dumps(
        obj,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def canon_sha256_hex(obj: Any) -> str:
    return sha256_hex(canon_json_bytes(obj))
