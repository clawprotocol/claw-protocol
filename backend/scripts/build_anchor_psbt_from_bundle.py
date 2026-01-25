#!/usr/bin/env python3
"""
Build a PSBT that anchors a CLAW batch via OP_RETURN.

Inputs:
- CLAW_BUNDLE: path to *.bundle.json (contains batch.anchor_op_return hex)
- FUNDED_ADDRESS: UTXO source address (bech32)
- CHANGE_ADDRESS: change address (bech32)
- NETWORK: bitcoin-testnet or bitcoin-mainnet (affects esplora base URL)

Output:
- artifacts/<batch_id>.anchor.psbt (base64)

No signing. No broadcast.
"""
from __future__ import annotations

import base64
import json
import os
from pathlib import Path
from typing import Any, Dict, List

import requests
from embit import psbt
from embit.transaction import Transaction, TransactionInput, TransactionOutput


ESPLORA = {
    "bitcoin-mainnet": "https://blockstream.info/api",
    "bitcoin-testnet": "https://blockstream.info/testnet/api",
}


def fetch_utxos(esplora: str, addr: str) -> List[Dict[str, Any]]:
    r = requests.get(f"{esplora}/address/{addr}/utxo", timeout=30)
    r.raise_for_status()
    return r.json()


def fetch_tx_hex(esplora: str, txid: str) -> str:
    r = requests.get(f"{esplora}/tx/{txid}/hex", timeout=30)
    r.raise_for_status()
    return r.text.strip()


def make_opreturn_script(payload_hex: str) -> bytes:
    data = bytes.fromhex(payload_hex)
    if len(data) > 80:
        raise ValueError(f"OP_RETURN payload too large: {len(data)} bytes")
    # script: OP_RETURN (0x6a) + pushdata
    if len(data) < 76:
        return b"\x6a" + bytes([len(data)]) + data
    else:
        # OP_PUSHDATA1
        return b"\x6a\x4c" + bytes([len(data)]) + data


def estimate_vbytes(n_in: int, n_out: int) -> int:
    # rough P2WPKH estimate; good enough for fee selection
    return 10 + n_in * 68 + n_out * 31


def main() -> None:
    bundle_path = Path(os.environ.get("CLAW_BUNDLE", ""))
    funded = os.environ.get("FUNDED_ADDRESS", "")
    change = os.environ.get("CHANGE_ADDRESS", "")
    network = os.environ.get("NETWORK", "bitcoin-testnet")
    fee_rate = int(os.environ.get("FEE_RATE_SATVB", "5"))

    if not bundle_path:
        raise SystemExit("set CLAW_BUNDLE")
    if not funded or not change:
        raise SystemExit("set FUNDED_ADDRESS and CHANGE_ADDRESS")
    if network not in ESPLORA:
        raise SystemExit("NETWORK must be bitcoin-testnet or bitcoin-mainnet")

    data = json.loads(bundle_path.read_text(encoding="utf-8"))
    batch = data["batch"]
    batch_id = batch["batch_id"]
    payload_hex = batch.get("anchor_op_return")
    if not payload_hex:
        raise SystemExit("bundle.batch.anchor_op_return missing (run build_opreturn_payload.py first)")

    esplora = ESPLORA[network]
    utxos = fetch_utxos(esplora, funded)
    if not utxos:
        raise SystemExit("no utxos for FUNDED_ADDRESS")

    # pick one UTXO (smallest that can cover fee)
    utxos = sorted(utxos, key=lambda u: int(u["value"]))
    chosen = None

    # outputs: OP_RETURN (0 sats) + change (all minus fee)
    n_out = 2
    for u in utxos:
        vbytes = estimate_vbytes(1, n_out)
        fee = vbytes * fee_rate
        if int(u["value"]) > fee + 600:  # leave a little room above dust-ish
            chosen = u
            break
    if not chosen:
        raise SystemExit("no utxo large enough for fee")

    txid = chosen["txid"]
    vout = int(chosen["vout"])
    value = int(chosen["value"])

    raw_hex = fetch_tx_hex(esplora, txid)
    prev_tx = bytes.fromhex(raw_hex)

    # Build unsigned tx
    t = Transaction(version=2, locktime=0)
    t.vin = [TransactionInput(bytes.fromhex(txid)[::-1], vout)]
    opret_script = make_opreturn_script(payload_hex)
    t.vout = [
        TransactionOutput(0, opret_script),
        TransactionOutput(0, b"")  # placeholder, set below
    ]

    # set change script (we leave scriptPubKey to wallet via PSBT "unknown"?)
    # simplest: create a P2WPKH output by letting Sparrow replace? Not reliable.
    # Instead, we do standard: ask user to provide a bech32 change address and use embit to script it.
    from embit import script
    change_script = script.p2wpkh(script.address_to_hash(change))
    t.vout[1].script_pubkey = change_script

    vbytes = estimate_vbytes(1, 2)
    fee = vbytes * fee_rate
    change_value = value - fee
    if change_value <= 546:
        raise SystemExit(f"change would be dust: {change_value} sats (need bigger utxo or lower fee)")

    t.vout[1].value = change_value

    # Build PSBT
    p = psbt.PSBT(t)
    # add witness utxo info (recommended for segwit signing)
    from embit.transaction import Transaction as Tx
    prev = Tx.parse(prev_tx)
    prev_out = prev.vout[vout]
    p.inputs[0].witness_utxo = prev_out

    out_file = Path(f"artifacts/{batch_id}.anchor.psbt")
    out_file.parent.mkdir(parents=True, exist_ok=True)
    out_file.write_text(base64.b64encode(p.serialize()).decode("ascii"), encoding="utf-8")

    print("ok")
    print(f"batch_id={batch_id}")
    print(f"psbt_base64_file={out_file}")
    print(f"utxo={txid}:{vout} value={value}")
    print(f"fee_sat={fee} fee_rate_satvb={fee_rate}")
    print(f"change_sat={change_value}")
    print(f"op_return_bytes={len(bytes.fromhex(payload_hex))}")


if __name__ == "__main__":
    main()
