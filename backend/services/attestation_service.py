from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Dict, Optional

from backend.utils.canon_json import canon_sha256_hex
from backend.services import workflow_service


def _canon_json(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _write_json(path: Path, obj: Dict[str, Any]) -> None:
    path.write_text(json.dumps(obj, indent=2, sort_keys=True), encoding="utf-8")


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _hash_input(attestation_type: str, payload: Dict[str, Any], signer: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "schema": "claw.attestation.v1",
        "type": attestation_type,
        "payload": payload,
        "signer": signer,
    }


def create_attestation(
    attestation_type: str,
    payload: Dict[str, Any],
    signer_metadata: Dict[str, Any],
    issued_at: str,
) -> Dict[str, Any]:
    hash_input = _hash_input(attestation_type, payload, signer_metadata)
    attestation_sha256 = canon_sha256_hex(hash_input)
    attestation_id = f"att_{attestation_sha256[:16]}"
    return {
        "schema": "claw.attestation.v1",
        "attestation_id": attestation_id,
        "type": attestation_type,
        "payload": payload,
        "signer": signer_metadata,
        "attestation_sha256": attestation_sha256,
        "issued_at": issued_at,
        "signature": None,
        "frozen": False,
        "frozen_at": None,
    }


def sign_attestation(
    attestation: Dict[str, Any],
    *,
    signer_id: str,
    signed_at: str,
    signing_key: Optional[str] = None,
) -> Dict[str, Any]:
    sig_payload = {
        "attestation_sha256": attestation.get("attestation_sha256"),
        "signer_id": signer_id,
    }
    if signing_key is not None:
        sig_payload["signing_key"] = signing_key
    signature = hashlib.sha256(_canon_json(sig_payload).encode("utf-8")).hexdigest()
    out = dict(attestation)
    out["signature"] = {
        "algo": "sha256",
        "signature": signature,
        "signer_id": signer_id,
        "signed_at": signed_at,
    }
    return out


def freeze_attestation(attestation: Dict[str, Any], frozen_at: str) -> Dict[str, Any]:
    out = dict(attestation)
    out["frozen"] = True
    out["frozen_at"] = frozen_at
    return out


def export_attestation_repro(
    *,
    out_dir: Path,
    attestation: Dict[str, Any],
    created_at: str,
    event_time: str,
    frozen_at: str,
    issued_at: str,
    anchor_network: str,
    epoch_id: str,
    verify_md_path: Optional[Path] = None,
) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)

    attestation_path = out_dir / "attestation.json"
    _write_json(attestation_path, attestation)
    att_sha = _sha256_bytes(attestation_path.read_bytes())

    timeline_id = f"tl_att_{attestation['attestation_id'][-8:]}"
    timeline = workflow_service.create_timeline(
        timeline_id=timeline_id,
        title="Attestation Capture",
        network="testnet",
        created_at=created_at,
        parties=[],
    )
    timeline = workflow_service.append_event(
        timeline=timeline,
        event_type="notice",
        event_time=event_time,
        notice={"text": "Attestation recorded"},
        marker=None,
        references=[
            {"path": "attestation.json", "sha256": att_sha, "type": attestation.get("type")}
        ],
    )
    timeline = workflow_service.freeze_timeline(timeline=timeline, frozen_at=frozen_at)
    receipt = workflow_service.create_receipt(
        timeline_id=timeline["timeline_id"],
        frozen_manifest_sha256=timeline["frozen_manifest_sha256"],
        anchor_network=anchor_network,
        epoch_id=epoch_id,
        issued_at=issued_at,
        btc_txid="pending",
    )

    verify_md = verify_md_path.read_text(encoding="utf-8") if verify_md_path else ""
    (out_dir / "VERIFY.md").write_text(verify_md, encoding="utf-8")
    (out_dir / "verify.py").write_text(workflow_service._verify_py(), encoding="utf-8")

    _write_json(out_dir / "sample_timeline.json", timeline)
    _write_json(out_dir / "sample_receipt.json", receipt)

    artifacts = []
    for name in [
        "sample_timeline.json",
        "sample_receipt.json",
        "attestation.json",
        "verify.py",
        "VERIFY.md",
    ]:
        artifacts.append({"path": name, "sha256": _sha256_bytes((out_dir / name).read_bytes())})

    pack_inputs = {
        "schema": "claw.attestation_pack.v1",
        "created_at": created_at,
        "commitment": timeline["frozen_manifest_sha256"],
        "artifacts": artifacts,
        "utilities": {
            "timeline": {
                "timeline_path": "sample_timeline.json",
                "receipt_path": "sample_receipt.json",
                "frozen_manifest_sha256": timeline["frozen_manifest_sha256"],
            },
            "attestation": {"path": "attestation.json"},
        },
    }
    pack = dict(pack_inputs)
    pack["pack_inputs_hash_sha256"] = canon_sha256_hex(pack_inputs)
    _write_json(out_dir / "pack.json", pack)
    return out_dir
