"""
Canonical application flow: **payment confirmed → ledger → treasury split → CLAW Key**.

Idempotent per ``payment_id`` (skips duplicate ``payment_confirmed`` ledger rows).
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, Optional

from backend.config.treasury_policy import apply_split, treasury_split_policy_from_env
from backend.treasury.treasury_store import TreasuryStore

TIER_RANK = {"free": 0, "standard": 1, "premium": 2, "admin": 3}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _ledger_pipeline_complete(store: TreasuryStore, payment_id: str) -> bool:
    """Fully idempotent marker — split + key issuance finished for this payment."""
    with store._conn() as con:  # noqa: SLF001
        row = con.execute(
            """
            SELECT 1 FROM ledger_events
            WHERE payment_id = ? AND event_type = 'payment_pipeline_completed' LIMIT 1
            """,
            (payment_id,),
        ).fetchone()
        return row is not None


def _parse_ts(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def _issue_or_extend_claw_key(
    store: TreasuryStore,
    *,
    subject_ref: str,
    entitlement_tier: str,
    source_payment_id: str,
    source_payment_type: str,
    usage_units_to_add: Optional[int],
    extend_days: int,
    payment_metadata: Dict[str, Any],
) -> str:
    et = entitlement_tier.strip().lower()
    if et not in TIER_RANK:
        et = "standard"

    existing = store.get_active_claw_key_for_subject(subject_ref)
    now = datetime.now(timezone.utc)
    new_expires = (now + timedelta(days=max(1, extend_days))).isoformat().replace("+00:00", "Z")

    def merge_meta(base: Dict[str, Any]) -> Dict[str, Any]:
        out = dict(base)
        out["last_payment_id"] = source_payment_id
        return out

    if existing:
        old_tier = str(existing.get("tier") or "free").lower()
        if TIER_RANK.get(et, 0) > TIER_RANK.get(old_tier, 0):
            store.update_claw_key(claw_key_id=str(existing["id"]), status="suspended")
        elif old_tier == et:
            prev_exp = _parse_ts(str(existing.get("expires_at") or ""))
            base = now if prev_exp is None or prev_exp < now else prev_exp
            new_expires = (base + timedelta(days=max(1, extend_days))).isoformat().replace(
                "+00:00", "Z"
            )
            urem = existing.get("usage_units_remaining")
            nu = int(urem) if urem is not None else 0
            if usage_units_to_add is not None:
                nu += int(usage_units_to_add)
            meta = json_merge(str(existing.get("metadata") or "{}"), payment_metadata)
            store.update_claw_key(
                claw_key_id=str(existing["id"]),
                expires_at=new_expires,
                usage_units_remaining=nu if usage_units_to_add is not None else urem,
                metadata=meta,
            )
            return str(existing["id"])
        else:
            # Lower tier than active key: retain existing entitlement; payment/split still accounted.
            return str(existing["id"])

    meta = merge_meta(dict(payment_metadata))
    return store.insert_claw_key(
        subject_ref=subject_ref,
        tier=et,
        status="active",
        source_payment_id=source_payment_id,
        source_payment_type=source_payment_type,
        usage_units_remaining=usage_units_to_add,
        expires_at=new_expires,
        metadata=meta,
        wallet_ref=payment_metadata.get("solana_wallet"),
    )


def json_merge(raw: str, extra: Dict[str, Any]) -> Dict[str, Any]:
    import json

    try:
        base = json.loads(raw) if raw else {}
        if not isinstance(base, dict):
            base = {}
    except json.JSONDecodeError:
        base = {}
    base.update(extra)
    return base


def run_post_confirmation_pipeline(
    store: TreasuryStore,
    *,
    payment_id: str,
    entitlement_tier: str = "standard",
    extend_days: Optional[int] = None,
    usage_units_to_add: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Run steps B–D for a payment already marked **confirmed** on ``payment_records``.

    ``entitlement_tier``: ``free`` | ``standard`` | ``premium`` | ``admin`` (product tier).
    """
    pay = store.get_payment(payment_id)
    if not pay:
        return {"ok": False, "error": "payment_not_found"}
    if str(pay.get("status") or "") != "confirmed":
        return {"ok": False, "error": "payment_not_confirmed"}

    if _ledger_pipeline_complete(store, payment_id):
        return {"ok": True, "idempotent": True, "payment_id": payment_id}

    payer_ref = str(pay.get("payer_ref") or "")
    gross = Decimal(str(pay.get("gross_amount") or "0"))
    currency = str(pay.get("currency") or "USD")
    import json

    try:
        meta = json.loads(str(pay.get("metadata") or "{}"))
        if not isinstance(meta, dict):
            meta = {}
    except json.JSONDecodeError:
        meta = {}

    store.insert_ledger_event(
        event_type="payment_confirmed",
        payment_id=payment_id,
        subject_ref=payer_ref or None,
        amount=gross,
        currency=currency,
        agreement_id=None,
        claw_key_id=None,
        metadata={"source_type": pay.get("source_type")},
    )

    policy = treasury_split_policy_from_env()
    ops_amt, reserve_amt, pool_amt = apply_split(gross=gross, policy=policy)
    split_id = store.insert_treasury_split(
        payment_id=payment_id,
        gross_amount=gross,
        currency=currency,
        ops_amount=ops_amt,
        reserve_amount=reserve_amt,
        pool_amount=pool_amt,
        split_policy_version=policy.version,
        metadata={
            "ops_bps": policy.ops_bps,
            "reserve_bps": policy.reserve_bps,
            "pool_bps": policy.pool_bps,
            "affiliate_credit_reserved": "0",
            "pool_credit_reserved_note": "accounting_only",
        },
    )

    store.insert_ledger_event(
        event_type="treasury_split_applied",
        payment_id=payment_id,
        subject_ref=payer_ref or None,
        amount=gross,
        currency=currency,
        agreement_id=None,
        claw_key_id=None,
        metadata={
            "treasury_split_id": split_id,
            "ops": str(ops_amt),
            "reserve": str(reserve_amt),
            "pool": str(pool_amt),
            "policy_version": policy.version,
        },
    )

    days = extend_days
    if days is None:
        days = int(os.getenv("CLAW_KEY_DEFAULT_EXTEND_DAYS", "30"))

    claw_key_id = _issue_or_extend_claw_key(
        store,
        subject_ref=payer_ref,
        entitlement_tier=entitlement_tier,
        source_payment_id=payment_id,
        source_payment_type=str(pay.get("source_type") or "unknown"),
        usage_units_to_add=usage_units_to_add,
        extend_days=days,
        payment_metadata={
            "solana_wallet": pay.get("solana_wallet"),
            "solana_signature": pay.get("solana_signature"),
        },
    )

    store.insert_ledger_event(
        event_type="claw_key_issued",
        payment_id=payment_id,
        subject_ref=payer_ref or None,
        amount=None,
        currency=currency,
        agreement_id=None,
        claw_key_id=claw_key_id,
        metadata={
            "tier": entitlement_tier,
            "extend_days": days,
            "usage_units_added": usage_units_to_add,
        },
    )

    store.insert_ledger_event(
        event_type="payment_pipeline_completed",
        payment_id=payment_id,
        subject_ref=payer_ref or None,
        amount=gross,
        currency=currency,
        agreement_id=None,
        claw_key_id=claw_key_id,
        metadata={"claw_key_id": claw_key_id, "treasury_split_id": split_id},
    )

    return {
        "ok": True,
        "payment_id": payment_id,
        "claw_key_id": claw_key_id,
        "treasury_split_id": split_id,
    }


