"""
Canonical economics ledger payloads (sorted keys, stable decimals as strings).
Emitted via payments.service.emit_event with ledger_source=\"economics\".
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, Optional

from backend.payments.service import emit_event
from backend.payments.store import OnrampStore, get_onramp_store
from backend.treasury.treasury_store import TreasuryStore, get_treasury_store


def _money_str(v: Decimal) -> str:
    return str(v.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _uc_str(unit_count: float) -> str:
    d = Decimal(str(unit_count))
    return str(d.normalize())


def subscription_purchased(
    *, subscription_id: str, org_id: str, plan_code: str
) -> Dict[str, Any]:
    return {
        "org_id": org_id,
        "plan_code": plan_code,
        "subscription_id": subscription_id,
        "type": "SubscriptionPurchased",
    }


def subscription_renewed(
    *, subscription_id: str, org_id: str, payment_id: str
) -> Dict[str, Any]:
    return {
        "org_id": org_id,
        "payment_id": payment_id,
        "subscription_id": subscription_id,
        "type": "SubscriptionRenewed",
    }


def usage_metered(
    *,
    usage_event_id: str,
    org_id: str,
    service_type: str,
    unit_count: float,
    key_cost: int,
) -> Dict[str, Any]:
    return {
        "key_cost": int(key_cost),
        "org_id": org_id,
        "service_type": service_type,
        "type": "UsageMetered",
        "unit_count": _uc_str(unit_count),
        "usage_event_id": usage_event_id,
    }


def keys_debited(*, org_id: str, usage_event_id: str, keys: int) -> Dict[str, Any]:
    return {
        "keys": int(keys),
        "org_id": org_id,
        "type": "KeysDebited",
        "usage_event_id": usage_event_id,
    }


def usage_limit_reached(
    *, org_id: str, required_keys: int, available_keys: int
) -> Dict[str, Any]:
    return {
        "available_keys": int(available_keys),
        "org_id": org_id,
        "required_keys": int(required_keys),
        "type": "UsageLimitReached",
    }


def affiliate_attributed(
    *, org_id: str, affiliate_id: str, attribution_id: str
) -> Dict[str, Any]:
    return {
        "affiliate_id": affiliate_id,
        "attribution_id": attribution_id,
        "org_id": org_id,
        "type": "AffiliateAttributed",
    }


def affiliate_accrued(
    *,
    affiliate_id: str,
    org_id: str,
    payment_id: str,
    basis_amount_usd: Decimal,
    payout_amount_usd: Decimal,
) -> Dict[str, Any]:
    return {
        "affiliate_id": affiliate_id,
        "basis_amount_usd": _money_str(basis_amount_usd),
        "org_id": org_id,
        "payment_id": payment_id,
        "payout_amount_usd": _money_str(payout_amount_usd),
        "type": "AffiliateAccrued",
    }


def affiliate_paid(
    *,
    affiliate_id: str,
    payout_id: str,
    amount_usd: Decimal,
    tx_hash: str,
) -> Dict[str, Any]:
    return {
        "affiliate_id": affiliate_id,
        "amount_usd": _money_str(amount_usd),
        "payout_id": payout_id,
        "tx_hash": tx_hash,
        "type": "AffiliatePaid",
    }


def affiliate_reversed(
    *, affiliate_accrual_id: str, reason: str
) -> Dict[str, Any]:
    return {
        "affiliate_accrual_id": affiliate_accrual_id,
        "reason": reason,
        "type": "AffiliateReversed",
    }


def emit_economics_event(
    event: Dict[str, Any],
    *,
    payment_id: Optional[str],
    subject_ref: Optional[str],
    ledger_amount: Optional[Decimal],
    currency: str = "USD",
    store: Optional[OnrampStore] = None,
    treasury: Optional[TreasuryStore] = None,
) -> None:
    emit_event(
        store=store or get_onramp_store(),
        treasury=treasury or get_treasury_store(),
        event=event,
        payment_id=payment_id,
        reserve_id=None,
        subject_ref=subject_ref,
        ledger_amount=ledger_amount,
        currency=currency,
        claw_key_id=None,
        ledger_source="economics",
    )
