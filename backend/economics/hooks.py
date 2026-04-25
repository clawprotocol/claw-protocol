"""Post–ClawKeyIssued integration: key balance, subscriptions, affiliate accrual (idempotent)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from backend.billing import subscriptions as subs
from backend.economics import config as econ_config
from backend.economics import events as econ_events
from backend.economics.store import EconomicsStore, get_economics_store
from backend.payments.store import OnrampStore
from backend.treasury.treasury_store import TreasuryStore

from backend.affiliates import service as affiliate_service


def _mature_at_iso() -> str:
    d = datetime.now(timezone.utc) + timedelta(days=econ_config.affiliate_maturity_days())
    return d.isoformat().replace("+00:00", "Z")


def after_claw_key_issued(
    *,
    store: OnrampStore,
    treasury: TreasuryStore,
    payment_id: str,
    org_id: str,
    user_id: Optional[str],
    plan_code: Optional[str],
    subscription_purchase: bool,
    affiliate_code: Optional[str],
    keys_allocated: int,
    net_for_keys_usd: Decimal,
    reserve_usd: Decimal,
    gross_amount_usd: Decimal,
    economics: Optional[EconomicsStore] = None,
) -> None:
    """
    Runs after treasury claw key + ClawKeyIssued event. Each stage is independently idempotent
    on ``payment_id`` via ``economics_payment_hook``.
    """
    del reserve_usd  # excluded from affiliate basis; net_for_keys_usd is the payout basis
    eco = economics or get_economics_store()
    eco.init_schema()

    if eco.claim_payment_hook_step(payment_id, "keys_credited"):
        if int(keys_allocated) > 0:
            eco.credit_keys_for_payment(
                org_id,
                int(keys_allocated),
                payment_id,
                float(gross_amount_usd.quantize(Decimal("0.01"))),
            )

    if affiliate_code:
        affiliate_service.maybe_attribute_on_payment(
            economics=eco,
            org_id=org_id,
            user_id=user_id,
            affiliate_code=affiliate_code,
            store=store,
            treasury=treasury,
            payment_id=payment_id,
        )

    if econ_config.subscription_enabled() and subscription_purchase and plan_code:
        if eco.claim_payment_hook_step(payment_id, "subscription_emitted"):
            subs.sync_subscription_from_payment(
                economics=eco,
                store=store,
                treasury=treasury,
                payment_id=payment_id,
                org_id=org_id,
                user_id=user_id,
                plan_code=plan_code,
            )

    if eco.claim_payment_hook_step(payment_id, "accrual_emitted"):
        plan_key = plan_code or "starter"
        affiliate_service.accrue_for_payment_if_eligible(
            economics=eco,
            store=store,
            treasury=treasury,
            payment_id=payment_id,
            org_id=org_id,
            net_eligible_usd=net_for_keys_usd,
            plan_code=plan_key,
            matured_at=_mature_at_iso(),
        )

