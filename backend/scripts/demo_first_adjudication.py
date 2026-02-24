#!/usr/bin/env python3
"""
Demo: first adjudication flow (minimal, deterministic).

Creates a single-event timeline, freezes it, and emits a receipt-like artifact.
No anchoring or network I/O; output is deterministic given env inputs.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict

# Minimal path bootstrap for direct script execution (B)
if __package__ is None or __package__ == "":
    repo_root = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(repo_root))

from backend.utils.canonical_json import canon_sha256_hex
from backend.utils.timeline_store import event_sha256, manifest_sha256


def _env(name: str, default: str) -> str:
    return os.getenv(name, default)


def _write_json(path: Path, obj: Dict[str, Any]) -> None:
    path.write_text(json.dumps(obj, indent=2, sort_keys=True), encoding="utf-8")


def main() -> None:
    out_dir = Path(_env("CLAW_OUT_DIR", "artifacts/first_adjudication"))
    out_dir.mkdir(parents=True, exist_ok=True)

    timeline_id = _env("CLAW_TIMELINE_ID", "demo-first-adjudication")
    title = _env("CLAW_TITLE", "First Adjudication Demo")
    message = _env("CLAW_MESSAGE", "Notice: verify run")
    if "verify run" not in message:
        message = f"{message} (verify run)"
    network = _env("CLAW_NETWORK", "testnet")
    anchor_network = _env("CLAW_ANCHOR_NETWORK", "bitcoin-testnet")
    epoch_id = _env("CLAW_EPOCH_ID", "epoch-demo")

    created_at = _env("CLAW_CREATED_AT", "2026-01-01T00:00:00Z")
    event_time = _env("CLAW_EVENT_TIME", "2026-01-01T00:00:00Z")
    frozen_at = _env("CLAW_FROZEN_AT", "2026-01-01T00:00:00Z")
    issued_at = _env("CLAW_ISSUED_AT", "2026-01-01T00:00:00Z")
    pack_created_at = _env("CLAW_PACK_CREATED_AT", "2026-01-01T00:00:00Z")
    signed_at = _env("CLAW_SIGNED_AT", "2026-01-01T00:00:00Z")
    valid_from = _env("CLAW_VALID_FROM", "2026-01-01T00:00:00Z")
    valid_to = _env("CLAW_VALID_TO", "2027-01-01T00:00:00Z")

    # Event (single notice)
    event_type = "notice"
    event_index = 0
    notice = {"text": message}

    event_obj = {
        "timeline_id": timeline_id,
        "event_index": event_index,
        "event_type": event_type,
        "event_time": event_time,
        "notice": notice,
    }
    event_hash = event_sha256(
        timeline_id=timeline_id,
        event_index=event_index,
        event_type=event_type,
        event_time=event_time,
        notice=notice,
        marker=None,
    )
    manifest_hash = manifest_sha256([event_hash])

    timeline = {
        "timeline_id": timeline_id,
        "protocol_version": "claw-timeline/1",
        "network": network,
        "created_at": created_at,
        "title": title,
        "parties": [],
        "events": [
            {
                **event_obj,
                "event_sha256": event_hash,
            }
        ],
        "manifest": {
            "event_count": 1,
            "event_hashes": [event_hash],
            "manifest_sha256": manifest_hash,
        },
        "frozen": True,
        "frozen_manifest_sha256": manifest_hash,
        "frozen_at": frozen_at,
    }

    receipt_payload = {
        "timeline_id": timeline_id,
        "frozen_manifest_sha256": manifest_hash,
        "anchor_network": anchor_network,
        "epoch_id": epoch_id,
    }
    receipt_id = f"tl_rcpt_{canon_sha256_hex(receipt_payload)[:20]}"

    receipt = {
        "receipt_id": receipt_id,
        "timeline_id": timeline_id,
        "protocol_version": "claw-timeline/1",
        "network": anchor_network,
        "epoch_id": epoch_id,
        "btc_txid": "pending",
        "commitment": manifest_hash,
        "merkle_proof": [],
        "zk_proof_refs": None,
        "issued_at": issued_at,
    }

    # E-sign attestation (minimal)
    esign_payload = {
        "schema": "claw.esign_attestation.v1",
        "signer_id": _env("CLAW_SIGNER_ID", "signer_demo_001"),
        "signer_name": _env("CLAW_SIGNER_NAME", "Demo Signer"),
        "statement": _env("CLAW_SIGNER_STATEMENT", "I attest to the facts stated in this record."),
        "signed_at": signed_at,
    }
    esign_attestation = dict(esign_payload)
    esign_attestation["attestation_sha256"] = canon_sha256_hex(esign_payload)

    # Personal liability attestation (minimal, non-advisory)
    liability_payload = {
        "schema": "claw.personal_liability_attestation.v1",
        "subject_id": _env("CLAW_SUBJECT_ID", "subject_demo_001"),
        "role": _env("CLAW_SUBJECT_ROLE", "operator"),
        "capacity": _env("CLAW_SUBJECT_CAPACITY", "individual"),
        "control_asserted": _env("CLAW_CONTROL_ASSERTED", "true").lower() == "true",
        "access_asserted": _env("CLAW_ACCESS_ASSERTED", "true").lower() == "true",
        "valid_from": valid_from,
        "valid_to": valid_to,
        "exclusions": [
            "No authority to bind third parties",
            "No ownership claimed beyond stated role",
        ],
    }
    liability_attestation = dict(liability_payload)
    liability_attestation["attestation_sha256"] = canon_sha256_hex(liability_payload)

    # Agreement reference (hash of file bytes)
    agreement_source = "docs/CLAW-AUTOMATED-DETERMINATION-CLAUSE.md"
    agreement_path = Path(agreement_source)
    agreement_bytes = agreement_path.read_bytes()
    agreement_hash = hashlib.sha256(agreement_bytes).hexdigest()
    agreement_ref = {
        "schema": "claw.agreement_ref.v1",
        "source": agreement_source,
        "content_hash_sha256": agreement_hash,
        "version": "unversioned",
    }

    pack_inputs = {
        "schema": "claw.first_adjudication_pack.v1",
        "timeline_id": timeline_id,
        "frozen_manifest_sha256": manifest_hash,
        "receipt_commitment": receipt["commitment"],
        "esign_attestation_sha256": esign_attestation["attestation_sha256"],
        "personal_liability_attestation_sha256": liability_attestation["attestation_sha256"],
        "agreement_content_hash_sha256": agreement_ref["content_hash_sha256"],
        "agreement_source": agreement_ref["source"],
        "agreement_version": agreement_ref["version"],
    }
    pack = dict(pack_inputs)
    pack["pack_inputs_hash_sha256"] = canon_sha256_hex(pack_inputs)

    timeline_path = out_dir / f"{timeline_id}.timeline.json"
    receipt_path = out_dir / f"{timeline_id}.receipt.json"
    esign_path = out_dir / "esign_attestation.json"
    liability_path = out_dir / "personal_liability_attestation.json"
    agreement_path_out = out_dir / "agreement_ref.json"
    pack_path = out_dir / "pack.json"
    verify_path = out_dir / "VERIFY.md"

    _write_json(timeline_path, timeline)
    _write_json(receipt_path, receipt)
    _write_json(esign_path, esign_attestation)
    _write_json(liability_path, liability_attestation)
    _write_json(agreement_path_out, agreement_ref)

    verify_md = f"""# VERIFY — First Adjudication Demo

