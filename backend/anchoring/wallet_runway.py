"""
Anchor wallet runway estimates (operator / deploy-readiness only).

Uses Core wallet RPC when reachable; falls back to static per-tx fee env defaults.
Does not change anchoring policy or submission paths.
"""

from __future__ import annotations

import os
from statistics import mean
from typing import Any, Dict, List, Literal, Optional

from backend.anchoring.config import (
    bitcoin_execution_provider_type,
    dogecoin_execution_provider_type,
    launch_anchor_cadence_days,
)
from backend.handlers.anchor_adapter import (
    BitcoinCoreRpcAnchorAdapter,
    DogecoinCoreRpcAnchorAdapter,
    wallet_rpc_call_result,
)

ChainKind = Literal["bitcoin", "dogecoin"]


def _provider_mode_no_core_wallet_runway(chain: ChainKind) -> Dict[str, Any]:
    return {
        "chain": chain,
        "balance_native": None,
        "balance_unit": "BTC" if chain == "bitcoin" else "DOGE",
        "avg_fee_per_tx_native": None,
        "avg_fee_source": "not_applicable_http_broadcast_provider",
        "est_anchor_tx_per_week": _weekly_tx_count(chain),
        "cadence_days_assumption": launch_anchor_cadence_days(),
        "weekly_spend_native": None,
        "runway_weeks": None,
        "runway_severity": "unknown",
        "note": "Fee wallet runway applies to self-hosted Core; HTTP broadcast uses offline signing + public APIs.",
    }


def _fallback_avg_fee_btc() -> float:
    raw = os.getenv("CLAW_ANCHOR_BTC_FALLBACK_FEE_BTC", "0.00003").strip()
    try:
        return max(1e-8, float(raw))
    except ValueError:
        return 0.00003


def _fallback_avg_fee_doge() -> float:
    raw = os.getenv("CLAW_ANCHOR_DOGE_FALLBACK_FEE_DOGE", "2.0").strip()
    try:
        return max(1e-6, float(raw))
    except ValueError:
        return 2.0


def _weekly_tx_count(chain: ChainKind) -> int:
    if chain == "bitcoin":
        raw = os.getenv("CLAW_ANCHOR_EST_WEEKLY_TX_COUNT_BTC", "1").strip()
    else:
        raw = os.getenv("CLAW_ANCHOR_EST_WEEKLY_TX_COUNT_DOGE", "1").strip()
    try:
        return max(1, int(raw))
    except ValueError:
        return 1


def _trusted_balance_btc(result: Any) -> Optional[float]:
    if not isinstance(result, dict):
        return None
    mine = result.get("mine")
    if isinstance(mine, dict) and "trusted" in mine:
        try:
            return float(mine["trusted"])
        except (TypeError, ValueError):
            return None
    for key in ("balance", "walletbalance"):
        w = result.get(key)
        if w is not None:
            try:
                return float(w)
            except (TypeError, ValueError):
                return None
    return None


def _avg_fee_from_listtransactions(rows: Any) -> Optional[float]:
    if not isinstance(rows, list):
        return None
    fees: List[float] = []
    for tx in rows:
        if not isinstance(tx, dict):
            continue
        if str(tx.get("category") or "") != "send":
            continue
        fee = tx.get("fee")
        if fee is None:
            continue
        try:
            f = float(fee)
        except (TypeError, ValueError):
            continue
        fees.append(abs(f))
    if not fees:
        return None
    return float(mean(fees[-20:]))


def estimate_anchor_wallet_runway(chain: ChainKind) -> Dict[str, Any]:
    """
    Returns explainable fields for operators:

    - balance_native, avg_fee_per_tx_native, est_tx_per_week, runway_weeks
    - runway_severity: ok | warning | critical | unknown
    """
    if chain == "bitcoin" and bitcoin_execution_provider_type() == "public_broadcast_bitcoin":
        return _provider_mode_no_core_wallet_runway(chain)
    if chain == "dogecoin" and dogecoin_execution_provider_type() == "blockchair_dogecoin":
        return _provider_mode_no_core_wallet_runway(chain)

    cadence_days = launch_anchor_cadence_days()
    weekly = _weekly_tx_count(chain)
    if chain == "bitcoin":
        adapter = BitcoinCoreRpcAnchorAdapter()
        fb_fee = _fallback_avg_fee_btc()
        unit = "BTC"
    else:
        adapter = DogecoinCoreRpcAnchorAdapter()
        fb_fee = _fallback_avg_fee_doge()
        unit = "DOGE"

    bal_res = wallet_rpc_call_result(
        adapter.cfg,
        rpc_user=adapter._rpc_user,
        rpc_password=adapter._rpc_password,
        method="getbalances",
        params=[],
        timeout=30,
    )
    balance = _trusted_balance_btc(bal_res)
    if balance is None:
        gw = wallet_rpc_call_result(
            adapter.cfg,
            rpc_user=adapter._rpc_user,
            rpc_password=adapter._rpc_password,
            method="getwalletinfo",
            params=[],
            timeout=30,
        )
        balance = _trusted_balance_btc(gw) if isinstance(gw, dict) else None

    lt = wallet_rpc_call_result(
        adapter.cfg,
        rpc_user=adapter._rpc_user,
        rpc_password=adapter._rpc_password,
        method="listtransactions",
        params=["*", 40],
        timeout=30,
    )
    avg_fee = _avg_fee_from_listtransactions(lt)
    fee_source = "recent_wallet_txs"
    if avg_fee is None:
        avg_fee = fb_fee
        fee_source = "fallback_env"

    weekly_spend = avg_fee * weekly
    runway_weeks: Optional[float]
    if balance is None or weekly_spend <= 0:
        runway_weeks = None
    else:
        runway_weeks = balance / weekly_spend

    sev = "unknown"
    if runway_weeks is not None:
        if runway_weeks < 2:
            sev = "critical"
        elif runway_weeks < 4:
            sev = "warning"
        else:
            sev = "ok"

    return {
        "chain": chain,
        "balance_native": balance,
        "balance_unit": unit,
        "avg_fee_per_tx_native": avg_fee,
        "avg_fee_source": fee_source,
        "est_anchor_tx_per_week": weekly,
        "cadence_days_assumption": cadence_days,
        "weekly_spend_native": weekly_spend if balance is not None else None,
        "runway_weeks": runway_weeks,
        "runway_severity": sev,
    }
