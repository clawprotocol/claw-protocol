"""
Signing placement readiness — bridges reviewed layout fields to a future signing workflow.

Does not modify uploaded bytes or merge into proof stores; placement manifest is an overlay only.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.document_layout.confidence_policy import (
    candidate_policy_snapshot,
    effective_placement_field_type,
    is_critical_field_type,
)
from backend.document_layout.events import emit_document_layout_event

SIGNER_ROLES = frozenset({"signer", "counterparty", "sender", "recipient", "unknown"})

_PLACEMENT_SCHEMA = "claw.document_layout.signing_placement/v1"


def normalize_signer_role(raw: Optional[str]) -> str:
    s = (raw or "").strip().lower()
    if s in SIGNER_ROLES:
        return s
    return "unknown"


def _bbox_sort_key(b: Optional[Dict[str, Any]]) -> tuple:
    if not isinstance(b, dict):
        return (0, 0.0, 0.0)
    try:
        return (
            0,
            float(b.get("y", 0)),
            float(b.get("x", 0)),
        )
    except (TypeError, ValueError):
        return (0, 0.0, 0.0)


def _manifest_fields_sorted(fields: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(
        fields,
        key=lambda f: (int(f.get("page_number") or 1),) + _bbox_sort_key(f.get("bbox_normalized")),
    )


def attach_signing_placement_metadata(fields: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Assign field_order and ensure signing-facing keys exist (mutates copies)."""
    out: List[Dict[str, Any]] = []
    for order, f in enumerate(_manifest_fields_sorted(list(fields))):
        row = dict(f)
        row["field_order"] = order
        ft = str(row.get("field_type") or "unknown_line")
        row["field_type"] = ft
        row["required"] = bool(is_critical_field_type(ft))
        row["optional"] = not row["required"]
        sr = normalize_signer_role(str(row.get("signer_role") or "unknown"))
        row["signer_role"] = sr
        inc = str(row.get("inclusion_reason") or "")
        if inc in ("user_confirmed",):
            row["source"] = "confirmed"
        elif inc in ("user_corrected",):
            row["source"] = "corrected"
        elif inc in ("manual",):
            row["source"] = "manually_added"
        elif inc in ("non_critical_autopass",):
            row["source"] = "suggested_autopass"
        else:
            row["source"] = "unknown"
        rs = str(row.get("review_state") or "")
        src = str(row.get("source") or "")
        row["placement_ready"] = rs in ("confirmed", "corrected", "manually_added") and src != "suggested_autopass"
        out.append(row)
    return out


def _document_metadata(data: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "schema": _PLACEMENT_SCHEMA,
        "analysis_id": data.get("analysis_id"),
        "document_id_ref": data.get("document_id_ref"),
        "content_sha256_analyzed": data.get("content_sha256_analyzed"),
        "page_count": data.get("page_count"),
        "layout_schema_version": data.get("schema_version"),
        "note": (
            "Original uploaded file is unchanged. Placement data is a structured overlay only — "
            "not merged into deterministic signed proofs until the signing workflow consumes it."
        ),
    }


