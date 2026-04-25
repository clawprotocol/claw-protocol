from __future__ import annotations

"""
Low-level Bitcoin / Dogecoin Core wallet OP_RETURN broadcast (optional dev/legacy path).

Production workers should submit batch commitments through
``backend.anchoring.execution.submit_commitment_for_network`` so provider selection
(Core RPC vs HTTP broadcast / Blockchair / third-party) stays centralized.
"""

import os
from dataclasses import dataclass
from typing import Any, List, Optional, Sequence

import requests


class AnchorAdapter:
    def broadcast_commitment(self, network: str, commitment_hex: str) -> str:
        raise NotImplementedError


@dataclass(frozen=True)
class ForkRpcConfig:
    url: str
    cookie_path: str | None
    wallet: str | None = None


def _load_cookie(cookie_path: str) -> tuple[str, str]:
    with open(cookie_path, "r", encoding="utf-8") as fh:
        raw = fh.read().strip()
    if ":" not in raw:
        raise RuntimeError("Invalid cookie format; expected user:password")
    user, pw = raw.split(":", 1)
    return user, pw


def _fork_rpc_auth(
    *, cookie_path: str | None, rpc_user: str, rpc_password: str
) -> tuple[str, str]:
    if rpc_user.strip():
        return (rpc_user, rpc_password)
    cp = (cookie_path or "").strip()
    if cp and os.path.isfile(cp):
        return _load_cookie(cp)
    raise RuntimeError(
        "RPC auth: set RPC user/password env vars for remote nodes, or set a cookie file path."
    )


def broadcast_op_return_via_core_wallet_rpc(
    cfg: ForkRpcConfig,
    *,
    rpc_user: str,
    rpc_password: str,
    commitment_hex: str,
) -> str:
    """
    Bitcoin Core–compatible wallet flow: OP_RETURN output via createrawtransaction →
    fundrawtransaction → signrawtransactionwithwallet → sendrawtransaction.
    Used by Bitcoin Core and Dogecoin Core anchors (same RPC surface).
    """
    if not isinstance(commitment_hex, str) or len(commitment_hex) != 64:
        raise ValueError("commitment_hex must be 32-byte hex")

    url = cfg.url.rstrip("/")
    if cfg.wallet:
        url = f"{url}/wallet/{cfg.wallet}"
    user, pw = _fork_rpc_auth(
        cookie_path=cfg.cookie_path, rpc_user=rpc_user, rpc_password=rpc_password
    )

    def rpc_call(method: str, params: List[object]) -> object:
        body = {"jsonrpc": "1.0", "id": "claw", "method": method, "params": params}
        r = requests.post(url, json=body, auth=(user, pw), timeout=120)
        r.raise_for_status()
        j = r.json()
        if j.get("error"):
            raise RuntimeError(f"{method} rpc error: {j['error']}")
        return j["result"]

    raw = rpc_call("createrawtransaction", [[], {"data": commitment_hex}])
    funded = rpc_call("fundrawtransaction", [raw])
    signed = rpc_call("signrawtransactionwithwallet", [funded["hex"]])
    if not signed.get("complete"):
        raise RuntimeError("signrawtransactionwithwallet incomplete")
    txid = rpc_call("sendrawtransaction", [signed["hex"]])
    return str(txid)


def wallet_rpc_call_result(
    cfg: ForkRpcConfig,
    *,
    rpc_user: str,
    rpc_password: str,
    method: str,
    params: List[object],
    timeout: int = 60,
) -> Optional[Any]:
    """Wallet-endpoint JSON-RPC; returns result object or ``None`` on error / transport failure."""
    url = cfg.url.rstrip("/")
    if cfg.wallet:
        url = f"{url}/wallet/{cfg.wallet}"
    user, pw = _fork_rpc_auth(
        cookie_path=cfg.cookie_path, rpc_user=rpc_user, rpc_password=rpc_password
    )
    body = {"jsonrpc": "1.0", "id": "claw", "method": method, "params": params}
    try:
        r = requests.post(url, json=body, auth=(user, pw), timeout=timeout)
        r.raise_for_status()
        j = r.json()
        if j.get("error"):
            return None
        return j.get("result")
    except Exception:
        return None


def wallet_gettransaction_confirmations(
    cfg: ForkRpcConfig,
    *,
    rpc_user: str,
    rpc_password: str,
    txid: str,
) -> Optional[int]:
    """
    Wallet RPC ``gettransaction`` confirmations (0 = mempool).

    Works on **pruned** nodes for transactions **in the local wallet** (the same path used to
    broadcast OP_RETURN anchors). Returns ``None`` if the tx is unknown to the wallet or RPC errors.
    """
    txid = (txid or "").strip().lower()
    if len(txid) != 64 or any(c not in "0123456789abcdef" for c in txid):
        return None

    result = wallet_rpc_call_result(
        cfg,
        rpc_user=rpc_user,
        rpc_password=rpc_password,
        method="gettransaction",
        params=[txid],
        timeout=60,
    )
    if not isinstance(result, dict):
        return None
    return int(result.get("confirmations", 0))


