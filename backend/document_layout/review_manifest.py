"""
User review state for layout field candidates — separate from proof / signed artifacts.

Original `field_candidates` are never mutated; resolutions live under `review_manifest`.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Literal, Optional, Tuple

from backend.document_layout.confidence_policy import (
    annotate_candidate,
    candidate_policy_snapshot,
    compute_effective_confidence,
    effective_placement_field_type,
    is_critical_field_type,
    placement_threshold_for_type,
)
from backend.document_layout.events import emit_document_layout_event
from backend.document_layout.signing_prep import (
    attach_signing_placement_metadata,
    compute_signing_readiness,
    normalize_signer_role,
)
from backend.document_layout.store import save_layout_analysis

ReviewState = Literal["suggested", "confirmed", "corrected", "rejected", "manually_added"]

ALLOWED_FIELD_TYPES = frozenset(
    {
        "signature_line",
        "printed_name_line",
        "date_line",
        "initials_line",
        "text_field",
        "amount_blank",
        "freeform_blank_line",
        "checkbox_like",
        "unknown_line",
        "body_text",
    }
)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _ensure_manifest(data: Dict[str, Any]) -> Dict[str, Any]:
    rm = data.get("review_manifest")
    if not isinstance(rm, dict):
        rm = {}
    rm.setdefault("version", 1)
    rm.setdefault("candidate_resolutions", {})
    if not isinstance(rm["candidate_resolutions"], dict):
        rm["candidate_resolutions"] = {}
    rm.setdefault("manual_fields", [])
    if not isinstance(rm["manual_fields"], list):
        rm["manual_fields"] = []
    data["review_manifest"] = rm
    return rm


def _validate_norm_bbox(b: Dict[str, Any]) -> Tuple[float, float, float, float]:
    x = float(b.get("x", -1))
    y = float(b.get("y", -1))
    w = float(b.get("width", -1))
    h = float(b.get("height", -1))
    if min(x, y, w, h) < 0 or max(x + w, y + h) > 1.001:
        raise ValueError("invalid_normalized_bbox")
    return x, y, w, h


def rebuild_downstream_field_manifest(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Structured list for workflows (not proof).

    Ready rows:
    - User confirmed / corrected / manual — always ``ready_for_downstream``.
    - Suggested detections only when ``auto_usable`` and non-critical (automation pass-through).
    Critical signing fields require user confirmation unless policy snapshot shows exceptional strength.
    """
    rm = _ensure_manifest(data)
    resolutions: Dict[str, Any] = rm["candidate_resolutions"]
    fields: List[Dict[str, Any]] = []
    aid = str(data.get("analysis_id") or "")
    blocked_by_confidence = 0

    for c in data.get("field_candidates") or []:
        cid = str(c.get("candidate_id") or "")
        if not cid:
            continue
        res = resolutions.get(cid) or {}
        state = str(res.get("state") or "suggested")
        if state == "rejected":
            continue
        pv = candidate_policy_snapshot(c if isinstance(c, dict) else {})
        ec = compute_effective_confidence(pv)
        eff_det = effective_placement_field_type(pv)
        th_det = placement_threshold_for_type(eff_det)
        crit_det = is_critical_field_type(eff_det)
        label = res.get("label")
        if label is None:
            label = c.get("label_text")

        if state in ("confirmed", "corrected"):
            ft = str(res.get("field_type") or c.get("field_type_guess") or "unknown_line")
            sr = normalize_signer_role(str(res.get("signer_role") or "unknown"))
            fields.append(
                {
                    "ref": f"candidate:{cid}",
                    "manifest_origin": "detection",
                    "review_state": state,
                    "page_number": c.get("page_number"),
                    "bbox_normalized": c.get("bbox_normalized"),
                    "bbox_pdf": c.get("bbox_pdf"),
                    "field_type": ft,
                    "label": label,
                    "signer_role": sr,
                    "confidence": pv.get("confidence_score", pv.get("confidence")),
                    "geometry_confidence": pv.get("geometry_confidence"),
                    "confidence_band": pv.get("confidence_band"),
                    "auto_usable": bool(pv.get("auto_usable")),
                    "review_required": bool(pv.get("review_required")),
                    "detection_effective_confidence": round(ec, 4),
                    "critical_field": is_critical_field_type(ft),
                    "low_confidence_at_detection": bool(crit_det and ec < th_det),
                    "ready_for_downstream": True,
                    "inclusion_reason": "user_confirmed" if state == "confirmed" else "user_corrected",
                }
            )
            continue

        if state == "suggested":
            if crit_det:
                blocked_by_confidence += 1
                continue
            if not bool(pv.get("auto_usable")):
                blocked_by_confidence += 1
                continue
            ft = str(c.get("field_type_guess") or "unknown_line")
            fields.append(
                {
                    "ref": f"candidate:{cid}",
                    "source": "detection",
                    "review_state": "suggested",
                    "page_number": c.get("page_number"),
                    "bbox_normalized": c.get("bbox_normalized"),
                    "bbox_pdf": c.get("bbox_pdf"),
                    "field_type": ft,
                    "label": label,
                    "signer_role": "unknown",
                    "confidence": pv.get("confidence_score", pv.get("confidence")),
                    "geometry_confidence": pv.get("geometry_confidence"),
                    "confidence_band": pv.get("confidence_band"),
                    "auto_usable": True,
                    "review_required": bool(pv.get("review_required")),
                    "detection_effective_confidence": round(ec, 4),
                    "critical_field": False,
                    "low_confidence_at_detection": False,
                    "ready_for_downstream": True,
                    "inclusion_reason": "non_critical_autopass",
                }
            )

    for mf in rm["manual_fields"]:
        if not isinstance(mf, dict):
            continue
        mid = str(mf.get("manual_field_id") or "")
        st = str(mf.get("review_state") or "manually_added")
        if st == "rejected" or not mid:
            continue
        sr = normalize_signer_role(str(mf.get("signer_role") or "unknown"))
        fields.append(
            {
                "ref": f"manual:{mid}",
                "manifest_origin": "manual",
                "review_state": st,
                "page_number": mf.get("page_number"),
                "bbox_normalized": mf.get("bbox_normalized"),
                "field_type": mf.get("field_type"),
                "label": mf.get("label"),
                "signer_role": sr,
                "ready_for_downstream": True,
                "inclusion_reason": "manual",
            }
        )

    out = {
        "version": 1,
        "updated_at": _utc_now_iso(),
        "field_count": len(fields),
        "fields": attach_signing_placement_metadata(fields),
        "blocked_by_confidence_previously": blocked_by_confidence,
        "disclaimer": "Workflow aid only — not a signed or anchored proof record.",
    }
    rm["downstream_field_manifest"] = out
    if aid and blocked_by_confidence > 0:
        emit_document_layout_event(
            "downstream_field_blocked_by_confidence",
            analysis_id=aid,
            blocked_suggested_count=blocked_by_confidence,
        )
    return out


