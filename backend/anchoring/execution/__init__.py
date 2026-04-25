"""Anchor execution provider abstraction (local RPC vs third-party)."""

from __future__ import annotations

from .facade import (
    execution_provider_type_for_network,
    get_anchor_status_for_network,
    get_execution_provider_for_network,
    primary_submission_reference,
    submit_commitment_for_network,
)
from .normalize import normalize_status_result, normalize_submission_result
from .providers import (
    AnchorExecutionProvider,
    LocalRpcBitcoinExecutionProvider,
    LocalRpcDogecoinExecutionProvider,
    ThirdPartyAnchorExecutionProvider,
    instantiate_provider,
)
from .types import AnchorStatusNormalized, AnchorSubmissionNormalized, safe_summary_json

__all__ = [
    "AnchorExecutionProvider",
    "AnchorStatusNormalized",
    "AnchorSubmissionNormalized",
    "LocalRpcBitcoinExecutionProvider",
    "LocalRpcDogecoinExecutionProvider",
    "ThirdPartyAnchorExecutionProvider",
    "execution_provider_type_for_network",
    "get_anchor_status_for_network",
    "get_execution_provider_for_network",
    "instantiate_provider",
    "normalize_status_result",
    "normalize_submission_result",
    "primary_submission_reference",
    "safe_summary_json",
    "submit_commitment_for_network",
]
