"""Workspace auth binding — link Supabase user to claw org and migrate local drafts."""

from __future__ import annotations

import logging
import os
import secrets
import uuid
from typing import Any, Dict, Optional, Set

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from backend.economics.store import get_economics_store
from backend.security.qa_payment_bypass_session import (
    COOKIE_NAME,
    mint_qa_payment_bypass_session,
    session_secret_bytes,
    session_ttl_seconds,
    verify_qa_payment_bypass_session,
)
from backend.lawdog_dashboard.supabase_service import sync_agreement_draft_to_supabase, ensure_organization
from backend.usage_economics.store import get_usage_economics_store
from backend.security.anonymous_session_store import get_anonymous_session_store
from backend.security.anonymous_session_token import (
    ANON_SESSION_COOKIE,
    anonymous_session_ttl_seconds,
)
from backend.security.supabase_jwt import require_supabase_user_id
from backend.security.workspace_identity import verify_anonymous_session_from_request, extract_anonymous_session_token
from backend.security.safe_redirect import build_destination_with_agreement, resolve_safe_redirect_path
from backend.config.deployment_runtime import claw_environment
from backend.cors_policy import apply_cors_headers_to_response

router = APIRouter(prefix="/v1/workspace", tags=["workspace-auth"])
_log = logging.getLogger("claw.workspace_auth")


class BindUserOrgIn(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=128)
    email: Optional[str] = Field(default=None, max_length=256)
    display_name: Optional[str] = Field(default=None, max_length=256)
    previous_org_id: Optional[str] = Field(default=None, max_length=128)
    """Pre-login checkout org (e.g. anon-* or local-org) when subscription was activated before bind-user-org."""
    subscription_source_org_id: Optional[str] = Field(default=None, max_length=128)
    """Explicit org ids that may hold an orphaned Pro subscription for this bound user."""
    entitlement_repair_candidates: Optional[list[str]] = Field(default=None, max_length=8)
    claim_method: Optional[str] = Field(default=None, max_length=64)


def _stable_org_id_for_user(user_id: str) -> str:
    uid = user_id.strip()
    if not uid:
        raise ValueError("missing_user_id")
    return f"user-{uid}"


def _is_claimable_draft_source_org(org_id: str) -> bool:
    """Only server-minted anonymous workspaces may transfer draft ownership."""
    oid = (org_id or "").strip()
    return bool(oid.startswith("anon-"))


def _assert_claimable_previous_org(previous_org_id: str, target_org_id: str) -> None:
    prev = (previous_org_id or "").strip()
    if not prev or prev == target_org_id:
        return
    if prev.startswith("user-"):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "ownership_conflict",
                "message": "Cannot claim drafts from another authenticated workspace.",
            },
        )
    if not _is_claimable_draft_source_org(prev):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "invalid_claim_source",
                "message": "Draft claim source is not eligible for transfer.",
            },
        )


def _attach_anon_session_cookie(*, response: Response, request: Request, token: str) -> None:
    samesite = _cookie_samesite_for_request(request)
    secure = _cookie_secure_for_request(request) or samesite == "none"
    response.set_cookie(
        key=ANON_SESSION_COOKIE,
        value=token,
        httponly=True,
        secure=secure,
        samesite=samesite,
        max_age=anonymous_session_ttl_seconds(),
        path="/",
    )


def _migrate_drafts_for_claim(
    *,
    prev_org_id: str,
    target_org_id: str,
    claim_method: str,
) -> list[str]:
    ustore = get_usage_economics_store()
    ustore.init_schema()
    from_subject = f"org:{prev_org_id}"
    to_subject = f"org:{target_org_id}"
    migrated_agreements = ustore.list_agreement_ids_for_subject(from_subject)
    if not migrated_agreements:
        return []
    claimed = ustore.record_agreements_claimed(
        agreement_ids=migrated_agreements,
        to_subject_ref=to_subject,
        from_org_id=prev_org_id,
        claim_method=claim_method,
    )
    if claimed != len(migrated_agreements):
        _log.warning(
            "partial_claim_migration prev=%s new=%s expected=%s claimed=%s",
            prev_org_id,
            target_org_id,
            len(migrated_agreements),
            claimed,
        )
    for aid in migrated_agreements:
        try:
            from backend.services.agreement_draft_store import load_draft

            draft = load_draft(aid)
            if draft:
                sync_agreement_draft_to_supabase(organization_id=target_org_id, draft=draft)
        except Exception:
            _log.exception("supabase_resync_failed aid=%s", aid)
    ustore.emit_event(
        subject_ref=to_subject,
        event_type="anonymous_draft_claim_completed",
        payload={
            "claim_method": claim_method,
            "migrated_count": claimed,
            "previous_org_id": prev_org_id,
        },
    )
    return migrated_agreements