This bundle is deterministic given the env inputs used by the script.

## Artifacts
- timeline: `{timeline_path}`
- receipt: `{receipt_path}`
- esign_attestation: `{esign_path}`
- personal_liability_attestation: `{liability_path}`
- agreement_ref: `{agreement_path_out}`
- pack: `{pack_path}`

## Expected Values
- timeline_id: `{timeline_id}`
- event_sha256: `{event_hash}`
- manifest_sha256: `{manifest_hash}`
- receipt_id: `{receipt_id}`
- esign_attestation_sha256: `{esign_attestation["attestation_sha256"]}`
- personal_liability_attestation_sha256: `{liability_attestation["attestation_sha256"]}`
- agreement_content_hash_sha256: `{agreement_hash}`

## Verification Steps (Python)

### 1) Recompute event hash
```bash
python3 - <<'PY'
import json, hashlib
from backend.utils.canonical_json import canon_json_bytes

payload = {{
  "timeline_id": "{timeline_id}",
  "event_index": 0,
  "event_type": "notice",
  "event_time": "{event_time}",
  "notice": {json.dumps(notice, ensure_ascii=False)},
}}
b = canon_json_bytes(payload)
print(hashlib.sha256(b).hexdigest())
PY
```

### 2) Recompute manifest hash
```bash
python3 - <<'PY'
import json, hashlib
from backend.utils.canonical_json import canon_json_bytes

payload = {{
  "event_count": 1,
  "event_hashes": ["{event_hash}"],
}}
b = canon_json_bytes(payload)
print(hashlib.sha256(b).hexdigest())
PY
```

### 3) Confirm receipt commitment
`receipt.commitment` must equal `manifest_sha256`.
"""

    verify_path.write_text(verify_md, encoding="utf-8")

    # Build pack manifest (after writing deterministic artifacts)
    artifacts = []
    for p in [
        timeline_path,
        receipt_path,
        esign_path,
        liability_path,
        agreement_path_out,
    ]:
        artifacts.append(
            {
                "path": p.name,
                "sha256": hashlib.sha256(p.read_bytes()).hexdigest(),
            }
        )

    pack_inputs = {
        "schema": "claw.first_adjudication_pack.v1",
        "created_at": pack_created_at,
        "commitment": manifest_hash,
        "artifacts": artifacts,
        "utilities": {
            "timeline": {
                "timeline_path": timeline_path.name,
                "receipt_path": receipt_path.name,
                "frozen_manifest_sha256": manifest_hash,
            },
            "e_sign": {"path": esign_path.name},
            "personal_liability": {"path": liability_path.name},
            "agreements": {"path": agreement_path_out.name},
        },
    }
    pack = dict(pack_inputs)
    pack["pack_inputs_hash_sha256"] = canon_sha256_hex(pack_inputs)
    _write_json(pack_path, pack)

    print("ok")
    print(f"timeline={timeline_path}")
    print(f"receipt={receipt_path}")
    print(f"esign_attestation={esign_path}")
    print(f"personal_liability_attestation={liability_path}")
    print(f"agreement_ref={agreement_path_out}")
    print(f"pack={pack_path}")
    print(f"verify={verify_path}")


if __name__ == "__main__":
    main()
