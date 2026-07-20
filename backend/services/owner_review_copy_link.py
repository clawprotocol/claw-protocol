"""Owner-authorized review copy-link minting (GTM Security Slice 3B)."""

from __future__ import annotations

import os
import time
from typing import Any, Dict, Optional, Tuple

from fastapi import HTTPException

from backend.config.runtime_environment import clamp_recipient_token_ttl_seconds
from backend.security.negotiation_review_bootstrap_token import mint_negotiation_review_bootstrap_token
from backend.security.negotiation_review_canonical_role import assert_eligible_review_participant
from backend.security.negotiation_review_content_binding import review_content_binding_sha256
from backend.security.negotiation_review_version_binding import authoritative_review_version_binding
from backend.services.email.review_delivery import _build_absolute_review_url
from backend.services.recipient_delivery_registry import record_invite_sent


def _infer_single_review_party_id(draft_dict: Dict[str, Any]) -> str:
    eligible: list[str] = []
    for party in draft_dict.get("parties") or []:
        if not isinstance(party, dict):
            continue
        pid = str(party.get("id") or "").strip()
        try:
            assert_eligible_review_participant(draft_dict, party_id=pid)
        except ValueError:
            continue
        eligible.append(pid)
    if len(eligible) == 1:
        return eligible[0]
    return ""


def _resolve_authoritative_participant_id(
    draft_dict: Dict[str, Any], body: Any
) -> str:
    party_id = (getattr(body, "recipient_party_id", None) or "").strip()
    if party_id:
        try:
            assert_eligible_review_participant(draft_dict, party_id=party_id)
        except ValueError as exc:
            code = str(exc)
            if code == "owner_party_not_eligible_for_review":
                raise OwnerReviewCopyLinkMintError(
                    code="owner_party_not_eligible_for_review",
                    status_code=403,
                    message="Owner parties cannot receive recipient review invitations.",
                ) from exc
            raise OwnerReviewCopyLinkMintError(
                code="recipient_party_not_found",
                status_code=400,
                message="Recipient party not found on agreement.",
            ) from exc
        return party_id
    inferred = _infer_single_review_party_id(draft_dict)
    if not inferred:
        raise OwnerReviewCopyLinkMintError(
            code="recipient_party_ambiguous",
            status_code=400,
            message="Recipient party is missing or ambiguous.",
        )
    return inferred


class OwnerReviewCopyLinkMintError(Exception):
    def __init__(self, *, code: str, status_code: int = 403, message: str = "forbidden") -> None:
        self.code = code
        self.status_code = status_code
        self.message = message
        super().__init__(message)


def mint_owner_review_copy_link(
    *,
    agreement_id: str,
    secret: bytes,
    body: Any,
    draft_dict: Dict[str, Any],
    signing_lock: Optional[Dict[str, Any]],
    persist_draft_fn,
) -> Dict[str, Any]:
    """
    Mint a fragment review URL for owner copy-link flows.
    Never returns a standalone token field.
    """
    if str(getattr(body, "mode", "") or "") != "review":
        raise OwnerReviewCopyLinkMintError(code="review_mode_required", status_code=400)

    env_ttl = os.getenv("CLAW_RECIPIENT_TOKEN_TTL_SECONDS", "").strip()
    raw_ttl = int(env_ttl) if env_ttl else int(getattr(body, "ttl_seconds", 0) or 0) or 60 * 60 * 24 * 7
    ttl = clamp_recipient_token_ttl_seconds(raw_ttl)
    lv = authoritative_review_version_binding(signing_lock)
    content_sha256 = review_content_binding_sha256(draft_dict)

    party_id = _resolve_authoritative_participant_id(draft_dict, body)
    role = assert_eligible_review_participant(draft_dict, party_id=party_id)
    token: Optional[str] = None
    review_jti: Optional[str] = None
    last_error: Optional[BaseException] = None
    for attempt in range(3):
        try:
            token, review_jti, _exp = mint_negotiation_review_bootstrap_token(
                secret=secret,
                agreement_id=agreement_id,
                locked_version_id=lv,
                party_id=party_id,
                role=role,
                content_sha256=content_sha256,
                ttl_seconds=ttl,
            )
            break
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if attempt < 2:
                time.sleep(0.06 * (2**attempt))
                continue
            break

    if not token or not review_jti:
        raise OwnerReviewCopyLinkMintError(
            code="recipient_token_mint_unavailable",
            status_code=422,
            message="Unable to mint review copy link after retries.",
        ) from last_error

    next_draft = dict(draft_dict)
    try:
        record_invite_sent(
            next_draft,
            phase="review",
            participant_id=party_id,
            jti=review_jti,
            bootstrap_authority=True,
            locked_version_id=lv,
            content_sha256=content_sha256,
            role=role,
        )
        persist_draft_fn(next_draft)
    except ValueError as exc:
        code = str(exc)
        if code.startswith("delivery_establishment"):
            raise OwnerReviewCopyLinkMintError(
                code=code,
                status_code=409,
                message="Invitation establishment conflict.",
            ) from exc
        raise

    origin = os.getenv("CLAW_APP_PUBLIC_ORIGIN", "").strip() or "http://localhost:5173"
    review_url = _build_absolute_review_url(origin, agreement_id, token)
    return {
        "review_url": review_url,
        "expires_in_seconds": ttl,
        "mode": "review",
        "locked_version_id": lv if lv != "__pre_lock__" else None,
    }
