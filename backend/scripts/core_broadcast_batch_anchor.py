#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any


def run_cli(args: list[str]) -> str:
    return subprocess.check_output(args, stderr=subprocess.STDOUT).decode("utf-8").strip()


def btc_cli_args(*cli_args: str) -> str:
    """
    Safer than passing a single JSON string: each param is its own CLI arg,
    so quoting/escaping stays correct.

    Uses bitcoin-cli with optional:
      - BTC_COOKIE_FILE (rpccookiefile)
      - BTC_WALLET (rpcwallet)
    """
    base = ["bitcoin-cli"]

    cookie = os.getenv("BTC_COOKIE_FILE")
    if cookie:
        base += [f"-rpccookiefile={cookie}"]

    wallet = os.getenv("BTC_WALLET", "")
    if wallet:
        base += [f"-rpcwallet={wallet}"]

    return run_cli(base + list(cli_args))


def require_broadcast_enabled() -> None:
    """
    Hard safety gate: refuse to broadcast unless explicitly enabled.

    To broadcast, you MUST set:
      CLAW_ENABLE_BROADCAST=1

    This prevents accidental mainnet/testnet sends during development,
    CI, or verifier-only deployments.
    """
    if os.getenv("CLAW_ENABLE_BROADCAST", "0") != "1":
        print("REFUSING TO BROADCAST: set CLAW_ENABLE_BROADCAST=1 to enable.")
        sys.exit(2)


def main() -> None:
    bundle_path = Path(os.environ.get("CLAW_BUNDLE", "")).expanduser()
    if not str(bundle_path):
        raise SystemExit("set CLAW_BUNDLE=artifacts/<batch>.bundle.json")
    if not bundle_path.exists():
        raise SystemExit(f"bundle not found: {bundle_path}")

    enable = os.getenv("CLAW_ENABLE_BROADCAST", "0") == "1"
    fee_rate_satvb = float(os.getenv("FEE_RATE_SATVB", "5"))  # sat/vB
    change_address = os.getenv("CHANGE_ADDRESS", "")  # optional

    data: dict[str, Any] = json.loads(bundle_path.read_text(encoding="utf-8"))
    batch = data["batch"]
    batch_id = batch["batch_id"]

    opret_hex = batch.get("anchor_op_return")
    if not opret_hex:
        raise SystemExit("bundle.batch.anchor_op_return missing (run build_opreturn_payload.py first)")

    # For operator visibility only (non-normative)
    opret_ascii = bytes.fromhex(opret_hex).decode("utf-8", errors="replace")

    # Core expects outputs as an OBJECT, e.g. {"data":"<hex>"}
    outputs = {"data": opret_hex}

    # fundrawtransaction options
    opts: dict[str, object] = {"fee_rate": fee_rate_satvb}
    if change_address:
        opts["changeAddress"] = change_address

    # IMPORTANT: pass args separately (matches the manual CLI call that worked)
    raw = btc_cli_args("createrawtransaction", "[]", json.dumps(outputs))
    funded = json.loads(btc_cli_args("fundrawtransaction", raw, json.dumps(opts)))
    signed = json.loads(btc_cli_args("signrawtransactionwithwallet", funded["hex"]))

    if not signed.get("complete"):
        raise SystemExit(f"signing_incomplete: {signed}")

    tx_hex = signed["hex"]

    if not enable:
        print("ok (dry-run)")
        print(f"batch_id={batch_id}")
        print(f"op_return_ascii={opret_ascii}")
        print(f"op_return_hex={opret_hex}")
        print(f"funded_fee_btc={funded.get('fee', 'unknown')}")
        print("note=set CLAW_ENABLE_BROADCAST=1 to actually send")
        return

    # Safety gate (must be explicit)
    require_broadcast_enabled()

    txid = btc_cli_args("sendrawtransaction", tx_hex)
    print("ok (broadcast)")
    print(f"batch_id={batch_id}")
    print(f"txid={txid}")


if __name__ == "__main__":
    main()
