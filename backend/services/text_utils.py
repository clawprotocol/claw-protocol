import hashlib
from typing import List

def hash_string(value: str) -> str:
    h = hashlib.sha256()
    h.update(value.encode("utf-8"))
    return h.hexdigest()

def hash_list(values: List[str]) -> str:
    joined = "\n---\n".join(values)
    return hash_string(joined)
