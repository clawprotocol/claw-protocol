# backend/handlers/bitcoin_opreturn.py
from __future__ import annotations

from dataclasses import dataclass
import os
import requests


def u32be(n: int) -> bytes:
    if n < 0 or n > 0xFFFFFFFF:
        raise ValueError("u32 out of range")
    return n.to_bytes(4, "big")


def hex32_to_bytes(h: str) -> bytes:
    h = h.lower().strip()
    if h.startswith("0x"):
        h = h[2:]
    if len(h) != 64:
        raise ValueError(f"expected 32-byte hex (64 chars), got len={len(h)}")
    return bytes.fromhex(h)


def build_claw_opreturn_payload(epoch_root_hex32: str, start_height: int, end_height: int) -> str:
    """
    Payload bytes:
      "CLAW" (4) + version 0x01 (1) + epoch_root (32) + start_height u32be (4) + end_height u32be (4)
    Total: 45 bytes => 90 hex chars
    Returns hex string (no 0x).
    """
    magic = b"CLAW"
    version = b"\x01"
    root_b = hex32_to_bytes(epoch_root_hex32)
    payload = magic + version + root_b + u32be(start_height) + u32be(end_height)
    return payload.hex()


@dataclass(frozen=True)
class BitcoinRpcConfig:
    url: str
    username: str
    password: str
    wallet: str | None = None


def load_bitcoin_rpc_config_from_env() -> BitcoinRpcConfig:
    url = os.getenv("BITCOIN_RPC_URL", "").strip()
    user = os.getenv("BITCOIN_RPC_USER", "").strip()
    pw = os.getenv("BITCOIN_RPC_PASS", "").strip()
    wallet = os.getenv("BITCOIN_RPC_WALLET", "").strip() or None
    if not url or not user or not pw:
        raise RuntimeError("Bitcoin RPC env not set. Need BITCOIN_RPC_URL, BITCOIN_RPC_USER, BITCOIN_RPC_PASS.")
    return BitcoinRpcConfig(url=url, username=user, password=pw, wallet=wallet)


def _rpc_call(cfg: BitcoinRpcConfig, method: str, params: list) -> dict:
    url = cfg.url
    if cfg.wallet:
        if not url.endswith("/"):
            url += "/"
        url += f"wallet/{cfg.wallet}"

    payload = {"jsonrpc": "1.0", "id": "claw", "method": method, "params": params}
    r = requests.post(url, json=payload, auth=(cfg.username, cfg.password), timeout=30)
    r.raise_for_status()
    j = r.json()
    if j.get("error"):
        raise RuntimeError(f"bitcoin rpc error: {j['error']}")
    return j["result"]


def anchor_opreturn_tx_testnet(opreturn_payload_hex: str) -> dict:
    """
    Broadcast a funded + signed OP_RETURN tx using Bitcoin Core RPC wallet.
    Requires a funded testnet wallet.

    Returns: {"txid": "..."}
    """
    cfg = load_bitcoin_rpc_config_from_env()

    raw = _rpc_call(cfg, "createrawtransaction", [[], {"data": opreturn_payload_hex}])
    funded = _rpc_call(cfg, "fundrawtransaction", [raw])
    signed = _rpc_call(cfg, "signrawtransactionwithwallet", [funded["hex"]])

    if not signed.get("complete"):
        raise RuntimeError("signrawtransactionwithwallet incomplete")

    txid = _rpc_call(cfg, "sendrawtransaction", [signed["hex"]])
    return {"txid": txid}
