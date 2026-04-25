from __future__ import annotations

import uuid
from typing import Any, Dict, Optional

from backend.billing import pricing
from backend.economics import config as econ_config
from backend.economics import events as econ_events
from backend.economics.store import EconomicsStore, get_economics_store
from backend.payments.store import get_onramp_store
from backend.treasury.treasury_store import get_treasury_store


def calculate_key_cost(
    service_type: str, unit_count: float, metadata: Optional[Dict[str, Any]] = None
) -> int:
    return pricing.calculate_key_cost(service_type, unit_count, metadata)


def get_key_balance(org_id: str, economics: Optional[EconomicsStore] = None) -> Dict[str, Any]:
    eco = economics or get_economics_store()
    eco.init_schema()
    return eco.get_key_balance(org_id)


def credit_keys(org_id: str, keys: int, economics: Optional[EconomicsStore] = None) -> None:
    eco = economics or get_economics_store()
    eco.init_schema()
    if keys > 0:
        eco.credit_keys(org_id, keys)


def debit_keys(org_id: str, keys: int, economics: Optional[EconomicsStore] = None) -> bool:
    del org_id, keys, economics
    raise RuntimeError(
        "debit_keys is disabled; use meter_usage so a UsageReceipt is always produced"
    )


def meter_usage(
    *,
    org_id: str,
    user_id: Optional[str],
    service_type: str,
    unit_count: float,
    reference_id: Optional[str] = None,
    economics: Optional[EconomicsStore] = None,
) -> Dict[str, Any]:
    if not econ_config.usage_metering_enabled():
        return {"ok": False, "error": "usage_metering_disabled"}
    eco = economics or get_economics_store()
    eco.init_schema()
    store = get_onramp_store()
    treasury = get_treasury_store()
    cost = calculate_key_cost(service_type, unit_count, None)
    if cost <= 0:
        return {"ok": False, "error": "zero_cost"}
    usage_id = str(uuid.uuid4())
    with eco._conn() as con:
        con.execute("BEGIN IMMEDIATE")
        row = con.execute(
            "SELECT keys_available FROM key_balances WHERE org_id = ?", (org_id,)
        ).fetchone()
        available = int(row[0]) if row else 0
        if available < cost:
            con.rollback()
            ev_lim = econ_events.usage_limit_reached(
                org_id=org_id, required_keys=cost, available_keys=available
            )
            econ_events.emit_economics_event(
                ev_lim,
                payment_id=None,
                subject_ref=org_id,
                ledger_amount=None,
                store=store,
                treasury=treasury,
            )
            return {
                "ok": False,
                "error": "insufficient_keys",
                "required_keys": cost,
                "available_keys": available,
            }
        ok = eco.debit_usage_metering_tx(
            con,
            org_id=org_id,
            user_id=user_id,
            service_type=service_type,
            unit_count=float(unit_count),
            key_cost=cost,
            reference_id=reference_id,
            usage_event_id=usage_id,
        )
        if not ok:
            con.rollback()
            return {"ok": False, "error": "debit_failed"}
        try:
            from backend.billing.usage_receipt_service import persist_usage_receipt_tx

            persist_usage_receipt_tx(con, usage_id)
        except Exception:
            con.rollback()
            return {"ok": False, "error": "receipt_persist_failed"}
        con.commit()

    ev_use = econ_events.usage_metered(
        usage_event_id=usage_id,
        org_id=org_id,
        service_type=service_type,
        unit_count=float(unit_count),
        key_cost=cost,
    )
    econ_events.emit_economics_event(
        ev_use,
        payment_id=None,
        subject_ref=org_id,
        ledger_amount=None,
        store=store,
        treasury=treasury,
    )
    ev_deb = econ_events.keys_debited(
        org_id=org_id, usage_event_id=usage_id, keys=cost
    )
    econ_events.emit_economics_event(
        ev_deb,
        payment_id=None,
        subject_ref=org_id,
        ledger_amount=None,
        store=store,
        treasury=treasury,
    )
    ur = eco.get_usage_receipt(usage_id)
    return {
        "ok": True,
        "usage_event_id": usage_id,
        "key_cost": cost,
        "receipt_hash_sha256": ur["receipt_hash_sha256"] if ur else None,
    }