class AuthContinuationIn(BaseModel):
    agreement_id: Optional[str] = Field(default=None, max_length=256)
    destination_path: str = Field(..., min_length=1, max_length=512)
    workflow_stage: Optional[str] = Field(default=None, max_length=64)
    auth_purpose: Optional[str] = Field(default=None, max_length=64)
    provider: Optional[str] = Field(default=None, max_length=32)


class FinalizeAuthIn(BaseModel):
    continuation_id: str = Field(..., min_length=8, max_length=128)
    claim_method: Optional[str] = Field(default=None, max_length=64)
    subscription_source_org_id: Optional[str] = Field(default=None, max_length=128)
    entitlement_repair_candidates: Optional[list[str]] = Field(default=None, max_length=8)


@router.post("/anonymous-session")
async def create_anonymous_session(request: Request, response: Response) -> Dict[str, Any]:
    """Mint server-authorized anonymous workspace session."""
    store = get_anonymous_session_store()
    org_id = f"anon-{uuid.uuid4().hex}"
    created = store.create_session(org_id=org_id, ttl_seconds=anonymous_session_ttl_seconds())
    token = created["token"]
    _attach_anon_session_cookie(response=response, request=request, token=token)
    _log.info("anonymous_session_created org_id=%s session_id=%s", org_id, created["session_id"])
    return {
        "ok": True,
        "org_id": org_id,
        "session_id": created["session_id"],
        "token": token,
        "expires_in_seconds": anonymous_session_ttl_seconds(),
    }


class GenesisAccessRequestIn(BaseModel):
    """Request Genesis Dog access — never auto-grants entitlement."""

    reason: Optional[str] = Field(default=None, max_length=500)


@router.post("/genesis-access-request")
async def request_genesis_access(request: Request, body: GenesisAccessRequestIn) -> Dict[str, Any]:
    """
    Authenticated users may request Genesis Dog access.

    Does not grant ``genesis_dog_entitlements`` or activate affiliate status.
    """
    from backend.usage_economics.genesis_dog_entitlement import record_genesis_access_request
    from backend.usage_economics.commercial_entitlement import resolve_commercial_entitlement

    user_id = require_supabase_user_id(request)
    row = record_genesis_access_request(user_id)
    decision = resolve_commercial_entitlement(f"org:user-{user_id}")
    _log.info(
        "genesis_access_requested user_id=%s state=%s grant_source=%s",
        user_id,
        decision.get("state"),
        decision.get("grant_source"),
    )
    return {
        "ok": True,
        "requested": True,
        "granted": False,
        "request": row,
        "commercial": {
            "state": decision.get("state"),
            "grant_source": decision.get("grant_source"),
            "can_create_persisted_agreement": decision.get("can_create_persisted_agreement"),
        },
        "reason": (body.reason or "").strip() or None,
    }


