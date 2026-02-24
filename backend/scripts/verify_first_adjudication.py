#!/usr/bin/env python3
"""
Verify: first adjudication demo artifacts (minimal, deterministic).

Recomputes event + manifest hashes and checks receipt commitment.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Dict

# Minimal path bootstrap for direct script execution
if __package__ is None or __package__ == "":
    repo_root = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(repo_root))

import hashlib

from backend.utils.canonical_json import canon_sha256_hex
from backend.utils.timeline_store import event_sha256, manifest_sha256


def _env(name: str, default: str) -> str:
    return os.getenv(name, default)


def _read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, obj: Dict[str, Any]) -> None:
    path.write_text(json.dumps(obj, indent=2, sort_keys=True), encoding="utf-8")


def _fail(msg: str) -> None:
    raise SystemExit(msg)


def main() -> None:
    out_dir = Path(_env("CLAW_OUT_DIR", "artifacts/first_adjudication"))
    timeline_id = _env("CLAW_TIMELINE_ID", "demo-first-adjudication")
    event_time = _env("CLAW_EVENT_TIME", "2026-01-01T00:00:00Z")
    message = _env("CLAW_MESSAGE", "Notice: verify run")

    timeline_path = out_dir / f"{timeline_id}.timeline.json"
    receipt_path = out_dir / f"{timeline_id}.receipt.json"
    esign_path = out_dir / "esign_attestation.json"
    liability_path = out_dir / "personal_liability_attestation.json"
    agreement_path = out_dir / "agreement_ref.json"
    pack_path = out_dir / "pack.json"
    verify_json_path = out_dir / "VERIFY_RESULT.json"
    verify_md_path = out_dir / "VERIFY.md"

    for p in [timeline_path, receipt_path, esign_path, liability_path, agreement_path, pack_path]:
        if not p.exists():
            _fail(f"missing artifact: {p}")

    timeline = _read_json(timeline_path)
    receipt = _read_json(receipt_path)
    esign = _read_json(esign_path)
    liability = _read_json(liability_path)
    agreement = _read_json(agreement_path)
    pack = _read_json(pack_path)

    # Recompute event hash using timeline events if present
    events = timeline.get("events")
    if isinstance(events, list) and events:
        ev = events[0]
        computed_event_hash = event_sha256(
            timeline_id=ev.get("timeline_id", timeline_id),
            event_index=int(ev.get("event_index", 0)),
            event_type=ev.get("event_type", "notice"),
            event_time=ev.get("event_time", event_time),
            notice=ev.get("notice"),
            marker=ev.get("marker"),
        )
    else:
        computed_event_hash = event_sha256(
            timeline_id=timeline_id,
            event_index=0,
            event_type="notice",
            event_time=event_time,
            notice={"text": message},
            marker=None,
        )
    computed_manifest = manifest_sha256([computed_event_hash])

    if receipt.get("commitment") != computed_manifest:
        _fail("receipt.commitment does not match manifest_sha256")

    # Recompute e-sign attestation hash
    esign_payload = {
        "schema": esign.get("schema"),
        "signer_id": esign.get("signer_id"),
        "signer_name": esign.get("signer_name"),
        "statement": esign.get("statement"),
        "signed_at": esign.get("signed_at"),
    }
    esign_hash = canon_sha256_hex(esign_payload)
    if esign.get("attestation_sha256") != esign_hash:
        _fail("esign_attestation.attestation_sha256 mismatch")

    # Recompute personal liability attestation hash
    liability_payload = {
        "schema": liability.get("schema"),
        "subject_id": liability.get("subject_id"),
        "role": liability.get("role"),
        "capacity": liability.get("capacity"),
        "control_asserted": liability.get("control_asserted"),
        "access_asserted": liability.get("access_asserted"),
        "valid_from": liability.get("valid_from"),
        "valid_to": liability.get("valid_to"),
        "exclusions": liability.get("exclusions"),
    }
    liability_hash = canon_sha256_hex(liability_payload)
    if liability.get("attestation_sha256") != liability_hash:
        _fail("personal_liability_attestation.attestation_sha256 mismatch")

    # Recompute agreement content hash (file bytes)
    agreement_source = agreement.get("source")
    if not agreement_source:
        _fail("agreement_ref.source missing")
    agreement_bytes = Path(agreement_source).read_bytes()
    agreement_hash = hashlib.sha256(agreement_bytes).hexdigest()
    if agreement.get("content_hash_sha256") != agreement_hash:
        _fail("agreement_ref.content_hash_sha256 mismatch")

    # Verify pack manifest and artifact hashes
    required_pack_keys = [
        "schema",
        "pack_inputs_hash_sha256",
        "created_at",
        "commitment",
        "artifacts",
        "utilities",
    ]
    for k in required_pack_keys:
        if k not in pack:
            _fail(f"pack.{k} missing")

    if pack.get("commitment") != computed_manifest:
        _fail("pack.commitment does not match manifest_sha256")

    artifacts = pack.get("artifacts")
    if not isinstance(artifacts, list) or not artifacts:
        _fail("pack.artifacts missing or empty")

    artifact_paths = set()
    # Verify artifact hashes
    for a in artifacts:
        path = a.get("path")
        expected = a.get("sha256")
        if not path or not expected:
            _fail("pack.artifacts entry missing path or sha256")
        artifact_paths.add(path)
        p = out_dir / path
        if not p.exists():
            _fail(f"artifact missing: {path}")
        actual = hashlib.sha256(p.read_bytes()).hexdigest()
        if actual != expected:
            _fail(f"artifact hash mismatch: {path}")

    utilities = pack.get("utilities") or {}
    for key in ("timeline", "e_sign", "personal_liability", "agreements"):
        if key not in utilities:
            _fail(f"pack.utilities missing {key}")

    if utilities["timeline"].get("timeline_path") != timeline_path.name:
        _fail("utilities.timeline.timeline_path mismatch")
    if utilities["timeline"].get("receipt_path") != receipt_path.name:
        _fail("utilities.timeline.receipt_path mismatch")
    if utilities["timeline"].get("frozen_manifest_sha256") != computed_manifest:
        _fail("utilities.timeline.frozen_manifest_sha256 mismatch")
    if utilities["e_sign"].get("path") != esign_path.name:
        _fail("utilities.e_sign.path mismatch")
    if utilities["personal_liability"].get("path") != liability_path.name:
        _fail("utilities.personal_liability.path mismatch")
    if utilities["agreements"].get("path") != agreement_path.name:
        _fail("utilities.agreements.path mismatch")
    for required_path in [
        timeline_path.name,
        receipt_path.name,
        esign_path.name,
        liability_path.name,
        agreement_path.name,
    ]:
        if required_path not in artifact_paths:
            _fail(f"utilities artifact not listed in pack.artifacts: {required_path}")

    pack_inputs = {
        "schema": pack.get("schema"),
        "created_at": pack.get("created_at"),
        "commitment": pack.get("commitment"),
        "artifacts": pack.get("artifacts"),
        "utilities": pack.get("utilities"),
    }
    pack_hash = canon_sha256_hex(pack_inputs)
    if pack.get("pack_inputs_hash_sha256") != pack_hash:
        _fail("pack.pack_inputs_hash_sha256 mismatch")

    result = {
        "ok": True,
        "timeline_id": timeline_id,
        "computed_event_hash": computed_event_hash,
        "computed_manifest_sha256": computed_manifest,
        "receipt_commitment": receipt.get("commitment"),
        "esign_attestation_sha256": esign_hash,
        "personal_liability_attestation_sha256": liability_hash,
        "agreement_content_hash_sha256": agreement_hash,
        "pack_inputs_hash_sha256": pack_hash,
    }
    _write_json(verify_json_path, result)

    status = "OK"
    verify_md = f"""# VERIFY — First Adjudication Demo

Status: **{status}**

## Inputs
- timeline: `{timeline_path}`
- receipt: `{receipt_path}`
- esign_attestation: `{esign_path}`
- personal_liability_attestation: `{liability_path}`
- agreement_ref: `{agreement_path}`
- pack: `{pack_path}`

## Computed
- event_hash: `{computed_event_hash}`
- manifest_sha256: `{computed_manifest}`
- esign_attestation_sha256: `{esign_hash}`
- personal_liability_attestation_sha256: `{liability_hash}`
- agreement_content_hash_sha256: `{agreement_hash}`
- pack_inputs_hash_sha256: `{pack_hash}`

## Receipt
- commitment: `{receipt.get("commitment")}`

"""
    verify_md_path.write_text(verify_md, encoding="utf-8")

    return


if __name__ == "__main__":
    main()