def enrich_analysis_for_api(data: Dict[str, Any]) -> Dict[str, Any]:
    """Attach effective review state per candidate for UI (copy-on-read)."""
    rm = _ensure_manifest(data)
    resolutions: Dict[str, Any] = rm["candidate_resolutions"]
    enriched: List[Dict[str, Any]] = []
    for c in data.get("field_candidates") or []:
        cid = str(c.get("candidate_id") or "")
        res = resolutions.get(cid) or {}
        state = str(res.get("state") or "suggested")
        row = dict(c)
        if row.get("placement_threshold") is None:
            annotate_candidate(row)
        row["review_state"] = state
        row["user_field_type"] = res.get("field_type")
        row["user_label"] = res.get("label")
        row["signer_role"] = res.get("signer_role")
        row["review_updated_at"] = res.get("updated_at")
        enriched.append(row)

    manual = []
    for mf in rm["manual_fields"]:
        if isinstance(mf, dict):
            manual.append(dict(mf))

    downstream = rm.get("downstream_field_manifest")
    if not isinstance(downstream, dict):
        downstream = rebuild_downstream_field_manifest(data)

    out = dict(data)
    out["field_candidates_enriched"] = enriched
    out["manual_fields"] = manual
    out["downstream_field_manifest"] = downstream
    sr = compute_signing_readiness(data)
    out["signing_readiness"] = {k: v for k, v in sr.items() if k != "placement_manifest"}
    return out