@router.post("/auth-continuation")
async def create_auth_continuation(request: Request, body: AuthContinuationIn) -> Dict[str, Any]:
    """Create durable server-side continuation for OAuth / magic-link round trips."""
    purpose = (body.auth_purpose or "").strip().lower()
    dest = resolve_safe_redirect_path(body.destination_path, "/app")
    store = get_anonymous_session_store()

    if purpose in ("returning_sign_in", "dashboard"):
        cont = store.create_continuation(
            session_id="returning",
            org_id="",
            agreement_id=body.agreement_id,
            destination_path=dest,
            workflow_stage=body.workflow_stage,
            auth_purpose=purpose,
            provider=body.provider,
            ttl_seconds=3600,
        )
        return {"ok": True, **cont, "org_id": ""}

    anon_row = verify_anonymous_session_from_request(request)
    session_id = str(anon_row.get("session_id") or "")
    org_id = str(anon_row.get("org_id") or "")
    cont = store.create_continuation(
        session_id=session_id,
        org_id=org_id,
        agreement_id=body.agreement_id,
        destination_path=dest,
        workflow_stage=body.workflow_stage,
        auth_purpose=body.auth_purpose,
        provider=body.provider,
    )
    _log.info(
        "auth_continuation_created continuation_id=%s org_id=%s agreement_id=%s",
        cont["continuation_id"],
        org_id,
        body.agreement_id or "",
    )
    return {"ok": True, **cont, "org_id": org_id}


@router.post("/finalize-auth")
async def finalize_auth(request: Request, body: FinalizeAuthIn) -> Dict[str, Any]:
    """
    Post-auth finalizer: verify Supabase user, continuation, anonymous session; claim drafts;
    return server-authoritative redirect destination.
    """
    from datetime import datetime, timezone

    user_id = require_supabase_user_id(request)
    org_id = _stable_org_id_for_user(user_id)
    claim_method = (body.claim_method or "unknown").strip()[:64]
    store = get_anonymous_session_store()
    cont_row = store.get_continuation(body.continuation_id.strip())
    if not cont_row:
        raise HTTPException(status_code=404, detail={"code": "continuation_not_found"})
    if cont_row.get("consumed_at"):
        # Idempotent retry by same user
        if str(cont_row.get("claimed_user_id") or "") == user_id:
            dest = build_destination_with_agreement(
                destination_path=str(cont_row.get("destination_path") or "/app"),
                agreement_id=str(cont_row.get("agreement_id") or "") or None,
            )
            return {
                "ok": True,
                "org_id": org_id,
                "destination_path": dest,
                "migrated_agreement_count": 0,
                "idempotent": True,
            }
        raise HTTPException(status_code=409, detail={"code": "continuation_consumed"})
    exp_raw = str(cont_row.get("expires_at") or "")
    if exp_raw:
        try:
            exp = datetime.fromisoformat(exp_raw.replace("Z", "+00:00"))
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > exp:
                raise HTTPException(status_code=410, detail={"code": "continuation_expired"})
        except HTTPException:
            raise
        except Exception:
            pass

    anon_row: Optional[Dict[str, Any]] = None
    token = extract_anonymous_session_token(request)
    if token:
        anon_row = verify_anonymous_session_from_request(request)
    purpose = str(cont_row.get("auth_purpose") or "").strip().lower()
    is_returning = purpose in ("returning_sign_in", "dashboard") or str(cont_row.get("session_id") or "") == "returning"

    prev_org = str(cont_row.get("org_id") or "").strip()
    ensure_organization(org_id, name=user_id)

    migrated: list[str] = []
    if not is_returning and prev_org and prev_org != org_id:
        if not anon_row:
            raise HTTPException(status_code=401, detail={"code": "anonymous_session_required"})
        if str(anon_row.get("session_id") or "") != str(cont_row.get("session_id") or ""):
            raise HTTPException(status_code=403, detail={"code": "continuation_session_mismatch"})
        _assert_claimable_previous_org(prev_org, org_id)
        migrated = _migrate_drafts_for_claim(
            prev_org_id=prev_org,
            target_org_id=org_id,
            claim_method=claim_method,
        )
        store.mark_session_claimed(session_id=str(anon_row.get("session_id") or ""), user_id=user_id)
    elif is_returning:
        prev_org = ""

    billing_migrated = _repair_billing_after_bind(
        user_id=user_id,
        org_id=org_id,
        prev_org_id=prev_org,
        subscription_source_org_id=body.subscription_source_org_id,
        entitlement_repair_candidates=body.entitlement_repair_candidates,
        require_anon_source_match=True,
    )
    store.consume_continuation(continuation_id=body.continuation_id.strip(), user_id=user_id)

    dest = build_destination_with_agreement(
        destination_path=str(cont_row.get("destination_path") or "/app"),
        agreement_id=str(cont_row.get("agreement_id") or "") or None,
    )
    ustore = get_usage_economics_store()
    ustore.init_schema()
    if cont_row.get("agreement_id"):
        owner = ustore.owner_subject_for_agreement(str(cont_row["agreement_id"]))
        if owner and owner != f"org:{org_id}":
            raise HTTPException(status_code=403, detail={"code": "post_claim_agreement_mismatch"})

    return {
        "ok": True,
        "org_id": org_id,
        "user_id": user_id,
        "destination_path": dest,
        "migrated_agreement_count": len(migrated),
        "migrated_agreement_ids": migrated[:50],
        "billing_migrated": billing_migrated,
        "claim_method": claim_method if migrated else None,
    }


