"""Operator-facing payout batch summaries (treasury stub + Safe JSON prep; no chain execution)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

from backend.economics import config as econ_config
from backend.economics.store import EconomicsStore, _utc_now, get_economics_store

from . import operator_alerts as op_alerts


def _parse_iso_utc(s: str) -> Optional[datetime]:
    raw = (s or "").strip()
    if not raw:
        return None
    t = raw.replace("Z", "+00:00")
    try:
        d = datetime.fromisoformat(t)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d.astimezone(timezone.utc)
    except ValueError:
        return None


def maybe_emit_stale_export_alert(eco: EconomicsStore, batch_row: Dict[str, Any]) -> None:
    """If exported >24h, emit at most once per 24h per batch (tracks last_stale_export_alert_at)."""
    bid = str(batch_row.get("id") or "").strip()
    if not bid or str(batch_row.get("status") or "") != "exported":
        return
    exp = _parse_iso_utc(str(batch_row.get("exported_at") or ""))
    if not exp:
        return
    now = datetime.now(timezone.utc)
    if now - exp <= timedelta(hours=24):
        return
    last_al = _parse_iso_utc(str(batch_row.get("last_stale_export_alert_at") or ""))
    if last_al and (now - last_al) < timedelta(hours=24):
        return
    hours_open = round((now - exp).total_seconds() / 3600.0, 1)
    op_alerts.emit_operator_alert_safe(
        op_alerts.AFFILIATE_BATCH_STALE_EXPORT,
        {
            "batch_id": bid,
            "exported_at": batch_row.get("exported_at"),
            "hours_since_export": hours_open,
        },
        severity="warning",
        batch_id=bid,
        economics=eco,
    )
    eco.update_payout_batch_fields(bid, last_stale_export_alert_at=_utc_now())


def build_payout_batch_summary(
    batch_id: str, *, economics: Optional[EconomicsStore] = None
) -> Optional[Dict[str, Any]]:
    """
    Explicit summary for weekly treasury ops.

    ``safe_balance_usdc`` / ``shortfall_usdc`` are null when
    ``CLAW_AFFILIATE_TREASURY_SAFE_USDC_BALANCE_STUB`` is unset (no live Safe read in this module).
    """
    eco = economics or get_economics_store()
    eco.init_schema()
    bid = (batch_id or "").strip()
    b = eco.get_payout_batch(bid) if bid else None
    if not b:
        return None
    items = eco.list_payout_batch_items(bid)
    wallets = {
        str(i.get("wallet_address") or "").strip()
        for i in items
        if str(i.get("wallet_address") or "").strip()
    }
    recipients_count = len(wallets) if wallets else (1 if items else 0)
    total_usd = float(b.get("total_usd") or 0)
    total_usdc_raw = b.get("total_usdc")
    try:
        total_usdc_dec = Decimal(str(total_usdc_raw or "0"))
    except Exception:
        total_usdc_dec = Decimal(0)

    stub_bal = econ_config.affiliate_treasury_safe_balance_usdc_stub()
    safe_balance_usdc: Optional[float]
    shortfall_usdc: Optional[float]
    treasury_notes: List[str] = []
    if stub_bal is None:
        safe_balance_usdc = None
        shortfall_usdc = None
        treasury_notes.append(
            "Treasury Safe USDC balance not stubbed — set CLAW_AFFILIATE_TREASURY_SAFE_USDC_BALANCE_STUB "
            "for shortfall math, or fund the Safe using your own checklist."
        )
    else:
        safe_balance_usdc = float(stub_bal)
        shortfall_usdc = float(max(Decimal(0), total_usdc_dec - stub_bal))

    notes_parts: List[str] = []
    base_note = (b.get("notes") or "").strip()
    if base_note:
        notes_parts.append(base_note)
    notes_parts.extend(treasury_notes)
    notes = " ".join(notes_parts).strip() or None

    treasury_stub_active = stub_bal is not None
    treasury_funding_required = bool(
        treasury_stub_active and shortfall_usdc is not None and shortfall_usdc > 0
    )

    st = str(b.get("status") or "")
    exp_at = _parse_iso_utc(str(b.get("exported_at") or ""))
    now = datetime.now(timezone.utc)
    export_stale = bool(
        st == "exported" and exp_at is not None and (now - exp_at) > timedelta(hours=24)
    )

    return {
        "batch_id": bid,
        "created_at": b.get("created_at"),
        "recipients_count": recipients_count,
        "total_usd": round(total_usd, 2),
        "total_usdc": str(total_usdc_dec),
        "status": st,
        "safe_balance_usdc": safe_balance_usdc,
        "shortfall_usdc": shortfall_usdc,
        "notes": notes,
        "affiliate_id": str(b.get("affiliate_id") or ""),
        "exported_at": b.get("exported_at"),
        "paid_at": b.get("paid_at"),
        "safe_tx_hash": b.get("safe_tx_hash"),
        "paid_network": b.get("paid_network"),
        "treasury_stub_active": treasury_stub_active,
        "treasury_balance_is_stub": treasury_stub_active,
        "treasury_funding_required": treasury_funding_required,
        "export_stale": export_stale,
    }


def list_payout_batch_summaries(
    *, limit: int = 50, economics: Optional[EconomicsStore] = None
) -> List[Dict[str, Any]]:
    eco = economics or get_economics_store()
    eco.init_schema()
    rows = eco.list_affiliate_payout_batches(limit=limit)
    out: List[Dict[str, Any]] = []
    for r in rows:
        br = dict(r)
        maybe_emit_stale_export_alert(eco, br)
        sid = str(br.get("id") or "")
        s = build_payout_batch_summary(sid, economics=eco)
        if s:
            out.append(s)
    return out
