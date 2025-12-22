# backend/handlers/sign_handler.py

from __future__ import annotations

from typing import List, Optional, Literal, Dict, Any
from datetime import datetime, timezone

from utils.canon_json import canon_json_bytes, sha256_hex


SigningRole = Literal["author", "verifier", "judge"]


def create_sign_packet(
    clauses: List[str],
    role: SigningRole,
    signer_name: Optional[str] = None,
    signer_wallet: Optional[str] = None,
    document_title: Optional[str] = None,
    chain: Optional[Literal["evm", "solana"]] = "evm",
) -> Dict[str, Any]:
    """
    Creates a signing packet that the UI can preview.

    Commercial rule:
    - The thing we sign is ALWAYS derived from a canonical proof packet.
    - Wallets sign the message string: "CLAW:<packet_hash>"

    This does NOT broadcast on-chain. It only prepares what you'd sign and later anchor.
    """

    created_at = datetime.now(timezone.utc).isoformat()
    doc_title = document_title or "Untitled Document"

    # 1) Build a canonical "unsigned proof packet" (no signature fields inside)
    #    This is the object whose canonical JSON bytes are hashed to produce packet_hash.
    proof_packet_unsigned: Dict[str, Any] = {
        "protocol_version": "claw/v0.1",
        "doc": {
            "title": doc_title,
        },
        "role": role,
        "clauses": clauses,  # list order preserved by canonical JSON rules
        "created_utc": created_at,
        "algo": "sha256-canonical-json",
    }

    # 2) Canonical hash of the proof packet (deterministic receipt key)
    packet_bytes = canon_json_bytes(proof_packet_unsigned)
    packet_hash = sha256_hex(packet_bytes)

    # 3) Standard message to sign (works for EVM personal_sign and Solana signMessage)
    message_to_sign = f"CLAW:{packet_hash}"

    # 4) UI-friendly sign packet (includes proof packet + receipt key)
    sign_packet: Dict[str, Any] = {
        "version": "0.1.0",
        "protocol_version": "claw/v0.1",
        "chain": (chain or "evm"),
        "document_title": doc_title,
        "role": role,
        "signer_name": signer_name or "Anonymous signer",
        "signer_wallet": signer_wallet or "0x0000000000000000000000000000000000000000",
        "created_at": created_at,
        "clauses_count": len(clauses),

        # Canonical receipt material
        "proof_packet": proof_packet_unsigned,
        "packet_hash": packet_hash,

        # What wallet signs
        "message": message_to_sign,
        "signing_scheme": "claw:message:CLAW:<packet_hash>",

        # Frontend / wallet fills this in
        "signature": None,
    }

    return sign_packet
