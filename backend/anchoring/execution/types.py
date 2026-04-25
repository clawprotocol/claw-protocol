"""Normalized anchor execution results (provider-agnostic; safe to persist metadata-only summaries)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass(frozen=True)
class AnchorSubmissionNormalized:
    """Result of a submit attempt; does not imply on-chain confirmation."""

    state: str  # submitted_unconfirmed | confirmed | failed
    txid: Optional[str] = None
    external_anchor_id: Optional[str] = None
    provider_response_summary: Optional[str] = None
    error_message: Optional[str] = None


@dataclass(frozen=True)
class AnchorStatusNormalized:
    """Poll / reconcile status for a prior submission reference (txid, external id, or stub token)."""

    state: str  # queued | submitted_unconfirmed | confirmed | failed_retryable | failed_terminal | unknown
    txid: Optional[str] = None
    external_anchor_id: Optional[str] = None
    confirmed_at: Optional[str] = None
    provider_response_summary: Optional[str] = None
    error_message: Optional[str] = None


def safe_summary_json(payload: Dict[str, Any], *, max_len: int = 4096) -> str:
    import json

    try:
        s = json.dumps(payload, default=str, separators=(",", ":"))
    except TypeError:
        s = str(payload)
    if len(s) > max_len:
        return s[: max_len - 3] + "..."
    return s
