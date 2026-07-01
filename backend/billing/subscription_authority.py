"""
Canonical Stripe → subscriptions authority.

All webhook handlers and checkout sync must update internal subscription state through
``apply_stripe_subscription_object`` or ``apply_invoice_paid_subscription_renewal`` so
``subscriptions`` remains the single entitlement source.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from backend.billing import pricing
from backend.economics.store import EconomicsStore

_log = logging.getLogger("claw.billing.subscription_authority")

_ENTITLED_STATUSES = frozenset({"active"})


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def stripe_timestamp_to_iso(value: Any) -> Optional[str]:
    if value is None:
        return None
    try:
        ts = int(value)
    except (TypeError, ValueError):
        return None
    if ts <= 0:
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def internal_status_from_stripe(stripe_status: str) -> str:
    st = (stripe_status or "").strip().lower()
    if st in ("active", "trialing"):
        return "active"
    if st in ("canceled", "unpaid", "incomplete_expired"):
        return "canceled"
    if st == "past_due":
        return "past_due"
    if st:
        return st
    return "unknown"


def _parse_utc_iso(value: str) -> Optional[datetime]:
    s = (value or "").strip()
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def subscription_period_end_iso(row: Dict[str, Any]) -> Optional[str]:
    cpe = (row.get("current_period_end") or "").strip()
    if cpe:
        return cpe
    exp = (row.get("expires_at") or "").strip()
    return exp or None


def is_subscription_entitled(row: Optional[Dict[str, Any]]) -> bool:
    """Single paid-plan gate — reads only the canonical subscriptions row."""
    if not row:
        return False
    if str(row.get("status") or "").lower() not in _ENTITLED_STATUSES:
        return False
    code = str(row.get("plan_code") or "").lower().strip()
    if not code or code in ("free", "trial"):
        return False
    end_iso = subscription_period_end_iso(row)
    if end_iso:
        end_dt = _parse_utc_iso(end_iso)
        if end_dt and datetime.now(timezone.utc) >= end_dt:
            return False
    return True


def _metadata_org_id(obj: Dict[str, Any]) -> Optional[str]:
    md = obj.get("metadata") or {}
    if not isinstance(md, dict):
        return None
    oid = md.get("org_id") or md.get("claw_org_id")
    return str(oid).strip() if oid else None


def _metadata_user_id(obj: Dict[str, Any]) -> Optional[str]:
    md = obj.get("metadata") or {}
    if not isinstance(md, dict):
        return None
    uid = md.get("user_id")
    return str(uid).strip() if uid else None


def _plan_code_from_stripe_subscription(sub: Dict[str, Any], default: str = "pro") -> str:
    md = sub.get("metadata") or {}
    if isinstance(md, dict) and md.get("plan_code"):
        return str(md["plan_code"]).strip().lower()
    items = sub.get("items") or {}
    if isinstance(items, dict):
        data = items.get("data") or []
        if data and isinstance(data[0], dict):
            price = (data[0].get("price") or {}).get("metadata") or {}
            if isinstance(price, dict) and price.get("plan_code"):
                return str(price["plan_code"]).strip().lower()
    return default


def _current_period_end_from_subscription(sub: Dict[str, Any]) -> Optional[str]:
    cpe = sub.get("current_period_end")
    if cpe is not None:
        return stripe_timestamp_to_iso(cpe)
    details = sub.get("items") or {}
    if isinstance(details, dict):
        data = details.get("data") or []
        if data and isinstance(data[0], dict):
            return stripe_timestamp_to_iso(data[0].get("current_period_end"))
    return None


def current_period_end_from_stripe_subscription(sub: Dict[str, Any]) -> Optional[str]:
    """Public helper — period end from a Stripe Subscription object."""
    return _current_period_end_from_subscription(sub)


def _canceled_at_from_subscription(sub: Dict[str, Any]) -> Optional[str]:
    c_at = sub.get("canceled_at")
    if c_at is not None:
        return stripe_timestamp_to_iso(c_at)
    st = str(sub.get("status") or "").lower()
    if st in ("canceled", "unpaid", "incomplete_expired"):
        return _utc_now_iso()
    return None


def resolve_org_id_for_stripe(
    economics: EconomicsStore,
    *,
    metadata_obj: Dict[str, Any],
    stripe_customer_id: Optional[str],
) -> Optional[str]:
    org_id = _metadata_org_id(metadata_obj)
    if org_id:
        return org_id
    cid = (stripe_customer_id or "").strip()
    if cid:
        return economics.get_org_for_stripe_customer(cid)
    return None


def apply_stripe_subscription_object(
    economics: EconomicsStore,
    sub: Dict[str, Any],
    *,
    plan_code_override: Optional[str] = None,
    payment_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Upsert stripe mirror tables and the canonical ``subscriptions`` row from a Stripe Subscription object.
    """
    economics.init_schema()
    sid = str(sub.get("id") or "").strip()
    if not sid:
        return {"ok": False, "error": "missing_subscription_id"}

    customer_raw = sub.get("customer")
    stripe_customer_id: Optional[str] = None
    if isinstance(customer_raw, str) and customer_raw.strip():
        stripe_customer_id = customer_raw.strip()
    elif isinstance(customer_raw, dict):
        stripe_customer_id = str(customer_raw.get("id") or "").strip() or None

    org_id = resolve_org_id_for_stripe(
        economics,
        metadata_obj=sub,
        stripe_customer_id=stripe_customer_id,
    )
    if not org_id:
        return {"ok": True, "ignored": True, "reason": "no_org_mapping", "subscription_id": sid}

    if stripe_customer_id:
        economics.upsert_stripe_customer_org(stripe_customer_id=stripe_customer_id, org_id=org_id)

    stripe_status = str(sub.get("status") or "unknown")
    internal_status = internal_status_from_stripe(stripe_status)
    plan_code = (plan_code_override or _plan_code_from_stripe_subscription(sub)).strip().lower()
    try:
        pricing.get_plan(plan_code)
    except Exception:
        plan_code = "pro"

    economics.upsert_stripe_subscription_org(
        stripe_subscription_id=sid,
        org_id=org_id,
        plan_code=plan_code,
        status=stripe_status,
    )

    period_end = _current_period_end_from_subscription(sub)
    canceled_at = _canceled_at_from_subscription(sub)
    user_id = _metadata_user_id(sub)

    sub_id = economics.upsert_subscription_authority(
        org_id=org_id,
        user_id=user_id,
        plan_code=plan_code,
        status=internal_status,
        expires_at=period_end,
        current_period_end=period_end,
        canceled_at=canceled_at,
        stripe_subscription_id=sid,
        stripe_customer_id=stripe_customer_id,
        payment_id=payment_id,
        renewed_at=_utc_now_iso() if internal_status == "active" else None,
    )
    _log.info(
        "subscription_authority_applied org=%s sub=%s stripe_sub=%s status=%s period_end=%s",
        org_id,
        sub_id,
        sid,
        internal_status,
        period_end,
    )
    return {
        "ok": True,
        "org_id": org_id,
        "subscription_id": sub_id,
        "stripe_subscription_id": sid,
        "status": internal_status,
        "current_period_end": period_end,
    }


