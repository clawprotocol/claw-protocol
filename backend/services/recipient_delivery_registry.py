"""Per-recipient invite delivery registry on agreement drafts (JTIs, timestamps, resend counts)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

INVITE_SENT = "invite_sent"
INVITE_OPENED = "invite_opened"
INVITE_RESENT = "invite_resent"
INVITE_SUPERSEDED = "invite_superseded"
RECIPIENT_EMAIL_CORRECTED = "recipient_email_corrected"
REVIEW_APPROVED = "review_approved"
SIGNATURE_COMPLETED = "signature_completed"

RECIPIENT_INVITE_SUPERSEDED_MESSAGE = (
    "This invite was replaced. Ask the sender for the latest link."
)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _registry_key(phase: str, participant_id: str) -> str:
    return f"{(phase or '').strip()}:{(participant_id or '').strip()}"


def delivery_registry_material(record: Dict[str, Any]) -> bytes:
    """Canonical bytes for recipient delivery registry authority comparison."""
    from backend.utils.canon_json import canon_json_bytes

    if not isinstance(record, dict):
        return b""
    recipients = record.get("recipients")
    if not isinstance(recipients, dict):
        return canon_json_bytes({"v": record.get("v"), "recipients": {}})
    return canon_json_bytes({"v": record.get("v"), "recipients": recipients})


def get_registry(draft: Dict[str, Any]) -> Dict[str, Any]:
    reg = draft.get("recipient_delivery_v1")
    if isinstance(reg, dict) and reg.get("v") == 1:
        recipients = reg.get("recipients")
        if not isinstance(recipients, dict):
            return {"v": 1, "recipients": {}}
        return reg
    return {"v": 1, "recipients": {}}


def _recipient_row(reg: Dict[str, Any], phase: str, participant_id: str) -> Dict[str, Any]:
    recipients = reg.setdefault("recipients", {})
    if not isinstance(recipients, dict):
        recipients = {}
        reg["recipients"] = recipients
    key = _registry_key(phase, participant_id)
    row = recipients.get(key)
    if not isinstance(row, dict):
        row = {
            "phase": phase,
            "participant_id": participant_id,
            "active_jti": None,
            "superseded_jtis": [],
            "last_sent_at": None,
            "last_opened_at": None,
            "resent_count": 0,
            "active_signing_email": None,
        }
        recipients[key] = row
    return row


def record_invite_sent(
    draft: Dict[str, Any],
    *,
    phase: str,
    participant_id: str,
    jti: Optional[str] = None,
    email: Optional[str] = None,
    audit_log: Optional[List[Dict[str, Any]]] = None,
    bootstrap_authority: bool = False,
    locked_version_id: Optional[str] = None,
    content_sha256: Optional[str] = None,
    role: Optional[str] = None,
) -> Dict[str, Any]:
    """Record a sent invite; supersede prior active JTI when re-sending."""
    reg = get_registry(draft)
    row = _recipient_row(reg, phase, participant_id)
    now = _utc_now_iso()
    old_jti = str(row.get("active_jti") or "").strip()
    if old_jti and jti and old_jti != jti:
        supersede_active_invite(draft, phase=phase, participant_id=participant_id, audit_log=audit_log)
        row = _recipient_row(reg, phase, participant_id)
    if jti:
        row["active_jti"] = jti
    if bootstrap_authority:
        row["bootstrap_authority"] = True
    if locked_version_id:
        row["bootstrap_locked_version_id"] = str(locked_version_id).strip()
    if content_sha256:
        row["bootstrap_content_sha256"] = str(content_sha256).strip()
    if role:
        row["bootstrap_role"] = str(role).strip()
    if email:
        row["active_signing_email"] = email.strip().lower()
    had_prior_send = bool(row.get("last_sent_at"))
    if had_prior_send:
        row["resent_count"] = int(row.get("resent_count") or 0) + 1
    row["last_sent_at"] = now
    draft["recipient_delivery_v1"] = reg
    if audit_log is not None:
        audit_log.append(
            {
                "event_type": INVITE_SENT if not had_prior_send else INVITE_RESENT,
                "at": now,
                "field": "recipient_delivery",
                "value": {
                    "phase": phase,
                    "participant_id": participant_id,
                    "email_redacted": _redact_email(email or ""),
                },
            }
        )
    return draft


def record_invite_opened(
    draft: Dict[str, Any],
    *,
    phase: str,
    participant_id: str,
    jti: Optional[str] = None,
    audit_log: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    reg = get_registry(draft)
    row = _recipient_row(reg, phase, participant_id)
    now = _utc_now_iso()
    if not row.get("last_opened_at"):
        row["first_opened_at"] = now
    row["last_opened_at"] = now
    draft["recipient_delivery_v1"] = reg
    if audit_log is not None:
        audit_log.append(
            {
                "event_type": INVITE_OPENED,
                "at": now,
                "field": "recipient_delivery",
                "value": {
                    "phase": phase,
                    "participant_id": participant_id,
                },
            }
        )
    return draft


_PRESERVED_DELIVERY_FIELDS = frozenset(
    {
        "bootstrap_exchanged_at",
        "recipient_session_id",
        "superseded_jtis",
        "first_opened_at",
        "last_opened_at",
    }
)

_ESTABLISHMENT_DELIVERY_FIELDS = frozenset(
    {
        "phase",
        "participant_id",
        "active_jti",
        "last_sent_at",
        "bootstrap_authority",
        "active_signing_email",
        "resent_count",
    }
)

_BOOTSTRAP_BINDING_FIELDS = frozenset(
    {
        "bootstrap_locked_version_id",
        "bootstrap_content_sha256",
        "bootstrap_role",
    }
)


def _party_for_participant(draft: Dict[str, Any], participant_id: str) -> Optional[Dict[str, Any]]:
    pid = (participant_id or "").strip()
    if not pid:
        return None
    for party in draft.get("parties") or []:
        if isinstance(party, dict) and str(party.get("id") or "").strip() == pid:
            return party
    return None


def _expected_bootstrap_bindings(
    draft: Dict[str, Any],
    *,
    participant_id: str,
    signing_lock: Optional[Dict[str, Any]],
) -> Dict[str, str]:
    from backend.security.negotiation_review_canonical_role import canonical_review_role_for_party
    from backend.security.negotiation_review_content_binding import review_content_binding_sha256
    from backend.security.negotiation_review_version_binding import authoritative_review_version_binding

    party = _party_for_participant(draft, participant_id)
    role = canonical_review_role_for_party(party or {})
    if not role:
        raise ValueError("delivery_establishment_stale_role_binding")
    return {
        "bootstrap_locked_version_id": authoritative_review_version_binding(signing_lock),
        "bootstrap_content_sha256": review_content_binding_sha256(draft),
        "bootstrap_role": role,
    }


def _assert_incoming_bindings_match_current(
    incoming_row: Dict[str, Any],
    current_draft: Dict[str, Any],
    *,
    signing_lock: Optional[Dict[str, Any]],
) -> None:
    if not incoming_row.get("bootstrap_authority"):
        return
    participant_id = str(incoming_row.get("participant_id") or "").strip()
    if not participant_id:
        return
    expected = _expected_bootstrap_bindings(
        current_draft,
        participant_id=participant_id,
        signing_lock=signing_lock,
    )
    for field, expected_value in expected.items():
        incoming_value = str(incoming_row.get(field) or "").strip()
        if not incoming_value:
            raise ValueError("delivery_establishment_stale_caller_snapshot")
        if incoming_value != expected_value:
            if field == "bootstrap_locked_version_id":
                raise ValueError("delivery_establishment_stale_version_binding")
            if field == "bootstrap_content_sha256":
                raise ValueError("delivery_establishment_stale_content_binding")
            raise ValueError("delivery_establishment_stale_role_binding")


def _merge_establishment_row(
    current_row: Optional[Dict[str, Any]],
    incoming_row: Dict[str, Any],
    current_draft: Dict[str, Any],
    *,
    signing_lock: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    if not isinstance(current_row, dict):
        _assert_incoming_bindings_match_current(
            incoming_row,
            current_draft,
            signing_lock=signing_lock,
        )
        return {
            field: incoming_row.get(field)
            for field in _ESTABLISHMENT_DELIVERY_FIELDS | _BOOTSTRAP_BINDING_FIELDS
            if field in incoming_row
        }

    incoming_jti = str(incoming_row.get("active_jti") or "").strip()
    current_jti = str(current_row.get("active_jti") or "").strip()

    if current_row.get("bootstrap_exchanged_at"):
        if incoming_jti and incoming_jti != current_jti:
            raise ValueError("delivery_establishment_conflict_after_exchange")
        return dict(current_row)

    if str(current_row.get("recipient_session_id") or "").strip():
        if incoming_jti and incoming_jti != current_jti:
            raise ValueError("delivery_establishment_conflict_session_bound")
        return dict(current_row)

    if incoming_row.get("bootstrap_authority"):
        _assert_incoming_bindings_match_current(
            incoming_row,
            current_draft,
            signing_lock=signing_lock,
        )

    if incoming_jti and incoming_jti == current_jti:
        merged = dict(current_row)
        for field in _ESTABLISHMENT_DELIVERY_FIELDS | _BOOTSTRAP_BINDING_FIELDS:
            if field in incoming_row and incoming_row.get(field) is not None:
                if merged.get(field) in (None, ""):
                    merged[field] = incoming_row.get(field)
        for field in _PRESERVED_DELIVERY_FIELDS:
            if field in current_row:
                merged[field] = current_row[field]
        return merged

    incoming_superseded = {
        str(j).strip() for j in (incoming_row.get("superseded_jtis") or []) if str(j).strip()
    }
    if current_jti and incoming_jti and current_jti in incoming_superseded:
        merged = dict(current_row)
        for field in _ESTABLISHMENT_DELIVERY_FIELDS | _BOOTSTRAP_BINDING_FIELDS:
            if field in incoming_row and incoming_row.get(field) is not None:
                merged[field] = incoming_row[field]
        merged_superseded = list(current_row.get("superseded_jtis") or [])
        for jti in incoming_superseded:
            if jti not in merged_superseded:
                merged_superseded.append(jti)
        merged["superseded_jtis"] = merged_superseded[-20:]
        for field in _PRESERVED_DELIVERY_FIELDS:
            if field in current_row:
                merged[field] = current_row[field]
        return merged

    if incoming_jti and incoming_jti in {
        str(j).strip() for j in (current_row.get("superseded_jtis") or []) if str(j).strip()
    }:
        raise ValueError("delivery_establishment_superseded_jti")

    if current_jti and incoming_jti and current_jti != incoming_jti:
        raise ValueError("delivery_establishment_active_invitation_conflict")

    merged = dict(current_row)
    for field in _ESTABLISHMENT_DELIVERY_FIELDS | _BOOTSTRAP_BINDING_FIELDS:
        if field in incoming_row and incoming_row.get(field) is not None:
            merged[field] = incoming_row.get(field)
    for field in _PRESERVED_DELIVERY_FIELDS:
        if field in current_row:
            merged[field] = current_row[field]
    return merged


def _merge_audit_events(current: List[Any], incoming: List[Any]) -> List[Any]:
    from backend.utils.canon_json import canon_json_bytes

    merged = list(current or [])
    seen = {canon_json_bytes(event) for event in merged if isinstance(event, dict)}
    for event in incoming or []:
        if not isinstance(event, dict):
            continue
        encoded = canon_json_bytes(event)
        if encoded in seen:
            continue
        merged.append(event)
        seen.add(encoded)
    return merged


def merge_review_delivery_establishment(
    current_draft: Optional[Dict[str, Any]],
    incoming_draft: Dict[str, Any],
    *,
    signing_lock: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Merge only new invitation-establishment rows into the latest delivery registry.
    Preserves consumption, exchange, revocation, and session metadata from current.
    """
    base = dict(current_draft or incoming_draft)
    current_reg = get_registry(current_draft or {})
    incoming_reg = get_registry(incoming_draft)
    merged_recipients = dict(current_reg.get("recipients") or {})
    latest_draft = dict(current_draft or incoming_draft)
    for key, incoming_row in (incoming_reg.get("recipients") or {}).items():
        if not isinstance(incoming_row, dict):
            continue
        current_row = merged_recipients.get(key)
        merged_recipients[key] = _merge_establishment_row(
            current_row if isinstance(current_row, dict) else None,
            incoming_row,
            latest_draft,
            signing_lock=signing_lock,
        )
    base["recipient_delivery_v1"] = {"v": 1, "recipients": merged_recipients}
    if incoming_draft.get("review_invite_emails_sent_at"):
        base["review_invite_emails_sent_at"] = incoming_draft["review_invite_emails_sent_at"]
    base["audit_log"] = _merge_audit_events(
        list((current_draft or {}).get("audit_log") or []),
        list(incoming_draft.get("audit_log") or []),
    )
    if incoming_draft.get("updated_at"):
        base["updated_at"] = incoming_draft["updated_at"]
    return base


