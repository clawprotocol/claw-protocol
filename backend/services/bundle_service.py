from __future__ import annotations

import hashlib
import json
import io
import os
import tempfile
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from backend.utils.canon_json import canon_sha256_hex


def _write_json(path: Path, obj: Dict[str, Any]) -> None:
    path.write_text(json.dumps(obj, indent=2, sort_keys=True), encoding="utf-8")


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _canon_hash(obj: Dict[str, Any]) -> str:
    return canon_sha256_hex(obj)


def _sorted_evidence(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(items, key=lambda x: x.get("path", ""))


def _bundle_contents_md(
    *,
    created_at: str,
    timeline_id: Optional[str],
    epoch_id: Optional[str],
    attestations: List[Dict[str, Any]],
    agreement_ref: Optional[Dict[str, Any]],
    analysis_ref: Optional[Dict[str, Any]],
    notes_included: bool,
    extra_files: Optional[List[str]] = None,
) -> str:
    protocol_version = os.getenv("CLAW_PROTOCOL_VERSION", "claw-v1")
    api_version = os.getenv("CLAW_API_VERSION", "v1")
    lines = [
        "# Bundle Contents",
        "",
        f"created_at: {created_at}",
        f"timeline_id: {timeline_id or ''}",
        f"epoch_id: {epoch_id or ''}",
        f"protocol_version: {protocol_version}",
        f"api_version: {api_version}",
        f"notes_included: {'true' if notes_included else 'false'}",
        "",
        "included_artifacts:",
        "- evidence/timeline.json",
        "- frozen_manifest (embedded in evidence/timeline.json)",
        "- receipt.json",
    ]
    if attestations:
        for ref in attestations:
            lines.append(f"- {ref.get('path')}")
    if agreement_ref:
        lines.append("- evidence/agreement.json")
    if analysis_ref:
        lines.append("- evidence/analysis.json")
    if extra_files:
        for name in extra_files:
            lines.append(f"- {name}")
    if not attestations and not agreement_ref and not analysis_ref:
        lines.append("- (no additional artifacts)")
    lines += [
        "",
        "boundary:",
        "- Evidence-only. Not legal advice.",
        "- Not enforcement or adjudication.",
    ]
    return "\n".join(lines) + "\n"


def compose_bundle(
    *,
    created_at: str,
    timeline_id: str,
    frozen_manifest_sha256: str,
    timeline_path: str,
    evidence: List[Dict[str, Any]],
    attestations: Optional[List[Dict[str, Any]]],
    agreement_ref: Optional[Dict[str, Any]],
    analysis_ref: Optional[Dict[str, Any]],
    note: Optional[str] = None,
) -> Dict[str, Any]:
    hashed = {
        "created_at": created_at,
        "timeline": {
            "timeline_id": timeline_id,
            "frozen_manifest_sha256": frozen_manifest_sha256,
            "path": timeline_path,
        },
        "attestations": _sorted_evidence(attestations or []),
        "agreement_ref": agreement_ref,
        "analysis_ref": analysis_ref,
        "evidence": _sorted_evidence(evidence),
    }
    sha = _canon_hash(hashed)
    bundle_id = f"bundle_{sha[:16]}"
    bundle = {
        "schema": "claw.bundle.v0",
        "bundle_id": bundle_id,
        "hashed": hashed,
        "hashes": {"sha256": sha},
        "manifests": {"sha256": "manifests/sha256.json"},
        "ordering": {"canonical_json": "utf-8", "sort_keys": True, "separators": ",:"},
    }
    if note:
        bundle["meta"] = {"note": note}
    return bundle


def _write_manifest(manifest_path: Path, files: List[Tuple[str, Path]]) -> None:
    entries = []
    for rel, path in files:
        entries.append({"path": rel, "sha256": _sha256_bytes(path.read_bytes())})
    entries = sorted(entries, key=lambda x: x["path"])
    _write_json(manifest_path, {"files": entries})


def export_bundle_dir(
    *,
    out_dir: Path,
    created_at: str,
    timeline: Dict[str, Any],
    receipt: Dict[str, Any],
    attestations: Optional[List[Dict[str, Any]]],
    agreement: Optional[Dict[str, Any]],
    analysis: Optional[Dict[str, Any]],
    note: Optional[str] = None,
    agreement_id: Optional[str] = None,
    agreement_version: Optional[int] = None,
    agreement_diff: Optional[Dict[str, int]] = None,
) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    evidence_dir = out_dir / "evidence"
    manifest_dir = out_dir / "manifests"
    evidence_dir.mkdir(parents=True, exist_ok=True)
    manifest_dir.mkdir(parents=True, exist_ok=True)

    timeline_path = evidence_dir / "timeline.json"
    _write_json(timeline_path, timeline)
    timeline_sha = _sha256_bytes(timeline_path.read_bytes())
    frozen_manifest = timeline.get("frozen_manifest_sha256")
    if not frozen_manifest:
        raise RuntimeError("timeline missing frozen_manifest_sha256")

    evidence: List[Dict[str, Any]] = [
        {"path": "evidence/timeline.json", "sha256": timeline_sha, "type": "timeline"}
    ]
    att_refs: List[Dict[str, Any]] = []

    notes_included = False
    if attestations:
        for idx, att in enumerate(attestations):
            if not att:
                continue
            att_type = att.get("type") or "attestation"
            name = f"attestation_{att_type}_{idx+1}.json"
            att_path = evidence_dir / name
            _write_json(att_path, att)
            att_sha = _sha256_bytes(att_path.read_bytes())
            ref = {"path": f"evidence/{name}", "sha256": att_sha, "type": att_type}
            evidence.append(ref)
            att_refs.append(ref)
            if isinstance(att, dict) and att.get("structuring_notes"):
                notes_included = True

    agreement_ref = None
    if agreement is not None:
        ag_path = evidence_dir / "agreement.json"
        _write_json(ag_path, agreement)
        ag_sha = _sha256_bytes(ag_path.read_bytes())
        agreement_ref = {"path": "evidence/agreement.json", "sha256": ag_sha}
        evidence.append({"path": "evidence/agreement.json", "sha256": ag_sha, "type": "agreement"})

    analysis_ref = None
    if analysis is not None:
        an_path = evidence_dir / "analysis.json"
        _write_json(an_path, analysis)
        an_sha = _sha256_bytes(an_path.read_bytes())
        analysis_ref = {"path": "evidence/analysis.json", "sha256": an_sha}
        evidence.append({"path": "evidence/analysis.json", "sha256": an_sha, "type": "analysis"})

    extra_files: List[Tuple[str, Path]] = []
    extra_list: List[str] = []
    if agreement_version is not None:
        from backend.utils.agreement_version_store import AgreementVersionStore

        ag_id = agreement_id or (agreement or {}).get("agreement_id")
        if not ag_id:
            raise RuntimeError("agreement_id required for agreement_version export")
        store = AgreementVersionStore()
        version = store.get_version(agreement_id=ag_id, version=agreement_version)
        ag_dir = out_dir / "agreements" / ag_id
        ag_dir.mkdir(parents=True, exist_ok=True)
        md_path = ag_dir / f"v{agreement_version}.md"
        md_path.write_text(version.get("body_markdown") or "", encoding="utf-8")
        meta = {
            "agreement_id": ag_id,
            "version": agreement_version,
            "created_at": version.get("created_at"),
            "title": version.get("title"),
            "body_sha256": version.get("body_sha256"),
            "disclaimers": version.get("disclaimers") or [],
            "metadata": version.get("metadata"),
        }
        json_path = ag_dir / f"v{agreement_version}.json"
        _write_json(json_path, meta)
        extra_files.extend(
            [
                (f"agreements/{ag_id}/v{agreement_version}.md", md_path),
                (f"agreements/{ag_id}/v{agreement_version}.json", json_path),
            ]
        )
        extra_list.extend(
            [
                f"agreements/{ag_id}/v{agreement_version}.md",
                f"agreements/{ag_id}/v{agreement_version}.json",
            ]
        )

    if agreement_diff:
        from backend.utils.agreement_version_store import AgreementVersionStore

        ag_id = agreement_id or (agreement or {}).get("agreement_id")
        if not ag_id:
            raise RuntimeError("agreement_id required for agreement_diff export")
        store = AgreementVersionStore()
        diff = store.diff_versions(
            agreement_id=ag_id,
            from_version=int(agreement_diff.get("from_version")),
            to_version=int(agreement_diff.get("to_version")),
        )
        ag_dir = out_dir / "agreements" / ag_id
        ag_dir.mkdir(parents=True, exist_ok=True)
        patch_name = f"diff_v{agreement_diff.get('from_version')}_v{agreement_diff.get('to_version')}.patch"
        patch_path = ag_dir / patch_name
        patch_path.write_text(diff.get("diff_text") or "", encoding="utf-8")
        meta = {
            "agreement_id": ag_id,
            "from_version": agreement_diff.get("from_version"),
            "to_version": agreement_diff.get("to_version"),
            "diff_sha256": diff.get("diff_sha256"),
        }
        json_name = patch_name.replace(".patch", ".json")
        json_path = ag_dir / json_name
        _write_json(json_path, meta)
        extra_files.extend(
            [
                (f"agreements/{ag_id}/{patch_name}", patch_path),
                (f"agreements/{ag_id}/{json_name}", json_path),
            ]
        )
        extra_list.extend(
            [
                f"agreements/{ag_id}/{patch_name}",
                f"agreements/{ag_id}/{json_name}",
            ]
        )

    bundle = compose_bundle(
        created_at=created_at,
        timeline_id=timeline.get("timeline_id", ""),
        frozen_manifest_sha256=frozen_manifest,
        timeline_path="evidence/timeline.json",
        evidence=evidence,
        attestations=att_refs,
        agreement_ref=agreement_ref,
        analysis_ref=analysis_ref,
        note=note,
    )
    _write_json(out_dir / "bundle.json", bundle)

    receipt_obj = {
        "schema": "claw.bundle_receipt.v0",
        "receipt_id": f"rcpt_{bundle['hashes']['sha256'][:16]}",
        "commitment": bundle["hashes"]["sha256"],
        "issued_at": receipt.get("issued_at") or created_at,
        "network": None,
        "epoch_id": None,
        "btc_txid": None,
        "merkle_proof": [],
        "zk_proof_refs": None,
    }
    _write_json(out_dir / "receipt.json", receipt_obj)

    readme = (
        "# CLAW Bundle v0\n\n"
        "This bundle is evidence-only and non-binding.\n\n"
        "Verification is cryptographic and file-based. Run verify.py for authoritative verification.\n"
    )
    (out_dir / "README.md").write_text(readme, encoding="utf-8")

    contents_md = _bundle_contents_md(
        created_at=created_at,
        timeline_id=timeline.get("timeline_id"),
        epoch_id=receipt.get("epoch_id"),
        attestations=att_refs,
        agreement_ref=agreement_ref,
        analysis_ref=analysis_ref,
        notes_included=notes_included,
        extra_files=extra_list,
    )
    (out_dir / "BUNDLE_CONTENTS.md").write_text(contents_md, encoding="utf-8")

    files = [
        ("bundle.json", out_dir / "bundle.json"),
        ("receipt.json", out_dir / "receipt.json"),
        ("README.md", out_dir / "README.md"),
        ("BUNDLE_CONTENTS.md", out_dir / "BUNDLE_CONTENTS.md"),
    ]
    for item in evidence:
        files.append((item["path"], out_dir / item["path"]))
    for rel, path in extra_files:
        files.append((rel, path))
    _write_manifest(manifest_dir / "sha256.json", files)
    return out_dir


def _validate_bundle_schema(bundle: Dict[str, Any]) -> Tuple[bool, str]:
    required = {"schema", "bundle_id", "hashed", "hashes"}
    if not required.issubset(bundle.keys()):
        missing = sorted(list(required - set(bundle.keys())))
        return False, f"missing required fields: {', '.join(missing)}"
    if bundle.get("schema") != "claw.bundle.v0":
        return False, "schema must be claw.bundle.v0"
    if not isinstance(bundle.get("hashed"), dict):
        return False, "bundle.hashed must be object"
    if not isinstance(bundle.get("hashes"), dict):
        return False, "bundle.hashes must be object"
    if "sha256" not in bundle["hashes"]:
        return False, "bundle.hashes.sha256 missing"
    return True, "ok"


def _collect_files(bundle_dir: Path) -> List[str]:
    files: List[str] = []
    for path in sorted(bundle_dir.rglob("*")):
        if path.is_file():
            rel = path.relative_to(bundle_dir).as_posix()
            files.append(rel)
    return files


def verify_bundle_dir(bundle_dir: Path) -> Dict[str, Any]:
    bundle_path = bundle_dir / "bundle.json"
    receipt_path = bundle_dir / "receipt.json"
    manifest_path = bundle_dir / "manifests" / "sha256.json"
    checks: List[Dict[str, Any]] = []
    if not bundle_path.exists() or not receipt_path.exists() or not manifest_path.exists():
        return {
            "ok": False,
            "checks": [{"name": "required files present", "ok": False}],
            "summary": {"error": "missing_bundle_files"},
            "recomputed": {},
        }

    bundle = json.loads(bundle_path.read_text(encoding="utf-8"))
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    schema_ok, schema_msg = _validate_bundle_schema(bundle)
    checks.append({"name": "bundle schema", "ok": schema_ok, "detail": schema_msg})

    hashed = bundle.get("hashed")
    if not isinstance(hashed, dict):
        checks.append({"name": "bundle.hashed present", "ok": False})
        return {
            "ok": False,
            "checks": checks,
            "summary": {"error": "bundle.hashed missing"},
            "recomputed": {},
        }
    recomputed = _canon_hash(hashed)
    hash_ok = recomputed == bundle.get("hashes", {}).get("sha256")
    checks.append({"name": "bundle hash", "ok": hash_ok, "detail": recomputed})

    rcpt_ok = receipt.get("commitment") == recomputed
    checks.append({"name": "receipt commitment", "ok": rcpt_ok})

    files = manifest.get("files") or []
    bundle_entry_ok = False
    manifest_paths = []
    for entry in files:
        rel = entry.get("path")
        expected = entry.get("sha256")
        if not rel or not expected:
            checks.append({"name": "manifest entry valid", "ok": False})
            return {
                "ok": False,
                "checks": checks,
                "summary": {"error": "manifest entry invalid"},
                "recomputed": {"bundle_hash": recomputed},
            }
        manifest_paths.append(rel)
        if rel == "bundle.json":
            bundle_entry_ok = True
        path = bundle_dir / rel
        if not path.exists():
            checks.append({"name": f"file present: {rel}", "ok": False})
            continue
        actual = _sha256_bytes(path.read_bytes())
        ok = actual == expected
        checks.append({"name": f"sha256: {rel}", "ok": ok})
    checks.append({"name": "bundle.json in manifest", "ok": bundle_entry_ok})

    manifest_set = set(manifest_paths)
    actual_set = set(_collect_files(bundle_dir))
    actual_set.discard("manifests/sha256.json")
    missing = sorted(list(manifest_set - actual_set))
    extra = sorted(list(actual_set - manifest_set))
    checks.append({"name": "missing files", "ok": len(missing) == 0, "detail": ",".join(missing)})
    checks.append({"name": "extra files", "ok": len(extra) == 0, "detail": ",".join(extra)})

    ok = all(c.get("ok") is True for c in checks)
    return {
        "ok": ok,
        "checks": checks,
        "summary": {"bundle_hash": recomputed},
        "recomputed": {"bundle_hash": recomputed},
    }


def export_bundle_zip(
    *,
    created_at: str,
    timeline: Dict[str, Any],
    receipt: Dict[str, Any],
    attestations: Optional[List[Dict[str, Any]]],
    agreement: Optional[Dict[str, Any]],
    analysis: Optional[Dict[str, Any]],
    note: Optional[str] = None,
    agreement_id: Optional[str] = None,
    agreement_version: Optional[int] = None,
    agreement_diff: Optional[Dict[str, int]] = None,
) -> bytes:
    with tempfile.TemporaryDirectory() as td:
        bundle_dir = Path(td) / "bundle"
        export_bundle_dir(
            out_dir=bundle_dir,
            created_at=created_at,
            timeline=timeline,
            receipt=receipt,
            attestations=attestations,
            agreement=agreement,
            analysis=analysis,
            note=note,
            agreement_id=agreement_id,
            agreement_version=agreement_version,
            agreement_diff=agreement_diff,
        )
        buf = _zip_dir(bundle_dir)
    return buf


def verify_bundle_zip(zip_bytes: bytes) -> Dict[str, Any]:
    validation = _validate_zip_bytes(zip_bytes)
    if not validation["ok"]:
        return {
            "ok": False,
            "checks": validation["checks"],
            "summary": {"error": "zip_validation_failed"},
            "recomputed": {},
        }
    with tempfile.TemporaryDirectory() as td:
        bundle_dir = Path(td) / "bundle"
        bundle_dir.mkdir(parents=True, exist_ok=True)
        try:
            with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
                zf.extractall(bundle_dir)
            return verify_bundle_dir(bundle_dir)
        except Exception as e:
            return {
                "ok": False,
                "checks": [{"name": "zip extract", "ok": False, "detail": str(e)}],
                "summary": {"error": "zip_extract_failed"},
                "recomputed": {},
            }


def _zip_dir(bundle_dir: Path) -> bytes:
    import io

    mem = io.BytesIO()
    with zipfile.ZipFile(mem, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(bundle_dir.rglob("*")):
            if path.is_file():
                rel = path.relative_to(bundle_dir).as_posix()
                info = zipfile.ZipInfo(rel)
                info.date_time = (1980, 1, 1, 0, 0, 0)
                data = path.read_bytes()
                zf.writestr(info, data)
    return mem.getvalue()


def _validate_zip_bytes(zip_bytes: bytes) -> Dict[str, Any]:
    max_zip = int(os.getenv("CLAW_BUNDLE_MAX_ZIP_BYTES", "10485760"))
    max_unzipped = int(os.getenv("CLAW_BUNDLE_MAX_UNZIPPED_BYTES", "52428800"))
    max_files = int(os.getenv("CLAW_BUNDLE_MAX_FILES", "500"))
    checks: List[Dict[str, Any]] = []

    size_ok = len(zip_bytes) <= max_zip
    checks.append({"name": "zip size", "ok": size_ok, "detail": str(len(zip_bytes))})
    if not size_ok:
        return {"ok": False, "checks": checks}

    total_unzipped = 0
    file_count = 0
    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
            for info in zf.infolist():
                file_count += 1
                if file_count > max_files:
                    checks.append({"name": "file count", "ok": False, "detail": str(file_count)})
                    return {"ok": False, "checks": checks}

                name = info.filename
                if name.startswith("/") or name.startswith("\\") or ".." in Path(name).parts:
                    checks.append({"name": "path traversal", "ok": False, "detail": name})
                    return {"ok": False, "checks": checks}

                is_symlink = (info.external_attr >> 16) & 0o120000 == 0o120000
                if is_symlink:
                    checks.append({"name": "symlink rejected", "ok": False, "detail": name})
                    return {"ok": False, "checks": checks}

                total_unzipped += info.file_size
                if total_unzipped > max_unzipped:
                    checks.append(
                        {"name": "unzipped size", "ok": False, "detail": str(total_unzipped)}
                    )
                    return {"ok": False, "checks": checks}
    except Exception as e:
        checks.append({"name": "zip read", "ok": False, "detail": str(e)})
        return {"ok": False, "checks": checks}

    checks.append({"name": "file count", "ok": True, "detail": str(file_count)})
    checks.append({"name": "unzipped size", "ok": True, "detail": str(total_unzipped)})
    return {"ok": True, "checks": checks}
