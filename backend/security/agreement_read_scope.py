"""
Scoped read access for full LawDog agreement drafts.

- Owner workspace: ``X-Claw-Org-Id`` resolving to the registered agreement owner (usage economics).
- Recipient: valid ``X-Claw-Recipient-Access-Token`` (or ``recipient_access_token`` query) for the same agreement id.
- Public proof: ``GET /api/agreements/public/{id}/verify`` only (handled separately; no full draft).

Legacy: when usage economics is off *and* recipient tokens are not required, full draft reads stay
permissive (anonymous + id) for dev/small installs — enable economics and/or
``CLAW_RECIPIENT_ACCESS_TOKEN_REQUIRED=1`` for production-style enforcement.
"""

from __future__ import annotations

import os
from typing import Any, Dict, Optional

from fastapi import HTTPException, Request

from backend.config.agreement_signing_token import (
    SigningTokenSecretMissingInProductionError,
    resolve_signing_token_secret_raw,
)
from backend.config.runtime_environment import recipient_access_token_required
from backend.security.recipient_access_token import RECIPIENT_LINK_INVALID_OR_EXPIRED, verify_recipient_access_token
from backend.services.agreement_draft_store import load_draft
from backend.services.agreement_signing_lock_store import read_signing_lock
from backend.services.recipient_token_consumed_store import append_usage_record, consume_jti, is_jti_consumed
from backend.usage_economics.policy import (
    require_claw_org_id_header,
    usage_economics_enabled,
    workspace_lists_agreement_for_subject,
)
from backend.utils.enforce import resolve_subject_from_request


def recipient_access_token_from_request(request: Request) -> str:
    h = (request.headers.get("X-Claw-Recipient-Access-Token") or "").strip()
    if h:
        return h
    return (request.query_params.get("recipient_access_token") or "").strip()


def _rfail(code: str, *, status_code: int = 403) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={"code": code, "message": RECIPIENT_LINK_INVALID_OR_EXPIRED},
    )


def _audit_event_dict(e: Any) -> Dict[str, Any]:
    if hasattr(e, "model_dump"):
        return e.model_dump()
    if isinstance(e, dict):
        return e
    return {}


def _draft_dict_fully_executed(draft_body: Dict[str, Any]) -> bool:
    audit = draft_body.get("audit_log") or []
    for e in audit:
        if str(_audit_event_dict(e).get("event_type") or "") == "signed":
            return True
    return False


def _recipient_party_id_on_draft(draft: Dict[str, Any], party_id: str) -> bool:
    pid = (party_id or "").strip()
    if not pid:
        return False
    for p in draft.get("parties") or []:
        if not isinstance(p, dict):
            continue
        if str(p.get("id") or "").strip() == pid:
            return True
    return False


def validate_recipient_access_token_for_agreement(
    *,
    token: str,
    path_agreement_id: str,
    query_agreement_id: Optional[str],
    secret_raw: str,
    consume_single_use: bool,
    log_validation: bool,
) -> Dict[str, Any]:
    """
    Verify recipient/signer token for an agreement. Optionally consume single-use JTI (validate endpoint).
    Raises HTTPException on failure.

    ``path_agreement_id``: from ``GET /api/agreements/{id}`` path (must match token ``aid`` when non-empty).
    ``query_agreement_id``: optional ``agreement_id`` query param on ``/access/validate`` (must match when non-empty).
    """
    t = (token or "").strip()
    if not t:
        raise _rfail("token_required", status_code=400)

    try:
        payload = verify_recipient_access_token(token=t, secret=secret_raw.encode("utf-8"))
    except ValueError as e:
        reason = str(e)
        code = {
            "invalid_token_format": "invalid_token",
            "invalid_token_signature": "invalid_token",
            "invalid_token_payload": "invalid_token",
            "token_expired": "token_expired",
        }.get(reason, "invalid_token")
        raise _rfail(code) from e

    aid = str(payload.get("aid") or "").strip()
    if not aid:
        raise _rfail("invalid_token")
    q_aid = (query_agreement_id or "").strip()
    if q_aid and q_aid != aid:
        raise _rfail("agreement_id_mismatch")
    p_aid = (path_agreement_id or "").strip()
    if p_aid and p_aid != aid:
        raise _rfail("agreement_id_mismatch")

    jti = str(payload.get("jti") or "").strip()
    su = bool(payload.get("su"))
    if su:
        if jti and is_jti_consumed(jti):
            raise _rfail("token_already_used")

    mode = str(payload.get("m") or "").strip()
    if mode not in ("sign", "review"):
        raise _rfail("invalid_token")
    v = str(payload.get("v") or "")
    role = str(payload.get("r") or "recipient").strip().lower()
    if mode == "sign" and role == "reviewer":
        raise _rfail("role_not_permitted_for_signing")

    try:
        draft_body = load_draft(aid)
    except Exception:
        raise HTTPException(status_code=404, detail="agreement_not_found") from None

    if mode == "sign":
        if _draft_dict_fully_executed(draft_body):
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "signing_complete",
                    "message": (
                        "This agreement is already fully executed. Ask the sender for the public verification link."
                    ),
                },
            )
        lock = read_signing_lock(aid)
        lock_v = str((lock or {}).get("locked_version_id") or "").strip()
        if not lock or not lock_v or lock_v != v.strip():
            raise _rfail("signing_version_mismatch_or_not_locked")

    if mode == "review":
        tok_v = v.strip()
        lock = read_signing_lock(aid)
        lock_v = str((lock or {}).get("locked_version_id") or "").strip()
        if tok_v and lock_v and tok_v != lock_v:
            raise _rfail("review_link_stale")

    party_id = str(payload.get("pid") or "").strip()
    inviter = str(payload.get("inv") or "").strip()
    if party_id:
        if not _recipient_party_id_on_draft(draft_body, party_id):
            raise _rfail("recipient_not_assigned")

    if log_validation and jti:
        append_usage_record({"jti": jti, "aid": aid, "mode": mode, "pid": party_id or None})

    if consume_single_use and su and jti:
        consume_jti(jti)

    return {
        "ok": True,
        "agreement_id": aid,
        "mode": mode,
        "locked_version_id": v,
        "role": payload.get("r"),
        "recipient_party_id": party_id or None,
        "inviter_display_name": inviter or None,
    }


