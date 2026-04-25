from __future__ import annotations

import sqlite3
import uuid
import re
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, Optional

from backend.billing import pricing
from backend.economics import events as econ_events
from backend.economics.store import EconomicsStore, _utc_now, get_economics_store
from backend.payments.store import OnrampStore
from backend.treasury.treasury_store import TreasuryStore

from backend.affiliates.evm_wallet import is_valid_evm_wallet_address, validate_evm_wallet_address


def create_affiliate(
    *,
    affiliate_code: str,
    wallet_address: str,
    display_name: Optional[str] = None,
    owner_org_id: Optional[str] = None,
    economics: Optional[EconomicsStore] = None,
) -> Dict[str, Any]:
    eco = economics or get_economics_store()
    eco.init_schema()
    try:
        wnorm = validate_evm_wallet_address(wallet_address)
    except ValueError:
        return {"ok": False, "error": "invalid_wallet"}
    aid = str(uuid.uuid4())
    try:
        eco.insert_affiliate(
            affiliate_id=aid,
            code=affiliate_code.strip(),
            display_name=display_name,
            wallet_address=wnorm,
            owner_org_id=owner_org_id,
        )
    except sqlite3.IntegrityError as exc:
        return {"ok": False, "error": str(exc)}
    aff_row = eco.get_affiliate(aid)
    if aff_row:
        created = str(aff_row.get("created_at") or "").strip()
        eco.seed_usdc_wallet_at_affiliate_creation(aid, wnorm, created or _utc_now())
    return {"ok": True, "affiliate_id": aid}


_HANDLE_RE = re.compile(r"^[a-z0-9_-]{3,32}$")
_WALLET_PENDING_SENTINEL = "pending_wallet_setup"


def create_affiliate_link_for_org(
    *,
    owner_org_id: str,
    requested_handle: str,
    economics: Optional[EconomicsStore] = None,
) -> Dict[str, Any]:
    eco = economics or get_economics_store()
    eco.init_schema()
    org_id = str(owner_org_id or "").strip()
    handle = str(requested_handle or "").strip().lower()
    if not org_id:
        return {"ok": False, "error": "org_required"}
    if not _HANDLE_RE.fullmatch(handle):
        return {"ok": False, "error": "invalid_handle"}

    existing = eco.get_affiliate_by_owner_org(org_id)
    if existing:
        code = str(existing.get("affiliate_code") or "").strip()
        return {
            "ok": True,
            "created": False,
            "affiliate_id": str(existing.get("id") or ""),
            "affiliate_code": code,
            "canonical_at_path": f"/@{code}" if code else "",
        }

    aid = str(uuid.uuid4())
    try:
        eco.insert_affiliate(
            affiliate_id=aid,
            code=handle,
            display_name=handle,
            wallet_address=_WALLET_PENDING_SENTINEL,
            owner_org_id=org_id,
        )
    except sqlite3.IntegrityError:
        return {"ok": False, "error": "handle_taken"}
    return {
        "ok": True,
        "created": True,
        "affiliate_id": aid,
        "affiliate_code": handle,
        "canonical_at_path": f"/@{handle}",
    }


