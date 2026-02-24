#!/usr/bin/env python3
import json
import hashlib
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


def canon_json_bytes(obj: Any) -> bytes:
    # Deterministic JSON encoding for protocol-level semantic hashes
    return json.dumps(
        obj,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")


def sha256_hex(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def sha256_file(path: Path) -> str:
    # IMPORTANT: artifact integrity hashes are over *raw file bytes*, not canonical JSON.
    return sha256_hex(path.read_bytes())


def fail(msg: str) -> None:
    print(f"FAIL: {msg}")
    sys.exit(1)


def _artifact_id(item: Dict[str, Any]) -> str:
    # Try a few common keys that exporters might use.
    for k in ("path", "name", "filename", "file", "id"):
        v = item.get(k)
        if isinstance(v, str) and v.strip():
            return v
    return "<unknown>"


def _artifact_sha(item: Dict[str, Any]) -> Optional[str]:
    v = item.get("sha256")
    return v if isinstance(v, str) and v.strip() else None


def _load_pack_artifacts(pack: Dict[str, Any]) -> List[Dict[str, Any]]:
    art = pack.get("artifacts")
    if isinstance(art, list):
        # Expected in your repro: list of {path/name, sha256, ...}
        return [x for x in art if isinstance(x, dict)]
    if isinstance(art, dict):
        # Fallback: dict keyed by filename -> {sha256: ...}
        out: List[Dict[str, Any]] = []
        for k, v in art.items():
            if isinstance(v, dict):
                d = dict(v)
                d.setdefault("path", k)
                out.append(d)
        return out
    return []


def verify_pack_artifacts(root: Path) -> None:
    pack_path = root / "pack.json"
    if not pack_path.exists():
        # Some repro bundles might omit pack.json; but your tests expect it.
        fail("missing pack.json")

    try:
        pack = json.loads(pack_path.read_text(encoding="utf-8"))
    except Exception as e:
        fail(f"pack.json is not valid JSON: {e}")

    artifacts = _load_pack_artifacts(pack)
    if not artifacts:
        fail("pack.json missing artifacts list")

    utilities = pack.get("utilities") or {}
    timeline_art = utilities.get("timeline", {}) if isinstance(utilities, dict) else {}
    timeline_path = timeline_art.get("timeline_path")
    receipt_path = timeline_art.get("receipt_path")

    for item in artifacts:
        aid = _artifact_id(item)
        expected = _artifact_sha(item)
        if not expected:
            fail(f"pack artifact missing sha256: {aid}")

        # Resolve relative to repro root
        rel = item.get("path") or item.get("name") or item.get("filename") or aid
        if not isinstance(rel, str) or not rel.strip():
            fail(f"pack artifact missing path/name: {aid}")

        path = (root / rel).resolve()
        try:
            path.relative_to(root.resolve())
        except Exception:
            fail(f"pack artifact path escapes repro root: {rel}")

        if not path.exists():
            fail(f"missing artifact file: {rel}")

        actual = sha256_file(path)
        if actual != expected:
            fail(f"artifact hash mismatch: {Path(rel).name}")

    # Ensure sample_* files match the canonical artifact bytes
    if timeline_path:
        sample_tl = root / "sample_timeline.json"
        canon_tl = root / timeline_path
        if sample_tl.exists() and canon_tl.exists():
            if sha256_file(sample_tl) != sha256_file(canon_tl):
                fail("sample_timeline.json mismatch")
    if receipt_path:
        sample_rcpt = root / "sample_receipt.json"
        canon_rcpt = root / receipt_path
        if sample_rcpt.exists() and canon_rcpt.exists():
            if sha256_file(sample_rcpt) != sha256_file(canon_rcpt):
                fail("sample_receipt.json mismatch")


def main() -> None:
    root = Path(__file__).resolve().parent

    # 1) Verify shipped artifact bytes match pack.json (tamper-detection for repro bundle)
    verify_pack_artifacts(root)

    # 2) Verify protocol semantics on the sample timeline/receipt
    timeline_path = root / "sample_timeline.json"
    receipt_path = root / "sample_receipt.json"

    if not timeline_path.exists() or not receipt_path.exists():
        fail("missing sample_timeline.json or sample_receipt.json")

    try:
        timeline = json.loads(timeline_path.read_text(encoding="utf-8"))
    except Exception as e:
        fail(f"sample_timeline.json invalid JSON: {e}")

    try:
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    except Exception as e:
        fail(f"sample_receipt.json invalid JSON: {e}")

    manifest = timeline.get("manifest") or {}
    if not isinstance(manifest, dict):
        fail("timeline.manifest must be an object")

    event_hashes = manifest.get("event_hashes") or []
    if not isinstance(event_hashes, list):
        fail("manifest.event_hashes must be a list")

    events = timeline.get("events")
    if not isinstance(events, list) or not events:
        fail("timeline.events missing (cannot recompute event hashes)")

    # Recompute per-event hashes from the hashed content.
    # We exclude any fields that look like they contain hashes/sha/manifest metadata.
    recomputed_event_hashes: List[str] = []
    for ev in events:
        if not isinstance(ev, dict):
            fail("event must be an object")

        ev_copy = {
            k: v
            for k, v in ev.items()
            if not any(h in k.lower() for h in ("hash", "sha256", "manifest"))
        }
        ev_hash = sha256_hex(canon_json_bytes(ev_copy))

        # If the event carries a precomputed hash field, it must match.
        for key in ("event_sha256", "event_hash", "hash", "sha256"):
            if key in ev and ev[key]:
                if ev[key] != ev_hash:
                    fail(f"event hash mismatch for key {key}")
        recomputed_event_hashes.append(ev_hash)

    if len(recomputed_event_hashes) != len(event_hashes):
        fail("event_hashes length mismatch")

    for i, h in enumerate(recomputed_event_hashes):
        if h != event_hashes[i]:
            fail(f"event_hashes mismatch at index {i}")

    # Manifest commitment is over the manifest payload (event_count + event_hashes)
    manifest_payload = {"event_count": len(event_hashes), "event_hashes": event_hashes}
    manifest_sha256 = sha256_hex(canon_json_bytes(manifest_payload))

    if manifest_sha256 != manifest.get("manifest_sha256"):
        fail("manifest_sha256 mismatch")

    if timeline.get("frozen") and manifest_sha256 != timeline.get("frozen_manifest_sha256"):
        fail("frozen_manifest_sha256 mismatch")

    receipt_commitment = receipt.get("commitment")
    if not receipt_commitment:
        fail("receipt commitment field missing")

    if receipt_commitment != manifest_sha256:
        fail("receipt.commitment mismatch")

    if "merkle_proof" in receipt and receipt["merkle_proof"] not in ([], None):
        fail("unexpected merkle_proof entries in sample receipt")

    print("PASS")
    print(f"manifest_sha256={manifest_sha256}")
    print(f"receipt_commitment={receipt_commitment}")


if __name__ == "__main__":
    main()