def _repair_billing_after_bind(
    *,
    user_id: str,
    org_id: str,
    prev_org_id: str,
    subscription_source_org_id: Optional[str],
    entitlement_repair_candidates: Optional[list[str]],
    require_anon_source_match: bool,
) -> bool:
    try:
        from backend.billing.workspace_billing_migration import (
            normalize_workspace_org_id,
            repair_bound_user_workspace_entitlement,
        )
        from backend.economics.store import get_economics_store

        eco = get_economics_store()
        eco.init_schema()
        ustore = get_usage_economics_store()
        ustore.init_schema()
        repair_candidates: list[str] = []
        for raw in entitlement_repair_candidates or []:
            oid = normalize_workspace_org_id(str(raw or ""))
            if oid and oid not in repair_candidates:
                repair_candidates.append(oid)
        sub_src = normalize_workspace_org_id(subscription_source_org_id or "")
        if sub_src and sub_src not in repair_candidates:
            repair_candidates.append(sub_src)
        prev = (prev_org_id or "").strip()
        if prev and prev != org_id and prev.startswith("anon-") and prev not in repair_candidates:
            repair_candidates.append(prev)

        return repair_bound_user_workspace_entitlement(
            eco,
            user_id=user_id,
            bound_org_id=org_id,
            candidate_source_org_ids=repair_candidates,
            usage_store=ustore,
            require_client_repair_signal=bool(repair_candidates),
        )
    except Exception:
        _log.exception("migrate_workspace_billing_failed prev=%s new=%s", prev_org_id, org_id)
        return False


@router.post("/bind-user-org")
async def bind_user_org(request: Request, body: BindUserOrgIn) -> Dict[str, Any]:
    user_id = require_supabase_user_id(request)
    if body.user_id.strip() != user_id:
        raise HTTPException(
            status_code=403,
            detail={"code": "user_id_mismatch", "message": "Authenticated user mismatch."},
        )
    org_id = _stable_org_id_for_user(user_id)
    display = (body.display_name or body.email or "LawDog workspace").strip()[:200]
    claim_method = (body.claim_method or "unknown").strip()[:64]

    ensure_organization(org_id, name=display)

    migrated_agreements: list[str] = []
    prev = (body.previous_org_id or "").strip()
    if prev and prev != org_id:
        if _is_claimable_draft_source_org(prev):
            ustore = get_usage_economics_store()
            ustore.init_schema()
            pending = ustore.list_agreement_ids_for_subject(f"org:{prev}")
            if pending:
                anon_row = verify_anonymous_session_from_request(request)
                if str(anon_row.get("org_id") or "") != prev:
                    raise HTTPException(
                        status_code=403,
                        detail={
                            "code": "anonymous_session_org_mismatch",
                            "message": "Session does not authorize this workspace.",
                        },
                    )
                migrated_agreements = _migrate_drafts_for_claim(
                    prev_org_id=prev,
                    target_org_id=org_id,
                    claim_method=claim_method,
                )
                get_anonymous_session_store().mark_session_claimed(
                    session_id=str(anon_row.get("session_id") or ""),
                    user_id=user_id,
                )
        elif prev != "local-org":
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "invalid_claim_source",
                    "message": "Draft claim source is not eligible for transfer.",
                },
            )

    billing_migrated = _repair_billing_after_bind(
        user_id=user_id,
        org_id=org_id,
        prev_org_id=prev,
        subscription_source_org_id=body.subscription_source_org_id,
        entitlement_repair_candidates=body.entitlement_repair_candidates,
        require_anon_source_match=True,
    )

    return {
        "ok": True,
        "org_id": org_id,
        "user_id": user_id,
        "migrated_agreement_count": len(migrated_agreements),
        "migrated_agreement_ids": migrated_agreements[:50],
        "billing_migrated": billing_migrated,
        "claim_method": claim_method if migrated_agreements else None,
    }


