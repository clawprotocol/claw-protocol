"""
HTTP-only anchor execution providers (public broadcast / Blockchair).

Submit **already-signed** raw transactions; commitment_hex is still the batch root for logging.
"""

from __future__ import annotations

import re
from typing import Any, Dict, Optional

import requests

from backend.anchoring.config import (
    bitcoin_public_broadcast_api_base_url,
    blockchair_dogecoin_transaction_dashboard_url,
    blockchair_dogecoin_push_url,
    canonical_bitcoin_network_for_anchors,
    mirror_dogecoin_network_for_anchors,
)

from .raw_tx_staging import resolve_signed_raw_tx_hex
from .types import AnchorStatusNormalized, AnchorSubmissionNormalized, safe_summary_json

_TXID_LIKE = re.compile(r"^[0-9a-fA-F]{64}$")


def _post_esplora_tx(base_api: str, raw_hex: str, timeout: int = 90) -> str:
    """POST /tx with raw body; response body is txid string."""
    url = f"{base_api.rstrip('/')}/tx"
    r = requests.post(url, data=raw_hex, headers={"Content-Type": "text/plain"}, timeout=timeout)
    if r.status_code >= 400:
        raise RuntimeError(f"public_bitcoin_broadcast_http_{r.status_code}:{r.text[:500]}")
    txid = (r.text or "").strip()
    if not _TXID_LIKE.match(txid):
        raise RuntimeError(f"public_bitcoin_broadcast_bad_txid_response:{txid[:80]!r}")
    return txid.lower()


def _esplora_tx_confirmations(base_api: str, txid: str, timeout: int = 45) -> Optional[int]:
    base = base_api.rstrip("/")
    tid = txid.strip().lower()
    if not _TXID_LIKE.match(tid):
        return None
    st = requests.get(f"{base}/tx/{tid}/status", timeout=timeout)
    if st.status_code == 404:
        return None
    st.raise_for_status()
    j = st.json()
    if not isinstance(j, dict):
        return None
    if not j.get("confirmed"):
        return 0
    bh = j.get("block_height")
    tip_r = requests.get(f"{base}/blocks/tip/height", timeout=timeout)
    tip_r.raise_for_status()
    try:
        tip = int(str(tip_r.text).strip())
    except ValueError:
        return 1
    if bh is None:
        return 1
    try:
        return max(1, tip - int(bh) + 1)
    except (TypeError, ValueError):
        return 1


def _blockchair_push_doge(url: str, raw_hex: str, timeout: int = 90) -> str:
    r = requests.post(
        url,
        json={"data": raw_hex},
        headers={"Content-Type": "application/json"},
        timeout=timeout,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"blockchair_push_http_{r.status_code}:{r.text[:500]}")
    body = r.json()
    if not isinstance(body, dict):
        raise RuntimeError("blockchair_push_non_object_json")
    data = body.get("data")
    if isinstance(data, dict):
        h = data.get("transaction_hash") or data.get("hash")
        if isinstance(h, str) and _TXID_LIKE.match(h):
            return h.lower()
    raise RuntimeError(f"blockchair_push_missing_txid:{str(body)[:300]}")


def _blockchair_doge_confirmations(dashboard_url: str, txid: str, timeout: int = 45) -> Optional[int]:
    tid = txid.strip().lower()
    if not _TXID_LIKE.match(tid):
        return None
    r = requests.get(dashboard_url.format(txid=tid), timeout=timeout)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    body = r.json()
    if not isinstance(body, dict):
        return None
    d = body.get("data")
    if not isinstance(d, dict):
        return None
    block = d.get(tid)
    if not isinstance(block, dict):
        # Some responses key by lower/upper
        for k, v in d.items():
            if isinstance(k, str) and k.lower() == tid and isinstance(v, dict):
                block = v
                break
    if not isinstance(block, dict):
        return None
    tx = block.get("transaction")
    if not isinstance(tx, dict):
        return None
    conf = tx.get("confirmations")
    if conf is not None:
        try:
            c = int(conf)
            return max(0, c)
        except (TypeError, ValueError):
            pass
    bid = tx.get("block_id")
    if bid is None or bid == -1:
        return 0
    return 1