def apply_review_actions(
    data: Dict[str, Any],
    actions: List[Dict[str, Any]],
    *,
    emit: Callable[..., None],
) -> Dict[str, Any]:
    """
    Mutates data in memory, then caller saves. emit(event_name, **kwargs).
    """
    rm = _ensure_manifest(data)
    resolutions: Dict[str, Any] = rm["candidate_resolutions"]
    cands_by_id = {str(c.get("candidate_id")): c for c in (data.get("field_candidates") or [])}

    for raw in actions:
        if not isinstance(raw, dict):
            continue
        action = str(raw.get("action") or "").strip().lower()
        if action == "confirm":
            cid = str(raw.get("candidate_id") or "")
            if cid not in cands_by_id:
                raise ValueError("unknown_candidate_id")
            cand = cands_by_id[cid]
            ft = raw.get("field_type")
            if ft is not None and str(ft) not in ALLOWED_FIELD_TYPES:
                ft = None
            ft_gate = str(ft or effective_placement_field_type(cand) or "unknown_line")
            if ft_gate not in ALLOWED_FIELD_TYPES:
                ft_gate = str(cand.get("field_type_guess") or "unknown_line")
            ec = compute_effective_confidence(cand)
            th = placement_threshold_for_type(ft_gate)
            if is_critical_field_type(ft_gate) and ec < th and not bool(raw.get("acknowledge_low_confidence")):
                raise ValueError("low_confidence_critical_ack_required")
            resolutions[cid] = {
                "state": "confirmed",
                "field_type": ft,
                "label": raw.get("label"),
                "signer_role": normalize_signer_role(str(raw.get("signer_role") or "unknown")),
                "updated_at": _utc_now_iso(),
            }
            emit("field_candidate_confirmed", candidate_id=cid)
        elif action == "correct":
            cid = str(raw.get("candidate_id") or "")
            if cid not in cands_by_id:
                raise ValueError("unknown_candidate_id")
            cand = cands_by_id[cid]
            ft = str(raw.get("field_type") or cands_by_id[cid].get("field_type_guess") or "unknown_line")
            if ft not in ALLOWED_FIELD_TYPES:
                ft = "unknown_line"
            ec = compute_effective_confidence(cand)
            th = placement_threshold_for_type(ft)
            if is_critical_field_type(ft) and ec < th and not bool(raw.get("acknowledge_low_confidence")):
                raise ValueError("low_confidence_critical_ack_required")
            resolutions[cid] = {
                "state": "corrected",
                "field_type": ft,
                "label": raw.get("label"),
                "signer_role": normalize_signer_role(str(raw.get("signer_role") or "unknown")),
                "updated_at": _utc_now_iso(),
            }
            emit("field_candidate_corrected", candidate_id=cid, field_type=ft)
        elif action == "reject":
            cid = str(raw.get("candidate_id") or "")
            if cid not in cands_by_id:
                raise ValueError("unknown_candidate_id")
            resolutions[cid] = {
                "state": "rejected",
                "updated_at": _utc_now_iso(),
            }
            emit("field_candidate_rejected", candidate_id=cid)
        elif action == "add_manual":
            bbox = raw.get("bbox_normalized")
            if not isinstance(bbox, dict):
                raise ValueError("missing_bbox_normalized")
            _validate_norm_bbox(bbox)
            pn = int(raw.get("page_number") or 1)
            ft = str(raw.get("field_type") or "text_field")
            if ft not in ALLOWED_FIELD_TYPES:
                ft = "text_field"
            mid = f"mf_{uuid.uuid4().hex[:12]}"
            entry = {
                "manual_field_id": mid,
                "review_state": "manually_added",
                "page_number": pn,
                "bbox_normalized": {
                    "x": float(bbox["x"]),
                    "y": float(bbox["y"]),
                    "width": float(bbox["width"]),
                    "height": float(bbox["height"]),
                    "space": "normalized_page",
                },
                "field_type": ft,
                "label": raw.get("label") or "",
                "signer_role": normalize_signer_role(str(raw.get("signer_role") or "unknown")),
                "created_at": _utc_now_iso(),
            }
            rm["manual_fields"].append(entry)
            emit("field_candidate_added_manually", manual_field_id=mid, field_type=ft)
        elif action == "reject_manual":
            mid = str(raw.get("manual_field_id") or "")
            found = False
            for mf in rm["manual_fields"]:
                if isinstance(mf, dict) and str(mf.get("manual_field_id")) == mid:
                    mf["review_state"] = "rejected"
                    mf["updated_at"] = _utc_now_iso()
                    found = True
                    break
            if not found:
                raise ValueError("unknown_manual_field_id")
            emit("field_candidate_rejected", manual_field_id=mid, source="manual")
        else:
            raise ValueError("unknown_action")

    rebuild_downstream_field_manifest(data)
    return data


def persist_analysis(analysis_id: str, data: Dict[str, Any]) -> None:
    save_layout_analysis(analysis_id, data)