def supersede_active_invite(
    draft: Dict[str, Any],
    *,
    phase: str,
    participant_id: str,
    audit_log: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    reg = get_registry(draft)
    row = _recipient_row(reg, phase, participant_id)
    now = _utc_now_iso()
    old_jti = str(row.get("active_jti") or "").strip()
    if old_jti:
        superseded = list(row.get("superseded_jtis") or [])
        if old_jti not in superseded:
            superseded.append(old_jti)
        row["superseded_jtis"] = superseded[-20:]
        row["active_jti"] = None
        if audit_log is not None:
            audit_log.append(
                {
                    "event_type": INVITE_SUPERSEDED,
                    "at": now,
                    "field": "recipient_delivery",
                    "value": {
                        "phase": phase,
                        "participant_id": participant_id,
                    },
                }
            )
    draft["recipient_delivery_v1"] = reg
    return draft


def is_jti_superseded(draft: Dict[str, Any], jti: str, phase: str, participant_id: str) -> bool:
    j = (jti or "").strip()
    if not j:
        return False
    reg = get_registry(draft)
    recipients = reg.get("recipients") or {}
    if not isinstance(recipients, dict):
        return False
    row = recipients.get(_registry_key(phase, participant_id))
    if not isinstance(row, dict):
        return False
    superseded = row.get("superseded_jtis") or []
    if isinstance(superseded, list) and j in superseded:
        return True
    active = str(row.get("active_jti") or "").strip()
    if active and active != j:
        return True
    return False


def is_signing_email_superseded(
    draft: Dict[str, Any],
    participant_id: str,
    recipient_email: str,
) -> bool:
    email = (recipient_email or "").strip().lower()
    if not email:
        return False
    reg = get_registry(draft)
    recipients = reg.get("recipients") or {}
    if not isinstance(recipients, dict):
        return False
    row = recipients.get(_registry_key("signing", participant_id))
    if not isinstance(row, dict):
        return False
    active = str(row.get("active_signing_email") or "").strip().lower()
    if active and active != email:
        return True
    parties = draft.get("parties") or []
    for p in parties:
        if not isinstance(p, dict):
            continue
        if str(p.get("id") or "").strip() != participant_id:
            continue
        current = str(p.get("email") or "").strip().lower()
        return bool(current and current != email)
    return False


def _redact_email(email: str) -> str:
    e = (email or "").strip().lower()
    if "@" not in e:
        return "***"
    local, domain = e.split("@", 1)
    if len(local) <= 1:
        return f"*@{domain}"
    return f"{local[0]}***@{domain}"


def is_bootstrap_authority_bound(
    draft: Dict[str, Any],
    jti: str,
    *,
    phase: str,
    participant_id: str,
) -> bool:
    """True when the active invite JTI is authority-bound to fragment/bootstrap transport."""
    j = (jti or "").strip()
    pid = (participant_id or "").strip()
    if not j or not pid:
        return False
    reg = get_registry(draft)
    recipients = reg.get("recipients") or {}
    if not isinstance(recipients, dict):
        return False
    row = recipients.get(_registry_key(phase, pid))
    if not isinstance(row, dict):
        return False
    if str(row.get("active_jti") or "").strip() != j:
        return False
    return bool(row.get("bootstrap_authority"))


def extract_jti_from_token(token: str) -> str:
    """Best-effort JTI extraction without full verify (for send recording)."""
    try:
        import base64
        import json

        parts = str(token or "").strip().split(".")
        if len(parts) != 2:
            return ""
        pad = "=" * ((4 - len(parts[0]) % 4) % 4)
        body = base64.urlsafe_b64decode((parts[0] + pad).encode("ascii"))
        payload = json.loads(body.decode("utf-8"))
        return str(payload.get("jti") or "").strip()
    except Exception:  # noqa: BLE001
        return ""
