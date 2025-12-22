# backend/handlers/verify_handler.py

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import base58
from nacl.signing import VerifyKey
from nacl.exceptions import BadSignatureError

from eth_account import Account
from eth_account.messages import encode_defunct


@dataclass
class VerifyResult:
    ok: bool
    reason: Optional[str] = None
    recovered_address: Optional[str] = None


def _strip_0x(s: str) -> str:
    return s[2:] if s.startswith("0x") else s


def verify_evm_personal_sign(
    *,
    message: str,
    signature_hex: str,
    expected_address: str,
) -> VerifyResult:
    """
    Verify an EVM personal_sign signature over a UTF-8 message.

    - message: e.g. "CLAW:<packet_hash>"
    - signature_hex: 65-byte signature hex (0x...)
    - expected_address: checks recovered == expected (case-insensitive)
    """
    try:
        sig = bytes.fromhex(_strip_0x(signature_hex))
        if len(sig) != 65:
            return VerifyResult(False, f"evm signature must be 65 bytes, got {len(sig)}")
    except Exception:
        return VerifyResult(False, "evm signature is not valid hex")

    try:
        msg = encode_defunct(text=message)
        recovered = Account.recover_message(msg, signature=sig)
        if recovered.lower() != expected_address.lower():
            return VerifyResult(
                False,
                "recovered address does not match expected address",
                recovered_address=recovered,
            )
        return VerifyResult(True, recovered_address=recovered)
    except Exception as e:
        return VerifyResult(False, f"evm recover failed: {e}")


def _decode_solana_signature(sig: str) -> Optional[bytes]:
    """
    Wallets commonly return Solana signatures as base58.
    Some apps might return base64; we keep it simple:
    - Try base58 first
    - If fails, try hex
    """
    # base58
    try:
        b = base58.b58decode(sig)
        return b
    except Exception:
        pass

    # hex (rare)
    try:
        return bytes.fromhex(_strip_0x(sig))
    except Exception:
        return None


def verify_solana_sign_message(
    *,
    message: str,
    signature: str,
    expected_pubkey_base58: str,
) -> VerifyResult:
    """
    Verify Solana signMessage signature over UTF-8 message bytes.

    - expected_pubkey_base58: base58-encoded 32-byte public key
    - signature: typically base58-encoded 64-byte signature
    """
    try:
        pubkey_bytes = base58.b58decode(expected_pubkey_base58)
        if len(pubkey_bytes) != 32:
            return VerifyResult(False, f"solana pubkey must be 32 bytes, got {len(pubkey_bytes)}")
    except Exception:
        return VerifyResult(False, "solana pubkey is not valid base58")

    sig_bytes = _decode_solana_signature(signature)
    if sig_bytes is None:
        return VerifyResult(False, "solana signature is not valid base58 or hex")
    if len(sig_bytes) != 64:
        return VerifyResult(False, f"solana signature must be 64 bytes, got {len(sig_bytes)}")

    try:
        vk = VerifyKey(pubkey_bytes)
        vk.verify(message.encode("utf-8"), sig_bytes)
        return VerifyResult(True)
    except BadSignatureError:
        return VerifyResult(False, "bad solana signature")
    except Exception as e:
        return VerifyResult(False, f"solana verify failed: {e}")
