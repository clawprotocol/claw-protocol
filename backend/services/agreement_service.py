from __future__ import annotations

from typing import Any, Dict
import hashlib

from backend.utils.canon_json import canon_sha256_hex, canon_json_bytes
from backend.services import attestation_service

_AGREEMENTS: Dict[str, Dict[str, Any]] = {}


def create_draft(payload: Dict[str, Any]) -> Dict[str, Any]:
    agreement_id = payload.get("agreement_id")
    if not agreement_id:
        seed = {
            "title": payload.get("title"),
            "jurisdiction": payload.get("jurisdiction"),
            "parties": payload.get("parties") or [],
            "effective_date": payload.get("effective_date"),
            "body_markdown": payload.get("body_markdown"),
            "created_at": payload.get("created_at"),
        }
        agreement_id = f"ag_{canon_sha256_hex(seed)[:16]}"
    draft = {
        "agreement_id": agreement_id,
        "title": payload.get("title"),
        "jurisdiction": payload.get("jurisdiction"),
        "parties": payload.get("parties") or [],
        "effective_date": payload.get("effective_date"),
        "body_markdown": payload.get("body_markdown"),
        "redlines": payload.get("redlines") or [],
        "created_at": payload.get("created_at"),
        "updated_at": payload.get("updated_at"),
    }
    _AGREEMENTS[agreement_id] = draft
    return draft


def append_redline(agreement_id: str, redline: Dict[str, Any]) -> Dict[str, Any]:
    draft = _AGREEMENTS.get(agreement_id)
    if not draft:
        raise KeyError("agreement_not_found")
    redlines = list(draft.get("redlines") or [])
    redlines.append(redline)
    draft = dict(draft)
    draft["redlines"] = redlines
    draft["updated_at"] = redline.get("created_at") or draft.get("updated_at")
    _AGREEMENTS[agreement_id] = draft
    return draft


def get_draft(agreement_id: str) -> Dict[str, Any]:
    draft = _AGREEMENTS.get(agreement_id)
    if not draft:
        raise KeyError("agreement_not_found")
    return draft


def export_bundle(agreement_id: str) -> Dict[str, Any]:
    draft = get_draft(agreement_id)
    export_obj = _export_object(draft)
    agreement_json = canon_json_bytes(export_obj).decode("utf-8")
    agreement_md = _to_markdown(draft, export_obj)
    return {
        "agreement_id": agreement_id,
        "agreement_json": agreement_json,
        "agreement_markdown": agreement_md,
        "filename_json": f"{agreement_id}.json",
        "filename_md": f"{agreement_id}.md",
    }


def _export_object(draft: Dict[str, Any]) -> Dict[str, Any]:
    body = draft.get("body_markdown") or ""
    return {
        "agreement_id": draft.get("agreement_id"),
        "title": draft.get("title"),
        "jurisdiction": draft.get("jurisdiction"),
        "parties": draft.get("parties") or [],
        "effective_date": draft.get("effective_date"),
        "body_markdown": body,
        "body_markdown_sha256": _sha256_text(body),
        "redlines": draft.get("redlines") or [],
        "created_at": draft.get("created_at"),
        "updated_at": draft.get("updated_at"),
        "disclaimers": [
            "Draft / non-binding by default.",
            "No legal advice.",
            "Verify jurisdictional enforceability separately.",
        ],
    }


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _to_markdown(draft: Dict[str, Any], export_obj: Dict[str, Any]) -> str:
    parties = "\n".join([f"- {p}" for p in (draft.get("parties") or [])])
    redlines = draft.get("redlines") or []
    redline_md = "\n".join(
        [
            f"- {r.get('change_text')} (by {r.get('author')} @ {r.get('created_at')})\n  - {r.get('rationale')}"
            for r in redlines
        ]
    )
    return (
        f"# {draft.get('title')}\n\n"
        f"**Agreement ID:** {draft.get('agreement_id')}\n\n"
        f"**Jurisdiction:** {draft.get('jurisdiction')}\n\n"
        f"**Effective Date:** {draft.get('effective_date')}\n\n"
        f"**Body SHA-256:** {export_obj.get('body_markdown_sha256')}\n\n"
        f"**Created At:** {draft.get('created_at')}\n\n"
        f"## Disclaimers\n"
        f"- Draft / non-binding by default.\n"
        f"- No legal advice.\n"
        f"- Verify jurisdictional enforceability separately.\n\n"
        f"## Parties\n{parties or '- (none)'}\n\n"
        f"## Body\n{draft.get('body_markdown') or ''}\n\n"
        f"## Redlines\n{redline_md or '- (none)'}\n"
    )


def _normalize_parties(parties: Any) -> list[Dict[str, Any]]:
    normalized: list[Dict[str, Any]] = []
    for p in parties or []:
        party_id = p.get("party_id") or f"party_{canon_sha256_hex({'name': p.get('name'), 'role': p.get('role'), 'contact': p.get('contact')})[:12]}"
        normalized.append(
            {
                "party_id": party_id,
                "name": p.get("name"),
                "role": p.get("role"),
                "contact": p.get("contact"),
            }
        )
    return sorted(
        normalized,
        key=lambda p: (
            (p.get("party_id") or "").lower(),
            (p.get("name") or "").lower(),
            (p.get("role") or "").lower(),
            (p.get("contact") or "").lower(),
        ),
    )


