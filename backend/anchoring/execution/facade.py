"""Single entry for workers/API: submit batch-root commitments using configured execution provider."""

from __future__ import annotations

from typing import Any, Dict, Optional

from backend.anchoring.config import (
    bitcoin_execution_provider_type,
    dogecoin_execution_provider_type,
)

from .providers import instantiate_provider
from .types import AnchorStatusNormalized, AnchorSubmissionNormalized


def execution_provider_type_for_network(network: str) -> str:
    n = (network or "").strip().lower()
    if n.startswith("bitcoin"):
        return bitcoin_execution_provider_type()
    if n.startswith("dogecoin"):
        return dogecoin_execution_provider_type()
    raise ValueError(f"unsupported_network_for_execution_provider:{network!r}")


def get_execution_provider_for_network(network: str):
    return instantiate_provider(execution_provider_type_for_network(network))


def primary_submission_reference(norm: AnchorSubmissionNormalized) -> str:
    """String stored as txid/receipt reference by existing timeline/queue code."""
    if norm.state == "failed":
        raise RuntimeError(norm.error_message or "anchor_submission_failed")
    if norm.txid:
        return norm.txid
    if norm.external_anchor_id:
        return f"pending:{norm.external_anchor_id}"
    raise RuntimeError("anchor_submission_missing_reference")


def submit_commitment_for_network(
    network: str,
    commitment_hex: str,
    *,
    metadata: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Submit a 32-byte (64-hex) commitment for the given anchor network label.

    Returns a chain txid, ``pending:<external_id>``, or ``stub:third_party:…`` (stub mode).
    """
    n = (network or "").strip().lower()
    chain = "btc" if n.startswith("bitcoin") else "doge" if n.startswith("dogecoin") else ""
    if chain not in ("btc", "doge"):
        raise ValueError(f"unsupported_network:{network!r}")
    provider = get_execution_provider_for_network(network)
    norm = provider.submit_anchor(commitment_hex, chain, network, metadata)
    return primary_submission_reference(norm)


def get_anchor_status_for_network(network: str, anchor_reference: str) -> AnchorStatusNormalized:
    provider = get_execution_provider_for_network(network)
    return provider.get_anchor_status(anchor_reference, network=network)
