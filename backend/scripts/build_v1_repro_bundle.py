#!/usr/bin/env python3
"""
Build a repo-less CLAW v1 repro bundle for launch gating.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import sys
from pathlib import Path
from typing import Dict, List

# Minimal path bootstrap for direct script execution
if __package__ is None or __package__ == "":
    repo_root = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(repo_root))

from backend.scripts import demo_first_adjudication
from backend.utils.canonical_json import canon_sha256_hex


def _env(name: str, default: str) -> str:
    return os.getenv(name, default)


def _require_file(path: Path) -> None:
    if not path.exists():
        raise SystemExit(f"missing required file: {path}")


def _write_text(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")


def _sha256_hex(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _select_single(paths: List[Path], label: str) -> Path:
    if not paths:
        raise SystemExit(f"missing {label} file")
    preferred = [p for p in paths if "demo-first-adjudication" in p.name]
    if preferred:
        return preferred[0]
    return max(paths, key=lambda p: p.stat().st_mtime)


def _verify_py() -> str:
    return """#!/usr/bin/env python3
import hashlib
import json
import sys
from pathlib import Path


def canon_json_bytes(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def sha256_hex(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def fail(msg):
    print(f"FAIL: {msg}")
    sys.exit(1)


def main():
    root = Path(__file__).resolve().parent
    timeline_path = root / "sample_timeline.json"
    receipt_path = root / "sample_receipt.json"
    pack_path = root / "pack.json"
    if not timeline_path.exists() or not receipt_path.exists() or not pack_path.exists():
        fail("missing sample_timeline.json, sample_receipt.json, or pack.json")

    timeline = json.loads(timeline_path.read_text(encoding="utf-8"))
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    pack = json.loads(pack_path.read_text(encoding="utf-8"))
    manifest = timeline.get("manifest") or {}
    event_hashes = manifest.get("event_hashes") or []
    if not isinstance(event_hashes, list):
        fail("manifest.event_hashes must be a list")

    events = timeline.get("events")
    if not isinstance(events, list) or not events:
        fail("timeline.events missing (cannot recompute event hashes)")

    recomputed = []
    for ev in events:
        if not isinstance(ev, dict):
            fail("event must be an object")
        ev_copy = {
            k: v
            for k, v in ev.items()
            if not any(h in k.lower() for h in ("hash", "sha256", "manifest"))
        }
        ev_hash = sha256_hex(canon_json_bytes(ev_copy))
        recomputed.append(ev_hash)

    if len(recomputed) != len(event_hashes):
        fail("event_hashes length mismatch")
    for i, h in enumerate(recomputed):
        if h != event_hashes[i]:
            fail(f"event_hashes mismatch at index {i}")

    manifest_obj = {"event_count": len(recomputed), "event_hashes": recomputed}
    manifest_sha256 = sha256_hex(canon_json_bytes(manifest_obj))
    if "manifest_sha256" in manifest and manifest_sha256 != manifest.get("manifest_sha256"):
        fail("manifest_sha256 mismatch")
    if manifest_sha256 != timeline.get("frozen_manifest_sha256"):
        fail("frozen_manifest_sha256 mismatch")

    receipt_commitment = receipt.get("commitment")
    if not receipt_commitment:
        fail("receipt commitment field missing")
    if receipt_commitment != manifest_sha256:
        fail("receipt.commitment mismatch")

    pack_inputs_hash = pack.get("pack_inputs_hash_sha256")
    if pack_inputs_hash:
        pack_inputs = dict(pack)
        pack_inputs.pop("pack_inputs_hash_sha256", None)
        recomputed_pack_hash = sha256_hex(canon_json_bytes(pack_inputs))
        if recomputed_pack_hash != pack_inputs_hash:
            fail("pack_inputs_hash_sha256 mismatch")

    # Verify artifacts from pack.json
    artifacts = pack.get("artifacts")
    if isinstance(artifacts, dict):
        items = [{"path": k, "sha256": v} for k, v in artifacts.items()]
    elif isinstance(artifacts, list):
        items = artifacts
    else:
        fail("pack.artifacts missing or invalid")

    for a in items:
        path = a.get("path")
        expected = a.get("sha256")
        if not path or not expected:
            fail("pack.artifacts entry missing path or sha256")
        p = root / path
        if not p.exists():
            fail(f"missing artifact file: {path}")
        data = p.read_bytes()
        raw_sha = hashlib.sha256(data).hexdigest()
        canon_sha = None
        try:
            obj = json.loads(data.decode("utf-8"))
            canon = json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
            canon_sha = hashlib.sha256(canon).hexdigest()
        except Exception:
            canon_sha = None
        if expected not in (raw_sha, canon_sha):
            fail(f"artifact hash mismatch: {path}")

    print("PASS")
    print(f"manifest_sha256={manifest_sha256}")
    print(f"receipt_commitment={receipt.get('commitment')}")


if __name__ == "__main__":
    main()
"""


def main() -> None:
    out_dir = Path(_env("CLAW_OUT_DIR", "artifacts/v1_repro_bundle"))
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    build_dir = out_dir / "_build"
    build_dir.mkdir(parents=True, exist_ok=True)

    old_out_dir = os.getenv("CLAW_OUT_DIR")
    try:
        os.environ["CLAW_OUT_DIR"] = str(build_dir)
        demo_first_adjudication.main()
    finally:
        if old_out_dir is None:
            os.environ.pop("CLAW_OUT_DIR", None)
        else:
            os.environ["CLAW_OUT_DIR"] = old_out_dir

    timeline_src = _select_single(list(build_dir.glob("*.timeline.json")), "timeline")
    receipt_src = _select_single(list(build_dir.glob("*.receipt.json")), "receipt")

    esign_src = build_dir / "esign_attestation.json"
    liability_src = build_dir / "personal_liability_attestation.json"
    agreement_src = build_dir / "agreement_ref.json"

    for path in [esign_src, liability_src, agreement_src]:
        _require_file(path)

    sample_timeline = out_dir / "sample_timeline.json"
    sample_receipt = out_dir / "sample_receipt.json"
    shutil.copy2(timeline_src, sample_timeline)
    shutil.copy2(receipt_src, sample_receipt)
    shutil.copy2(esign_src, out_dir / "esign_attestation.json")
    shutil.copy2(liability_src, out_dir / "personal_liability_attestation.json")
    shutil.copy2(agreement_src, out_dir / "agreement_ref.json")

    verify_md_src = Path(__file__).resolve().parents[2] / "docs" / "VERIFY.md"
    _require_file(verify_md_src)
    shutil.copy2(verify_md_src, out_dir / "VERIFY.md")

    verify_py = out_dir / "verify.py"
    _write_text(verify_py, _verify_py())

    timeline = json.loads(sample_timeline.read_text(encoding="utf-8"))
    manifest = timeline.get("manifest") or {}
    manifest_sha256 = timeline.get("frozen_manifest_sha256") or manifest.get("manifest_sha256")
    if not manifest_sha256:
        raise SystemExit("timeline missing frozen_manifest_sha256")

    artifacts = []
    for name in [
        "sample_timeline.json",
        "sample_receipt.json",
        "esign_attestation.json",
        "personal_liability_attestation.json",
        "agreement_ref.json",
        "verify.py",
        "VERIFY.md",
    ]:
        artifacts.append({"path": name, "sha256": _sha256_hex(out_dir / name)})

    pack_created_at = _env("CLAW_PACK_CREATED_AT", "2026-01-01T00:00:00Z")
    pack_inputs = {
        "schema": "claw.first_adjudication_pack.v1",
        "created_at": pack_created_at,
        "commitment": manifest_sha256,
        "artifacts": artifacts,
        "utilities": {
            "timeline": {
                "timeline_path": "sample_timeline.json",
                "receipt_path": "sample_receipt.json",
                "frozen_manifest_sha256": manifest_sha256,
            },
            "e_sign": {"path": "esign_attestation.json"},
            "personal_liability": {"path": "personal_liability_attestation.json"},
            "agreements": {"path": "agreement_ref.json"},
        },
    }
    pack = dict(pack_inputs)
    pack["pack_inputs_hash_sha256"] = canon_sha256_hex(pack_inputs)
    (out_dir / "pack.json").write_text(
        json.dumps(pack, indent=2, sort_keys=True), encoding="utf-8"
    )

    shutil.rmtree(build_dir)
    print(out_dir)


if __name__ == "__main__":
    main()
