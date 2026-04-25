"""
Anchor execution providers: local Core RPC vs third-party API.

Orchestration uses :func:`facade.submit_commitment_for_network` so call sites stay unaware
of which provider submitted the commitment.
"""

from __future__ import annotations

import os
import re
import uuid
from typing import Any, Dict, Optional, Protocol

import requests

from backend.handlers.anchor_adapter import (
    BitcoinCoreRpcAnchorAdapter,
    DogecoinCoreRpcAnchorAdapter,
)

from .http_anchor_providers import (
    BlockchairDogecoinExecutionProvider,
    PublicBroadcastBitcoinExecutionProvider,
)
from .normalize import normalize_status_result, normalize_submission_result
from .types import AnchorStatusNormalized, AnchorSubmissionNormalized, safe_summary_json


class AnchorExecutionProvider(Protocol):
    """Provider-pluggable anchor execution (batch-root commitment only)."""

    provider_type: str

    def submit_anchor(
        self,
        commitment_hex: str,
        chain: str,
        network: str,
        metadata: Optional[Dict[str, Any]],
    ) -> AnchorSubmissionNormalized: ...

    def get_anchor_status(
        self, anchor_reference: str, *, network: Optional[str] = None
    ) -> AnchorStatusNormalized: ...


_TXID_LIKE = re.compile(r"^[0-9a-fA-F]{64}$")


class LocalRpcBitcoinExecutionProvider:
    provider_type: str = "local_rpc_bitcoin"

    def submit_anchor(
        self,
        commitment_hex: str,
        chain: str,
        network: str,
        metadata: Optional[Dict[str, Any]],
    ) -> AnchorSubmissionNormalized:
        _ = chain, metadata
        adapter = BitcoinCoreRpcAnchorAdapter()
        txid = adapter.broadcast_commitment(network, commitment_hex)
        return AnchorSubmissionNormalized(
            state="submitted_unconfirmed",
            txid=txid,
            external_anchor_id=None,
            provider_response_summary=safe_summary_json(
                {"provider": self.provider_type, "network": network}
            ),
        )

    def get_anchor_status(
        self, anchor_reference: str, *, network: Optional[str] = None
    ) -> AnchorStatusNormalized:
        _ = network
        ref = anchor_reference.strip()
        if _TXID_LIKE.match(ref):
            return AnchorStatusNormalized(
                state="submitted_unconfirmed",
                txid=ref.lower(),
                provider_response_summary=safe_summary_json(
                    {"provider": self.provider_type, "note": "no_rpc_confirmation_in_provider"}
                ),
            )
        return AnchorStatusNormalized(
            state="unknown",
            provider_response_summary=safe_summary_json(
                {"provider": self.provider_type, "reference": ref[:128]}
            ),
        )


class LocalRpcDogecoinExecutionProvider:
    provider_type: str = "local_rpc_dogecoin"

    def submit_anchor(
        self,
        commitment_hex: str,
        chain: str,
        network: str,
        metadata: Optional[Dict[str, Any]],
    ) -> AnchorSubmissionNormalized:
        _ = chain, metadata
        adapter = DogecoinCoreRpcAnchorAdapter()
        txid = adapter.broadcast_commitment(network, commitment_hex)
        return AnchorSubmissionNormalized(
            state="submitted_unconfirmed",
            txid=txid,
            external_anchor_id=None,
            provider_response_summary=safe_summary_json(
                {"provider": self.provider_type, "network": network}
            ),
        )

    def get_anchor_status(
        self, anchor_reference: str, *, network: Optional[str] = None
    ) -> AnchorStatusNormalized:
        _ = network
        ref = anchor_reference.strip()
        if _TXID_LIKE.match(ref):
            return AnchorStatusNormalized(
                state="submitted_unconfirmed",
                txid=ref.lower(),
                provider_response_summary=safe_summary_json(
                    {"provider": self.provider_type, "note": "no_rpc_confirmation_in_provider"}
                ),
            )
        return AnchorStatusNormalized(state="unknown", provider_response_summary=None)