def apply_invoice_paid_subscription_renewal(
    economics: EconomicsStore,
    invoice: Dict[str, Any],
) -> Dict[str, Any]:
    """Extend canonical subscription period from a paid Stripe invoice (subscription cycles)."""
    economics.init_schema()
    inv_id = str(invoice.get("id") or "").strip()
    if not inv_id:
        return {"ok": False, "error": "missing_invoice_id"}

    customer_id = str(invoice.get("customer") or "").strip()
    org_id = resolve_org_id_for_stripe(
        economics,
        metadata_obj=invoice,
        stripe_customer_id=customer_id or None,
    )
    if not org_id:
        return {"ok": True, "ignored": True, "reason": "no_org_mapping", "invoice_id": inv_id}

    sub_sid = invoice.get("subscription")
    stripe_sub_id: Optional[str] = None
    if isinstance(sub_sid, str) and sub_sid.strip():
        stripe_sub_id = sub_sid.strip()
    elif isinstance(sub_sid, dict):
        stripe_sub_id = str(sub_sid.get("id") or "").strip() or None

    period_end: Optional[str] = None
    if invoice.get("period_end") is not None:
        period_end = stripe_timestamp_to_iso(invoice.get("period_end"))
    if not period_end:
        lines = invoice.get("lines") or {}
        if isinstance(lines, dict):
            data = lines.get("data") or []
            if data and isinstance(data[0], dict):
                period = data[0].get("period") or {}
                if isinstance(period, dict):
                    period_end = stripe_timestamp_to_iso(period.get("end"))

    if isinstance(sub_sid, dict):
        sub_result = apply_stripe_subscription_object(
            economics,
            sub_sid,
            payment_id=f"stripe:invoice:{inv_id}",
        )
        if sub_result.get("ok") and not sub_result.get("ignored"):
            return {**sub_result, "invoice_id": inv_id, "source": "expanded_subscription"}

    if not stripe_sub_id and not period_end:
        return {"ok": True, "ignored": True, "reason": "not_subscription_invoice", "invoice_id": inv_id}

    if stripe_sub_id and customer_id:
        economics.upsert_stripe_customer_org(stripe_customer_id=customer_id, org_id=org_id)

    link = economics.get_stripe_subscription_org(stripe_sub_id) if stripe_sub_id else None
    plan_code = str(link.get("plan_code") or "pro") if link else "pro"
    row = economics.get_subscription_by_org(org_id)
    if row and row.get("plan_code"):
        plan_code = str(row["plan_code"])

    payment_id = f"stripe:invoice:{inv_id}"
    sub_id = economics.upsert_subscription_authority(
        org_id=org_id,
        user_id=str(row.get("user_id") or "").strip() or None if row else None,
        plan_code=plan_code,
        status="active",
        expires_at=period_end,
        current_period_end=period_end,
        canceled_at=None,
        stripe_subscription_id=stripe_sub_id,
        stripe_customer_id=customer_id or None,
        payment_id=payment_id,
        renewed_at=_utc_now_iso(),
    )
    if stripe_sub_id:
        economics.upsert_stripe_subscription_org(
            stripe_subscription_id=stripe_sub_id,
            org_id=org_id,
            plan_code=plan_code,
            status="active",
        )
    return {
        "ok": True,
        "org_id": org_id,
        "subscription_id": sub_id,
        "invoice_id": inv_id,
        "current_period_end": period_end,
        "source": "invoice_period",
    }


