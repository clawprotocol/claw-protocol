from __future__ import annotations

import os
from dataclasses import dataclass
from typing import List

import requests


class AnchorAdapter:
    def broadcast_commitment(self, network: str, commitment_hex: str) -> str:
        raise NotImplementedError


@dataclass(frozen=True)
class BitcoinRpcConfig:
    url: str
    cookie_path: str
    wallet: str | None = None


def _load_cookie(cookie_path: str) -> tuple[str, str]:
    with open(cookie_path, "r", encoding="utf-8") as fh:
        raw = fh.read().strip()
    if ":" not in raw:
        raise RuntimeError("Invalid cookie format; expected user:password")
    user, pw = raw.split(":", 1)
    return user, pw


class BitcoinCoreRpcAnchorAdapter(AnchorAdapter):
    def __init__(
        self,
        *,
        rpc_url: str | None = None,
        cookie_path: str | None = None,
        wallet: str | None = None,
    ) -> None:
        default_url = os.getenv("BITCOIN_RPC_URL", "http://127.0.0.1:18332").strip()
        default_cookie = os.getenv(
            "BITCOIN_RPC_COOKIE", os.path.expanduser("~/.bitcoin/testnet3/.cookie")
        )
        self.cfg = BitcoinRpcConfig(
            url=rpc_url or default_url,
            cookie_path=cookie_path or default_cookie,
            wallet=wallet or os.getenv("BITCOIN_RPC_WALLET", "").strip() or None,
        )

    def _rpc_call(self, method: str, params: List[object]) -> object:
        url = self.cfg.url.rstrip("/")
        if self.cfg.wallet:
            url = f"{url}/wallet/{self.cfg.wallet}"
        user, pw = _load_cookie(self.cfg.cookie_path)
        payload = {"jsonrpc": "1.0", "id": "claw", "method": method, "params": params}
        r = requests.post(url, json=payload, auth=(user, pw), timeout=30)
        r.raise_for_status()
        j = r.json()
        if j.get("error"):
            raise RuntimeError(f"bitcoin rpc error: {j['error']}")
        return j["result"]

    def broadcast_commitment(self, network: str, commitment_hex: str) -> str:
        if network != "bitcoin-testnet":
            raise RuntimeError("BitcoinCoreRpcAnchorAdapter supports bitcoin-testnet only")
        if not isinstance(commitment_hex, str) or len(commitment_hex) != 64:
            raise ValueError("commitment_hex must be 32-byte hex")

        raw = self._rpc_call("createrawtransaction", [[], {"data": commitment_hex}])
        funded = self._rpc_call("fundrawtransaction", [raw])
        signed = self._rpc_call("signrawtransactionwithwallet", [funded["hex"]])
        if not signed.get("complete"):
            raise RuntimeError("signrawtransactionwithwallet incomplete")
        txid = self._rpc_call("sendrawtransaction", [signed["hex"]])
        return str(txid)
