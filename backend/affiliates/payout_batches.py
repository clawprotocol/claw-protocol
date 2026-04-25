"""Stripe affiliate_earnings payout batches — draft → exported → paid (operator-driven USDC send)."""

from __future__ import annotations

import csv
import io
import uuid
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from backend.economics import config as econ_config
from backend.economics.store import EconomicsStore, _utc_now, get_economics_store

from . import operator_alerts as op_alerts
from .evm_wallet import is_valid_evm_tx_hash, validate_evm_wallet_address
from .payout_ops_summary import build_payout_batch_summary
from .payout_wallet import payout_wallet_in_cooling_period
from .payouts import affiliate_past_first_payout_moratorium
from .usdc_conversion import convert_usd_to_usdc


def prepare_draft_earning_batches(
    *,
    as_of_iso: str,
    economics: Optional[EconomicsStore] = None,
    notes: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Group matured, unbatched payable affiliate_earnings by affiliate; create draft batches when
    totals meet threshold and first-payout moratorium passes.
    """
    eco = economics or get_economics_store()
    eco.init_schema()
    eco.promote_affiliate_earnings_pending_to_payable(as_of_iso=as_of_iso)
    threshold = Decimal(str(econ_config.affiliate_payout_threshold_usd()))
    rows = eco.list_matured_payable_affiliate_earnings(as_of_iso=as_of_iso)
    by_aff: Dict[str, List[Dict[str, Any]]] = {}
    for r in rows:
        aid = str(r["affiliate_id"])
        if not affiliate_past_first_payout_moratorium(eco, aid, as_of_iso=as_of_iso):
            continue
        by_aff.setdefault(aid, []).append(dict(r))

    batches_created = 0
    batch_ids: List[str] = []
    skipped_no_wallet = 0
    skipped_wallet_affiliate_ids: List[str] = []
    skipped_invalid_wallet_ids: List[str] = []
    skipped_cooling_affiliate_ids: List[str] = []
    legacy_wallet_import_ids: List[str] = []
    for aid, erows in by_aff.items():
        total = sum(Decimal(str(x["amount_usd"])) for x in erows)
        total = total.quantize(Decimal("0.01"))
        if total < threshold:
            continue
        raw_wallet, legacy_import = eco.sync_canonical_usdc_payout_wallet(aid)
        if legacy_import:
            legacy_wallet_import_ids.append(aid)
        if not raw_wallet:
            skipped_no_wallet += 1
            skipped_invalid_wallet_ids.append(aid)
            skipped_wallet_affiliate_ids.append(aid)
            continue
        try:
            wallet_norm = validate_evm_wallet_address(raw_wallet)
        except ValueError:
            skipped_no_wallet += 1
            skipped_invalid_wallet_ids.append(aid)
            skipped_wallet_affiliate_ids.append(aid)
            continue
        if payout_wallet_in_cooling_period(eco, aid, wallet_norm, as_of_iso):
            skipped_no_wallet += 1
            skipped_wallet_affiliate_ids.append(aid)
            skipped_cooling_affiliate_ids.append(aid)
            continue
        total_micros = 0
        item_rows: List[Tuple[Dict[str, Any], str, str]] = []
        for er in erows:
            _s18, s6, micros = convert_usd_to_usdc(Decimal(str(er["amount_usd"])))
            total_micros += micros
            item_rows.append((er, wallet_norm, s6))
        batch_total_dec = Decimal(total_micros) / Decimal(10**6)
        batch_total_usdc = f"{batch_total_dec:.18f}"
        batch_id = str(uuid.uuid4())
        now = _utc_now()
        eco.create_draft_payout_batch_atomic(
            batch_id=batch_id,
            affiliate_id=aid,
            now=now,
            total_usd=float(total),
            total_usdc=batch_total_usdc,
            notes=notes,
            item_rows=item_rows,
        )
        batches_created += 1
        batch_ids.append(batch_id)
        summ = build_payout_batch_summary(batch_id, economics=eco) or {}
        op_alerts.emit_operator_alert_safe(
            op_alerts.AFFILIATE_BATCH_PREPARED,
            {
                "batch_id": batch_id,
                "affiliate_id": aid,
                "recipients_count": summ.get("recipients_count"),
                "total_usd": summ.get("total_usd"),
                "total_usdc": summ.get("total_usdc"),
                "status": summ.get("status"),
            },
            batch_id=batch_id,
            economics=eco,
        )
        sf = summ.get("shortfall_usdc")
        if sf is not None and float(sf) > 0:
            op_alerts.emit_operator_alert_safe(
                op_alerts.AFFILIATE_TREASURY_SHORTFALL,
                {
                    "batch_id": batch_id,
                    "required_usdc": summ.get("total_usdc"),
                    "available_usdc": summ.get("safe_balance_usdc"),
                    "shortfall_usdc": sf,
                },
                severity="warning",
                batch_id=batch_id,
                economics=eco,
            )

    if skipped_invalid_wallet_ids:
        op_alerts.emit_operator_alert_safe(
            op_alerts.AFFILIATE_WALLET_INVALID,
            {
                "skipped_count": len(skipped_invalid_wallet_ids),
                "affiliate_ids": skipped_invalid_wallet_ids[:80],
            },
            severity="warning",
            economics=eco,
        )
    if skipped_cooling_affiliate_ids:
        op_alerts.emit_operator_alert_safe(
            op_alerts.AFFILIATE_WALLET_COOLING_PERIOD,
            {
                "skipped_count": len(skipped_cooling_affiliate_ids),
                "affiliate_ids": skipped_cooling_affiliate_ids[:80],
                "cooling_days": int(econ_config.affiliate_payout_wallet_cooling_days()),
            },
            severity="warning",
            economics=eco,
        )
    if legacy_wallet_import_ids:
        op_alerts.emit_operator_alert_safe(
            op_alerts.AFFILIATE_PAYOUT_WALLET_LEGACY_IMPORT,
            {
                "count": len(legacy_wallet_import_ids),
                "affiliate_ids": legacy_wallet_import_ids[:80],
            },
            severity="warning",
            economics=eco,
        )

    return {
        "ok": True,
        "batches_created": batches_created,
        "batch_ids": batch_ids,
        "skipped_no_wallet": skipped_no_wallet,
        "skipped_wallet_affiliate_ids": skipped_wallet_affiliate_ids,
        "skipped_cooling_affiliate_ids": skipped_cooling_affiliate_ids,
    }


def mark_batch_exported(
    *, batch_id: str, economics: Optional[EconomicsStore] = None
) -> Dict[str, Any]:
    eco = economics or get_economics_store()
    eco.init_schema()
    bid = (batch_id or "").strip()
    b = eco.get_payout_batch(bid)
    if not b:
        op_alerts.emit_operator_alert_safe(
            op_alerts.AFFILIATE_BATCH_FAILED,
            {"batch_id": bid, "reason": "not_found", "step": "mark_exported"},
            severity="error",
            batch_id=bid or None,
            economics=eco,
        )
        return {"ok": False, "error": "not_found"}
    if str(b.get("status")) != "draft":
        op_alerts.emit_operator_alert_safe(
            op_alerts.AFFILIATE_BATCH_FAILED,
            {
                "batch_id": bid,
                "reason": "invalid_status",
                "current_status": b.get("status"),
                "step": "mark_exported",
            },
            severity="warning",
            batch_id=bid,
            economics=eco,
        )
        return {"ok": False, "error": "invalid_status"}
    items = eco.list_payout_batch_items(bid)
    if not items:
        op_alerts.emit_operator_alert_safe(
            op_alerts.AFFILIATE_BATCH_FAILED,
            {"batch_id": bid, "reason": "no_items", "step": "mark_exported"},
            severity="error",
            batch_id=bid,
            economics=eco,
        )
        return {"ok": False, "error": "no_items"}
    bad = eco.payout_batch_earnings_integrity_failure(bid, items)
    if bad:
        code, detail = bad
        op_alerts.emit_operator_alert_safe(
            op_alerts.AFFILIATE_BATCH_FAILED,
            {
                "batch_id": bid,
                "reason": code,
                "detail_id": detail,
                "step": "mark_exported",
            },
            severity="error",
            batch_id=bid,
            economics=eco,
        )
        return {"ok": False, "error": code, "detail_id": detail}
    eco.update_payout_batch_fields(
        bid, status="exported", exported_at=_utc_now()
    )
    op_alerts.emit_operator_alert_safe(
        op_alerts.AFFILIATE_BATCH_EXPORTED,
        {
            "batch_id": bid,
            "affiliate_id": str(b.get("affiliate_id") or ""),
            "total_usdc": b.get("total_usdc"),
            "total_usd": float(b.get("total_usd") or 0),
        },
        batch_id=bid,
        economics=eco,
    )
    return {"ok": True}


def mark_batch_paid(
    *,
    batch_id: str,
    economics: Optional[EconomicsStore] = None,
    tx_hash: Optional[str] = None,
    network: Optional[str] = None,
) -> Dict[str, Any]:
    """Marks batch paid, flips earnings to paid, inserts affiliate_payouts audit row (operator USDC)."""
    eco = economics or get_economics_store()
    eco.init_schema()
    bid = (batch_id or "").strip()
    b = eco.get_payout_batch(bid)
    if not b:
        op_alerts.emit_operator_alert_safe(
            op_alerts.AFFILIATE_BATCH_FAILED,
            {"batch_id": bid, "reason": "not_found", "step": "mark_paid"},
            severity="error",
            batch_id=bid or None,
            economics=eco,
        )
        return {"ok": False, "error": "not_found"}
    st = str(b.get("status") or "")
    if st == "paid":
        op_alerts.emit_operator_alert_safe(
            op_alerts.AFFILIATE_BATCH_FAILED,
            {
                "batch_id": bid,
                "reason": "already_paid",
                "step": "mark_paid",
            },
            severity="warning",
            batch_id=bid,
            economics=eco,
        )
        return {"ok": False, "error": "already_paid"}
    if st != "exported":
        op_alerts.emit_operator_alert_safe(
            op_alerts.AFFILIATE_BATCH_FAILED,
            {
                "batch_id": bid,
                "reason": "not_exported" if st == "draft" else "invalid_status",
                "current_status": st,
                "step": "mark_paid",
            },
            severity="warning",
            batch_id=bid,
            economics=eco,
        )
        return {
            "ok": False,
            "error": "not_exported" if st == "draft" else "invalid_status",
        }
    aid = str(b["affiliate_id"])

    items = eco.list_payout_batch_items(bid)
    earning_ids = [str(i["earning_id"]) for i in items if i.get("earning_id")]
    if not earning_ids:
        op_alerts.emit_operator_alert_safe(
            op_alerts.AFFILIATE_BATCH_FAILED,
            {"batch_id": bid, "reason": "no_items", "step": "mark_paid"},
            severity="error",
            batch_id=bid,
            economics=eco,
        )
        return {"ok": False, "error": "no_items"}

    frozen_addrs = [
        str(i.get("wallet_address") or "").strip() for i in items if str(i.get("wallet_address") or "").strip()
    ]
    if not frozen_addrs:
        op_alerts.emit_operator_alert_safe(
            op_alerts.AFFILIATE_BATCH_FAILED,
            {"batch_id": bid, "reason": "frozen_wallet_missing", "step": "mark_paid"},
            severity="error",
            batch_id=bid,
            economics=eco,
        )
        return {"ok": False, "error": "frozen_wallet_missing"}
    try:
        wallet = validate_evm_wallet_address(frozen_addrs[0])
    except ValueError:
        op_alerts.emit_operator_alert_safe(
            op_alerts.AFFILIATE_BATCH_FAILED,
            {"batch_id": bid, "reason": "invalid_frozen_wallet", "affiliate_id": aid, "step": "mark_paid"},
            severity="error",
            batch_id=bid,
            economics=eco,
        )
        return {"ok": False, "error": "invalid_frozen_wallet"}
    for fa in frozen_addrs[1:]:
        try:
            if validate_evm_wallet_address(fa) != wallet:
                op_alerts.emit_operator_alert_safe(
                    op_alerts.AFFILIATE_BATCH_FAILED,
                    {"batch_id": bid, "reason": "frozen_wallet_mismatch", "step": "mark_paid"},
                    severity="error",
                    batch_id=bid,
                    economics=eco,
                )
                return {"ok": False, "error": "frozen_wallet_mismatch"}
        except ValueError:
            op_alerts.emit_operator_alert_safe(
                op_alerts.AFFILIATE_BATCH_FAILED,
                {"batch_id": bid, "reason": "invalid_frozen_wallet", "step": "mark_paid"},
                severity="error",
                batch_id=bid,
                economics=eco,
            )
            return {"ok": False, "error": "invalid_frozen_wallet"}

    require_tx = econ_config.affiliate_require_tx_hash_for_mark_paid()
    tx_clean = (tx_hash or "").strip()
    if require_tx:
        if not is_valid_evm_tx_hash(tx_clean):
            op_alerts.emit_operator_alert_safe(
                op_alerts.AFFILIATE_BATCH_FAILED,
                {"batch_id": bid, "reason": "missing_or_invalid_tx_hash", "step": "mark_paid"},
                severity="error",
                batch_id=bid,
                economics=eco,
            )
            return {"ok": False, "error": "missing_or_invalid_tx_hash"}
    elif not tx_clean:
        tx_clean = f"manual_batch:{bid[:8]}"

    payout_id = str(uuid.uuid4())
    amount = float(b.get("total_usd") or 0)
    tx = tx_clean

    net = (network or "").strip() or "base"
    bad = eco.payout_batch_earnings_integrity_failure(bid, items)
    if bad:
        code, detail = bad
        op_alerts.emit_operator_alert_safe(
            op_alerts.AFFILIATE_BATCH_FAILED,
            {
                "batch_id": bid,
                "reason": code,
                "detail_id": detail,
                "step": "mark_paid",
            },
            severity="error",
            batch_id=bid,
            economics=eco,
        )
        return {"ok": False, "error": code, "detail_id": detail}
    fin_err = eco.finalize_affiliate_payout_batch_paid(
        batch_id=bid,
        affiliate_id=aid,
        earning_ids=earning_ids,
        wallet_address=wallet,
        payout_id=payout_id,
        amount_usd=amount,
        tx_hash=tx,
        paid_network=net,
    )
    if fin_err:
        op_alerts.emit_operator_alert_safe(
            op_alerts.AFFILIATE_BATCH_FAILED,
            {"batch_id": bid, "reason": fin_err, "step": "mark_paid"},
            severity="error",
            batch_id=bid,
            economics=eco,
        )
        return {"ok": False, "error": fin_err}
    wallets = {
        str(i.get("wallet_address") or "").strip()
        for i in items
        if str(i.get("wallet_address") or "").strip()
    }
    rc = len(wallets) if wallets else len(items)
    op_alerts.emit_operator_alert_safe(
        op_alerts.AFFILIATE_BATCH_PAID,
        {
            "batch_id": bid,
            "tx_hash": tx,
            "network": net,
            "total_usd": round(amount, 2),
            "recipients_count": rc,
            "payout_id": payout_id,
        },
        severity="info",
        batch_id=bid,
        economics=eco,
    )
    try:
        from backend.affiliates import trust_ledger as _trust

        aff_row = eco.get_affiliate(aid)
        ref_code = str((aff_row or {}).get("affiliate_code") or "").strip() or aid
        _trust.record_payout_sent(
            eco,
            affiliate_id=aid,
            referral_code=ref_code,
            batch_id=bid,
            amount_usd=amount,
            tx_hash=tx,
        )
    except Exception:
        pass
    return {"ok": True, "payout_id": payout_id}


def build_payout_batch_csv(
    *, batch_id: str, economics: Optional[EconomicsStore] = None
) -> tuple[str, bytes]:
    """
    Single-row CSV for operator USDC send: affiliate_id, wallet_address (canonical USDC payout method), amount_usd.
    """
    eco = economics or get_economics_store()
    eco.init_schema()
    bid = (batch_id or "").strip()
    b = eco.get_payout_batch(bid) if bid else None
    if not b:
        raise ValueError("batch_not_found")
    aid = str(b["affiliate_id"])
    items = eco.list_payout_batch_items(bid)
    bad = eco.payout_batch_earnings_integrity_failure(bid, items)
    if bad:
        code, detail = bad
        raise ValueError(f"{code}:{detail}")
    frozen = [str(i.get("wallet_address") or "").strip() for i in items if str(i.get("wallet_address") or "").strip()]
    if not frozen:
        raise ValueError("batch_missing_frozen_wallet")
    wallet = validate_evm_wallet_address(frozen[0])
    amount = f"{float(b.get('total_usd') or 0):.2f}"
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(["affiliate_id", "wallet_address", "amount_usd"])
    writer.writerow([aid, wallet, amount])
    body = buf.getvalue().encode("utf-8")
    fname = f"payout-batch-{bid[:8]}.csv"
    return fname, body


def cancel_draft_batch(
    *, batch_id: str, economics: Optional[EconomicsStore] = None
) -> Dict[str, Any]:
    eco = economics or get_economics_store()
    eco.init_schema()
    b = eco.get_payout_batch(batch_id)
    if not b:
        return {"ok": False, "error": "not_found"}
    if str(b.get("status")) != "draft":
        return {"ok": False, "error": "invalid_status"}
    n = eco.clear_affiliate_earnings_batch_reservation(batch_id)
    eco.update_payout_batch_fields(batch_id, status="cancelled")
    eco.update_batch_items_payout_status(batch_id, "cancelled")
    return {"ok": True, "cleared_earnings": n}