def compute_signing_readiness(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Derive human-readable summary and blocker lists from analysis + review state.
    """
    rm = data.get("review_manifest") if isinstance(data.get("review_manifest"), dict) else {}
    resolutions: Dict[str, Any] = rm.get("candidate_resolutions") if isinstance(rm.get("candidate_resolutions"), dict) else {}
    downstream = (
        rm.get("downstream_field_manifest")
        if isinstance(rm.get("downstream_field_manifest"), dict)
        else {}
    )
    fields_raw = list(downstream.get("fields") or [])
    fields = attach_signing_placement_metadata(fields_raw)

    placement_ready = [f for f in fields if f.get("placement_ready")]
    critical_suggested = 0
    review_unresolved = 0
    critical_types_unconfirmed: set[str] = set()
    issues: List[str] = []

    for c in data.get("field_candidates") or []:
        if not isinstance(c, dict):
            continue
        cid = str(c.get("candidate_id") or "")
        if not cid:
            continue
        res = resolutions.get(cid) or {}
        state = str(res.get("state") or "suggested")
        pv = candidate_policy_snapshot(c)
        ft = effective_placement_field_type(pv)
        if state == "suggested" and bool(pv.get("review_required")):
            review_unresolved += 1
        if is_critical_field_type(ft) and state == "suggested":
            critical_suggested += 1
            critical_types_unconfirmed.add(ft)

    if critical_suggested:
        if "signature_line" in critical_types_unconfirmed:
            issues.append("Confirm or correct the signature line on the document")
        if "date_line" in critical_types_unconfirmed:
            issues.append("Confirm or correct the date field")
        if "printed_name_line" in critical_types_unconfirmed:
            issues.append("Confirm or correct the legal / printed name line")
        if "initials_line" in critical_types_unconfirmed:
            issues.append("Confirm or correct the initials field")
        if not issues:
            issues.append(f"{critical_suggested} critical signing field(s) still need confirmation")

    if review_unresolved:
        issues.insert(0, f"{review_unresolved} highlighted field(s) still need review")

    sig_ok = any(
        f.get("field_type") == "signature_line" and f.get("placement_ready") for f in fields
    )
    date_ok = any(
        f.get("field_type") == "date_line" and f.get("placement_ready") for f in fields
    )
    initials_ok = any(
        f.get("field_type") == "initials_line" and f.get("placement_ready") for f in fields
    )
    printed_ok = any(
        f.get("field_type") == "printed_name_line" and f.get("placement_ready") for f in fields
    )

    highlights: List[str] = []
    if sig_ok:
        highlights.append("Signature placement is reviewed and structurally mapped")
    if date_ok:
        highlights.append("Date placement is reviewed and structurally mapped")
    if printed_ok:
        highlights.append("Legal name line is reviewed and structurally mapped")
    if initials_ok:
        highlights.append("Initials placement is reviewed and structurally mapped")

    unknown_role_placement_count = sum(
        1
        for f in placement_ready
        if normalize_signer_role(str(f.get("signer_role"))) == "unknown"
    )
    critical_ready_unknown_role = sum(
        1
        for f in placement_ready
        if bool(f.get("required")) and normalize_signer_role(str(f.get("signer_role"))) == "unknown"
    )

    blockers: List[str] = []
    if review_unresolved:
        blockers.append(f"{review_unresolved} review-required detection(s) still in suggested state")
    if critical_suggested:
        blockers.append(
            f"{critical_suggested} critical signing field(s) detected but not confirmed or corrected"
        )

    signing_ready = len(blockers) == 0

    role_clarity_note: Optional[str] = None
    if critical_ready_unknown_role:
        role_clarity_note = (
            f"{critical_ready_unknown_role} required signing field(s) still have party role unset — "
            "pick Signer, Sender, or Recipient in the sidebar so routing stays clear in the next step."
        )
    elif unknown_role_placement_count and signing_ready:
        role_clarity_note = (
            "Optional: assign signer / party roles on mapped fields to make multi-party routing obvious later."
        )

    if signing_ready and placement_ready:
        headline = "Ready for signing prep"
        handoff_line = (
            "Field mapping is clean enough to carry into CLAW’s structured completion and signing flow — "
            "placements stay an overlay on your original file until execution."
        )
    elif signing_ready and not placement_ready:
        headline = "No confirmed placements yet"
        handoff_line = "Confirm at least one field on the page (or add a marker) so signing prep has anchors to work from."
    else:
        headline = "Not ready for signing prep"
        handoff_line = "Finish the checklist below — city letters and forms usually need signature, date, and often name or initials."

    summary_messages = [headline] + [m for m in issues if m and m != headline] + [m for m in highlights if m]

    return {
        "signing_ready": signing_ready,
        "headline": headline,
        "handoff_line": handoff_line,
        "summary_messages": summary_messages,
        "readiness_highlights": highlights,
        "blocking_prompts": issues,
        "role_clarity_note": role_clarity_note,
        "unknown_role_placement_count": unknown_role_placement_count,
        "critical_ready_unknown_role_count": critical_ready_unknown_role,
        "placement_ready_count": len(placement_ready),
        "review_required_unresolved_count": review_unresolved,
        "critical_fields_missing_count": critical_suggested,
        "critical_types_unconfirmed": sorted(critical_types_unconfirmed),
        "blockers": blockers,
        "placement_manifest": fields,
    }


def build_signing_prep_response(data: Dict[str, Any], *, analysis_id: str) -> Dict[str, Any]:
    """Full signing-prep payload for API (no persistence side effects)."""
    readiness_full = compute_signing_readiness(data)
    placement_manifest = readiness_full["placement_manifest"]
    readiness = {k: v for k, v in readiness_full.items() if k != "placement_manifest"}
    payload = {
        "ok": True,
        "document": _document_metadata(data),
        "placement_manifest": placement_manifest,
        "signing_ready": readiness_full["signing_ready"],
        "unresolved_blockers": readiness_full["blockers"],
        "critical_fields_missing": readiness_full["critical_types_unconfirmed"],
        "review_required_unresolved_count": readiness_full["review_required_unresolved_count"],
        "readiness": readiness,
    }
    emit_document_layout_event("signing_prep_requested", analysis_id=analysis_id)
    if payload["signing_ready"]:
        emit_document_layout_event(
            "signing_prep_ready",
            analysis_id=analysis_id,
            placement_ready_count=readiness_full["placement_ready_count"],
        )
    else:
        emit_document_layout_event(
            "signing_prep_blocked",
            analysis_id=analysis_id,
            blockers=readiness_full["blockers"],
            critical_missing=readiness_full["critical_types_unconfirmed"],
        )
    return payload
