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

def usage() -> None:
    print(
        "Usage:\n"
        "  python claw_genesis_commitment.py <path_to_spec_file> [network] [wallet] [--anchor]\n\n"
        "Examples:\n"
        "  python claw_genesis_commitment.py docs/GENESIS.md testnet claw_anchor_v0\n"
        "  python claw_genesis_commitment.py docs/GENESIS.md testnet claw_anchor_v0 --anchor\n"
    )

def main():
    if len(sys.argv) < 2:
        usage()
        sys.exit(1)

    spec_path = Path(sys.argv[1])

    # Optional args: network + wallet
    network = sys.argv[2] if len(sys.argv) >= 3 and not sys.argv[2].startswith("--") else "testnet"
    wallet  = sys.argv[3] if len(sys.argv) >= 4 and not sys.argv[3].startswith("--") else ""

    do_anchor = "--anchor" in sys.argv

    if do_anchor and network != "testnet":
        raise SystemExit("Safety stop: --anchor is enabled only for testnet right now. Prove testnet first.")

    if do_anchor and not wallet:
        raise SystemExit("Missing wallet name. Provide: <file> <network> <wallet> --anchor")

    doc_bytes = spec_path.read_bytes()
    doc_hash_hex = sha256_hex(doc_bytes)

    # Genesis claim: the spec itself + a stable locator
    # WARNING: if you change this claim format after anchoring, verification will break.
    claim_text = normalize_text(doc_bytes.decode("utf-8", errors="strict"))

    claim = {
        "protocol": PROTOCOL,
        "type": "genesis_spec",
        "text": claim_text,
        "source": {
            "doc_hash": doc_hash_hex,
            "locator": "file:CLAW-PROOF-v0.md#fulltext",
        },
    }

    leaf = sha256(canonical_json_bytes(claim))
    merkle_root = leaf  # single-leaf tree

    # Keep your commitment format EXACTLY as-is
    commitment = sha256(b"CLAW" + b"\x00" + merkle_root)
    commitment_hex = commitment.hex()

    print("\n=== doc_hash (sha256 hex of raw file bytes) ===")
    print(doc_hash_hex)

    print("\n=== leaf (sha256 of canonical claim json) ===")
    print(leaf.hex())

    print("\n=== merkle_root ===")
    print(merkle_root.hex())

    print("\n=== commitment (OP_RETURN payload hex, 32 bytes) ===")
    print(commitment_hex)

    txid = None
    anchor_meta = None

    if do_anchor:
        # Import your existing broadcaster
        from backend.handlers.bitcoin_opreturn import anchor_opreturn_tx_testnet

        # IMPORTANT: anchor_opreturn_tx_testnet expects payload hex (not including 6a20)
        # It uses Bitcoin Core createrawtransaction with {"data": payload_hex}
        result = anchor_opreturn_tx_testnet(commitment_hex)

        if isinstance(result, dict):
            txid = (
                result.get("txid")
                or result.get("anchor_txid")
                or result.get("opreturn_txid")
                or result.get("transaction_id")
            )
            anchor_meta = result
        else:
            txid = str(result)
            anchor_meta = {"txid": txid}

        if not txid:
            raise SystemExit(f"Anchor returned no txid. Raw result: {anchor_meta}")

        print("\n=== anchored (testnet) ===")
        print(txid)

    # Always write/update receipt artifact (even if not anchored yet)
    out = {
        "protocol": PROTOCOL,
        "type": "genesis_spec",
        "file": str(spec_path.as_posix()),
        "doc_hash": doc_hash_hex,
        "leaf": leaf.hex(),
        "merkle_root": merkle_root.hex(),
        "opreturn_payload_hex32": commitment_hex,
        "network": network,
        "wallet": wallet or None,
        "txid": txid,
        "anchor_meta": anchor_meta,
        "notes": "CLAW Genesis anchor (OP_RETURN push32). Fill block_* after confirmation.",
    }

    Path("receipts").mkdir(exist_ok=True)
    Path("receipts/claw-genesis-receipt.json").write_text(json.dumps(out, indent=2) + "\n")

if __name__ == "__main__":
    main()
