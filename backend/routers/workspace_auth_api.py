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

router = APIRouter(prefix="/v1/workspace", tags=["workspace-auth"])
_log = logging.getLogger("claw.workspace_auth")


class BindUserOrgIn(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=128)
    email: Optional[str] = Field(default=None, max_length=256)
    display_name: Optional[str] = Field(default=None, max_length=256)
    previous_org_id: Optional[str] = Field(default=None, max_length=128)
    """Pre-login checkout org (e.g. local-org) when subscription was activated before bind-user-org."""
    subscription_source_org_id: Optional[str] = Field(default=None, max_length=128)


def _stable_org_id_for_user(user_id: str) -> str:
    uid = user_id.strip()
    if not uid:
        raise ValueError("missing_user_id")
    return f"user-{uid}"


@router.post("/bind-user-org")
async def bind_user_org(body: BindUserOrgIn) -> Dict[str, Any]:
    user_id = body.user_id.strip()
    org_id = _stable_org_id_for_user(user_id)
    display = (body.display_name or body.email or "LawDog workspace").strip()[:200]

    ensure_organization(org_id, name=display)

    migrated_agreements: list[str] = []
    prev = (body.previous_org_id or "").strip()
    if prev and prev != org_id:
        ustore = get_usage_economics_store()
        ustore.init_schema()
        from_subject = f"org:{prev}"
        to_subject = f"org:{org_id}"
        try:
            with ustore._conn() as con:
                rows = con.execute(
                    "SELECT agreement_id FROM agreement_owner WHERE subject_ref = ?",
                    (from_subject,),
                ).fetchall()
                for row in rows:
                    aid = str(row[0] or "").strip()
                    if not aid:
                        continue
                    con.execute(
                        "UPDATE agreement_owner SET subject_ref = ? WHERE agreement_id = ?",
                        (to_subject, aid),
                    )
                    migrated_agreements.append(aid)
                    try:
                        from backend.services.agreement_draft_store import load_draft

                        draft = load_draft(aid)
                        if draft:
                            sync_agreement_draft_to_supabase(organization_id=org_id, draft=draft)
                    except Exception:
                        _log.exception("supabase_resync_failed aid=%s", aid)
        except Exception:
            _log.exception("migrate_org_agreements_failed prev=%s new=%s", prev, org_id)

    billing_migrated = False
    try:
        from backend.billing.workspace_billing_migration import migrate_entitled_subscription_to_org
        from backend.economics.store import get_economics_store

        eco = get_economics_store()
        eco.init_schema()
        if prev and prev != org_id:
            billing_migrated = migrate_entitled_subscription_to_org(
                eco,
                from_org_id=prev,
                to_org_id=org_id,
                user_id=user_id,
            )
        sub_src = (body.subscription_source_org_id or "").strip()
        if sub_src and sub_src not in (org_id, prev):
            billing_migrated = migrate_entitled_subscription_to_org(
                eco,
                from_org_id=sub_src,
                to_org_id=org_id,
                user_id=user_id,
            ) or billing_migrated
    except Exception:
        _log.exception("migrate_workspace_billing_failed prev=%s new=%s", prev, org_id)

    return {
        "ok": True,
        "org_id": org_id,
        "user_id": user_id,
        "migrated_agreement_count": len(migrated_agreements),
        "migrated_agreement_ids": migrated_agreements[:50],
        "billing_migrated": billing_migrated,
    }


@router.post("/demo-activate-subscription")
async def demo_activate_subscription(body: BindUserOrgIn) -> Dict[str, Any]:
    """Dev/QA/staging only: activate Pro subscription without Stripe."""
    import os

    env = os.getenv("CLAW_ENVIRONMENT", "local").strip().lower()
    prod_denied = env in ("production", "prod")
    non_prod_allowed = env in ("local", "dev", "test", "staging", "qa", "preview", "review")
    preview_like = env.startswith("preview") or env.startswith("review") or env.startswith("pr-")
    if prod_denied or not (non_prod_allowed or preview_like):
        raise HTTPException(status_code=404, detail="not_found")

    org_id = (body.previous_org_id or "").strip() or _stable_org_id_for_user(body.user_id)
    if not org_id:
        raise HTTPException(status_code=400, detail="missing_org_id")

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
        user_id=body.user_id.strip(),
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
    env = os.getenv("CLAW_ENVIRONMENT", "local").strip().lower()
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
    Bootstrap-only: validate admin secret once and issue a short-lived httpOnly session cookie.
    The secret is never stored client-side as a long-lived bypass credential.
    """
    configured = os.getenv("CLAW_ADMIN_SECRET", "").strip()
    presented = body.admin_secret.strip()
    if not configured or not presented or not secrets.compare_digest(configured, presented):
        raise HTTPException(status_code=401, detail="invalid_admin_secret")

    session_secret = session_secret_bytes()
    if not session_secret:
        raise HTTPException(status_code=503, detail="qa_session_unconfigured")

    token = mint_qa_payment_bypass_session(secret=session_secret)
    _attach_qa_payment_bypass_session_cookie(response=response, request=request, token=token)
    _log.info(
        "qa_payment_bypass_session_minted host=%s deployment=%s",
        request.url.hostname or "",
        os.getenv("CLAW_ENVIRONMENT", "local").strip().lower(),
    )
    return {"ok": True}


@router.get("/qa-payment-bypass/authorization")
async def qa_payment_bypass_authorization(request: Request) -> Dict[str, Any]:
    """
    Server-authoritative QA payment bypass authorization for public production hosts.
    Does not activate billing — only reports whether the caller may use QA bypass UI.
    """
    result = _resolve_qa_payment_bypass_authorization(request)
    _log.info(
        "qa_payment_bypass_authorization authorized=%s reason=%s host=%s deployment=%s",
        result["authorized"],
        result["reason"],
        request.url.hostname or "",
        os.getenv("CLAW_ENVIRONMENT", "local").strip().lower(),
    )
    return result
