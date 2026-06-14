"""Per-recipient invite delivery registry on agreement drafts (JTIs, timestamps, resend counts)."""

from __future__ import annotations

import hashlib
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


def _jti_fingerprint(jti: str) -> str:
    raw = (jti or "").strip()
    if not raw:
        return ""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


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
            "active_jti_fp": None,
            "superseded_jtis": [],
            "superseded_jti_fps": [],
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
        row["active_jti_fp"] = _jti_fingerprint(jti)
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
                    "jti_fp": row.get("active_jti_fp"),
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
                    "jti_fp": _jti_fingerprint(jti or ""),
                },
            }
        )
    return draft


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
        superseded_fps = list(row.get("superseded_jti_fps") or [])
        if old_jti not in superseded:
            superseded.append(old_jti)
            superseded_fps.append(_jti_fingerprint(old_jti))
        row["superseded_jtis"] = superseded[-20:]
        row["superseded_jti_fps"] = superseded_fps[-20:]
        row["active_jti"] = None
        row["active_jti_fp"] = None
        if audit_log is not None:
            audit_log.append(
                {
                    "event_type": INVITE_SUPERSEDED,
                    "at": now,
                    "field": "recipient_delivery",
                    "value": {
                        "phase": phase,
                        "participant_id": participant_id,
                        "jti_fp": _jti_fingerprint(old_jti),
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
