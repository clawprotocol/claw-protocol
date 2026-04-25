"""
Lightweight JSON-RPC reachability for Bitcoin / Dogecoin Core (wallet endpoint).

Shared by deploy readiness and anchoring observability — no anchoring policy here.
"""

from __future__ import annotations

import os
from typing import Any, Dict, Optional

import requests

from backend.handlers.anchor_adapter import ForkRpcConfig, _fork_rpc_auth


def rpc_getblockchaininfo_wallet(
    *,
    label: str,
    url: str,
    rpc_user: str,
    rpc_password: str,
    cookie_path: Optional[str],
    wallet: Optional[str],
) -> Dict[str, Any]:
    if not (url or "").strip():
        return {"status": "not_configured", "detail": f"{label} RPC URL unset"}
    cfg = ForkRpcConfig(
        url=url.strip(),
        cookie_path=(cookie_path or "").strip() or None,
        wallet=(wallet or "").strip() or None,
    )
    rpc_url = cfg.url.rstrip("/")
    if cfg.wallet:
        rpc_url = f"{rpc_url}/wallet/{cfg.wallet}"
    try:
        user, pw = _fork_rpc_auth(
            cookie_path=cfg.cookie_path, rpc_user=rpc_user, rpc_password=rpc_password
        )
    except Exception as e:
        return {"status": "error", "detail": f"auth: {str(e)[:200]}"}
    payload = {
        "jsonrpc": "1.0",
        "id": "claw-rpc-ping",
        "method": "getblockchaininfo",
        "params": [],
    }
    try:
        r = requests.post(rpc_url, json=payload, auth=(user, pw), timeout=15)
        r.raise_for_status()
        j = r.json()
        if j.get("error"):
            return {"status": "error", "detail": str(j.get("error"))[:300]}
        chain = (j.get("result") or {}).get("chain")
        blocks = (j.get("result") or {}).get("blocks")
        return {"status": "ok", "chain": chain, "blocks": blocks}
    except Exception as e:
        return {"status": "error", "detail": str(e)[:300]}


def check_bitcoin_rpc_reachable() -> Dict[str, Any]:
    return rpc_getblockchaininfo_wallet(
        label="bitcoin",
        url=os.getenv("BITCOIN_RPC_URL", "").strip(),
        rpc_user=os.getenv("BITCOIN_RPC_USER", "").strip(),
        rpc_password=os.getenv("BITCOIN_RPC_PASSWORD", "").strip(),
        cookie_path=os.getenv("BITCOIN_RPC_COOKIE", "").strip() or None,
        wallet=os.getenv("BITCOIN_RPC_WALLET", "").strip() or None,
    )


def check_dogecoin_rpc_reachable() -> Dict[str, Any]:
    return rpc_getblockchaininfo_wallet(
        label="dogecoin",
        url=os.getenv("DOGECOIN_RPC_URL", "").strip(),
        rpc_user=os.getenv("DOGECOIN_RPC_USER", "").strip(),
        rpc_password=os.getenv("DOGECOIN_RPC_PASSWORD", "").strip(),
        cookie_path=os.getenv("DOGECOIN_RPC_COOKIE", "").strip() or None,
        wallet=os.getenv("DOGECOIN_RPC_WALLET", "").strip() or None,
    )
