"""Deterministic usage verification bundles (on-chain-agnostic, replayable)."""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from backend.billing.usage_receipt_service import build_usage_receipt_from_db_row
from backend.economics.store import EconomicsStore, get_economics_store
from backend.payments.store import OnrampStore, get_onramp_store


USAGE_BUNDLE_VERSION = "v1"


def build_usage_bundle(
    usage_event_id: str,
    *,
    economics: Optional[EconomicsStore] = None,
    onramp: Optional[OnrampStore] = None,
) -> Dict[str, Any]:
    eco = economics or get_economics_store()
    eco.init_schema()
    o = onramp or get_onramp_store()
    o.init_schema()

    row = eco.get_usage_event(usage_event_id)
    if not row:
        raise ValueError("usage_event not found")
    ur = eco.get_usage_receipt(usage_event_id)
    if not ur:
        allocs0 = eco.list_usage_payment_allocations(usage_event_id)
        body, rh = build_usage_receipt_from_db_row(row, allocs0)
    else:
        body = json.loads(ur["canonical_json"])
        rh = str(ur["receipt_hash_sha256"])

    allocs = eco.list_usage_payment_allocations(usage_event_id)
    payment_ids = sorted(
        {
            str(a["payment_id"])
            for a in allocs
            if str(a.get("payment_id") or "")
            and not str(a.get("payment_id")).startswith("__")
        }
    )

    payment_events: List[Dict[str, Any]] = []
    reserve_events: List[Dict[str, Any]] = []
    claw_events: List[Dict[str, Any]] = []

    for pid in payment_ids:
        if not pid or pid == "__legacy_balance__":
            continue
        evs = o.list_canonical_events_for_payment(pid)
        for e in evs:
            et = str(e.get("event_type") or "")
            entry = {
                "canonical_json": e.get("canonical_json"),
                "event_sha256": e.get("event_sha256"),
                "event_type": et,
                "payment_id": pid,
            }
            payment_events.append(entry)
            if et == "ReserveAllocated":
                reserve_events.append(entry)
            if et == "ClawKeyIssued":
                claw_events.append(entry)

    bundle: Dict[str, Any] = {
        "claw_key_events": sorted(
            claw_events,
            key=lambda x: (
                str(x.get("payment_id") or ""),
                str(x.get("event_type") or ""),
                str(x.get("event_sha256") or ""),
            ),
        ),
        "payment_events": sorted(
            payment_events,
            key=lambda x: (
                str(x.get("payment_id") or ""),
                str(x.get("event_type") or ""),
                str(x.get("event_sha256") or ""),
            ),
        ),
        "payment_ids": payment_ids,
        "receipt_hash_sha256": rh,
        "reserve_events": sorted(
            reserve_events,
            key=lambda x: (
                str(x.get("payment_id") or ""),
                str(x.get("event_type") or ""),
                str(x.get("event_sha256") or ""),
            ),
        ),
        "type": "UsageVerificationBundle",
        "usage_event_id": usage_event_id,
        "usage_receipt": body,
        "version": USAGE_BUNDLE_VERSION,
    }
    return {k: bundle[k] for k in sorted(bundle.keys())}