class ThirdPartyAnchorExecutionProvider:
    """
    Minimal third-party anchor client.

    **Stub mode** (default when ``CLAW_THIRD_PARTY_ANCHOR_BASE_URL`` or
    ``CLAW_THIRD_PARTY_ANCHOR_API_KEY`` is missing): returns a synthetic ``stub:third_party:…``
    reference — clearly non-mainnet-real; for dev/tests only. Do not treat as a chain txid.
    """

    provider_type: str = "third_party_anchor"

    def __init__(
        self,
        *,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
    ) -> None:
        self._base = (base_url or os.getenv("CLAW_THIRD_PARTY_ANCHOR_BASE_URL", "")).strip().rstrip(
            "/"
        )
        self._key = (api_key or os.getenv("CLAW_THIRD_PARTY_ANCHOR_API_KEY", "")).strip()

    def _stub_submit(
        self, network: str, commitment_hex: str, chain: str
    ) -> AnchorSubmissionNormalized:
        token = f"stub:third_party:{uuid.uuid4().hex}"
        return AnchorSubmissionNormalized(
            state="submitted_unconfirmed",
            txid=token,
            external_anchor_id=None,
            provider_response_summary=safe_summary_json(
                {
                    "mode": "stub",
                    "provider": self.provider_type,
                    "chain": chain,
                    "network": network,
                    "reason": "missing_CLAW_THIRD_PARTY_ANCHOR_BASE_URL_or_API_KEY",
                }
            ),
        )

    def submit_anchor(
        self,
        commitment_hex: str,
        chain: str,
        network: str,
        metadata: Optional[Dict[str, Any]],
    ) -> AnchorSubmissionNormalized:
        if not self._base or not self._key:
            return self._stub_submit(network, commitment_hex, chain)

        url = f"{self._base}/v1/anchor/commitments"
        body: Dict[str, Any] = {
            "commitment_hex": commitment_hex,
            "chain": chain,
            "network": network,
            "metadata": metadata or {},
        }
        try:
            r = requests.post(
                url,
                json=body,
                headers={"Authorization": f"Bearer {self._key}"},
                timeout=90,
            )
            r.raise_for_status()
            raw = r.json()
            if not isinstance(raw, dict):
                return AnchorSubmissionNormalized(
                    state="failed",
                    error_message="third_party_non_object_json",
                    provider_response_summary=str(raw)[:4096],
                )
            return normalize_submission_result(raw)
        except Exception as e:
            return AnchorSubmissionNormalized(
                state="failed",
                error_message=str(e)[:500],
                provider_response_summary=safe_summary_json({"error": str(e)[:500]}),
            )

    def get_anchor_status(
        self, anchor_reference: str, *, network: Optional[str] = None
    ) -> AnchorStatusNormalized:
        _ = network
        ref = anchor_reference.strip()
        if ref.startswith("stub:third_party:"):
            return AnchorStatusNormalized(
                state="submitted_unconfirmed",
                txid=ref,
                provider_response_summary=safe_summary_json({"mode": "stub"}),
            )
        if not self._base or not self._key:
            return AnchorStatusNormalized(
                state="unknown",
                txid=ref if _TXID_LIKE.match(ref) else None,
                external_anchor_id=ref if not _TXID_LIKE.match(ref) else None,
                provider_response_summary=safe_summary_json({"mode": "stub_status_lookup"}),
            )

        q = ref.split("pending:", 1)[-1] if ref.startswith("pending:") else ref
        url = f"{self._base}/v1/anchor/commitments/{q}"
        try:
            r = requests.get(
                url,
                headers={"Authorization": f"Bearer {self._key}"},
                timeout=60,
            )
            r.raise_for_status()
            raw = r.json()
            if not isinstance(raw, dict):
                return AnchorStatusNormalized(state="unknown", provider_response_summary=str(raw)[:1024])
            return normalize_status_result(raw)
        except Exception as e:
            return AnchorStatusNormalized(
                state="failed_retryable",
                error_message=str(e)[:500],
                provider_response_summary=safe_summary_json({"error": str(e)[:500]}),
            )


def instantiate_provider(provider_type: str) -> AnchorExecutionProvider:
    pt = (provider_type or "").strip().lower()
    if pt == "local_rpc_bitcoin":
        return LocalRpcBitcoinExecutionProvider()
    if pt == "local_rpc_dogecoin":
        return LocalRpcDogecoinExecutionProvider()
    if pt == "public_broadcast_bitcoin":
        return PublicBroadcastBitcoinExecutionProvider()
    if pt == "blockchair_dogecoin":
        return BlockchairDogecoinExecutionProvider()
    if pt == "third_party_anchor":
        return ThirdPartyAnchorExecutionProvider()
    raise ValueError(f"unknown_anchor_execution_provider:{provider_type!r}")