def assert_agreement_recipient_write_allowed(
    request: Request,
    agreement_id: str,
    *,
    allowed_modes: tuple[str, ...],
    bind_participant_id: Optional[str] = None,
) -> None:
    """
    Require a valid recipient access token for mutating recipient flows when strict (economics on
    or ``CLAW_RECIPIENT_ACCESS_TOKEN_REQUIRED``). Same legacy bypass as full-draft reads when both
    are off.

    When ``bind_participant_id`` is not None, a token that encodes ``pid`` must match that id
    (after strip). Pass resolved ceremony participant id for signing (including legacy inferred id).
    """
    aid = (agreement_id or "").strip()
    if not aid:
        raise HTTPException(status_code=404, detail="agreement_not_found")

    tok = recipient_access_token_from_request(request)
    strict = usage_economics_enabled() or recipient_access_token_required()
    if not tok:
        if not strict:
            return
        raise HTTPException(
            status_code=403,
            detail={
                "code": "recipient_token_required",
                "message": RECIPIENT_LINK_INVALID_OR_EXPIRED,
            },
        )

    try:
        secret_raw = resolve_signing_token_secret_raw()
    except SigningTokenSecretMissingInProductionError as e:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "signing_token_secret_not_configured",
                "message": str(e),
            },
        ) from e

    out = validate_recipient_access_token_for_agreement(
        token=tok,
        path_agreement_id=aid,
        query_agreement_id=None,
        secret_raw=secret_raw,
        consume_single_use=False,
        log_validation=False,
    )
    mode = str(out.get("mode") or "")
    if mode not in allowed_modes:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "recipient_token_mode_not_allowed",
                "message": "This action requires a different recipient link (review vs sign).",
            },
        )

    if bind_participant_id is not None:
        tok_pid = str(out.get("recipient_party_id") or "").strip()
        body_pid = (bind_participant_id or "").strip()
        if tok_pid:
            if not body_pid:
                raise HTTPException(
                    status_code=403,
                    detail={
                        "code": "recipient_party_id_required",
                        "message": RECIPIENT_LINK_INVALID_OR_EXPIRED,
                    },
                )
            if tok_pid != body_pid:
                raise HTTPException(
                    status_code=403,
                    detail={
                        "code": "recipient_party_token_mismatch",
                        "message": RECIPIENT_LINK_INVALID_OR_EXPIRED,
                    },
                )


def assert_agreement_full_draft_read_allowed(request: Request, agreement_id: str) -> None:
    """Require recipient token or owner workspace before returning a full draft / render."""
    aid = (agreement_id or "").strip()
    if not aid:
        raise HTTPException(status_code=404, detail="agreement_not_found")

    tok = recipient_access_token_from_request(request)
    if tok:
        try:
            secret_raw = resolve_signing_token_secret_raw()
        except SigningTokenSecretMissingInProductionError as e:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "signing_token_secret_not_configured",
                    "message": str(e),
                },
            ) from e
        validate_recipient_access_token_for_agreement(
            token=tok,
            path_agreement_id=aid,
            query_agreement_id=None,
            secret_raw=secret_raw,
            consume_single_use=False,
            log_validation=False,
        )
        return

    strict = usage_economics_enabled() or recipient_access_token_required()
    if not strict:
        return

    require_claw_org_id_header(request)
    subject = resolve_subject_from_request(request)
    if not workspace_lists_agreement_for_subject(aid, subject):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "agreement_read_denied",
                "message": "Not allowed to read this agreement. Sign in with the owner workspace or use a recipient link token.",
            },
        )
