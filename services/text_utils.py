# backend/services/text_utils.py

import hashlib
from typing import List


def hash_string(value: str) -> str:
    """
    Returns a hex-encoded SHA-256 hash of the given string.
    """
    h = hashlib.sha256()
    h.update(value.encode("utf-8"))
    return h.hexdigest()


def hash_list(values: List[str]) -> str:
    """
    Deterministic hash of a list of strings.
    """
    joined = "\n---\n".join(values)
    return hash_string(joined)