def get_wallet_transaction_confirmations(network: str, txid: str) -> Optional[int]:
    """Dispatch to Bitcoin or Dogecoin Core wallet RPC based on ``network`` label."""
    n = (network or "").strip().lower()
    try:
        if n in BitcoinCoreRpcAnchorAdapter._NETWORKS:
            a = BitcoinCoreRpcAnchorAdapter()
            return wallet_gettransaction_confirmations(
                a.cfg, rpc_user=a._rpc_user, rpc_password=a._rpc_password, txid=txid
            )
        if n in DogecoinCoreRpcAnchorAdapter._NETWORKS:
            a = DogecoinCoreRpcAnchorAdapter()
            return wallet_gettransaction_confirmations(
                a.cfg, rpc_user=a._rpc_user, rpc_password=a._rpc_password, txid=txid
            )
    except Exception:
        return None
    return None


class BitcoinCoreRpcAnchorAdapter(AnchorAdapter):
    """
    Bitcoin Core JSON-RPC for OP_RETURN batch commitments.
    Remote/production: set BITCOIN_RPC_URL and BITCOIN_RPC_USER + BITCOIN_RPC_PASSWORD,
    or provide BITCOIN_RPC_COOKIE as a path to a cookie file on the anchor worker host.
    """

    _NETWORKS: Sequence[str] = ("bitcoin-mainnet", "bitcoin-testnet")

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
        self.cfg = ForkRpcConfig(
            url=rpc_url or default_url,
            cookie_path=(cookie_path or default_cookie).strip() or None,
            wallet=wallet or os.getenv("BITCOIN_RPC_WALLET", "").strip() or None,
        )
        self._rpc_user = os.getenv("BITCOIN_RPC_USER", "").strip()
        self._rpc_password = os.getenv("BITCOIN_RPC_PASSWORD", "").strip()

    def broadcast_commitment(self, network: str, commitment_hex: str) -> str:
        if network not in self._NETWORKS:
            raise RuntimeError(
                f"BitcoinCoreRpcAnchorAdapter does not support network {network!r} "
                f"(use {', '.join(self._NETWORKS)})."
            )
        return broadcast_op_return_via_core_wallet_rpc(
            self.cfg,
            rpc_user=self._rpc_user,
            rpc_password=self._rpc_password,
            commitment_hex=commitment_hex,
        )


class DogecoinCoreRpcAnchorAdapter(AnchorAdapter):
    """
    Dogecoin Core JSON-RPC — same wallet OP_RETURN path as Bitcoin Core.
    Set DOGECOIN_RPC_URL and DOGECOIN_RPC_USER + DOGECOIN_RPC_PASSWORD, or DOGECOIN_RPC_COOKIE.
    If the node is unreachable or misconfigured, broadcast fails with an explicit error (no fake txids).
    """

    _NETWORKS: Sequence[str] = ("dogecoin-mainnet", "dogecoin-testnet")

    def __init__(
        self,
        *,
        rpc_url: str | None = None,
        cookie_path: str | None = None,
        wallet: str | None = None,
    ) -> None:
        default_url = os.getenv("DOGECOIN_RPC_URL", "http://127.0.0.1:44555").strip()
        default_cookie = os.getenv(
            "DOGECOIN_RPC_COOKIE",
            os.path.expanduser("~/.dogecoin/testnet3/.cookie"),
        )
        self.cfg = ForkRpcConfig(
            url=rpc_url or default_url,
            cookie_path=(cookie_path or default_cookie).strip() or None,
            wallet=wallet or os.getenv("DOGECOIN_RPC_WALLET", "").strip() or None,
        )
        self._rpc_user = os.getenv("DOGECOIN_RPC_USER", "").strip()
        self._rpc_password = os.getenv("DOGECOIN_RPC_PASSWORD", "").strip()

    def broadcast_commitment(self, network: str, commitment_hex: str) -> str:
        if network not in self._NETWORKS:
            raise RuntimeError(
                f"DogecoinCoreRpcAnchorAdapter does not support network {network!r} "
                f"(use {', '.join(self._NETWORKS)})."
            )
        return broadcast_op_return_via_core_wallet_rpc(
            self.cfg,
            rpc_user=self._rpc_user,
            rpc_password=self._rpc_password,
            commitment_hex=commitment_hex,
        )


def anchor_adapter_for_network(network: str) -> AnchorAdapter:
    n = (network or "").strip().lower()
    if n in BitcoinCoreRpcAnchorAdapter._NETWORKS:
        return BitcoinCoreRpcAnchorAdapter()
    if n in DogecoinCoreRpcAnchorAdapter._NETWORKS:
        return DogecoinCoreRpcAnchorAdapter()
    raise ValueError(f"unsupported anchor network for adapter: {network!r}")
