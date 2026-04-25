"""
Crypto onramp payment service: canonical events first, idempotent pipeline, treasury mirror.

Strict order: PaymentReceived → CryptoReceived → ReserveAllocated → ClawKeyIssued.
"""

from __future__ import annotations

import os
import sqlite3
import uuid
from datetime import datetime, timezone
from decimal import ROUND_FLOOR, Decimal
from typing import Any, Dict, Optional, Tuple

from backend.payments import canon_events
from backend.payments.config import hold_days, keys_per_usd, reserve_fraction
from backend.payments.store import OnrampStore, get_onramp_store
from backend.treasury.treasury_store import TreasuryStore, get_treasury_store
from backend.utils.canon_json import canon_json_bytes


def _iso_z() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _json_dumps_canon(obj: Dict[str, Any]) -> str:
    return canon_json_bytes(obj).decode("utf-8")


def emit_event(
    *,
    store: OnrampStore,
    treasury: TreasuryStore,
    event: Dict[str, Any],
    payment_id: Optional[str],
    reserve_id: Optional[str],
    subject_ref: Optional[str],
    ledger_amount: Optional[Decimal],
    currency: str,
    claw_key_id: Optional[str] = None,
    ledger_source: str = "crypto_onramp",
) -> Tuple[str, str]:
    """
    Persist canonical event (dedup by hash), mirror to treasury ledger with stable id.

    Returns (event_id, event_sha256).
    """
    h = canon_events.event_sha256(event)
    if store.has_event_hash(h):
        return (f"dedup_{h[:16]}", h)

    eid = str(uuid.uuid4())
    et = str(event["type"])
    payload = _json_dumps_canon(event)
    if not store.persist_canonical_event(
        event_id=eid,
        event_sha256=h,
        event_type=et,
        payment_id=payment_id,
        reserve_id=reserve_id,
        canonical_json=payload,
    ):
        return (f"dedup_{h[:16]}", h)

    lid = f"onr_{h}"
    meta = {
        "canonical_event": event,
        "event_sha256": h,
        "source": "crypto_onramp",
    }
    try:
        treasury.insert_ledger_event(
            event_type=et,
            payment_id=payment_id,
            subject_ref=subject_ref,
            amount=ledger_amount,
            currency=currency,
            agreement_id=None,
            claw_key_id=claw_key_id,
            metadata=meta,
            ledger_id=lid,
        )
    except sqlite3.IntegrityError:
        pass
    return (eid, h)


def allocate_reserve(gross: Decimal) -> Tuple[Decimal, Decimal, int]:
    """Reserve, net, and key count (``keys_per_usd``) from gross USD."""
    return allocate_reserve_and_keys(gross)


def allocate_reserve_and_keys(
    gross: Decimal,
) -> Tuple[Decimal, Decimal, int]:
    """reserve, net, keys (floor)."""
    rfrac = reserve_fraction()
    reserve = (gross * rfrac).quantize(Decimal("0.01"))
    net = (gross - reserve).quantize(Decimal("0.01"))
    if net < Decimal("0"):
        net = Decimal("0")
    keys = int((net * keys_per_usd()).to_integral_value(rounding=ROUND_FLOOR))
    return reserve, net, keys


