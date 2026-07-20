"""Authoritative review/version binding for negotiation-review bootstrap and sessions."""

from __future__ import annotations

from typing import Any, Dict, Optional

# Explicit sentinel for pre-lock review state (never compare via empty-string skip).
PRE_LOCK_VERSION_BINDING = "__pre_lock__"


def _clean(value: Any) -> str:
    return str(value or "").strip()


def authoritative_review_version_binding(signing_lock: Optional[Dict[str, Any]]) -> str:
    """Current authoritative lock/version binding observed on the agreement."""
    lock_v = _clean((signing_lock or {}).get("locked_version_id"))
    return lock_v if lock_v else PRE_LOCK_VERSION_BINDING


def normalize_bound_version_id(value: Any) -> str:
    """Normalize token/session bound version, mapping empty to pre-lock sentinel."""
    bound = _clean(value)
    return bound if bound else PRE_LOCK_VERSION_BINDING


def review_version_bindings_match(
    *,
    signing_lock: Optional[Dict[str, Any]],
    bound_version_id: Any,
) -> bool:
    return authoritative_review_version_binding(signing_lock) == normalize_bound_version_id(
        bound_version_id
    )


def assert_review_version_binding_matches(
    *,
    signing_lock: Optional[Dict[str, Any]],
    bound_version_id: Any,
) -> None:
    if not review_version_bindings_match(
        signing_lock=signing_lock,
        bound_version_id=bound_version_id,
    ):
        from backend.services.negotiation_review_bootstrap_exchange import (
            NegotiationReviewBootstrapExchangeError,
        )

        raise NegotiationReviewBootstrapExchangeError()
