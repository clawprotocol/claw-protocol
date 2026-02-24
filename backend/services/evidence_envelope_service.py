from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.utils.canon_json import canon_sha256_hex
from backend.services import workflow_service


def _write_json(path: Path, obj: Dict[str, Any]) -> None:
    path.write_text(json.dumps(obj, indent=2, sort_keys=True), encoding="utf-8")


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def compose_envelope(
    *,
    timeline_id: str,
    frozen_manifest_sha256: str,
    attestations: List[Dict[str, Any]],
    agreement_ref: Optional[Dict[str, Any]],
    created_at: str,
) -> Dict[str, Any]:
    hashed = {
        "timeline": {
            "timeline_id": timeline_id,
            "frozen_manifest_sha256": frozen_manifest_sha256,
        },
        "attestations": attestations,
        "agreement_ref": agreement_ref,
        "created_at": created_at,
    }
    sha = canon_sha256_hex(hashed)
    envelope_id = f"env_{sha[:16]}"
    return {
        "schema": "claw.evidence_envelope.v1",
        "envelope_id": envelope_id,
        "hashed": hashed,
        "hashes": {"sha256": sha},
        "ordering": {
            "canonical_json": "utf-8",
            "sort_keys": True,
            "separators": ",:",
        },
    }


def hash_envelope(envelope: Dict[str, Any]) -> str:
    hashed = envelope.get("hashed")
    if not isinstance(hashed, dict):
        raise RuntimeError("envelope.hashed missing")
    return canon_sha256_hex(hashed)


def export_envelope_repro(
    *,
    out_dir: Path,
    envelope: Dict[str, Any],
    timeline: Dict[str, Any],
    receipt: Dict[str, Any],
    attestation_paths: List[Path],
    created_at: str,
    verify_md_path: Optional[Path] = None,
) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)

    _write_json(out_dir / "sample_timeline.json", timeline)
    _write_json(out_dir / "sample_receipt.json", receipt)
    _write_json(out_dir / "evidence_envelope.json", envelope)

    for src in attestation_paths:
        dest = out_dir / src.name
        dest.write_bytes(src.read_bytes())

    verify_md = verify_md_path.read_text(encoding="utf-8") if verify_md_path else ""
    (out_dir / "VERIFY.md").write_text(verify_md, encoding="utf-8")
    (out_dir / "verify.py").write_text(workflow_service._verify_py(), encoding="utf-8")

    artifacts = []
    for name in [
        "sample_timeline.json",
        "sample_receipt.json",
        "evidence_envelope.json",
        "verify.py",
        "VERIFY.md",
    ] + [p.name for p in attestation_paths]:
        artifacts.append({"path": name, "sha256": _sha256_bytes((out_dir / name).read_bytes())})

    manifest_hash = timeline.get("frozen_manifest_sha256") or timeline.get("manifest", {}).get(
        "manifest_sha256"
    )
    if not manifest_hash:
        raise RuntimeError("timeline missing frozen_manifest_sha256")

    pack_inputs = {
        "schema": "claw.evidence_envelope_pack.v1",
        "created_at": created_at,
        "commitment": manifest_hash,
        "artifacts": artifacts,
        "utilities": {
            "timeline": {
                "timeline_path": "sample_timeline.json",
                "receipt_path": "sample_receipt.json",
                "frozen_manifest_sha256": manifest_hash,
            },
            "evidence_envelope": {"path": "evidence_envelope.json"},
        },
    }
    pack = dict(pack_inputs)
    pack["pack_inputs_hash_sha256"] = canon_sha256_hex(pack_inputs)
    _write_json(out_dir / "pack.json", pack)
    return out_dir