def process_payment(provider: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Provider dispatch → ``settle_onramp_payment``.

    ``payload`` must include ``provider_payment_id``, ``org_id``, ``amount_usd`` (Decimal|str),
    and ``tx_hash`` for settled crypto.
    """
    pid = str(payload.get("provider_payment_id") or "").strip()
    org_id = str(payload.get("org_id") or "").strip()
    tx_hash = str(payload.get("tx_hash") or "").strip()
    amt_raw = payload.get("amount_usd")
    if not pid or not org_id or not tx_hash or amt_raw is None:
        return {"ok": False, "error": "invalid_payload"}
    amount = amt_raw if isinstance(amt_raw, Decimal) else Decimal(str(amt_raw))
    def _truthy(v: Any) -> bool:
        if v is None:
            return False
        if isinstance(v, bool):
            return v
        return str(v).strip().lower() in ("1", "true", "yes")

    user_id = str(payload.get("user_id") or "").strip() or None
    plan_code = str(payload.get("plan_code") or "").strip() or None
    subscription_purchase = _truthy(payload.get("subscription_purchase"))
    affiliate_code = str(payload.get("affiliate_code") or "").strip() or None
    return settle_onramp_payment(
        provider=provider,
        provider_payment_id=pid,
        org_id=org_id,
        amount_usd=amount,
        tx_hash=tx_hash,
        user_id=user_id,
        plan_code=plan_code,
        subscription_purchase=subscription_purchase,
        affiliate_code=affiliate_code,
    )


def settle_onramp_payment(
    *,
    provider: str,
    provider_payment_id: str,
    org_id: str,
    amount_usd: Decimal,
    tx_hash: str,
    store: Optional[OnrampStore] = None,
    treasury: Optional[TreasuryStore] = None,
    user_id: Optional[str] = None,
    plan_code: Optional[str] = None,
    subscription_purchase: bool = False,
    affiliate_code: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Full synchronous pipeline (webhook-safe / idempotent).

    Idempotent on ``provider_payment_id`` (per provider), enforced by UNIQUE constraint.
    """
    store = store or get_onramp_store()
    treasury = treasury or get_treasury_store()
    treasury.init_schema()
    store.init_schema()

    existing0 = store.get_payment_by_provider_id(
        provider=provider, provider_payment_id=provider_payment_id
    )
    if existing0:
        return {
            "ok": True,
            "duplicate": True,
            "payment": existing0,
            "reason": "provider_payment_id",
        }

    payment_id = str(uuid.uuid4())

    amt_f = float(amount_usd.quantize(Decimal("0.01")))
    inserted = store.insert_payment(
        payment_id=payment_id,
        provider=provider,
        provider_payment_id=provider_payment_id,
        amount_usd=amt_f,
        currency="USD",
        status="settled",
        org_id=org_id,
    )
    if not inserted:
        existing = store.get_payment_by_provider_id(
            provider=provider, provider_payment_id=provider_payment_id
        )
        return {
            "ok": True,
            "duplicate": True,
            "payment": existing,
            "reason": "race_provider_payment_id",
        }

    ev1 = canon_events.payment_received(
        payment_id=payment_id, provider=provider, amount_usd=amount_usd
    )
    emit_event(
        store=store,
        treasury=treasury,
        event=ev1,
        payment_id=payment_id,
        reserve_id=None,
        subject_ref=org_id,
        ledger_amount=amount_usd,
        currency="USD",
    )

    receipt_id = str(uuid.uuid4())
    store.insert_crypto_receipt(
        receipt_id=receipt_id,
        payment_id=payment_id,
        tx_hash=tx_hash,
        amount_usd=amt_f,
        status="confirmed",
    )
    ev2 = canon_events.crypto_received(
        payment_id=payment_id, tx_hash=tx_hash, amount_usd=amount_usd
    )
    emit_event(
        store=store,
        treasury=treasury,
        event=ev2,
        payment_id=payment_id,
        reserve_id=None,
        subject_ref=org_id,
        ledger_amount=amount_usd,
        currency="USD",
    )

    reserve_amt, _net_amt, keys = allocate_reserve_and_keys(amount_usd)
    reserve_id = str(uuid.uuid4())
    alloc_iso = _iso_z()
    release_iso = store.current_release_deadline_iso(hold_days_val=hold_days())
    store.insert_reserve(
        reserve_id=reserve_id,
        org_id=org_id,
        amount_usd=float(reserve_amt),
        allocated_at=alloc_iso,
        release_at=release_iso,
        payment_id=payment_id,
    )
    ev3 = canon_events.reserve_allocated(
        payment_id=payment_id, org_id=org_id, amount_usd=reserve_amt
    )
    emit_event(
        store=store,
        treasury=treasury,
        event=ev3,
        payment_id=payment_id,
        reserve_id=reserve_id,
        subject_ref=org_id,
        ledger_amount=reserve_amt,
        currency="USD",
    )

    onr_claw_row = str(uuid.uuid4())
    store.insert_onramp_claw_key(
        row_id=onr_claw_row,
        org_id=org_id,
        keys_allocated=keys,
        payment_id=payment_id,
    )
    extend_days = int(os.getenv("CLAW_KEY_DEFAULT_EXTEND_DAYS", "30"))
    expires = store.release_at_for_allocation(allocated_at_iso=alloc_iso, hold_days=extend_days)

    treasury_kid = str(uuid.uuid4())
    treasury.insert_claw_key(
        claw_key_id=treasury_kid,
        subject_ref=org_id,
        tier="standard",
        status="active",
        source_payment_id=payment_id,
        source_payment_type=f"onramp_{provider}",
        usage_units_remaining=keys,
        expires_at=expires,
        metadata={
            "provider": provider,
            "provider_payment_id": provider_payment_id,
            "onramp_claw_row_id": onr_claw_row,
            "reserve_id": reserve_id,
            "onramp_lane": True,
        },
    )

    ev4 = canon_events.claw_key_issued(
        org_id=org_id, payment_id=payment_id, keys=keys
    )
    emit_event(
        store=store,
        treasury=treasury,
        event=ev4,
        payment_id=payment_id,
        reserve_id=None,
        subject_ref=org_id,
        ledger_amount=None,
        currency="USD",
        claw_key_id=treasury_kid,
    )

    from backend.economics import hooks as economics_hooks

    economics_hooks.after_claw_key_issued(
        store=store,
        treasury=treasury,
        payment_id=payment_id,
        org_id=org_id,
        user_id=user_id,
        plan_code=plan_code,
        subscription_purchase=subscription_purchase,
        affiliate_code=affiliate_code,
        keys_allocated=keys,
        net_for_keys_usd=_net_amt,
        reserve_usd=reserve_amt,
        gross_amount_usd=amount_usd,
    )

    return {
        "ok": True,
        "duplicate": False,
        "payment_id": payment_id,
        "reserve_id": reserve_id,
        "claw_key_id": treasury_kid,
        "keys_allocated": keys,
        "reserve_usd": str(reserve_amt),
        "net_for_keys_usd": str(_net_amt),
    }
