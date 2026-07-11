"""Safe Transaction Builder JSON for Base USDC affiliate batches (export-only; no signing)."""

from __future__ import annotations

import time
from collections import defaultdict
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from eth_abi import encode as eth_abi_encode

from backend.affiliates.evm_wallet import validate_evm_wallet_address
from backend.economics import config as econ_config
from backend.economics.store import EconomicsStore, get_economics_store

from .usdc_conversion import USDC_DECIMALS, convert_usd_to_usdc

# keccak256("transfer(address,uint256)")[:4] — constant ERC-20 transfer selector.
_ERC20_TRANSFER_SELECTOR = bytes.fromhex("a9059cbb")


def _norm_addr(addr: str) -> str:
    try:
        return validate_evm_wallet_address(addr)
    except ValueError:
        raise


def erc20_transfer_data(recipient: str, amount_base_units: int) -> str:
    """ABI-encoded transfer(address,uint256) call data (0x-prefixed hex)."""
    if amount_base_units < 0:
        raise ValueError("negative_amount")
    selector = _ERC20_TRANSFER_SELECTOR
    to_c = _norm_addr(recipient)
    body = eth_abi_encode(["address", "uint256"], [to_c, amount_base_units])
    return "0x" + (selector + body).hex()


def _item_usdc_micros(item: Dict[str, Any], fallback_wallet: str) -> Tuple[str, int]:
    """Resolve wallet + USDC base units for a batch item."""
    w = (item.get("wallet_address") or "").strip() or fallback_wallet
    w = _norm_addr(w)
    raw_usdc = (item.get("amount_usdc") or "").strip()
    if raw_usdc:
        try:
            d = Decimal(raw_usdc)
            _, _, micros = convert_usd_to_usdc(d)
            return w, micros
        except Exception:
            pass
    usd = Decimal(str(item.get("amount_usd") or 0))
    _, _, micros = convert_usd_to_usdc(usd)
    return w, micros


def build_safe_payout_batch_json(
    *,
    batch_id: str,
    economics: Optional[EconomicsStore] = None,
) -> Dict[str, Any]:
    """
    One Safe JSON per batch: USDC contract calls aggregated per recipient wallet.
    """
    eco = economics or get_economics_store()
    eco.init_schema()
    bid = (batch_id or "").strip()
    b = eco.get_payout_batch(bid) if bid else None
    if not b:
        raise ValueError("batch_not_found")
    st = str(b.get("status") or "")
    if st not in ("draft", "exported"):
        raise ValueError("invalid_batch_status")
    aid = str(b["affiliate_id"])

    items = eco.list_payout_batch_items(bid)
    if not items:
        raise ValueError("no_items")
    bad = eco.payout_batch_earnings_integrity_failure(bid, items)
    if bad:
        code, detail = bad
        raise ValueError(f"{code}:{detail}")
    frozen = [
        str(it.get("wallet_address") or "").strip()
        for it in items
        if str(it.get("wallet_address") or "").strip()
    ]
    if not frozen:
        raise ValueError("missing_wallet")
    try:
        fallback = _norm_addr(frozen[0])
    except ValueError as exc:
        raise ValueError("missing_wallet") from exc

    by_wallet: Dict[str, int] = defaultdict(int)
    for it in items:
        w, micros = _item_usdc_micros(dict(it), fallback)
        by_wallet[w] += micros

    token = econ_config.affiliate_base_usdc_contract()
    token_c = _norm_addr(token)
    chain_id = econ_config.affiliate_payout_chain_id()

    transactions: List[Dict[str, str]] = []
    for recipient, micros in sorted(by_wallet.items(), key=lambda x: x[0].lower()):
        if micros <= 0:
            continue
        data = erc20_transfer_data(recipient, micros)
        transactions.append(
            {
                "to": token_c,
                "value": "0",
                "data": data,
            }
        )

    if not transactions:
        raise ValueError("zero_payout")

    return {
        "version": "1.0",
        "chainId": chain_id,
        "createdAt": int(time.time()),
        "meta": {
            "name": f"LawDog Affiliate Payout Batch #{bid}",
            "affiliate_id": aid,
            "batch_id": bid,
            "total_usd": float(b.get("total_usd") or 0),
            "usdc_contract": token_c,
            "usdc_decimals": USDC_DECIMALS,
        },
        "transactions": transactions,
    }
