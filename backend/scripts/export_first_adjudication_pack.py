#!/usr/bin/env python3
"""
Export first adjudication pack as a zip artifact.
"""
from __future__ import annotations

import json
import os
import sys
import zipfile
from pathlib import Path
from typing import Iterable

# Minimal path bootstrap for direct script execution
if __package__ is None or __package__ == "":
    repo_root = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(repo_root))


def _env(name: str, default: str) -> str:
    return os.getenv(name, default)


def _require_file(path: Path) -> None:
    if not path.exists():
        raise SystemExit(f"missing required file: {path}")


def _find_pack_manifest(out_dir: Path) -> Path:
    for name in ("pack.json", "pack_manifest.json"):
        p = out_dir / name
        if p.exists():
            return p
    raise SystemExit("missing pack manifest (pack.json or pack_manifest.json)")


def _iter_files(out_dir: Path) -> Iterable[Path]:
    for p in out_dir.rglob("*"):
        if p.is_file():
            yield p


def main() -> None:
    out_dir = Path(_env("CLAW_OUT_DIR", "artifacts/first_adjudication"))
    timeline_id = _env("CLAW_TIMELINE_ID", "demo-first-adjudication")

    required = [
        out_dir / f"{timeline_id}.timeline.json",
        out_dir / f"{timeline_id}.receipt.json",
        out_dir / "VERIFY.md",
        out_dir / "esign_attestation.json",
        out_dir / "personal_liability_attestation.json",
        out_dir / "agreement_ref.json",
        out_dir / "pack.json",
    ]
    for p in required:
        _require_file(p)

    pack_path = _find_pack_manifest(out_dir)
    pack = json.loads(pack_path.read_text(encoding="utf-8"))
    pack_hash = pack.get("pack_inputs_hash_sha256")
    if not pack_hash:
        raise SystemExit("pack_inputs_hash_sha256 missing from pack manifest")

    zip_name = f"claw_first_adjudication_pack_{pack_hash}.zip"
    zip_path = out_dir.parent / zip_name

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for p in _iter_files(out_dir):
            zf.write(p, arcname=p.relative_to(out_dir))

    print(zip_path)


if __name__ == "__main__":
    main()
