#!/usr/bin/env python3
"""
dry_run_anchor_from_bundle.py

One-command, zero-broadcast “I’m ready” runner.

Given a batch bundle JSON (CLAW_BUNDLE=...), this script will:

1) Verify the bundle (must be ok=True)
2) Ensure OP_RETURN payload exists in bundle.batch.anchor_op_return
   - If missing, it will build it using build_opreturn_payload.py
3) Build a PSBT using build_anchor_psbt_from_bundle.py
4) Print a compact readiness summary

It NEVER broadcasts. It does not call the broadcast script.
If you want to broadcast, use core_broadcast_batch_anchor.py explicitly,
and only with CLAW_ENABLE_BROADCAST=1.

Env:
  - CLAW_BUNDLE=artifacts/<batch>.bundle.json   (required)
  - CLAW_OUTDIR=artifacts/anchor-dryrun         (optional; default: artifacts/anchor-dryrun)
  - FEE_RATE_SATVB=5                           (optional)
  - CHANGE_ADDRESS=<btc address>               (optional)
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any


def _run(cmd: list[str]) -> str:
    try:
        return subprocess.check_output(cmd, stderr=subprocess.STDOUT).decode("utf-8").strip()
    except subprocess.CalledProcessError as e:
        out = ""
        try:
            out = e.output.decode("utf-8", errors="replace")
        except Exception:
            out = str(e)
        raise RuntimeError(f"command failed: {' '.join(cmd)}\n{out}") from e


def _ensure_file(path: Path, hint: str) -> None:
    if not path.exists():
        raise SystemExit(f"{hint}: {path}")


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _print_kv(k: str, v: object) -> None:
    print(f"{k}={v}")


def _python_module_cmd(module_path: str, args: list[str]) -> list[str]:
    # Prefer uv if available (you’re using it everywhere)
    # Fallback to sys.executable if uv not present.
    if os.getenv("CLAW_NO_UV", "0") == "1":
        return [sys.executable, "-m", module_path] + args
    return ["uv", "run", "python", "-m", module_path] + args


def main() -> None:
    bundle_path = Path(os.environ.get("CLAW_BUNDLE", "")).expanduser()
    if not str(bundle_path):
        raise SystemExit("set CLAW_BUNDLE=artifacts/<batch>.bundle.json")
    _ensure_file(bundle_path, "bundle not found")

    outdir = Path(os.environ.get("CLAW_OUTDIR", "artifacts/anchor-dryrun")).expanduser()
    outdir.mkdir(parents=True, exist_ok=True)

    fee_rate_satvb = os.getenv("FEE_RATE_SATVB", "5")
    change_address = os.getenv("CHANGE_ADDRESS", "")

    # ---------------------------------------------------------------------
    # 1) Verify bundle
    # ---------------------------------------------------------------------
    print("== step 1: verify bundle ==")
    verify_cmd = _python_module_cmd(
        "backend.scripts.verify_batch_bundle",
        ["--bundle", str(bundle_path)],
    )
    verify_out = _run(verify_cmd)
    print(verify_out)

    # Soft-parse ok=True from output if present, but real gate is that verify command succeeded.
    if "ok=True" not in verify_out.replace(" ", "") and "ok=True" not in verify_out:
        # Don’t hard fail on formatting changes; still encourage strictness.
        print("warn: did not detect 'ok=True' in verifier output (check output above).")

    # ---------------------------------------------------------------------
    # 2) Ensure OP_RETURN payload exists (build if missing)
    # ---------------------------------------------------------------------
    print("\n== step 2: ensure OP_RETURN payload ==")
    data = _load_json(bundle_path)
    batch = data.get("batch", {})
    batch_id = batch.get("batch_id", "unknown")
    opret_hex = batch.get("anchor_op_return")

    if not opret_hex:
        print("anchor_op_return missing; building payload and updating bundle...")
        build_payload_cmd = _python_module_cmd(
            "backend.scripts.build_opreturn_payload",
            ["--bundle", str(bundle_path)],
        )
        build_out = _run(build_payload_cmd)
        print(build_out)

        # Reload bundle after builder updates it
        data = _load_json(bundle_path)
        batch = data.get("batch", {})
        opret_hex = batch.get("anchor_op_return")

        if not opret_hex:
            raise SystemExit("failed: anchor_op_return still missing after build_opreturn_payload")

    opret_ascii = bytes.fromhex(opret_hex).decode("utf-8", errors="replace")
    _print_kv("batch_id", batch_id)
    _print_kv("op_return_bytes", len(bytes.fromhex(opret_hex)))
    _print_kv("op_return_ascii", opret_ascii)
    _print_kv("op_return_hex", opret_hex)

    # Write a small summary file for operator convenience
    _write_text(outdir / "op_return.hex", opret_hex + "\n")
    _write_text(outdir / "op_return.ascii", opret_ascii + "\n")

    # ---------------------------------------------------------------------
    # 3) Build PSBT from bundle (no broadcast)
    # ---------------------------------------------------------------------
    print("\n== step 3: build PSBT (no broadcast) ==")
    psbt_path = outdir / f"{batch_id}.psbt"
    args = ["--bundle", str(bundle_path), "--out", str(psbt_path), "--fee-rate-satvb", str(fee_rate_satvb)]
    if change_address:
        args += ["--change-address", change_address]

    build_psbt_cmd = _python_module_cmd("backend.scripts.build_anchor_psbt_from_bundle", args)
    psbt_out = _run(build_psbt_cmd)
    print(psbt_out)

    _ensure_file(psbt_path, "psbt not created")
    _print_kv("psbt_path", psbt_path)

    # ---------------------------------------------------------------------
    # 4) Final readiness summary
    # ---------------------------------------------------------------------
    print("\n== readiness summary ==")
    print("ok (dry-run anchor pack)")
    _print_kv("bundle", bundle_path)
    _print_kv("outdir", outdir)
    _print_kv("fee_rate_satvb", fee_rate_satvb)
    _print_kv("change_address", change_address or "(none)")
    _print_kv("broadcast_enabled", os.getenv("CLAW_ENABLE_BROADCAST", "0"))
    print("note: this script never broadcasts. to broadcast, use core_broadcast_batch_anchor.py explicitly.")


if __name__ == "__main__":
    main()
