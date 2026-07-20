"""Sanitized negotiation-review draft projection (GTM Security Slice 3B)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.security.negotiation_review_authorization import NegotiationReviewAuthorization

_REVIEW_AUDIT_EVENT_TYPES = frozenset(
    {
        "recipient_approved",
        "participant_approved",
        "recipient_proposal_pending",
        "participant_proposed_revision",
        "recipient_proposal_submitted",
        "recipient_proposal_staged",
        "recipient_proposal_rejected",
        "recipient_proposal_applied",
        "reviewer_suggestion_submitted",
        "reviewer_suggestion_rejected",
        "reviewer_suggestion_applied",
        "owner_review_approval_notified",
        "counterparty_reviews_complete_notified",
    }
)

_DRAFT_COPY_KEYS = (
    "title",
    "jurisdiction",
    "purpose",
    "payment_terms",
    "duration",
    "due_date",
    "effective_date",
    "feed_visibility",
    "feed_party_anonymize",
    "feed_show_financial_summary",
    "feed_anchor_network",
    "payment_request",
    "payment_required",
    "updated_at",
    "created_at",
)

_EXCLUDED_TOP_LEVEL = frozenset(
    {
        "recipient_delivery_v1",
        "negotiation_review_sessions_v1",
        "recipient_bootstrap_sessions_v1",
        "frozen_signing_authority_v1",
        "vs01_signing_packet_v1",
        "vs01_signing_packet_activation_v1",
        "vs01_signing_invite_delivery_v1",
        "premium_render_source",
        "server_full_document_text",
        "premium_server_full_document_text",
        "premium_full_document_text",
        "document_text",
        "rendered_document_text",
    }
)

_SAFE_AUDIT_VALUE_KEYS = frozenset(
    {
        "proposal_id",
        "participant_id",
        "suggestion_id",
        "status",
        "field",
    }
)


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _sanitize_party(party: Dict[str, Any]) -> Dict[str, Any]:
    pid = _clean(party.get("id"))
    return {
        "id": pid or None,
        "name": _clean(party.get("name")) or "Party",
        "role": _clean(party.get("role")) or "party",
    }


def _sanitize_parties(parties: Any) -> List[Dict[str, Any]]:
    if not isinstance(parties, list):
        return []
    out: List[Dict[str, Any]] = []
    for party in parties:
        if isinstance(party, dict):
            out.append(_sanitize_party(party))
    return out


def _sanitize_audit_scalar(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        return None
    if isinstance(value, dict):
        out: Dict[str, Any] = {}
        for key, raw in value.items():
            if key not in _SAFE_AUDIT_VALUE_KEYS:
                continue
            if isinstance(raw, bool):
                out[key] = raw
            elif isinstance(raw, (int, float)):
                out[key] = raw
            elif isinstance(raw, str):
                cleaned = raw.strip()
                if cleaned:
                    out[key] = cleaned[:128]
        return out or None
    return None


def _sanitize_audit_log(audit_log: Any) -> List[Dict[str, Any]]:
    if not isinstance(audit_log, list):
        return []
    out: List[Dict[str, Any]] = []
    for event in audit_log:
        if not isinstance(event, dict):
            continue
        event_type = _clean(event.get("event_type"))
        if event_type not in _REVIEW_AUDIT_EVENT_TYPES:
            continue
        sanitized: Dict[str, Any] = {
            "event_type": event_type,
            "at": event.get("at"),
        }
        field = event.get("field")
        if isinstance(field, str) and field.strip():
            sanitized["field"] = field.strip()[:64]
        safe_value = _sanitize_audit_scalar(event.get("value"))
        if safe_value is not None:
            sanitized["value"] = safe_value
        out.append(sanitized)
    return out


def _sanitize_pro_redline(raw: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict):
        return None
    out: Dict[str, Any] = {}
    corpus = raw.get("review_first_final_corpus")
    if isinstance(corpus, dict):
        text = _clean(corpus.get("text"))
        if text:
            out["review_first_final_corpus"] = {"text": text}
    suggestions = raw.get("reviewer_suggestions")
    if isinstance(suggestions, list):
        safe_suggestions: List[Dict[str, Any]] = []
        for item in suggestions:
            if not isinstance(item, dict):
                continue
            safe_suggestions.append(
                {
                    "id": _clean(item.get("id")) or None,
                    "participant_id": _clean(item.get("participant_id")) or None,
                    "reviewer_display_name": _clean(item.get("reviewer_display_name")) or None,
                    "status": _clean(item.get("status")) or None,
                    "created_at": item.get("created_at"),
                }
            )
        if safe_suggestions:
            out["reviewer_suggestions"] = safe_suggestions
    return out or None


def build_negotiation_review_draft_projection(
    *,
    draft: Dict[str, Any],
    auth: NegotiationReviewAuthorization,
) -> Dict[str, Any]:
    """Return a recipient-safe review draft projection for cookie-authorized reads."""
    projected: Dict[str, Any] = {}
    for key in _DRAFT_COPY_KEYS:
        if key in draft:
            projected[key] = draft.get(key)
    projected["parties"] = _sanitize_parties(draft.get("parties"))
    projected["audit_log"] = _sanitize_audit_log(draft.get("audit_log"))
    pro_redline = _sanitize_pro_redline(draft.get("pro_redline_v1"))
    if pro_redline:
        projected["pro_redline_v1"] = pro_redline
    for excluded in _EXCLUDED_TOP_LEVEL:
        projected.pop(excluded, None)
    return projected


def build_negotiation_review_read_response(
    *,
    agreement_id: str,
    draft: Dict[str, Any],
    auth: NegotiationReviewAuthorization,
    signing_lock: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    from backend.security.negotiation_review_version_binding import (
        normalize_bound_version_id,
    )

    lv = normalize_bound_version_id(auth.locked_version_id)
    return {
        "id": agreement_id,
        "draft": build_negotiation_review_draft_projection(draft=draft, auth=auth),
        "review_authorization": {
            "agreement_id": auth.agreement_id,
            "recipient_party_id": auth.recipient_party_id,
            "mode": auth.mode,
            "role": auth.role,
            "locked_version_id": lv if lv != "__pre_lock__" else None,
        },
    }


FORBIDDEN_PROJECTION_KEYS = frozenset(
    {
        "recipient_delivery_v1",
        "negotiation_review_sessions_v1",
        "recipient_bootstrap_sessions_v1",
        "frozen_signing_authority_v1",
        "vs01_signing_packet_v1",
        "premium_render_source",
        "signing_lock",
        "session_id",
        "token_hash",
        "content_sha256",
        "email",
        "phone",
        "message",
        "instruction",
        "active_jti",
        "active_jti_fp",
        "consumed_token_jti",
        "consumed_token_jti_fp",
        "jti_fp",
        "rendered_html",
        "staged_at",
        "submitted_at",
    }
)

FORBIDDEN_PROJECTION_VALUE_SUBSTRINGS = (
    "token_hash",
    "content_sha256",
    "session_id",
    "active_jti",
    "consumed_token_jti",
    "SECRET_PII_MARKER",
    "arbitrary_audit_leak",
)


def collect_forbidden_projection_audit_values(payload: Any, *, path: str = "") -> List[str]:
    """Collect bare-string audit values and forbidden secret substrings from projections."""
    hits: List[str] = []

    def _walk_audit_value(value: Any, value_path: str, *, root: bool) -> None:
        if isinstance(value, str):
            if root:
                hits.append(value_path)
            lowered = value.lower()
            for needle in FORBIDDEN_PROJECTION_VALUE_SUBSTRINGS:
                if needle.lower() in lowered:
                    hits.append(value)
            return
        if isinstance(value, dict):
            for key, item in value.items():
                child_path = f"{value_path}.{key}"
                if key not in _SAFE_AUDIT_VALUE_KEYS:
                    hits.append(child_path)
                    continue
                _walk_audit_value(item, child_path, root=False)
            return
        if isinstance(value, list):
            for idx, item in enumerate(value):
                _walk_audit_value(item, f"{value_path}[{idx}]", root=False)

    if isinstance(payload, dict):
        audit_log = payload.get("audit_log")
        if isinstance(audit_log, list):
            for idx, event in enumerate(audit_log):
                if not isinstance(event, dict):
                    continue
                if "value" in event:
                    _walk_audit_value(event.get("value"), f"audit_log[{idx}].value", root=True)
        draft = payload.get("draft")
        if isinstance(draft, dict):
            hits.extend(collect_forbidden_projection_audit_values(draft, path=path))
    return hits


def collect_forbidden_projection_keys(payload: Any, *, path: str = "") -> List[str]:
    """Recursively collect forbidden keys from a negotiation-review response payload."""
    hits: List[str] = []
    if isinstance(payload, dict):
        for key, value in payload.items():
            key_path = f"{path}.{key}" if path else key
            if key in FORBIDDEN_PROJECTION_KEYS:
                hits.append(key_path)
            hits.extend(collect_forbidden_projection_keys(value, path=key_path))
    elif isinstance(payload, list):
        for idx, item in enumerate(payload):
            hits.extend(collect_forbidden_projection_keys(item, path=f"{path}[{idx}]"))
    return hits


def collect_forbidden_projection_values(payload: Any) -> List[str]:
    """Collect known forbidden authority identifier values from a response payload."""
    hits: List[str] = []

    def _walk(value: Any) -> None:
        if isinstance(value, dict):
            for item in value.values():
                _walk(item)
            return
        if isinstance(value, list):
            for item in value:
                _walk(item)
            return
        if isinstance(value, str):
            lowered = value.lower()
            for needle in FORBIDDEN_PROJECTION_VALUE_SUBSTRINGS:
                if needle in lowered:
                    hits.append(value)
                    return

    _walk(payload)
    return hits
