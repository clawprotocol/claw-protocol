"""Server-authoritative billing display — does not change entitlement."""

from __future__ import annotations

from typing import Any, Dict, Optional

from backend.billing.subscription_authority import is_subscription_entitled, subscription_period_end_iso

BILLING_DISPLAY_STATES = (
    "no_subscription",
    "active",
    "scheduled_cancellation",
    "expired_canceled",
    "payment_problem",
    "unavailable",
)

_PAYMENT_PROBLEM_STATUSES = frozenset({"past_due", "incomplete", "unpaid"})
_EXPIRED_STATUSES = frozenset({"canceled", "expired", "incomplete_expired"})
_KNOWN_INTERVALS = {"month": "month", "monthly": "month", "year": "year", "annual": "year", "yearly": "year"}

_PLAN_LABELS = {
    "pro": "LawDog Pro",
    "team": "LawDog Pro",
    "enterprise": "Enterprise",
    "business": "Enterprise",
}


def truthy_flag(value: Any) -> bool:
    if value is True or value == 1:
        return True
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def normalize_billing_interval(value: Any) -> Optional[str]:
    raw = str(value or "").strip().lower()
    return _KNOWN_INTERVALS.get(raw)


def plan_label_for_code(plan_code: Optional[str]) -> Optional[str]:
    code = str(plan_code or "").strip().lower()
    if not code or code in {"free", "trial"}:
        return None
    if code in _PLAN_LABELS:
        return _PLAN_LABELS[code]
    return code.replace("_", " ")


def derive_billing_display_state(row: Optional[Dict[str, Any]]) -> str:
    if not row:
        return "no_subscription"
    status = str(row.get("status") or "").strip().lower()
    if status in _PAYMENT_PROBLEM_STATUSES:
        return "payment_problem"
    entitled = is_subscription_entitled(row)
    if entitled and truthy_flag(row.get("cancel_at_period_end")):
        return "scheduled_cancellation"
    if entitled:
        return "active"
    if status in _EXPIRED_STATUSES or status == "active":
        return "expired_canceled"
    return "unavailable"


def build_billing_status_payload(
    *,
    org_id: str,
    row: Optional[Dict[str, Any]],
    stripe_configured: bool,
    stripe_customer_id: Optional[str],
) -> Dict[str, Any]:
    """Org-scoped display DTO. Never includes caller-supplied or Stripe customer ids."""
    state = derive_billing_display_state(row)
    entitled = is_subscription_entitled(row)
    plan_code = str(row.get("plan_code") or "").strip().lower() if row else ""
    if not plan_code or plan_code in {"free", "trial"}:
        plan_code_out = None
    else:
        plan_code_out = plan_code
    interval = normalize_billing_interval(row.get("billing_interval")) if row else None
    period_end = subscription_period_end_iso(row) if row else None
    canceled_at = str(row.get("canceled_at") or "").strip() if row else ""
    has_customer = bool((stripe_customer_id or "").strip())
    return {
        "org_id": org_id,
        "display_state": state,
        "entitled": entitled,
        "plan_code": plan_code_out,
        "plan_label": plan_label_for_code(plan_code_out),
        "status": str(row.get("status") or "").strip().lower() if row else None,
        "billing_interval": interval,
        "current_period_end": period_end,
        "canceled_at": canceled_at or None,
        "cancel_at_period_end": truthy_flag(row.get("cancel_at_period_end")) if row else False,
        "has_stripe_customer": has_customer,
        "stripe_configured": bool(stripe_configured),
        "manage_available": bool(stripe_configured) and has_customer,
    }
