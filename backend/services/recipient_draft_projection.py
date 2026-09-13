"""
Minimum recipient-facing draft projection — strip unrelated-party PII and operator fields.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional


def _clean(v: Any) -> str:
    return str(v or "").strip()


def _current_approval_revision_binding(draft: Dict[str, Any]) -> tuple[str, str]:
    """Owner-authorized revision ids only. Missing ids mean no current-revision filter."""
    aid = _clean(draft.get("id") or draft.get("agreement_id"))
    if not aid:
        return "", ""
    from backend.services.accepted_review_snapshot import current_review_revision_public

    rev = current_review_revision_public(draft, aid)
    if not isinstance(rev, dict):
        return "", ""
    return _clean(rev.get("snapshot_id")), _clean(rev.get("corpus_sha256"))


def _recipient_visible_approval_audit(
    draft: Dict[str, Any],
    recipient_party_id: str,
) -> List[Dict[str, Any]]:
    """Keep only this participant's current-revision approval events. Never restore the full audit log."""
    pid = _clean(recipient_party_id)
    if not pid:
        return []
    current_sid, current_digest = _current_approval_revision_binding(draft)
    visible: List[Dict[str, Any]] = []
    for raw in draft.get("audit_log") or []:
        event = raw if isinstance(raw, dict) else getattr(raw, "model_dump", lambda: None)()
        if not isinstance(event, dict):
            continue
        et = _clean(event.get("event_type"))
        if et not in {"recipient_approved", "participant_approved"}:
            continue
        value = event.get("value") if isinstance(event.get("value"), dict) else {}
        ev_pid = _clean(value.get("participant_id"))
        if not ev_pid or ev_pid != pid:
            continue
        ev_sid = _clean(value.get("snapshot_id"))
        ev_digest = _clean(value.get("corpus_sha256"))
        if current_sid or current_digest:
            if current_sid and ev_sid and ev_sid != current_sid:
                continue
            if current_digest and ev_digest and ev_digest != current_digest:
                continue
            if current_sid and not ev_sid:
                continue
        slim_value = {
            key: value.get(key)
            for key in (
                "message",
                "participant_id",
                "participant_display_name",
                "snapshot_id",
                "corpus_sha256",
            )
            if value.get(key)
        }
        visible.append(
            {
                "event_type": et,
                "at": event.get("at"),
                "field": "recipient",
                "value": slim_value,
            }
        )
    return visible


def project_recipient_agreement_draft(
    draft: Dict[str, Any],
    *,
    recipient_party_id: Optional[str],
) -> Dict[str, Any]:
    """
    Return a signing-role-minimal draft view.

    Keeps corpus / document fields needed to sign; redacts other parties' emails/phones,
    delivery JTIs, full audit logs, and internal admin/economics fields.
    """
    out = dict(draft or {})
    pid = _clean(recipient_party_id)

    parties_in = out.get("parties") if isinstance(out.get("parties"), list) else []
    parties_out: List[Dict[str, Any]] = []
    for p in parties_in:
        if not isinstance(p, dict):
            continue
        row = {
            "id": _clean(p.get("id")),
            "name": _clean(p.get("name")),
            "role": _clean(p.get("role")),
        }
        # Only the bound recipient sees their own contact fields.
        if pid and _clean(p.get("id")) == pid:
            if _clean(p.get("email")):
                row["email"] = _clean(p.get("email"))
            if _clean(p.get("phone")):
                row["phone"] = _clean(p.get("phone"))
        parties_out.append(row)
    out["parties"] = parties_out

    approval_audit = _recipient_visible_approval_audit(draft, pid)

    # Drop high-sensitivity / unrelated operational fields.
    for key in (
        "recipient_delivery_v1",
        "audit_log",
        "pro_redline_v1",
        "canonical_review_snapshots_v1",
        "accepted_review_snapshot_v1",
        "economics",
        "workspace_tags",
        "workspace_folder_id",
        "vs01_signer_execution_v1",
    ):
        out.pop(key, None)
    if approval_audit:
        out["audit_log"] = approval_audit

    # Portable packet: keep structure but strip other signers' emails when possible.
    pkt = out.get("vs01_signing_packet_v1")
    if isinstance(pkt, dict):
        portable = pkt.get("portable") if isinstance(pkt.get("portable"), dict) else None
        if isinstance(portable, dict):
            roles = portable.get("roles")
            if isinstance(roles, list):
                slim_roles = []
                for r in roles:
                    if not isinstance(r, dict):
                        continue
                    rr = {
                        "roleId": r.get("roleId") or r.get("role_id"),
                        "partyId": r.get("partyId") or r.get("party_id"),
                        "kind": r.get("kind"),
                        "entityName": r.get("entityName") or r.get("entity_name"),
                        "requiresSignature": r.get("requiresSignature", r.get("requires_signature")),
                    }
                    party_id = _clean(rr.get("partyId"))
                    if pid and party_id == pid:
                        rr["partyName"] = r.get("partyName") or r.get("party_name")
                    slim_roles.append(rr)
                portable = {**portable, "roles": slim_roles}
            slim_pkt = {**pkt, "portable": portable}
            slim_pkt.pop("signer_execution_v1", None)
            out["vs01_signing_packet_v1"] = slim_pkt

    return out
