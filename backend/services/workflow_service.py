from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.utils.canon_json import canon_sha256_hex
from backend.utils.timeline_store import event_sha256, manifest_sha256


def _canon_json(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _write_json(path: Path, obj: Dict[str, Any]) -> None:
    path.write_text(json.dumps(obj, indent=2, sort_keys=True), encoding="utf-8")


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


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


def create_timeline(
    *,
    timeline_id: str,
    title: str,
    network: str,
    created_at: str,
    parties: Optional[List[Dict[str, Any]]] = None,
    protocol_version: str = "claw-timeline/1",
) -> Dict[str, Any]:
    return {
        "timeline_id": timeline_id,
        "protocol_version": protocol_version,
        "network": network,
        "created_at": created_at,
        "title": title,
        "parties": parties or [],
        "events": [],
        "manifest": {"event_count": 0, "event_hashes": [], "manifest_sha256": manifest_sha256([])},
        "frozen": False,
        "frozen_manifest_sha256": None,
        "frozen_at": None,
    }


def create_timeline_version(
    *,
    frozen_timeline: Dict[str, Any],
    created_at: str,
    title: Optional[str] = None,
    timeline_id: Optional[str] = None,
    network: Optional[str] = None,
) -> Dict[str, Any]:
    if frozen_timeline.get("frozen") is not True and not frozen_timeline.get(
        "frozen_manifest_sha256"
    ):
        raise ValueError("Timeline is not frozen; cannot fork a new version.")
    prev_manifest = frozen_timeline.get("frozen_manifest_sha256")
    if not prev_manifest:
        raise ValueError("Frozen timeline missing frozen_manifest_sha256.")
    base_id = frozen_timeline.get("timeline_id", "")
    new_id = timeline_id or f"{base_id}_v{canon_sha256_hex({'prev': prev_manifest, 'created_at': created_at})[:8]}"
    new_title = title or f"{frozen_timeline.get('title') or 'Timeline'} (v2)"
    new_network = network or frozen_timeline.get("network") or "testnet"
    new_timeline = create_timeline(
        timeline_id=new_id,
        title=new_title,
        network=new_network,
        created_at=created_at,
        parties=frozen_timeline.get("parties") or [],
    )
    new_timeline["forked_from_timeline_id"] = base_id
    new_timeline["prev_frozen_manifest_sha256"] = prev_manifest
    fork_notice = {
        "text": "Timeline version fork",
        "forked_from_timeline_id": base_id,
        "prev_frozen_manifest_sha256": prev_manifest,
    }
    new_timeline = append_event(
        timeline=new_timeline,
        event_type="notice",
        event_time=created_at,
        notice=fork_notice,
        marker=None,
        references=None,
    )
    return new_timeline


def append_event(
    *,
    timeline: Dict[str, Any],
    event_type: str,
    event_time: str,
    notice: Optional[Dict[str, Any]] = None,
    marker: Optional[Dict[str, Any]] = None,
    references: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    if timeline.get("frozen") or timeline.get("frozen_manifest_sha256"):
        raise ValueError(
            "Timeline is frozen; appends are not allowed. Create a new version to add events."
        )
    events = list(timeline.get("events") or [])
    event_index = len(events)
    notice_obj = dict(notice or {})
    if references:
        notice_obj["references"] = references
    ev_hash = event_sha256(
        timeline_id=timeline["timeline_id"],
        event_index=event_index,
        event_type=event_type,
        event_time=event_time,
        notice=notice_obj,
        marker=marker,
    )
    event_obj: Dict[str, Any] = {
        "timeline_id": timeline["timeline_id"],
        "event_index": event_index,
        "event_type": event_type,
        "event_time": event_time,
    }
    if event_type == "notice":
        event_obj["notice"] = notice_obj
    if event_type == "marker":
        event_obj["marker"] = marker or {}
    event_obj["event_sha256"] = ev_hash
    events.append(event_obj)
    hashes = [e["event_sha256"] for e in events]
    manifest_hash = manifest_sha256(hashes)
    out = dict(timeline)
    out["events"] = events
    out["manifest"] = {
        "event_count": len(hashes),
        "event_hashes": hashes,
        "manifest_sha256": manifest_hash,
    }
    return out


def freeze_timeline(*, timeline: Dict[str, Any], frozen_at: str) -> Dict[str, Any]:
    hashes = [e["event_sha256"] for e in (timeline.get("events") or [])]
    manifest_hash = manifest_sha256(hashes)
    out = dict(timeline)
    out["manifest"] = {
        "event_count": len(hashes),
        "event_hashes": hashes,
        "manifest_sha256": manifest_hash,
    }
    out["frozen"] = True
    out["frozen_manifest_sha256"] = manifest_hash
    out["frozen_at"] = frozen_at
    return out


def create_receipt(
    *,
    timeline_id: str,
    frozen_manifest_sha256: str,
    anchor_network: str,
    epoch_id: str,
    issued_at: str,
    btc_txid: str = "pending",
) -> Dict[str, Any]:
    payload = {
        "timeline_id": timeline_id,
        "frozen_manifest_sha256": frozen_manifest_sha256,
        "anchor_network": anchor_network,
        "epoch_id": epoch_id,
    }
    receipt_id = f"tl_rcpt_{canon_sha256_hex(payload)[:20]}"
    return {
        "receipt_id": receipt_id,
        "timeline_id": timeline_id,
        "protocol_version": "claw-timeline/1",
        "network": anchor_network,
        "epoch_id": epoch_id,
        "btc_txid": btc_txid,
        "commitment": frozen_manifest_sha256,
        "merkle_proof": [],
        "zk_proof_refs": None,
        "issued_at": issued_at,
    }


def create_attestation_esign(
    *,
    signer_id: str,
    signer_name: str,
    statement: str,
    signed_at: str,
) -> Dict[str, Any]:
    payload = {
        "schema": "claw.esign_attestation.v1",
        "signer_id": signer_id,
        "signer_name": signer_name,
        "statement": statement,
        "signed_at": signed_at,
    }
    att = dict(payload)
    att["attestation_sha256"] = canon_sha256_hex(payload)
    return att


def create_attestation_liability(
    *,
    subject_id: str,
    role: str,
    capacity: str,
    control_asserted: bool,
    access_asserted: bool,
    valid_from: str,
    valid_to: str,
    exclusions: Optional[List[str]] = None,
    structuring_notes: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    payload = {
        "schema": "claw.personal_liability_attestation.v1",
        "subject_id": subject_id,
        "role": role,
        "capacity": capacity,
        "control_asserted": control_asserted,
        "access_asserted": access_asserted,
        "valid_from": valid_from,
        "valid_to": valid_to,
        "exclusions": exclusions or [],
    }
    att = dict(payload)
    att["attestation_sha256"] = canon_sha256_hex(payload)
    if structuring_notes:
        att["structuring_notes"] = structuring_notes
    return att


def sign_attestation(
    *,
    attestation: Dict[str, Any],
    algo: str,
    signature: str,
    signer_id: str,
    signed_at: str,
) -> Dict[str, Any]:
    out = dict(attestation)
    out["signature"] = {
        "algo": algo,
        "signature": signature,
        "signer_id": signer_id,
        "signed_at": signed_at,
    }
    return out


def freeze_attestation(*, attestation: Dict[str, Any], frozen_at: str) -> Dict[str, Any]:
    out = dict(attestation)
    out["frozen"] = True
    out["frozen_at"] = frozen_at
    return out


def create_agreement(
    *,
    title: str,
    parties: Optional[List[str]],
    content: str,
    created_at: str,
) -> Dict[str, Any]:
    content_hash = _sha256_bytes(content.encode("utf-8"))
    version_id = f"av_{content_hash[:16]}"
    agreement_id = f"ag_{canon_sha256_hex({'title': title, 'content_hash': content_hash})[:16]}"
    version = {
        "version_id": version_id,
        "created_at": created_at,
        "content_hash_sha256": content_hash,
        "source_ref": None,
        "redlines": [],
    }
    return {
        "schema": "claw.agreement_doc.v1",
        "agreement_id": agreement_id,
        "title": title,
        "parties": parties or [],
        "versions": [version],
        "current_version_id": version_id,
    }


def propose_redline(
    *,
    agreement: Dict[str, Any],
    base_version_id: str,
    ops: List[Dict[str, Any]],
    new_content: str,
    created_at: str,
) -> Dict[str, Any]:
    redline_id = f"rd_{canon_sha256_hex({'base': base_version_id, 'ops': ops})[:16]}"
    redline = {"redline_id": redline_id, "base_version_id": base_version_id, "ops": ops}
    content_hash = _sha256_bytes(new_content.encode("utf-8"))
    version_id = f"av_{content_hash[:16]}"
    version = {
        "version_id": version_id,
        "created_at": created_at,
        "content_hash_sha256": content_hash,
        "source_ref": None,
        "redlines": [redline],
    }
    out = dict(agreement)
    out["versions"] = list(agreement.get("versions") or []) + [version]
    return out


def accept_version(
    *,
    agreement: Dict[str, Any],
    version_id: str,
    accepted_at: str,
) -> Dict[str, Any]:
    out = dict(agreement)
    out["current_version_id"] = version_id
    out["accepted_at"] = accepted_at
    return out


def freeze_agreement(*, agreement: Dict[str, Any], frozen_at: str) -> Dict[str, Any]:
    out = dict(agreement)
    out["frozen"] = True
    out["frozen_at"] = frozen_at
    out["frozen_version_id"] = agreement.get("current_version_id")
    return out


def build_dispute_packet(
    *,
    claims: List[str],
    references: List[Dict[str, Any]],
    timelines: Optional[List[Dict[str, Any]]],
    created_at: str,
) -> Dict[str, Any]:
    payload = {
        "schema": "claw.dispute_packet.v1",
        "created_at": created_at,
        "claims": claims,
        "references": references,
        "timelines": timelines or [],
    }
    packet_id = f"dp_{canon_sha256_hex(payload)[:16]}"
    out = dict(payload)
    out["packet_id"] = packet_id
    return out


def export_bundle(
    *,
    out_dir: Path,
    timeline: Dict[str, Any],
    receipt: Dict[str, Any],
    esign_attestation: Dict[str, Any],
    liability_attestation: Dict[str, Any],
    agreement: Dict[str, Any],
    dispute_packet: Optional[Dict[str, Any]] = None,
    verify_md_path: Optional[Path] = None,
    created_at: str,
) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)

    _write_json(out_dir / "sample_timeline.json", timeline)
    _write_json(out_dir / "sample_receipt.json", receipt)
    _write_json(out_dir / "esign_attestation.json", esign_attestation)
    _write_json(out_dir / "personal_liability_attestation.json", liability_attestation)
    _write_json(out_dir / "agreement.json", agreement)
    if dispute_packet is not None:
        _write_json(out_dir / "dispute_packet.json", dispute_packet)

    verify_md = verify_md_path.read_text(encoding="utf-8") if verify_md_path else ""
    if verify_md:
        (out_dir / "VERIFY.md").write_text(verify_md, encoding="utf-8")
    else:
        (out_dir / "VERIFY.md").write_text("", encoding="utf-8")

    (out_dir / "verify.py").write_text(_verify_py(), encoding="utf-8")

    artifacts = []
    for name in [
        "sample_timeline.json",
        "sample_receipt.json",
        "esign_attestation.json",
        "personal_liability_attestation.json",
        "agreement.json",
        "verify.py",
        "VERIFY.md",
    ] + (["dispute_packet.json"] if dispute_packet is not None else []):
        artifacts.append({"path": name, "sha256": _sha256_bytes((out_dir / name).read_bytes())})

    manifest_hash = timeline.get("frozen_manifest_sha256") or timeline.get("manifest", {}).get(
        "manifest_sha256"
    )
    if not manifest_hash:
        raise RuntimeError("timeline missing frozen_manifest_sha256")

    pack_inputs = {
        "schema": "claw.workflow_bundle.v1",
        "created_at": created_at,
        "commitment": manifest_hash,
        "artifacts": artifacts,
        "utilities": {
            "timeline": {
                "timeline_path": "sample_timeline.json",
                "receipt_path": "sample_receipt.json",
                "frozen_manifest_sha256": manifest_hash,
            },
            "e_sign": {"path": "esign_attestation.json"},
            "personal_liability": {"path": "personal_liability_attestation.json"},
            "agreements": {"path": "agreement.json"},
            "dispute": {"path": "dispute_packet.json"} if dispute_packet is not None else None,
        },
    }
    if pack_inputs["utilities"]["dispute"] is None:
        pack_inputs["utilities"].pop("dispute")

    pack = dict(pack_inputs)
    pack["pack_inputs_hash_sha256"] = canon_sha256_hex(pack_inputs)
    _write_json(out_dir / "pack.json", pack)
    return out_dir


def export_timeline_repro_kit(
    *,
    out_dir: Path,
    timeline: Dict[str, Any],
    receipt: Dict[str, Any],
    created_at: str,
    verify_md_path: Optional[Path] = None,
    reference_base_dir: Optional[Path] = None,
) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    _write_json(out_dir / "sample_timeline.json", timeline)
    _write_json(out_dir / "sample_receipt.json", receipt)

    verify_md = verify_md_path.read_text(encoding="utf-8") if verify_md_path else ""
    (out_dir / "VERIFY.md").write_text(verify_md, encoding="utf-8")
    (out_dir / "verify.py").write_text(_verify_py(), encoding="utf-8")

    artifacts = [
        {"path": "sample_timeline.json", "sha256": _sha256_bytes((out_dir / "sample_timeline.json").read_bytes())},
        {"path": "sample_receipt.json", "sha256": _sha256_bytes((out_dir / "sample_receipt.json").read_bytes())},
        {"path": "verify.py", "sha256": _sha256_bytes((out_dir / "verify.py").read_bytes())},
        {"path": "VERIFY.md", "sha256": _sha256_bytes((out_dir / "VERIFY.md").read_bytes())},
    ]

    base_dir = reference_base_dir or Path.cwd()
    for ev in timeline.get("events") or []:
        notice = ev.get("notice") or {}
        refs = notice.get("references") or []
        if not isinstance(refs, list):
            raise RuntimeError("event.notice.references must be a list")
        for ref in refs:
            if not isinstance(ref, dict):
                raise RuntimeError("reference entry must be an object")
            ref_path = ref.get("path")
            ref_sha = ref.get("sha256")
            if not ref_path or not ref_sha:
                raise RuntimeError("reference missing path or sha256")
            ref_path_obj = Path(ref_path)
            if ref_path_obj.is_absolute():
                raise RuntimeError("reference path must be relative")
            src = base_dir / ref_path_obj
            if not src.exists():
                raise RuntimeError(f"reference file missing: {ref_path}")
            dest = out_dir / ref_path_obj
            dest.parent.mkdir(parents=True, exist_ok=True)
            data = src.read_bytes()
            calc = _sha256_bytes(data)
            if calc != ref_sha:
                raise RuntimeError(f"reference sha256 mismatch: {ref_path}")
            dest.write_bytes(data)
            artifacts.append({"path": str(ref_path_obj), "sha256": calc})

    manifest_hash = timeline.get("frozen_manifest_sha256") or timeline.get("manifest", {}).get(
        "manifest_sha256"
    )
    if not manifest_hash:
        raise RuntimeError("timeline missing frozen_manifest_sha256")

    pack_inputs = {
        "schema": "claw.timeline_capture_pack.v1",
        "created_at": created_at,
        "commitment": manifest_hash,
        "artifacts": artifacts,
        "utilities": {
            "timeline": {
                "timeline_path": "sample_timeline.json",
                "receipt_path": "sample_receipt.json",
                "frozen_manifest_sha256": manifest_hash,
            }
        },
    }
    pack = dict(pack_inputs)
    pack["pack_inputs_hash_sha256"] = canon_sha256_hex(pack_inputs)
    _write_json(out_dir / "pack.json", pack)
    return out_dir