class PublicBroadcastBitcoinExecutionProvider:
    """Esplora/mempool.space-compatible ``POST /tx`` + ``GET /tx/{txid}/status``."""

    provider_type: str = "public_broadcast_bitcoin"

    def submit_anchor(
        self,
        commitment_hex: str,
        chain: str,
        network: str,
        metadata: Optional[Dict[str, Any]],
    ) -> AnchorSubmissionNormalized:
        _ = chain
        raw = resolve_signed_raw_tx_hex(commitment_hex=commitment_hex, metadata=metadata)
        base = bitcoin_public_broadcast_api_base_url(network=network)
        txid = _post_esplora_tx(base, raw)
        return AnchorSubmissionNormalized(
            state="submitted_unconfirmed",
            txid=txid,
            external_anchor_id=None,
            provider_response_summary=safe_summary_json(
                {
                    "provider": self.provider_type,
                    "network": network,
                    "api_base": base,
                    "commitment_hex": commitment_hex[:16] + "…",
                }
            ),
        )

    def get_anchor_status(
        self, anchor_reference: str, *, network: Optional[str] = None
    ) -> AnchorStatusNormalized:
        ref = anchor_reference.strip()
        if not _TXID_LIKE.match(ref):
            return AnchorStatusNormalized(
                state="unknown",
                provider_response_summary=safe_summary_json(
                    {"provider": self.provider_type, "reference": ref[:128]}
                ),
            )
        net = (network or "").strip() or canonical_bitcoin_network_for_anchors()
        base = bitcoin_public_broadcast_api_base_url(network=net)
        try:
            conf = _esplora_tx_confirmations(base, ref)
        except Exception as e:
            return AnchorStatusNormalized(
                state="failed_retryable",
                txid=ref.lower(),
                error_message=str(e)[:500],
                provider_response_summary=safe_summary_json({"error": str(e)[:500]}),
            )
        if conf is None:
            return AnchorStatusNormalized(
                state="submitted_unconfirmed",
                txid=ref.lower(),
                provider_response_summary=safe_summary_json(
                    {"provider": self.provider_type, "note": "tx_not_found_at_provider"}
                ),
            )
        if conf <= 0:
            return AnchorStatusNormalized(
                state="submitted_unconfirmed",
                txid=ref.lower(),
                provider_response_summary=safe_summary_json({"confirmations": 0}),
            )
        return AnchorStatusNormalized(
            state="confirmed",
            txid=ref.lower(),
            provider_response_summary=safe_summary_json({"confirmations": conf}),
        )


class BlockchairDogecoinExecutionProvider:
    """Blockchair Dogecoin push + dashboards transaction lookup (no generic analytics usage)."""

    provider_type: str = "blockchair_dogecoin"

    def submit_anchor(
        self,
        commitment_hex: str,
        chain: str,
        network: str,
        metadata: Optional[Dict[str, Any]],
    ) -> AnchorSubmissionNormalized:
        _ = chain, network
        raw = resolve_signed_raw_tx_hex(commitment_hex=commitment_hex, metadata=metadata)
        url = blockchair_dogecoin_push_url(network=network)
        txid = _blockchair_push_doge(url, raw)
        return AnchorSubmissionNormalized(
            state="submitted_unconfirmed",
            txid=txid,
            external_anchor_id=None,
            provider_response_summary=safe_summary_json(
                {
                    "provider": self.provider_type,
                    "commitment_hex": commitment_hex[:16] + "…",
                }
            ),
        )

    def get_anchor_status(
        self, anchor_reference: str, *, network: Optional[str] = None
    ) -> AnchorStatusNormalized:
        ref = anchor_reference.strip()
        if not _TXID_LIKE.match(ref):
            return AnchorStatusNormalized(
                state="unknown",
                provider_response_summary=safe_summary_json(
                    {"provider": self.provider_type, "reference": ref[:128]}
                ),
            )
        net = (network or "").strip() or mirror_dogecoin_network_for_anchors()
        url_tpl = blockchair_dogecoin_transaction_dashboard_url(network=net)
        try:
            conf = _blockchair_doge_confirmations(url_tpl, ref)
        except Exception as e:
            return AnchorStatusNormalized(
                state="failed_retryable",
                txid=ref.lower(),
                error_message=str(e)[:500],
                provider_response_summary=safe_summary_json({"error": str(e)[:500]}),
            )
        if conf is None:
            return AnchorStatusNormalized(
                state="submitted_unconfirmed",
                txid=ref.lower(),
                provider_response_summary=safe_summary_json(
                    {"provider": self.provider_type, "note": "unexpected_dashboard_shape"}
                ),
            )
        if conf <= 0:
            return AnchorStatusNormalized(
                state="submitted_unconfirmed",
                txid=ref.lower(),
                provider_response_summary=safe_summary_json({"confirmations": 0}),
            )
        return AnchorStatusNormalized(
            state="confirmed",
            txid=ref.lower(),
            provider_response_summary=safe_summary_json({"confirmations": conf}),
        )
