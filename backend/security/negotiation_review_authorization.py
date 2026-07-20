"""Narrowly typed negotiation-review session authorization (GTM Security Slice 3B)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from fastapi import HTTPException, Request

from backend.security.negotiation_review_same_origin import assert_negotiation_review_same_origin
from backend.security.negotiation_review_session_cookie import (
    read_negotiation_review_session_cookie,
)
from backend.security.recipient_access_token import RECIPIENT_LINK_INVALID_OR_EXPIRED
from backend.services.negotiation_review_bootstrap_exchange import (
    NegotiationReviewBootstrapExchangeError,
    peek_revalidated_negotiation_review_session,
)


@dataclass(frozen=True)
class NegotiationReviewAuthorization:
    agreement_id: str
    recipient_party_id: Optional[str]
    mode: str
    role: str
    locked_version_id: str
    session_id: str


def negotiation_review_cookie_state(request: Request, agreement_id: str) -> str:
    """
    Distinguish absent, valid, and invalid negotiation-review cookies for an agreement route.
    Returns one of: ``none``, ``valid``, ``invalid``.
    """
    cookie = read_negotiation_review_session_cookie(request)
    if not cookie:
        return "none"
    aid = (agreement_id or "").strip()
    if not aid:
        return "invalid"
    try:
        session = peek_revalidated_negotiation_review_session(session_secret=cookie)
    except NegotiationReviewBootstrapExchangeError:
        return "invalid"
    if _clean(session.get("agreement_id")) != aid:
        return "invalid"
    return "valid"


def negotiation_review_authorization_from_request(
    request: Request,
    agreement_id: str,
) -> Optional[NegotiationReviewAuthorization]:
    """Return validated negotiation-review authorization for the agreement, or None."""
    cookie = read_negotiation_review_session_cookie(request)
    if not cookie:
        return None
    aid = (agreement_id or "").strip()
    if not aid:
        return None
    try:
        session = peek_revalidated_negotiation_review_session(session_secret=cookie)
    except NegotiationReviewBootstrapExchangeError:
        return None
    if _clean(session.get("agreement_id")) != aid:
        return None
    return NegotiationReviewAuthorization(
        agreement_id=aid,
        recipient_party_id=_clean(session.get("party_id")) or None,
        mode="review",
        role=_clean(session.get("role")) or "reviewer",
        locked_version_id=_clean(session.get("locked_version_id")),
        session_id=_clean(session.get("session_id")),
    )


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _write_denied(*, code: str = "recipient_token_required") -> HTTPException:
    return HTTPException(
        status_code=403,
        detail={"code": code, "message": RECIPIENT_LINK_INVALID_OR_EXPIRED},
    )


def assert_negotiation_review_read_allowed(
    request: Request,
    agreement_id: str,
) -> NegotiationReviewAuthorization:
    auth = negotiation_review_authorization_from_request(request, agreement_id)
    if not auth:
        raise _write_denied()
    if auth.mode != "review":
        raise HTTPException(
            status_code=403,
            detail={
                "code": "recipient_token_mode_not_allowed",
                "message": "This action requires a different recipient link (review vs sign).",
            },
        )
    return auth


def assert_negotiation_review_write_allowed(
    request: Request,
    agreement_id: str,
    *,
    allowed_modes: tuple[str, ...],
    bind_participant_id: Optional[str] = None,
    require_same_origin: bool = True,
) -> NegotiationReviewAuthorization:
    """Cookie-authorized review mutations require same-origin CSRF protection."""
    if require_same_origin:
        assert_negotiation_review_same_origin(request)
    auth = assert_negotiation_review_read_allowed(request, agreement_id)
    if auth.mode not in allowed_modes:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "recipient_token_mode_not_allowed",
                "message": "This action requires a different recipient link (review vs sign).",
            },
        )
    if bind_participant_id is not None:
        tok_pid = (auth.recipient_party_id or "").strip()
        body_pid = (bind_participant_id or "").strip()
        if tok_pid:
            if not body_pid:
                raise _write_denied(code="recipient_party_id_required")
            if tok_pid != body_pid:
                raise _write_denied(code="recipient_party_token_mismatch")
    return auth


def reject_negotiation_review_session_for_full_draft(
    request: Request,
    agreement_id: str,
) -> None:
    """Full-draft/export/signing routes must not accept negotiation-review session cookies."""
    state = negotiation_review_cookie_state(request, agreement_id)
    if state == "invalid":
        raise HTTPException(
            status_code=403,
            detail={
                "code": "negotiation_review_session_invalid",
                "message": RECIPIENT_LINK_INVALID_OR_EXPIRED,
            },
        )
    if state == "valid":
        raise HTTPException(
            status_code=403,
            detail={
                "code": "negotiation_review_full_draft_denied",
                "message": RECIPIENT_LINK_INVALID_OR_EXPIRED,
            },
        )


def is_negotiation_review_session_request(request: Request, agreement_id: str) -> bool:
    try:
        return negotiation_review_authorization_from_request(request, agreement_id) is not None
    except NegotiationReviewBootstrapExchangeError:
        return False
