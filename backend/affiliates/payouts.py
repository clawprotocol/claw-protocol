from __future__ import annotations

import hashlib
import uuid
from collections import defaultdict
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, List, Optional, Protocol, Tuple

from backend.affiliates import operator_alerts as op_alerts
from backend.economics import config as econ_config
from backend.economics import events as econ_events
from backend.economics.store import EconomicsStore, get_economics_store
from backend.payments.store import get_onramp_store
from backend.treasury.treasury_store import get_treasury_store

from .payout_wallet import payout_wallet_in_cooling_period


class PayoutAdapter(Protocol):
    """Future: Base USDC send. Stub returns deterministic tx hash."""

    def send_usdc(self, *, wallet_address: str, amount_usd: Decimal, network: str) -> str:
        ...


class StubPayoutAdapter:
    def send_usdc(self, *, wallet_address: str, amount_usd: Decimal, network: str) -> str:
        del network
        h = hashlib.sha256(
            f"{wallet_address}:{amount_usd}".encode("utf-8")
        ).hexdigest()
        return f"0xstub{h[:62]}"


def _parse_iso_dt(s: str) -> datetime:
    return datetime.fromisoformat((s or "").strip().replace("Z", "+00:00"))


def affiliate_past_first_payout_moratorium(
    eco: EconomicsStore, affiliate_id: str, *, as_of_iso: str
) -> bool:
    """First disbursement only after N days from affiliate record, unless they were paid before."""
    if eco.affiliate_has_completed_payout(affiliate_id):
        return True
    aff = eco.get_affiliate(affiliate_id)
    if not aff:
        return False
    raw = str(aff.get("created_at") or "").strip()
    if not raw:
        return True
    try:
        created = _parse_iso_dt(raw)
        as_of = _parse_iso_dt(as_of_iso)
    except ValueError:
        return True
    delay = timedelta(days=econ_config.affiliate_first_payout_delay_days())
    return as_of >= created + delay


def run_payout_cycle(
    *,
    as_of_iso: str,
    economics: Optional[EconomicsStore] = None,
    adapter: Optional[PayoutAdapter] = None,
) -> Dict[str, Any]:
    """
    Aggregate matured on-ramp ``accrued`` rows per affiliate; above threshold, create payout + mark paid.
    Stripe ``affiliate_earnings`` are settled via ``affiliates.payout_batches`` (draft → exported → paid).
    """
    eco = economics or get_economics_store()
    eco.init_schema()
    adapter = adapter or StubPayoutAdapter()
    store = get_onramp_store()
    treasury = get_treasury_store()
    threshold = econ_config.affiliate_payout_threshold_usd()
    matured = eco.list_matured_accruals(as_of=as_of_iso)
    by_aff: Dict[str, List[Tuple[str, dict]]] = defaultdict(list)
    for row in matured:
        if row.get("status") != "accrued":
            continue
        by_aff[str(row["affiliate_id"])].append(("accrual", dict(row)))

    payouts_created = 0
    legacy_wallet_import_ids: List[str] = []
    for aid, rows in by_aff.items():
        total = Decimal("0")
        for kind, r in rows:
            if kind == "accrual":
                total += Decimal(str(r["payout_amount_usd"]))
        total = total.quantize(Decimal("0.01"))
        if total < threshold:
            continue
        wallet_norm, legacy_import = eco.sync_canonical_usdc_payout_wallet(aid)
        if legacy_import:
            legacy_wallet_import_ids.append(aid)
        if not wallet_norm:
            continue
        if payout_wallet_in_cooling_period(eco, aid, wallet_norm, as_of_iso):
            continue
        payout_id = str(uuid.uuid4())
        amount_dec = total
        tx = adapter.send_usdc(
            wallet_address=wallet_norm,
            amount_usd=amount_dec,
            network=econ_config.payout_network(),
        )
        eco.insert_payout(
            payout_id=payout_id,
            affiliate_id=aid,
            wallet_address=wallet_norm,
            amount_usd=float(amount_dec),
            status="completed",
            tx_hash=tx,
        )
        accrual_ids = [str(r["id"]) for k, r in rows if k == "accrual"]
        if accrual_ids:
            eco.mark_accruals_included_in_payout(accrual_ids)
        ev = econ_events.affiliate_paid(
            affiliate_id=aid,
            payout_id=payout_id,
            amount_usd=amount_dec,
            tx_hash=tx,
        )
        econ_events.emit_economics_event(
            ev,
            payment_id=None,
            subject_ref=aid,
            ledger_amount=amount_dec,
            store=store,
            treasury=treasury,
        )
        payouts_created += 1

    if legacy_wallet_import_ids:
        op_alerts.emit_operator_alert_safe(
            op_alerts.AFFILIATE_PAYOUT_WALLET_LEGACY_IMPORT,
            {
                "count": len(legacy_wallet_import_ids),
                "affiliate_ids": legacy_wallet_import_ids[:80],
                "context": "accrual_payout_cycle",
            },
            severity="warning",
            economics=eco,
        )

    return {"ok": True, "payouts_created": payouts_created}


def aggregate_matured_totals(
    *, as_of_iso: str, economics: Optional[EconomicsStore] = None
) -> Tuple[int, Decimal]:
    eco = economics or get_economics_store()
    matured = eco.list_matured_accruals(as_of=as_of_iso)
    total = Decimal("0")
    n = 0
    for row in matured:
        if row.get("status") != "accrued":
            continue
        total += Decimal(str(row["payout_amount_usd"]))
        n += 1
    return n, total.quantize(Decimal("0.01"))
