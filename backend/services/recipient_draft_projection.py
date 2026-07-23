"""
Minimum recipient-facing draft projection — strip unrelated-party PII and operator fields.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional


def _clean(v: Any) -> str:
    return str(v or "").strip()


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
    ):
        out.pop(key, None)

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
            out["vs01_signing_packet_v1"] = {**pkt, "portable": portable}

    return out
