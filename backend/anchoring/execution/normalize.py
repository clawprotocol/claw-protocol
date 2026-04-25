"""Map provider-specific JSON into normalized anchor shapes (third-party APIs)."""

from __future__ import annotations

from typing import Any, Dict

from .types import AnchorStatusNormalized, AnchorSubmissionNormalized


def normalize_submission_result(data: Dict[str, Any]) -> AnchorSubmissionNormalized:
    """
    Best-effort mapping for a generic third-party POST response.

    Recognized keys (any subset): txid, transaction_id, external_id, id, status, error, message.
    """
    txid = _str_or_none(
        data.get("txid") or data.get("transaction_id") or data.get("tx_id")
    )
    ext = _str_or_none(
        data.get("external_id") or data.get("external_anchor_id") or data.get("id")
    )
    status_raw = (data.get("status") or data.get("state") or "").strip().lower()
    err = _str_or_none(data.get("error") or data.get("message"))

    if err and not txid and not ext:
        return AnchorSubmissionNormalized(
            state="failed",
            txid=None,
            external_anchor_id=ext,
            provider_response_summary=str(data)[:4096],
            error_message=err,
        )

    if status_raw in ("confirmed", "finalized", "mined"):
        return AnchorSubmissionNormalized(
            state="confirmed",
            txid=txid,
            external_anchor_id=ext,
            provider_response_summary=str(data)[:4096],
        )

    if txid or ext:
        return AnchorSubmissionNormalized(
            state="submitted_unconfirmed",
            txid=txid,
            external_anchor_id=ext,
            provider_response_summary=str(data)[:4096],
        )

    return AnchorSubmissionNormalized(
        state="failed",
        provider_response_summary=str(data)[:4096],
        error_message=err or "third_party_missing_txid_and_external_id",
    )


def normalize_status_result(data: Dict[str, Any]) -> AnchorStatusNormalized:
    """Map a generic third-party GET status response."""
    txid = _str_or_none(
        data.get("txid") or data.get("transaction_id") or data.get("tx_id")
    )
    ext = _str_or_none(
        data.get("external_id") or data.get("external_anchor_id") or data.get("id")
    )
    status_raw = (data.get("status") or data.get("state") or "").strip().lower()
    confirmed_at = _str_or_none(data.get("confirmed_at") or data.get("mined_at"))

    if status_raw in ("failed", "error", "rejected"):
        return AnchorStatusNormalized(
            state="failed_terminal",
            txid=txid,
            external_anchor_id=ext,
            confirmed_at=confirmed_at,
            provider_response_summary=str(data)[:4096],
            error_message=_str_or_none(data.get("error") or data.get("message")),
        )
    if status_raw in ("confirmed", "finalized", "mined") or (txid and confirmed_at):
        return AnchorStatusNormalized(
            state="confirmed",
            txid=txid,
            external_anchor_id=ext,
            confirmed_at=confirmed_at,
            provider_response_summary=str(data)[:4096],
        )
    if status_raw in ("pending", "queued", "broadcast", "submitted", "processing"):
        return AnchorStatusNormalized(
            state="submitted_unconfirmed",
            txid=txid,
            external_anchor_id=ext,
            provider_response_summary=str(data)[:4096],
        )
    return AnchorStatusNormalized(
        state="unknown",
        txid=txid,
        external_anchor_id=ext,
        provider_response_summary=str(data)[:4096],
    )


def _str_or_none(v: Any) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s or None
