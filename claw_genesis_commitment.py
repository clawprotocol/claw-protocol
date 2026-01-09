#!/usr/bin/env python3
import hashlib
import json
import sys
from pathlib import Path

PROTOCOL = "CLAW-PROOF-v0"

def sha256(b: bytes) -> bytes:
    return hashlib.sha256(b).digest()

def sha256_hex(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()

def canonical_json_bytes(obj) -> bytes:
    s = json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return s.encode("utf-8")

def normalize_text(s: str) -> str:
    # Spec: CRLF->LF, CR->LF, trim trailing spaces/tabs per line
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    s = "\n".join(line.rstrip(" \t") for line in s.split("\n"))
    return s

def main():
    if len(sys.argv) < 2:
        print("Usage: python claw_genesis_commitment.py <path_to_spec_file>")
        sys.exit(1)

    spec_path = Path(sys.argv[1])
    doc_bytes = spec_path.read_bytes()
    doc_hash = sha256_hex(doc_bytes)

    # Genesis claim: the spec itself + a stable locator
    # You can change type/locator wording if you want, but DO NOT change after anchoring.
    claim_text = normalize_text(doc_bytes.decode("utf-8", errors="strict"))

    claim = {
        "protocol": PROTOCOL,
        "type": "genesis_spec",
        "text": claim_text,
        "source": {
            "doc_hash": doc_hash,
            "locator": "file:CLAW-PROOF-v0.md#fulltext",
        },
    }

    leaf = sha256(canonical_json_bytes(claim))
    merkle_root = leaf  # single-leaf tree
    commitment = sha256(b"CLAW" + b"\x00" + merkle_root)

    print("\n=== doc_hash (sha256 hex of raw file bytes) ===")
    print(doc_hash)

    print("\n=== leaf (sha256 of canonical claim json) ===")
    print(leaf.hex())

    print("\n=== merkle_root ===")
    print(merkle_root.hex())

    print("\n=== commitment (OP_RETURN payload hex, 32 bytes) ===")
    print(commitment.hex())

if __name__ == "__main__":
    main()
