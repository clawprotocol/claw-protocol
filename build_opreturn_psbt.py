```python
#!/usr/bin/env python3
"""
build_opreturn_psbt.py

Build a PSBT that spends UTXOs from a funded bech32 address, creates:
- an OP_RETURN output (0 sats) with your hex payload
- optional pay-to output (sats)
- change output (if not dust)

Uses Blockstream Esplora public APIs (no Bitcoin Core required).
Signer: Sparrow (or any PSBT-capable wallet).

USAGE:
  python build_opreturn_psbt.py <funded_address> <change_address> <opreturn_hex> [pay_to_address] [pay_amount_sats] [fee_rate_satvb]

Example:
  python build_opreturn_psbt.py \
    bc1q...fund \
    bc1q...change \
    434c41572047454e4553495320323032362d30312d3031
"""

import base64
import math
import sys
from dataclasses import dataclass
from typing import List, Optional, Tuple

import requests
from embit import psbt
from embit.transaction import Transaction, TransactionInput, TransactionOutput

try:
    # Older embit versions
    from embit.addresses import address_to_scriptpubkey
except ModuleNotFoundError:
    # embit 0.8.x+ moved address helpers here
    from embit.script import address_to_scriptpubkey


# Blockstream Esplora API (mainnet)
ESPLORA_BASE = "https://blockstream.info"  # mainnet
DUST_P2WPKH = 330  # sats; conservative dust threshold for segwit change


# ------------- Helpers -------------

def pushdata(data: bytes) -> bytes:
    """Bitcoin script pushdata encoding."""
    l = len(data)
    if l < 0x4c:
        return bytes([l]) + data
    elif l <= 0xff:
        return b"\x4c" + bytes([l]) + data
    elif l <= 0xffff:
        return b"\x4d" + l.to_bytes(2, "little") + data
    else:
        return b"\x4e" + l.to_bytes(4, "little") + data


def op_return_script(hex_data: str) -> bytes:
    data = bytes.fromhex(hex_data)
    # OP_RETURN (0x6a) + pushdata(payload)
    return b"\x6a" + pushdata(data)


def get_json(url: str, timeout: int = 20):
    r = requests.get(url, timeout=timeout)
    # Helpful error text if 400/404
    if not r.ok:
        raise requests.HTTPError(f"{r.status_code} {r.reason} for url: {url}\nBody: {r.text[:500]}")
    return r.json()


def get_text(url: str, timeout: int = 20) -> str:
    r = requests.get(url, timeout=timeout)
    if not r.ok:
        raise requests.HTTPError(f"{r.status_code} {r.reason} for url: {url}\nBody: {r.text[:500]}")
    return r.text.strip()


def get_utxos(address: str) -> List[dict]:
    # Esplora: /api/address/:address/utxo
    return get_json(f"{ESPLORA_BASE}/api/address/{address}/utxo")


def get_tx_hex(txid: str) -> str:
    # Esplora: /api/tx/:txid/hex
    return get_text(f"{ESPLORA_BASE}/api/tx/{txid}/hex")


def get_prevout_scriptpubkey_and_value(txid: str, vout: int) -> Tuple[str, int]:
    """
    Returns (scriptpubkey_hex, value_sats) for the referenced output.
    We parse raw tx hex so we don't depend on JSON schemas that vary by API.
    """
    raw = bytes.fromhex(get_tx_hex(txid))
    tx = Transaction.parse(raw)
    if vout < 0 or vout >= len(tx.vout):
        raise RuntimeError(f"vout index {vout} not found in tx {txid}")
    out = tx.vout[vout]
    return out.script_pubkey.data.hex(), out.value  # (scriptpubkey_hex, sats)


def get_fee_rate_satvb() -> int:
    """
    Blockstream /api/fee-estimates returns a mapping of target blocks -> sats/vB (float).
    Example keys: "1","2","3","6","10","144",...
    We'll default to 6-block target.
    """
    fees = get_json(f"{ESPLORA_BASE}/api/fee-estimates")
    # pick 6-block if available else 2-block else 1-block else 5
    for k in ("6", "3", "2", "1"):
        if k in fees:
            return int(math.ceil(float(fees[k])))
    return 5


def estimate_vbytes(num_inputs: int, num_outputs: int, opret_bytes: int) -> int:
    """
    Rough vbytes estimate for P2WPKH inputs/outputs.
    - P2WPKH input: ~68 vB
    - P2WPKH output: ~31 vB
    - OP_RETURN output: ~ (opret_bytes + 12) vB-ish depending on pushdata; approximate
    - Base tx overhead: ~10 vB
    """
    opret_vb = 12 + opret_bytes  # conservative
    return int(10 + 68 * num_inputs + 31 * num_outputs + opret_vb)


@dataclass
class SelectedInput:
    txid: str
    vout: int
    value: int  # sats
    scriptpubkey_hex: str


def select_inputs(utxos: List[dict], target_sats: int) -> List[dict]:
    """
    Greedy largest-first.
    UTXO dict from Esplora has: {"txid","vout","value","status":...}
    """
    utxos_sorted = sorted(utxos, key=lambda u: int(u["value"]), reverse=True)
    picked = []
    total = 0
    for u in utxos_sorted:
        picked.append(u)
        total += int(u["value"])
        if total >= target_sats:
            return picked
    return picked


def build_psbt(
    funded_address: str,
    change_address: str,
    opreturn_hex: str,
    fee_rate_satvb: Optional[int] = None,
    pay_to_address: Optional[str] = None,
    pay_amount_sats: int = 0,
) -> Tuple[str, dict]:
    """
    Returns: (psbt_base64, debug_info)
    """

    # Validate OP_RETURN payload policy-ish (<=80 bytes recommended)
    opret_payload = bytes.fromhex(opreturn_hex)
    opret_bytes = len(opret_payload)
    if opret_bytes > 80:
        raise ValueError(
            f"OP_RETURN payload is {opret_bytes} bytes. "
            "Keep it <= 80 bytes for best relay policy."
        )

    if fee_rate_satvb is None:
        fee_rate_satvb = get_fee_rate_satvb()

    utxos = get_utxos(funded_address)
    if not utxos:
        raise RuntimeError(
            "No UTXOs found for funded_address. "
            "Make sure that address actually holds spendable BTC."
        )

    outputs_sum = 0
    if pay_to_address and pay_amount_sats > 0:
        outputs_sum += pay_amount_sats

    # always includes OP_RETURN
    wants_pay = bool(pay_to_address and pay_amount_sats > 0)

    # Assume we might include change, then iterate
    guessed_num_outputs = (1 if wants_pay else 0) + 1 + 1  # pay + opret + change

    picked_utxos: List[dict] = []
    debug = {"fee_rate_satvb": fee_rate_satvb, "iterations": []}

    include_change = True
    fee = 0
    change = 0

    for _ in range(10):
        if not picked_utxos:
            rough_fee = fee_rate_satvb * estimate_vbytes(1, guessed_num_outputs, opret_bytes)
            picked_utxos = select_inputs(utxos, outputs_sum + rough_fee)

        total_in = sum(int(u["value"]) for u in picked_utxos)
        num_inputs = len(picked_utxos)

        # first estimate with change
        vbytes = estimate_vbytes(num_inputs, guessed_num_outputs, opret_bytes)
        fee = fee_rate_satvb * vbytes
        change = total_in - outputs_sum - fee

        if change < 0:
            needed = outputs_sum + fee + 1
            picked_utxos = select_inputs(utxos, needed)
            debug["iterations"].append(
                {"total_in": total_in, "vbytes": vbytes, "fee": fee, "change": change, "action": "add_inputs"}
            )
            continue

        if change < DUST_P2WPKH:
            # try without change output
            num_outputs_no_change = (1 if wants_pay else 0) + 1  # pay + opret
            vbytes2 = estimate_vbytes(num_inputs, num_outputs_no_change, opret_bytes)
            fee2 = fee_rate_satvb * vbytes2
            change2 = total_in - outputs_sum - fee2

            if change2 < DUST_P2WPKH:
                include_change = False
                fee = fee2 + max(0, change2)  # sweep tiny remainder into fee
                change = 0
                debug["iterations"].append(
                    {"total_in": total_in, "vbytes": vbytes2, "fee": fee, "change": change, "action": "no_change"}
                )
                break
            else:
                include_change = True
                fee = fee2
                change = change2
                debug["iterations"].append(
                    {"total_in": total_in, "vbytes": vbytes2, "fee": fee, "change": change, "action": "recalc"}
                )
                break

        include_change = True
        debug["iterations"].append(
            {"total_in": total_in, "vbytes": vbytes, "fee": fee, "change": change, "action": "ok"}
        )
        break
    else:
        raise RuntimeError("Failed to converge on inputs/fee/change within iteration limit.")

    # Build selected inputs with scriptPubKey and value from tx (robust via raw tx hex parsing)
    selected: List[SelectedInput] = []
    for u in picked_utxos:
        txid = u["txid"]
        vout = int(u["vout"])
        spk_hex, value_sats = get_prevout_scriptpubkey_and_value(txid, vout)
        selected.append(
            SelectedInput(txid=txid, vout=vout, value=value_sats, scriptpubkey_hex=spk_hex)
        )

    # Construct unsigned transaction
    tx_ins: List[TransactionInput] = []
    for s in selected:
        txid_le = bytes.fromhex(s.txid)[::-1]  # little-endian in tx format
        tx_ins.append(TransactionInput(txid_le, s.vout, sequence=0xFFFFFFFD))

    tx_outs: List[TransactionOutput] = []

    if wants_pay:
        tx_outs.append(TransactionOutput(pay_amount_sats, address_to_scriptpubkey(pay_to_address)))

    # OP_RETURN output (0 sats)
    tx_outs.append(TransactionOutput(0, op_return_script(opreturn_hex)))

    if include_change and change > 0:
        tx_outs.append(TransactionOutput(change, address_to_scriptpubkey(change_address)))

    unsigned_tx = Transaction(version=2, vin=tx_ins, vout=tx_outs, locktime=0)

    p = psbt.PSBT(unsigned_tx)

    # Attach witness_utxo so Sparrow can sign (SegWit input metadata)
    for i, s in enumerate(selected):
        p.inputs[i].witness_utxo = TransactionOutput(s.value, bytes.fromhex(s.scriptpubkey_hex))

    psbt_b64 = base64.b64encode(p.serialize()).decode("ascii")

    debug.update(
        {
            "inputs_count": len(selected),
            "total_in_sats": sum(s.value for s in selected),
            "pay_amount_sats": pay_amount_sats if wants_pay else 0,
            "fee_sats": fee,
            "change_sats": change if include_change else 0,
            "include_change": include_change,
            "opreturn_bytes": opret_bytes,
            "api_base": ESPLORA_BASE,
        }
    )

    return psbt_b64, debug


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(
            "Usage: python build_opreturn_psbt.py <funded_address> <change_address> <opreturn_hex> "
            "[pay_to_address] [pay_amount_sats] [fee_rate_satvb]"
        )
        sys.exit(1)

    funded_address = sys.argv[1].strip()
    change_address = sys.argv[2].strip()
    opreturn_hex = sys.argv[3].strip()

    pay_to = sys.argv[4].strip() if len(sys.argv) >= 5 else None
    pay_amt = int(sys.argv[5]) if len(sys.argv) >= 6 else 0
    fee_rate = int(sys.argv[6]) if len(sys.argv) >= 7 else None

    psbt_b64, info = build_psbt(
        funded_address=funded_address,
        change_address=change_address,
        opreturn_hex=opreturn_hex,
        fee_rate_satvb=fee_rate,
        pay_to_address=pay_to,
        pay_amount_sats=pay_amt,
    )

    print("\n=== PSBT (base64) ===\n")
    print(psbt_b64)
    print("\n=== Debug info ===\n")
    for k, v in info.items():
        print(f"{k}: {v}")
```