def _normalize_body(text: str) -> str:
    return (text or "").replace("\r\n", "\n").replace("\r", "\n")


def _diff_text(prev_text: str, next_text: str, from_label: str, to_label: str) -> str:
    import difflib

    prev_lines = _normalize_body(prev_text).splitlines()
    next_lines = _normalize_body(next_text).splitlines()
    diff = difflib.unified_diff(
        prev_lines,
        next_lines,
        fromfile=from_label,
        tofile=to_label,
        lineterm="",
    )
    return "\n".join(diff)


def create_agreement_packet(
    *,
    agreement_id: str | None,
    title: str,
    parties: list[Dict[str, Any]],
    inclusion: Dict[str, Any],
    escrow_reference: Dict[str, Any] | None,
    created_at: str,
    updated_at: str,
    analysis: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    normalized_parties = _normalize_parties(parties)
    ag_id = agreement_id or f"ag_{canon_sha256_hex({'title': title, 'parties': normalized_parties, 'created_at': created_at})[:16]}"
    return {
        "schema": "claw.agreement_packet.v1",
        "agreement_id": ag_id,
        "title": title,
        "parties": normalized_parties,
        "versions": [],
        "inclusion": {
            "include_diffs_in_bundle": bool(inclusion.get("include_diffs_in_bundle", True)),
            "include_private_notes_in_bundle": bool(
                inclusion.get("include_private_notes_in_bundle", False)
            ),
        },
        "escrow_reference": escrow_reference,
        "analysis": analysis,
        "created_at": created_at,
        "updated_at": updated_at,
    }


def add_version(
    *,
    packet: Dict[str, Any],
    author_party_id: str,
    body_text: str,
    created_at: str,
    content_type: str,
    notes: str | None = None,
) -> Dict[str, Any]:
    body = _normalize_body(body_text)
    body_sha256 = canon_sha256_hex(body)
    prev_versions = list(packet.get("versions") or [])
    prev_version = prev_versions[-1] if prev_versions else None
    prev_version_id = prev_version.get("version_id") if prev_version else None
    version_id = f"av_{canon_sha256_hex({'agreement_id': packet.get('agreement_id'), 'body_sha256': body_sha256, 'prev_version_id': prev_version_id, 'author_party_id': author_party_id, 'created_at': created_at, 'content_type': content_type})[:16]}"
    diff_from_prev = (
        _diff_text(prev_version.get("body_text") or "", body, prev_version_id or "v0", version_id)
        if prev_version
        else ""
    )
    version = {
        "version_id": version_id,
        "created_at": created_at,
        "author_party_id": author_party_id,
        "content_type": content_type,
        "body_text": body,
        "body_sha256": body_sha256,
        "prev_version_id": prev_version_id,
        "diff_from_prev": diff_from_prev,
        "notes": notes,
    }
    out = dict(packet)
    out["parties"] = _normalize_parties(packet.get("parties") or [])
    out["versions"] = prev_versions + [version]
    out["updated_at"] = created_at
    return out


def finalize_agreement(*, packet: Dict[str, Any], finalized_at: str) -> Dict[str, Any]:
    inclusion = packet.get("inclusion") or {}
    include_diffs = bool(inclusion.get("include_diffs_in_bundle", True))
    include_notes = bool(inclusion.get("include_private_notes_in_bundle", False))
    versions = []
    for v in packet.get("versions") or []:
        item = {
            "version_id": v.get("version_id"),
            "created_at": v.get("created_at"),
            "author_party_id": v.get("author_party_id"),
            "content_type": v.get("content_type"),
            "body_text": v.get("body_text"),
            "body_sha256": v.get("body_sha256"),
            "prev_version_id": v.get("prev_version_id"),
        }
        if include_diffs:
            item["diff_from_prev"] = v.get("diff_from_prev")
        if include_notes and v.get("notes"):
            item["notes"] = v.get("notes")
        versions.append(item)
    payload: Dict[str, Any] = {
        "schema": "claw.agreement_packet.v1",
        "agreement_id": packet.get("agreement_id"),
        "title": packet.get("title"),
        "parties": _normalize_parties(packet.get("parties") or []),
        "versions": versions,
        "inclusion": inclusion,
        "escrow_reference": packet.get("escrow_reference"),
        "created_at": packet.get("created_at"),
        "updated_at": packet.get("updated_at"),
    }
    analysis = packet.get("analysis")
    if analysis and analysis.get("include_in_bundle"):
        party_ids = [p.get("party_id") for p in payload.get("parties") or [] if p.get("party_id")]
        opt_in = analysis.get("opt_in_party_ids") or []
        if all(pid in opt_in for pid in party_ids):
            payload["analysis"] = analysis
    signer_metadata = {"id": "agreement_packet", "name": "CLAW Agreement Packet"}
    return attestation_service.create_attestation(
        "agreement",
        payload,
        signer_metadata,
        finalized_at,
    )
