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


def normalize_delivery_phase(phase: str) -> str:
    """
    Canonical delivery-registry phases: ``review`` | ``signing``.

    Legacy clients may send ``sign``; map it to ``signing`` so revoke/resend/
    validation/post-complete always hit the same registry key.
    """
    p = (phase or "").strip().lower()
    if p in ("sign", "signing", "signature"):
        return "signing"
    if p == "review":
        return "review"
    return p


def _registry_key(phase: str, participant_id: str) -> str:
    return f"{normalize_delivery_phase(phase)}:{(participant_id or '').strip()}"


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
            "revoked_at": None,
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
    phase = normalize_delivery_phase(phase)
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
    # New invite clears explicit revoke.
    row["revoked_at"] = None
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
    phase = normalize_delivery_phase(phase)
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
    jti: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Supersede the active invite JTI for phase+participant.

    When ``jti`` is provided (e.g. the token just used to complete), that JTI is
    always marked superseded even if ``active_jti`` was never recorded — closing
    the production replay gap when delivery omitted JTI registration.
    """
    phase = normalize_delivery_phase(phase)
    reg = get_registry(draft)
    row = _recipient_row(reg, phase, participant_id)
    now = _utc_now_iso()
    superseded = list(row.get("superseded_jtis") or [])
    superseded_fps = list(row.get("superseded_jti_fps") or [])
    consumed: List[str] = []
    old_jti = str(row.get("active_jti") or "").strip()
    if old_jti:
        consumed.append(old_jti)
    explicit = str(jti or "").strip()
    if explicit and explicit not in consumed:
        consumed.append(explicit)
    for victim in consumed:
        if victim not in superseded:
            superseded.append(victim)
            superseded_fps.append(_jti_fingerprint(victim))
    # Always clear active invite. When no JTI was known, mark revoked so any
    # outstanding token for this phase+participant fails until a new invite.
    row["superseded_jtis"] = superseded[-20:]
    row["superseded_jti_fps"] = superseded_fps[-20:]
    row["active_jti"] = None
    row["active_jti_fp"] = None
    if not consumed:
        row["revoked_at"] = now
    if audit_log is not None:
        audit_log.append(
            {
                "event_type": INVITE_SUPERSEDED,
                "at": now,
                "field": "recipient_delivery",
                "value": {
                    "phase": phase,
                    "participant_id": participant_id,
                    "jti_fp": _jti_fingerprint(consumed[0]) if consumed else None,
                    "consumed_count": len(consumed),
                    "revoked_without_jti": not bool(consumed),
                },
            }
        )
    draft["recipient_delivery_v1"] = reg
    return draft


def is_jti_superseded(draft: Dict[str, Any], jti: str, phase: str, participant_id: str) -> bool:
    j = (jti or "").strip()
    if not j:
        return False
    phase = normalize_delivery_phase(phase)
    reg = get_registry(draft)
    recipients = reg.get("recipients") or {}
    if not isinstance(recipients, dict):
        return False
    row = recipients.get(_registry_key(phase, participant_id))
    if not isinstance(row, dict):
        return False
    if row.get("revoked_at"):
        return True
    superseded = row.get("superseded_jtis") or []
    if isinstance(superseded, list) and j in superseded:
        return True
    active = str(row.get("active_jti") or "").strip()
    # Active invite exists and this JTI is not it → superseded/replaced.
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


def extract_jti_from_signing_url(url: str) -> str:
    """Extract recipient access-token JTI from a signing URL ``t=`` query param."""
    try:
        from urllib.parse import parse_qs, urlparse

        parsed = urlparse(str(url or "").strip())
        qs = parse_qs(parsed.query or "")
        for key in ("t", "token", "access_token", "recipient_token"):
            vals = qs.get(key) or []
            if vals:
                jti = extract_jti_from_token(str(vals[0] or ""))
                if jti:
                    return jti
        return ""
    except Exception:  # noqa: BLE001
        return ""


def supersede_all_phase_invites(
    draft: Dict[str, Any],
    *,
    phase: str,
    audit_log: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Supersede every active invite for ``phase`` across all participants.

    Used on signing-packet cancel/reissue so prior JTIs cannot complete against
    a cancelled or replaced packet. Idempotent: repeated calls keep JTIs
    superseded and leave ``revoked_at`` set when no active JTI was known.
    """
    phase = normalize_delivery_phase(phase)
    reg = get_registry(draft)
    recipients = reg.get("recipients") or {}
    if not isinstance(recipients, dict):
        return draft
    # Snapshot keys — supersede mutates the registry in place.
    keys = [str(k) for k in list(recipients.keys())]
    prefix = f"{phase}:"
    for key in keys:
        if not key.startswith(prefix):
            continue
        row = recipients.get(key)
        pid = ""
        if isinstance(row, dict):
            pid = str(row.get("participant_id") or "").strip()
        if not pid:
            pid = key[len(prefix) :].strip()
        if not pid:
            continue
        supersede_active_invite(
            draft,
            phase=phase,
            participant_id=pid,
            audit_log=audit_log,
        )
    return draft
