#!/usr/bin/env python3
"""
Export a repo-less repro pack for first adjudication verification.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import sys
from pathlib import Path

# Minimal path bootstrap for direct script execution
if __package__ is None or __package__ == "":
    repo_root = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(repo_root))


def _env(name: str, default: str) -> str:
    return os.getenv(name, default)


def _require_file(path: Path) -> None:
    if not path.exists():
        raise SystemExit(f"missing required file: {path}")


def _write_text(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")


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
    out_dir = Path(_env("CLAW_OUT_DIR", "artifacts/first_adjudication"))
    pack_path = out_dir / "pack.json"
    verify_md = out_dir / "VERIFY.md"

    _require_file(pack_path)
    _require_file(verify_md)

    pack = json.loads(pack_path.read_text(encoding="utf-8"))
    artifacts = pack.get("artifacts") or []
    if not artifacts:
        raise SystemExit("pack.artifacts missing or empty")

    repro_dir = out_dir / "repro"
    if repro_dir.exists():
        shutil.rmtree(repro_dir)
    repro_dir.mkdir(parents=True, exist_ok=True)

    # Copy artifacts listed in pack.json
    for a in artifacts:
        path = a.get("path")
        if not path:
            raise SystemExit("pack.artifacts entry missing path")
        src = out_dir / path
        _require_file(src)
        shutil.copy2(src, repro_dir / path)

    # Copy pack.json and VERIFY.md
    shutil.copy2(pack_path, repro_dir / "pack.json")
    shutil.copy2(verify_md, repro_dir / "VERIFY.md")

    # Build repo-less sample_timeline.json from the actual timeline file in CLAW_OUT_DIR
    utilities = pack.get("utilities") or {}
    receipt_path = utilities.get("timeline", {}).get("receipt_path")
    if not receipt_path:
        raise SystemExit("pack.utilities.timeline receipt_path missing")

    candidates = sorted(out_dir.glob("*.timeline.json"))
    if not candidates:
        raise SystemExit("no timeline json found in output dir")
    preferred = [p for p in candidates if "demo-first-adjudication" in p.name]
    if preferred:
        timeline_src = preferred[0]
    else:
        timeline_src = max(candidates, key=lambda p: p.stat().st_mtime)

    tl = json.loads(timeline_src.read_text(encoding="utf-8"))
    events = tl.get("events")
    if not isinstance(events, list) or not events:
        raise RuntimeError(
            f"timeline.events missing in {timeline_src.name}; keys={list(tl.keys())}"
        )
    if "verify run" not in json.dumps(tl, ensure_ascii=False):
        raise RuntimeError(
        f"'verify run' not found in {timeline_src.name}; timeline must include it in hashed event content"
    )


    rcpt = json.loads((out_dir / receipt_path).read_text(encoding="utf-8"))

    (repro_dir / "sample_timeline.json").write_text(
        json.dumps(tl, indent=2, sort_keys=True), encoding="utf-8"
    )
    (repro_dir / "sample_receipt.json").write_text(
        json.dumps(rcpt, indent=2, sort_keys=True), encoding="utf-8"
    )

    # Write standalone verifier
    verify_py = repro_dir / "verify.py"
    _write_text(verify_py, _verify_py())

    print(repro_dir)


if __name__ == "__main__":
    main()
