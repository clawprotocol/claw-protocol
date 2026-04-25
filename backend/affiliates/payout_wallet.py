"""Shared payout wallet cooling checks (Stripe batches + accrual payout cycle)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from backend.economics import config as econ_config
from backend.economics.store import EconomicsStore

from .evm_wallet import validate_evm_wallet_address


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


def payout_wallet_in_cooling_period(
    eco: EconomicsStore, affiliate_id: str, wallet_norm: str, as_of_iso: str
) -> bool:
    cd = int(econ_config.affiliate_payout_wallet_cooling_days())
    if cd <= 0:
        return False
    row = eco.get_affiliate_payout_method_row(affiliate_id, "usdc_wallet")
    if not row or str(row.get("status") or "") != "active":
        return False
    mw = (row.get("usdc_wallet_address") or "").strip()
    if not mw:
        return False
    try:
        if validate_evm_wallet_address(mw) != wallet_norm:
            return False
    except ValueError:
        return False
    wu = (row.get("wallet_updated_at") or "").strip()
    if not wu:
        # Cooling is configured: require a recorded wallet change time (no legacy bypass).
        return True
    wu_dt = _parse_iso_utc(wu)
    as_of_dt = _parse_iso_utc(as_of_iso)
    if not wu_dt or not as_of_dt:
        return False
    clear_at = wu_dt + timedelta(days=cd)
    return as_of_dt < clear_at