@router.post("/demo-activate-subscription")
async def demo_activate_subscription(request: Request, body: BindUserOrgIn) -> Dict[str, Any]:
    """
    Explicit local/dev/test only: activate Pro without Stripe.

    Requires authenticated principal bound to the target user/org.
    Impossible on staging, production, unset, blank, or unknown environments.
    """
    from backend.config.deployment_runtime import is_relaxed_claw_environment
    from backend.security.supabase_jwt import require_supabase_user_id

    if not is_relaxed_claw_environment():
        raise HTTPException(status_code=404, detail="not_found")

    uid = require_supabase_user_id(request)
    body_uid = (body.user_id or "").strip()
    if not body_uid or body_uid != uid:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "cross_user_denied",
                "message": "Demo activation user_id must match authenticated principal.",
            },
        )

    expected_org = f"user-{uid}"
    org_id = (body.previous_org_id or "").strip() or expected_org
    # Allow user workspace or a prior anonymous org during local bind/migration only.
    if org_id != expected_org and not org_id.startswith("anon-"):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "cross_org_denied",
                "message": "Demo activation organization must match authenticated principal.",
            },
        )

    from backend.billing import subscriptions as subs
    from backend.economics.store import get_economics_store
    from backend.payments.store import get_onramp_store
    from backend.treasury.treasury_store import get_treasury_store

    eco = get_economics_store()
    payment_id = f"demo:activate:{uuid.uuid4().hex[:12]}"
    subs.sync_subscription_from_payment(
        economics=eco,
        store=get_onramp_store(),
        treasury=get_treasury_store(),
        payment_id=payment_id,
        org_id=org_id,
        user_id=uid,
        plan_code="pro",
        use_demo_expiry=True,
    )
    return {"ok": True, "org_id": org_id, "subscription": eco.get_subscription_by_org(org_id)}


class QaPaymentBypassSessionIn(BaseModel):
    admin_secret: str = Field(..., min_length=1, max_length=512)


def _parse_id_allowlist(*env_names: str) -> Set[str]:
    ids: Set[str] = set()
    for name in env_names:
        raw = os.getenv(name, "").strip()
        if not raw:
            continue
        ids.update(part.strip() for part in raw.split(",") if part.strip())
    return ids


def _qa_payment_bypass_allowlist() -> Set[str]:
    return _parse_id_allowlist("CLAW_QA_PAYMENT_BYPASS_USER_IDS", "CLAW_GENESIS_QA_USER_IDS")


def _qa_payment_bypass_role_users() -> Set[str]:
    return _parse_id_allowlist("CLAW_QA_PAYMENT_BYPASS_ROLE_USER_IDS")


def _cookie_secure_for_request(request: Request) -> bool:
    env = claw_environment()
    if env in ("production", "prod"):
        return True
    forwarded = (request.headers.get("x-forwarded-proto") or "").split(",")[0].strip().lower()
    if forwarded == "https":
        return True
    return request.url.scheme == "https"


def _cookie_samesite_for_request(request: Request) -> str:
    origin = (request.headers.get("origin") or "").strip()
    if not origin:
        return "lax"
    try:
        from urllib.parse import urlparse

        req_host = (request.url.hostname or "").lower()
        origin_host = (urlparse(origin).hostname or "").lower()
        if req_host and origin_host and req_host != origin_host:
            return "none"
    except Exception:
        pass
    return "lax"