def ingest_and_confirm_payment(
    store: TreasuryStore,
    *,
    normalized: Any,
    confirm_immediately: bool = True,
    entitlement_tier: str = "standard",
    extend_days: Optional[int] = None,
    usage_units_to_add: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Insert payment from ``NormalizedPaymentInput``; optionally confirm and run pipeline.

    ``normalized`` should be ``NormalizedPaymentInput`` from ``payment_source``.
    """
    from backend.treasury.payment_source import NormalizedPaymentInput

    if not isinstance(normalized, NormalizedPaymentInput):
        raise TypeError("expected NormalizedPaymentInput")

    status: str = "confirmed" if confirm_immediately else str(normalized.status)
    received = _utc_now()
    pid = store.insert_payment(
        source_type=normalized.source_type,
        source_reference=normalized.source_reference,
        payer_ref=normalized.payer_ref,
        gross_amount=normalized.gross_amount,
        currency=normalized.currency,
        normalized_usd_amount=normalized.normalized_usd_amount,
        status=status,
        received_at=received,
        metadata=dict(normalized.metadata or {}),
        solana_wallet=normalized.solana_wallet,
        solana_signature=normalized.solana_signature,
        solana_memo=normalized.solana_memo,
        solana_token_mint=normalized.solana_token_mint,
    )
    if confirm_immediately:
        store.update_payment_status(payment_id=pid, status="confirmed")
        return run_post_confirmation_pipeline(
            store,
            payment_id=pid,
            entitlement_tier=entitlement_tier,
            extend_days=extend_days,
            usage_units_to_add=usage_units_to_add,
        )
    return {"ok": True, "payment_id": pid, "status": status}