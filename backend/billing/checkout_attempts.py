"""Owner/org-scoped Checkout Session reuse and Stripe idempotency."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional

from backend.billing.subscription_authority import is_subscription_entitled
from backend.economics.store import EconomicsStore, _checkout_attempt_expired

_log = logging.getLogger("claw.billing.checkout_attempts")

_UNUSABLE_SESSION_STATUSES = frozenset({"expired", "canceled", "cancelled"})
_BLOCKING_STATUSES = frozenset({"complete", "reconciling"})
CreateSession = Callable[..., Dict[str, Any]]
RetrieveSession = Callable[[str], Dict[str, Any]]
ExpireSession = Callable[[str], Dict[str, Any]]
SyncSession = Callable[..., Dict[str, Any]]


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


def canonical_checkout_request(
    *,
    price_id: str,
    success_url: str,
    cancel_url: str,
    customer_email: Optional[str],
    metadata: Dict[str, str],
) -> Dict[str, Any]:
    return {
        "price_id": price_id,
        "success_url": success_url,
        "cancel_url": cancel_url,
        "customer_email": customer_email,
        "metadata": dict(metadata),
    }


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
    expire_session: Optional[ExpireSession] = None,
    sync_session: Optional[SyncSession] = None,
) -> Dict[str, Any]:
    """Return one payable session, or a reconciliation/processing outcome.

    Retries replay the persisted provider request for the attempt's Idempotency-Key.
    A completed purchase awaiting local authority cannot mint another payable session.
    A legitimate cadence/agreement change expires the previous unpaid session first.
    """
    cad = normalize_checkout_cadence(cadence)
    desired = canonical_checkout_request(
        price_id=price_id,
        success_url=success_url,
        cancel_url=cancel_url,
        customer_email=customer_email,
        metadata=metadata,
    )
    attempt = eco.claim_or_reuse_checkout_attempt(
        org_id=org_id,
        user_id=user_id,
        agreement_id=agreement_id,
        cadence=cad,
        return_to=return_to,
        price_id=price_id,
    )
    return _resolve_attempt(
        eco,
        attempt,
        org_id=org_id,
        user_id=user_id,
        agreement_id=agreement_id,
        cadence=cad,
        return_to=return_to,
        price_id=price_id,
        desired=desired,
        create_session=create_session,
        retrieve_session=retrieve_session,
        expire_session=expire_session,
        sync_session=sync_session,
    )


def _resolve_attempt(
    eco: EconomicsStore,
    attempt: Dict[str, Any],
    *,
    org_id: str,
    user_id: Optional[str],
    agreement_id: str,
    cadence: str,
    return_to: Optional[str],
    price_id: str,
    desired: Dict[str, Any],
    create_session: CreateSession,
    retrieve_session: RetrieveSession,
    expire_session: Optional[ExpireSession],
    sync_session: Optional[SyncSession],
) -> Dict[str, Any]:
    same_purchase = (
        str(attempt.get("agreement_id") or "") == agreement_id
        and str(attempt.get("cadence") or "") == cadence
    )
    status = str(attempt.get("status") or "").strip().lower()

    if status in _BLOCKING_STATUSES or _session_is_complete_locally(attempt):
        return _reconcile_completed_attempt(
            eco, attempt, retrieve_session=retrieve_session, sync_session=sync_session
        )

    materialized = _materialize_attempt_session(
        eco,
        attempt,
        desired=desired if same_purchase or not _stored_request(attempt) else None,
        create_session=create_session,
        retrieve_session=retrieve_session,
        sync_session=sync_session,
    )
    if materialized.get("kind") == "unusable":
        replacement = eco.claim_or_reuse_checkout_attempt(
            org_id=org_id,
            user_id=user_id,
            agreement_id=agreement_id,
            cadence=cadence,
            return_to=return_to,
            price_id=price_id,
        )
        return _materialize_attempt_session(
            eco,
            replacement,
            desired=desired,
            create_session=create_session,
            retrieve_session=retrieve_session,
            sync_session=sync_session,
        )
    if materialized.get("kind") in {"processing", "already_subscribed", "unresolved"}:
        return materialized
    if materialized.get("kind") == "session" and not same_purchase:
        live_status = str(materialized.get("provider_status") or "").strip().lower()
        if live_status == "complete":
            return _reconcile_completed_attempt(
                eco,
                eco.get_pending_checkout_attempt_for_org(org_id) or attempt,
                retrieve_session=retrieve_session,
                sync_session=sync_session,
            )
        if live_status in _UNUSABLE_SESSION_STATUSES:
            eco.mark_checkout_attempt_status(
                str(attempt["id"]),
                "expired" if live_status == "expired" else "canceled",
            )
        else:
            retired = _retire_unpaid_attempt(
                eco,
                attempt,
                expire_session=expire_session,
                retrieve_session=retrieve_session,
                sync_session=sync_session,
                session_id=str(materialized.get("id") or ""),
            )
            if retired.get("kind") != "superseded":
                return retired
        replacement = eco.claim_or_reuse_checkout_attempt(
            org_id=org_id,
            user_id=user_id,
            agreement_id=agreement_id,
            cadence=cadence,
            return_to=return_to,
            price_id=price_id,
        )
        return _materialize_attempt_session(
            eco,
            replacement,
            desired=desired,
            create_session=create_session,
            retrieve_session=retrieve_session,
            sync_session=sync_session,
        )
    if materialized.get("kind") == "session":
        return materialized

    if not same_purchase and status in {"creating", "open"}:
        if _checkout_attempt_expired(attempt.get("expires_at")) and not attempt.get("stripe_session_id"):
            eco.mark_checkout_attempt_status(str(attempt["id"]), "expired")
            replacement = eco.claim_or_reuse_checkout_attempt(
                org_id=org_id,
                user_id=user_id,
                agreement_id=agreement_id,
                cadence=cadence,
                return_to=return_to,
                price_id=price_id,
            )
            return _materialize_attempt_session(
                eco,
                replacement,
                desired=desired,
                create_session=create_session,
                retrieve_session=retrieve_session,
                sync_session=sync_session,
            )
    return materialized


def _stored_request(attempt: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    raw = attempt.get("provider_request_json")
    if not raw:
        return None
    if isinstance(raw, dict):
        return raw
    try:
        parsed = json.loads(str(raw))
    except (TypeError, ValueError):
        return None
    return parsed if isinstance(parsed, dict) else None


def _session_is_complete_locally(attempt: Dict[str, Any]) -> bool:
    return str(attempt.get("status") or "").strip().lower() == "complete"


def _materialize_attempt_session(
    eco: EconomicsStore,
    attempt: Dict[str, Any],
    *,
    desired: Optional[Dict[str, Any]],
    create_session: CreateSession,
    retrieve_session: RetrieveSession,
    sync_session: Optional[SyncSession],
) -> Dict[str, Any]:
    reused = _reuse_existing_session(
        eco,
        attempt,
        retrieve_session=retrieve_session,
        sync_session=sync_session,
    )
    if reused:
        return reused

    request = _stored_request(attempt)
    if request is None:
        if desired is None:
            return {"kind": "processing", "session_id": None, "attempt_id": attempt.get("id")}
        request = eco.persist_checkout_attempt_request(str(attempt["id"]), desired)
    else:
        eco.persist_checkout_attempt_request(str(attempt["id"]), request)

    created = create_session(
        price_id=str(request.get("price_id") or ""),
        success_url=str(request.get("success_url") or ""),
        cancel_url=str(request.get("cancel_url") or ""),
        customer_email=request.get("customer_email"),
        metadata=dict(request.get("metadata") or {}),
        idempotency_key=str(attempt.get("idempotency_key") or ""),
    )
    session_id = str(created.get("id") or "").strip()
    checkout_url = str(created.get("url") or "").strip()
    if not session_id or not checkout_url:
        raise RuntimeError("stripe_session_incomplete")
    live_status = str(created.get("status") or "open").strip().lower()
    persist_status = "complete" if live_status == "complete" else "open"
    eco.record_checkout_attempt_session(
        str(attempt["id"]),
        stripe_session_id=session_id,
        checkout_url=checkout_url,
        expires_at=stripe_expires_at_iso(created),
        status=persist_status,
    )
    if persist_status == "complete":
        return _reconcile_completed_attempt(
            eco,
            {**attempt, "stripe_session_id": session_id, "checkout_url": checkout_url, "status": "complete"},
            retrieve_session=retrieve_session,
            sync_session=sync_session,
            live=created,
        )
    return {
        "kind": "session",
        "id": session_id,
        "url": checkout_url,
        "attempt_id": attempt["id"],
        "reused": False,
        "provider_status": live_status or "open",
    }


def _reuse_existing_session(
    eco: EconomicsStore,
    attempt: Dict[str, Any],
    *,
    retrieve_session: RetrieveSession,
    sync_session: Optional[SyncSession],
) -> Optional[Dict[str, Any]]:
    session_id = str(attempt.get("stripe_session_id") or "").strip()
    checkout_url = str(attempt.get("checkout_url") or "").strip()
    if not session_id or not checkout_url:
        return None
    try:
        live = retrieve_session(session_id)
        live_status = _confirmed_session_status(live)
        live_url = str(live.get("url") or checkout_url).strip() or checkout_url
        live_expires = stripe_expires_at_iso(live)
    except RuntimeError:
        _log.info(
            "checkout_attempt_retrieve_failed attempt=%s session=%s",
            attempt.get("id"),
            session_id,
        )
        if str(attempt.get("status") or "") in _BLOCKING_STATUSES:
            return {
                "kind": "processing",
                "session_id": session_id,
                "attempt_id": attempt.get("id"),
            }
        # A local deadline plus a failed lookup is not proof the provider
        # session expired unpaid. Keep A and refuse a replacement.
        return _unresolved_outcome(attempt, session_id)

    if live_status is None:
        return _unresolved_outcome(attempt, session_id)

    if live_status in _UNUSABLE_SESSION_STATUSES:
        eco.mark_checkout_attempt_status(
            str(attempt["id"]),
            "expired" if live_status == "expired" else "canceled",
        )
        return {"kind": "unusable", "attempt_id": attempt.get("id")}
    persist_status = "complete" if live_status == "complete" else "open"
    eco.record_checkout_attempt_session(
        str(attempt["id"]),
        stripe_session_id=session_id,
        checkout_url=live_url,
        expires_at=live_expires,
        status="reconciling" if persist_status == "complete" else persist_status,
    )
    if persist_status == "complete":
        return _reconcile_completed_attempt(
            eco,
            {**attempt, "stripe_session_id": session_id, "checkout_url": live_url, "status": "reconciling"},
            retrieve_session=retrieve_session,
            sync_session=sync_session,
            live=live,
        )
    return {
        "kind": "session",
        "id": session_id,
        "url": live_url,
        "attempt_id": attempt["id"],
        "reused": True,
        "provider_status": live_status or "open",
    }


def _reconcile_completed_attempt(
    eco: EconomicsStore,
    attempt: Dict[str, Any],
    *,
    retrieve_session: RetrieveSession,
    sync_session: Optional[SyncSession],
    live: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    session_id = str(attempt.get("stripe_session_id") or "").strip()
    eco.mark_checkout_attempt_status(str(attempt["id"]), "reconciling")
    session = live
    if session is None and session_id:
        try:
            session = retrieve_session(session_id)
        except RuntimeError:
            session = None
    if session is not None and sync_session is not None:
        try:
            sync_session(eco, session)
        except Exception:
            _log.exception("checkout_reconcile_failed attempt=%s session=%s", attempt.get("id"), session_id)
    eco.mark_checkout_attempt_status(str(attempt["id"]), "complete")
    row = eco.get_subscription_by_org(str(attempt.get("org_id") or ""))
    if is_subscription_entitled(row):
        return {
            "kind": "already_subscribed",
            "session_id": session_id or None,
            "attempt_id": attempt.get("id"),
        }
    return {
        "kind": "processing",
        "session_id": session_id or None,
        "attempt_id": attempt.get("id"),
    }


def _confirmed_session_status(payload: Any) -> Optional[str]:
    if not isinstance(payload, dict):
        return None
    status = str(payload.get("status") or "").strip().lower()
    if not status:
        return None
    if status == "cancelled":
        return "canceled"
    if status in {"expired", "canceled", "complete", "open"}:
        return status
    return None


def _unresolved_outcome(attempt: Dict[str, Any], session_id: Optional[str] = None) -> Dict[str, Any]:
    sid = str(session_id or attempt.get("stripe_session_id") or "").strip() or None
    return {
        "kind": "unresolved",
        "session_id": sid,
        "attempt_id": attempt.get("id"),
    }


def _retire_unpaid_attempt(
    eco: EconomicsStore,
    attempt: Dict[str, Any],
    *,
    expire_session: Optional[ExpireSession],
    retrieve_session: RetrieveSession,
    sync_session: Optional[SyncSession],
    session_id: str,
) -> Dict[str, Any]:
    """Retire A only after the provider confirms unpaid expiration.

    Failed, malformed, or still-open expire/retrieve responses keep A and
    refuse a replacement. A completion that races expiration reconciles A.
    """
    sid = session_id or str(attempt.get("stripe_session_id") or "").strip()
    if not sid or expire_session is None:
        return _unresolved_outcome(attempt, sid)

    expire_payload: Optional[Dict[str, Any]] = None
    expire_status: Optional[str] = None
    try:
        expire_payload = expire_session(sid)
        expire_status = _confirmed_session_status(expire_payload)
    except RuntimeError:
        _log.info("checkout_attempt_expire_failed attempt=%s session=%s", attempt.get("id"), sid)

    if expire_status == "complete":
        return _reconcile_completed_attempt(
            eco,
            attempt,
            retrieve_session=retrieve_session,
            sync_session=sync_session,
            live=expire_payload,
        )
    if expire_status in _UNUSABLE_SESSION_STATUSES:
        eco.mark_checkout_attempt_status(str(attempt["id"]), "superseded")
        return {"kind": "superseded", "session_id": sid, "attempt_id": attempt.get("id")}

    live: Optional[Dict[str, Any]] = None
    live_status: Optional[str] = None
    try:
        live = retrieve_session(sid)
        live_status = _confirmed_session_status(live)
    except RuntimeError:
        return _unresolved_outcome(attempt, sid)

    if live_status == "complete":
        return _reconcile_completed_attempt(
            eco,
            attempt,
            retrieve_session=retrieve_session,
            sync_session=sync_session,
            live=live,
        )
    if live_status in _UNUSABLE_SESSION_STATUSES:
        eco.mark_checkout_attempt_status(str(attempt["id"]), "superseded")
        return {"kind": "superseded", "session_id": sid, "attempt_id": attempt.get("id")}
    return _unresolved_outcome(attempt, sid)