def _attach_qa_payment_bypass_session_cookie(*, response: Response, request: Request, token: str) -> None:
    samesite = _cookie_samesite_for_request(request)
    secure = _cookie_secure_for_request(request) or samesite == "none"
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=secure,
        samesite=samesite,
        max_age=session_ttl_seconds(),
        path="/",
    )


def _resolve_qa_payment_bypass_authorization(request: Request) -> Dict[str, Any]:
    session_secret = session_secret_bytes()
    session_token = (request.cookies.get(COOKIE_NAME) or "").strip()
    if session_secret and session_token:
        try:
            verify_qa_payment_bypass_session(token=session_token, secret=session_secret)
            return {"authorized": True, "reason": "admin_session"}
        except ValueError as exc:
            reason = str(exc)
            if reason == "session_expired":
                return {"authorized": False, "reason": "admin_session_expired"}
            return {"authorized": False, "reason": "admin_session_invalid"}

    uid = (request.headers.get("X-Claw-User-Id") or "").strip()
    if uid and uid in _qa_payment_bypass_allowlist():
        return {"authorized": True, "reason": "qa_allowlist"}
    if uid and uid in _qa_payment_bypass_role_users():
        return {"authorized": True, "reason": "qa_role"}

    return {"authorized": False, "reason": "not_authorized"}


@router.post("/qa-payment-bypass/session")
async def qa_payment_bypass_bootstrap_session(
    body: QaPaymentBypassSessionIn,
    request: Request,
    response: Response,
) -> Dict[str, Any]:
    """
    Explicit local/dev/test only. Operator principal + admin secret second factor.
    Never available on staging/production/unset/unknown environments.
    """
    from backend.config.deployment_runtime import claw_environment, is_relaxed_claw_environment
    from backend.security.privileged_ops import PERM_MUTATE_SUPPORT, require_privileged_operator

    if not is_relaxed_claw_environment():
        raise HTTPException(status_code=404, detail="not_found")

    require_privileged_operator(
        request,
        permission=PERM_MUTATE_SUPPORT,
        action_type="qa_payment_bypass_session",
        target_type="workspace",
        target_id="qa_bypass",
        reason=(request.headers.get("x-claw-admin-reason") or "qa payment bypass session").strip(),
    )

    session_secret = session_secret_bytes()
    if not session_secret:
        raise HTTPException(status_code=503, detail="qa_session_unconfigured")

    token = mint_qa_payment_bypass_session(secret=session_secret)
    _attach_qa_payment_bypass_session_cookie(response=response, request=request, token=token)
    _log.info(
        "qa_payment_bypass_session_minted host=%s deployment=%s",
        request.url.hostname or "",
        claw_environment() or "(unset)",
    )
    return {"ok": True}


@router.get("/qa-payment-bypass/authorization")
async def qa_payment_bypass_authorization(request: Request) -> Dict[str, Any]:
    """
    QA payment bypass authorization — local/dev/test only.
    Never authorize via spoofable X-Claw-User-Id outside relaxed env.
    """
    from backend.config.deployment_runtime import claw_environment, is_relaxed_claw_environment

    if not is_relaxed_claw_environment():
        return {"authorized": False, "reason": "not_available_outside_local_dev_test"}
    result = _resolve_qa_payment_bypass_authorization(request)
    # Never trust client X-Claw-User-Id allowlist alone — require verified principal.
    if result.get("reason") in ("qa_allowlist", "qa_role"):
        try:
            from backend.security.supabase_jwt import require_supabase_user_id

            uid = require_supabase_user_id(request)
            header_uid = (request.headers.get("X-Claw-User-Id") or "").strip()
            if not header_uid or header_uid != uid:
                result = {"authorized": False, "reason": "principal_required"}
        except Exception:
            result = {"authorized": False, "reason": "principal_required"}
    _log.info(
        "qa_payment_bypass_authorization authorized=%s reason=%s host=%s deployment=%s",
        result["authorized"],
        result["reason"],
        request.url.hostname or "",
        claw_environment() or "(unset)",
    )
    return result