def apply_stripe_checkout_session_authority(
    economics: EconomicsStore,
    session: Dict[str, Any],
    *,
    plan_code_override: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Single write path for checkout.session.completed subscription activation.
    """
    session_id = str(session.get("id") or "").strip()
    if not session_id:
        return {"ok": False, "error": "missing_session_id"}
    status = str(session.get("status") or "").strip().lower()
    payment_status = str(session.get("payment_status") or "").strip().lower()
    if status != "complete" or payment_status not in ("paid", "no_payment_required"):
        return {"ok": True, "ignored": True, "reason": "session_not_paid", "status": status}

    org_id = _metadata_org_id(session)
    if not org_id:
        return {"ok": False, "error": "missing_org_id"}

    plan_code = (plan_code_override or "").strip().lower()
    md = session.get("metadata") or {}
    if isinstance(md, dict) and md.get("plan_code"):
        plan_code = str(md["plan_code"]).strip().lower()
    if not plan_code:
        plan_code = "pro"
    try:
        pricing.get_plan(plan_code)
    except Exception:
        plan_code = "pro"

    payment_id = f"stripe:checkout_session:{session_id}"
    customer_id = str(session.get("customer") or "").strip()
    if customer_id:
        economics.upsert_stripe_customer_org(stripe_customer_id=customer_id, org_id=org_id)

    sub_sid = session.get("subscription")
    if isinstance(sub_sid, dict):
        result = apply_stripe_subscription_object(
            economics,
            sub_sid,
            plan_code_override=plan_code,
            payment_id=payment_id,
        )
        result["plan_code"] = plan_code
        result["payment_id"] = payment_id
        return result

    stripe_sub_id = sub_sid.strip() if isinstance(sub_sid, str) and sub_sid.strip() else None
    if stripe_sub_id:
        minimal_sub: Dict[str, Any] = {
            "id": stripe_sub_id,
            "customer": customer_id or None,
            "status": "active",
            "metadata": session.get("metadata") if isinstance(session.get("metadata"), dict) else {},
        }
        result = apply_stripe_subscription_object(
            economics,
            minimal_sub,
            plan_code_override=plan_code,
            payment_id=payment_id,
        )
        result["plan_code"] = plan_code
        result["payment_id"] = payment_id
        return result

    sub_id = economics.upsert_subscription_authority(
        org_id=org_id,
        user_id=_metadata_user_id(session),
        plan_code=plan_code,
        status="active",
        expires_at=None,
        current_period_end=None,
        canceled_at=None,
        stripe_subscription_id=None,
        stripe_customer_id=customer_id or None,
        payment_id=payment_id,
        renewed_at=_utc_now_iso(),
    )
    return {
        "ok": True,
        "org_id": org_id,
        "subscription_id": sub_id,
        "plan_code": plan_code,
        "payment_id": payment_id,
        "source": "checkout_session_no_subscription_id",
    }


def demo_expiry_iso(days: int = 30) -> str:
    """Explicit demo/dev subscription expiry — not used for Stripe-backed rows."""
    from datetime import timedelta

    d = datetime.now(timezone.utc) + timedelta(days=days)
    return d.isoformat().replace("+00:00", "Z")