def attribute_affiliate(
    *,
    org_id: str,
    affiliate_code: str,
    attribution_type: str,
    user_id: Optional[str] = None,
    expires_at: Optional[str] = None,
    economics: Optional[EconomicsStore] = None,
    store: Optional[OnrampStore] = None,
    treasury: Optional[TreasuryStore] = None,
    payment_id: Optional[str] = None,
    emit_event: bool = True,
    signup_ip: Optional[str] = None,
    device_fingerprint: Optional[str] = None,
    signup_email: Optional[str] = None,
    attribution_source: Optional[str] = None,
) -> Dict[str, Any]:
    eco = economics or get_economics_store()
    eco.init_schema()
    if eco.get_active_attribution(org_id):
        return {"ok": False, "error": "already_attributed"}
    aff = eco.get_affiliate_by_code(affiliate_code.strip())
    if not aff:
        return {"ok": False, "error": "unknown_affiliate"}
    owner = aff.get("owner_org_id")
    if owner and owner == org_id:
        return {"ok": False, "error": "self_referral"}
    from backend.affiliates.gamification_events import emit_affiliate_gamification_event
    from backend.affiliates.trust_signals import (
        evaluate_new_attribution,
        hash_signal,
        normalize_email_domain,
    )

    attr_id = str(uuid.uuid4())
    ip_hash = hash_signal(signup_ip) if signup_ip else None
    dev_hash = hash_signal(device_fingerprint) if device_fingerprint else None
    email_dom = normalize_email_domain(signup_email) if signup_email else None
    if not eco.insert_attribution(
        attr_id=attr_id,
        org_id=org_id,
        user_id=user_id,
        affiliate_id=str(aff["id"]),
        attribution_type=attribution_type,
        expires_at=expires_at,
        signup_ip_hash=ip_hash,
        device_fingerprint_hash=dev_hash,
        signup_email_domain=email_dom,
        attribution_source=attribution_source,
    ):
        return {"ok": False, "error": "attribution_conflict"}
    te = evaluate_new_attribution(
        economics=eco,
        affiliate_id=str(aff["id"]),
        attr_id=attr_id,
        signup_ip_hash=ip_hash,
        device_fingerprint_hash=dev_hash,
        email_domain=email_dom,
    )
    if te.flags:
        emit_affiliate_gamification_event(
            "affiliate_referral_flagged",
            affiliate_id=str(aff["id"]),
            org_id=org_id,
            attribution_id=attr_id,
            flags=te.flags,
            momentum_credit_state=te.momentum_credit_state,
        )
    if emit_event and store is not None and treasury is not None:
        ev = econ_events.affiliate_attributed(
            org_id=org_id,
            affiliate_id=str(aff["id"]),
            attribution_id=attr_id,
        )
        econ_events.emit_economics_event(
            ev,
            payment_id=payment_id,
            subject_ref=org_id,
            ledger_amount=None,
            store=store,
            treasury=treasury,
        )
    try:
        from backend.affiliates.activity_hooks import record_qualified_signup_day

        record_qualified_signup_day(
            str(aff["id"]),
            datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            economics=eco,
        )
    except Exception:
        pass
    try:
        from backend.affiliates import trust_ledger as _trust

        _trust.record_signup_attributed(
            eco,
            affiliate_id=str(aff["id"]),
            referral_code=str(aff.get("affiliate_code") or "").strip() or str(aff["id"]),
            attribution_id=attr_id,
            org_id=org_id,
        )
    except Exception:
        pass
    return {"ok": True, "attribution_id": attr_id, "affiliate_id": str(aff["id"])}


def get_active_affiliate_for_org(
    org_id: str, economics: Optional[EconomicsStore] = None
) -> Optional[Dict[str, Any]]:
    eco = economics or get_economics_store()
    eco.init_schema()
    row = eco.get_active_attribution(org_id)
    if not row:
        return None
    aff = eco.get_affiliate(str(row["affiliate_id"]))
    return {"attribution": dict(row), "affiliate": aff}


def maybe_attribute_on_payment(
    *,
    economics: EconomicsStore,
    org_id: str,
    user_id: Optional[str],
    affiliate_code: Optional[str],
    store: OnrampStore,
    treasury: TreasuryStore,
    payment_id: str,
) -> None:
    if not affiliate_code:
        return
    if economics.get_active_attribution(org_id):
        return
    attribute_affiliate(
        org_id=org_id,
        affiliate_code=affiliate_code,
        attribution_type="first_payment",
        user_id=user_id,
        economics=economics,
        store=store,
        treasury=treasury,
        payment_id=payment_id,
        emit_event=True,
    )


