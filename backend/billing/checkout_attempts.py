"""Owner/org-scoped Checkout Session reuse and Stripe idempotency."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional

from backend.economics.store import EconomicsStore, _checkout_attempt_expired

_log = logging.getLogger("claw.billing.checkout_attempts")

_UNUSABLE_SESSION_STATUSES = frozenset({"expired", "canceled", "cancelled"})
CreateSession = Callable[..., Dict[str, Any]]
RetrieveSession = Callable[[str], Dict[str, Any]]


def normalize_checkout_cadence(cadence: Optional[str]) -> str:
    return "annual" if str(cadence or "").strip().lower() == "annual" else "monthly"


def stripe_expires_at_iso(session: Dict[str, Any]) -> Optional[str]:
    raw = session.get("expires_at")
    if raw is None:
        return None
    try:
        ts = int(raw)
    except (TypeError, ValueError):
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def reuse_or_create_checkout_session(
    *,
    eco: EconomicsStore,
    org_id: str,
    user_id: Optional[str],
    agreement_id: str,
    cadence: str,
    return_to: Optional[str],
    price_id: str,
    success_url: str,
    cancel_url: str,
    customer_email: Optional[str],
    metadata: Dict[str, str],
    create_session: CreateSession,
    retrieve_session: RetrieveSession,
) -> Dict[str, Any]:
    """Return one payable Checkout Session for this pending purchase.

    Retries, concurrent tabs, and provider-success/local-response-loss reuse the
    same attempt and Stripe Idempotency-Key. Expired or canceled attempts are
    closed so a later legitimate purchase can start a new session.
    """
    cad = normalize_checkout_cadence(cadence)
    attempt = eco.claim_or_reuse_checkout_attempt(
        org_id=org_id,
        user_id=user_id,
        agreement_id=agreement_id,
        cadence=cad,
        return_to=return_to,
        price_id=price_id,
    )
    reused = _reuse_existing_session(
        eco, attempt, retrieve_session=retrieve_session
    )
    if reused:
        return reused

    attempt = eco.claim_or_reuse_checkout_attempt(
        org_id=org_id,
        user_id=user_id,
        agreement_id=agreement_id,
        cadence=cad,
        return_to=return_to,
        price_id=price_id,
    )
    reused = _reuse_existing_session(
        eco, attempt, retrieve_session=retrieve_session
    )
    if reused:
        return reused

    created = create_session(
        price_id=price_id,
        success_url=success_url,
        cancel_url=cancel_url,
        customer_email=customer_email,
        metadata=metadata,
        idempotency_key=str(attempt.get("idempotency_key") or ""),
    )
    session_id = str(created.get("id") or "").strip()
    checkout_url = str(created.get("url") or "").strip()
    if not session_id or not checkout_url:
        raise RuntimeError("stripe_session_incomplete")
    eco.record_checkout_attempt_session(
        str(attempt["id"]),
        stripe_session_id=session_id,
        checkout_url=checkout_url,
        expires_at=stripe_expires_at_iso(created),
        status="open",
    )
    return {
        "id": session_id,
        "url": checkout_url,
        "attempt_id": attempt["id"],
        "reused": False,
    }


def _reuse_existing_session(
    eco: EconomicsStore,
    attempt: Dict[str, Any],
    *,
    retrieve_session: RetrieveSession,
) -> Optional[Dict[str, Any]]:
    session_id = str(attempt.get("stripe_session_id") or "").strip()
    checkout_url = str(attempt.get("checkout_url") or "").strip()
    if not session_id or not checkout_url:
        return None
    live_status = ""
    live_url = checkout_url
    live_expires = None
    try:
        live = retrieve_session(session_id)
        live_status = str(live.get("status") or "").strip().lower()
        live_url = str(live.get("url") or checkout_url).strip() or checkout_url
        live_expires = stripe_expires_at_iso(live)
    except RuntimeError:
        _log.info(
            "checkout_attempt_retrieve_failed attempt=%s session=%s",
            attempt.get("id"),
            session_id,
        )
        if _checkout_attempt_expired(attempt.get("expires_at")):
            eco.mark_checkout_attempt_status(str(attempt["id"]), "expired")
            return None
        return {
            "id": session_id,
            "url": checkout_url,
            "attempt_id": attempt["id"],
            "reused": True,
        }

    if live_status in _UNUSABLE_SESSION_STATUSES:
        eco.mark_checkout_attempt_status(
            str(attempt["id"]),
            "expired" if live_status == "expired" else "canceled",
        )
        return None
    persist_status = "complete" if live_status == "complete" else "open"
    eco.record_checkout_attempt_session(
        str(attempt["id"]),
        stripe_session_id=session_id,
        checkout_url=live_url,
        expires_at=live_expires,
        status=persist_status,
    )
    return {
        "id": session_id,
        "url": live_url,
        "attempt_id": attempt["id"],
        "reused": True,
    }