def accrue_for_payment_if_eligible(
    *,
    economics: EconomicsStore,
    store: OnrampStore,
    treasury: TreasuryStore,
    payment_id: str,
    org_id: str,
    net_eligible_usd: Decimal,
    plan_code: str,
    matured_at: str,
) -> None:
    if not pricing.affiliate_eligible_for_plan(plan_code):
        return
    active = get_active_affiliate_for_org(org_id, economics=economics)
    if not active or not active.get("affiliate"):
        return
    aff_row = active["affiliate"]
    wallet = str(aff_row.get("wallet_address") or "")
    if not is_valid_evm_wallet_address(wallet):
        return
    bps = pricing.affiliate_bps_for_plan(plan_code)
    if bps <= 0:
        return
    basis = net_eligible_usd.quantize(Decimal("0.01"))
    payout_amt = (basis * Decimal(bps) / Decimal("10000")).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    if payout_amt <= 0:
        return
    acc_id = str(uuid.uuid4())
    inserted = economics.insert_accrual(
        accrual_id=acc_id,
        affiliate_id=str(aff_row["id"]),
        org_id=org_id,
        payment_id=payment_id,
        basis_amount_usd=float(basis),
        payout_amount_usd=float(payout_amt),
        status="accrued",
        matured_at=matured_at,
    )
    if not inserted:
        return
    ev = econ_events.affiliate_accrued(
        affiliate_id=str(aff_row["id"]),
        org_id=org_id,
        payment_id=payment_id,
        basis_amount_usd=basis,
        payout_amount_usd=payout_amt,
    )
    econ_events.emit_economics_event(
        ev,
        payment_id=payment_id,
        subject_ref=org_id,
        ledger_amount=payout_amt,
        store=store,
        treasury=treasury,
    )
    try:
        from backend.affiliates.activity_hooks import (
            confirm_referral_credit_after_payment,
            record_conversion_day,
        )

        record_conversion_day(
            str(aff_row["id"]),
            datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            economics=economics,
        )
        confirm_referral_credit_after_payment(org_id=org_id, economics=economics)
    except Exception:
        pass


def record_chargeback(
    *,
    payment_id: str,
    economics: Optional[EconomicsStore] = None,
    store: Optional[OnrampStore] = None,
    treasury: Optional[TreasuryStore] = None,
) -> Dict[str, Any]:
    eco = economics or get_economics_store()
    eco.init_schema()
    st = store
    tr = treasury
    if st is None:
        from backend.payments.store import get_onramp_store

        st = get_onramp_store()
    if tr is None:
        from backend.treasury.treasury_store import get_treasury_store

        tr = get_treasury_store()
    rows = eco.list_accruals_for_payment(payment_id)
    reversed_ids = [r["id"] for r in rows if r.get("status") == "accrued"]
    aff_by_row = {
        str(r["id"]): (str(r.get("affiliate_id") or ""), str(r.get("org_id") or ""))
        for r in rows
        if r.get("status") == "accrued"
    }
    eco.reverse_accruals_for_payment(payment_id, reason="chargeback")
    from backend.affiliates.gamification_events import emit_affiliate_gamification_event

    affected_affiliates: set[str] = set()
    for rid in reversed_ids:
        ev = econ_events.affiliate_reversed(
            affiliate_accrual_id=str(rid), reason="chargeback"
        )
        econ_events.emit_economics_event(
            ev,
            payment_id=payment_id,
            subject_ref=None,
            ledger_amount=None,
            store=st,
            treasury=tr,
        )
        pair = aff_by_row.get(str(rid))
        if pair:
            aid, oid = pair
            if aid and oid:
                emit_affiliate_gamification_event(
                    "affiliate_pending_credit_reversed",
                    affiliate_id=aid,
                    org_id=oid,
                    payment_id=payment_id,
                    reason="chargeback",
                    accrual_id=str(rid),
                )
                affected_affiliates.add(aid)
    for aid in affected_affiliates:
        emit_affiliate_gamification_event(
            "affiliate_score_adjusted",
            affiliate_id=aid,
            reason="accrual_reversed",
            payment_id=payment_id,
        )
    return {"ok": True, "reversed": len(reversed_ids)}


def get_affiliate(affiliate_id: str, economics: Optional[EconomicsStore] = None) -> Optional[Dict[str, Any]]:
    eco = economics or get_economics_store()
    eco.init_schema()
    return eco.get_affiliate(affiliate_id)
