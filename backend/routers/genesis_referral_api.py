"""Genesis Referral Access — capture, conversion, affiliate dashboard, admin ops."""

from __future__ import annotations

import csv
import io
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.affiliates import genesis_referral_service as genesis_svc
from backend.economics.genesis_referral_store import (
    admin_ops_summary,
    affiliate_dashboard_summary,
    commissions_csv_rows,
)
from backend.economics.store import get_economics_store

router = APIRouter(prefix="/v1/genesis-referral", tags=["genesis-referral"])


class CaptureReferralBody(BaseModel):
    referral_code: str = Field(..., min_length=2, max_length=64)
    visitor_id: str = Field(..., min_length=8, max_length=128)
    source_path: Optional[str] = Field(default=None, max_length=500)
    metadata: Optional[Dict[str, Any]] = None


class ConvertReferralBody(BaseModel):
    referral_code: str = Field(..., min_length=2, max_length=64)
    visitor_id: str = Field(..., min_length=8, max_length=128)
    referred_org_id: Optional[str] = Field(default=None, max_length=128)
    referred_user_id: Optional[str] = Field(default=None, max_length=128)


class CreateGenesisAffiliateBody(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=128)
    display_name: str = Field(..., min_length=1, max_length=160)
    referral_code: str = Field(..., min_length=2, max_length=64)
    community_slug: Optional[str] = Field(default=None, max_length=80)
    affiliate_status: str = Field(default="active", pattern="^(active|paused|revoked)$")
    payout_rate: float = Field(default=0.30, ge=0, le=1)
    reason: str = Field(..., min_length=3, max_length=500)


class CheckoutMetadataBody(BaseModel):
    org_id: str = Field(..., min_length=1, max_length=128)
    referral_code: Optional[str] = Field(default=None, max_length=64)
    visitor_id: Optional[str] = Field(default=None, max_length=128)
    user_id: Optional[str] = Field(default=None, max_length=128)
    plan_code: str = Field(default="pro", max_length=32)


def _require_admin(
    request: Request,
    *,
    permission: str,
    action_type: str,
    reason: Optional[str] = None,
    target_id: str = "global",
) -> Any:
    """Privileged Genesis ops via unified gate (principal + permission + reason + audit)."""
    from backend.security.privileged_ops import require_privileged_operator

    return require_privileged_operator(
        request,
        permission=permission,
        action_type=action_type,
        target_type="genesis",
        target_id=target_id,
        reason=reason,
    )


def _user_id_from_request(request: Request) -> str:
    """Affiliate identity from validated JWT/test principal — never client spoof headers."""
    from backend.security.supabase_jwt import require_supabase_user_id

    return require_supabase_user_id(request)


@router.post("/capture")
async def capture_referral(body: CaptureReferralBody) -> Dict[str, Any]:
    """Public, no auth — soft-fail (ok:false) so invalid refs never block client flows."""
    eco = get_economics_store()
    out = genesis_svc.capture_referral_visit(
        eco,
        referral_code=body.referral_code,
        visitor_id=body.visitor_id,
        source_path=body.source_path,
        metadata=body.metadata,
    )
    return out


@router.post("/convert")
async def convert_referral(request: Request, body: ConvertReferralBody) -> Dict[str, Any]:
    """Authenticated convert — org/user must match validated principal."""
    from backend.security.commercial_auth import require_org_matches_principal
    from backend.security.supabase_jwt import require_supabase_user_id

    uid = require_supabase_user_id(request)
    require_org_matches_principal(request, body.referred_org_id)
    body_uid = (body.referred_user_id or "").strip()
    if body_uid and body_uid != uid:
        raise HTTPException(
            status_code=403,
            detail={"code": "cross_user_denied", "message": "referred_user_id must match principal."},
        )
    eco = get_economics_store()
    out = genesis_svc.convert_referral(
        eco,
        referral_code=body.referral_code,
        visitor_id=body.visitor_id,
        referred_org_id=body.referred_org_id,
        referred_user_id=uid,
    )
    if not out.get("ok"):
        code = 400
        if out.get("error") == "self_referral":
            code = 409
        raise HTTPException(status_code=code, detail=out.get("error", "convert_failed"))
    return out


@router.post("/checkout-metadata")
async def checkout_metadata(request: Request, body: CheckoutMetadataBody) -> Dict[str, Any]:
    """Stripe-ready metadata — authenticated; org/user bound to principal."""
    from backend.security.commercial_auth import require_org_matches_principal
    from backend.security.supabase_jwt import require_supabase_user_id

    uid = require_supabase_user_id(request)
    require_org_matches_principal(request, body.org_id)
    body_uid = (body.user_id or "").strip()
    if body_uid and body_uid != uid:
        raise HTTPException(
            status_code=403,
            detail={"code": "cross_user_denied", "message": "user_id must match principal."},
        )
    md = genesis_svc.build_stripe_checkout_metadata(
        org_id=body.org_id,
        referral_code=body.referral_code,
        visitor_id=body.visitor_id,
        user_id=uid,
        plan_code=body.plan_code,
    )
    return {"ok": True, "metadata": md}


@router.get("/affiliate/me")
async def affiliate_me(request: Request) -> Dict[str, Any]:
    uid = _user_id_from_request(request)
    eco = get_economics_store()
    eco.init_schema()
    with eco._conn() as con:
        summary = affiliate_dashboard_summary(con, uid)
    if not summary.get("ok"):
        raise HTTPException(status_code=404, detail=summary.get("error", "not_found"))
    return summary


@router.post("/ops/affiliates")
async def ops_create_affiliate(request: Request, body: CreateGenesisAffiliateBody) -> Dict[str, Any]:
    from backend.security.privileged_ops import PERM_MUTATE_SUPPORT

    _require_admin(
        request,
        permission=PERM_MUTATE_SUPPORT,
        action_type="genesis_ops_create_affiliate",
        reason=body.reason,
        target_id=(body.referral_code or "affiliate")[:128],
    )
    eco = get_economics_store()
    return genesis_svc.create_genesis_affiliate(
        eco,
        user_id=body.user_id,
        display_name=body.display_name,
        referral_code=body.referral_code,
        community_slug=body.community_slug,
        affiliate_status=body.affiliate_status,
        payout_rate=body.payout_rate,
    )


@router.get("/ops/summary")
async def ops_summary(request: Request) -> Dict[str, Any]:
    from backend.security.privileged_ops import PERM_READ_OPS

    _require_admin(
        request,
        permission=PERM_READ_OPS,
        action_type="genesis_ops_summary",
        target_id="summary",
    )
    eco = get_economics_store()
    eco.init_schema()
    with eco._conn() as con:
        return admin_ops_summary(con)


@router.get("/ops/commissions/export.csv")
async def ops_commissions_csv(request: Request) -> Response:
    from backend.security.privileged_ops import PERM_READ_OPS

    _require_admin(
        request,
        permission=PERM_READ_OPS,
        action_type="genesis_ops_commissions_export",
        target_id="commissions_export",
    )
    eco = get_economics_store()
    eco.init_schema()
    with eco._conn() as con:
        rows = commissions_csv_rows(con)
    buf = io.StringIO()
    writer = csv.DictWriter(
        buf,
        fieldnames=[
            "id",
            "referrer_user_id",
            "display_name",
            "referral_code",
            "referred_org_id",
            "referred_user_id",
            "stripe_customer_id",
            "stripe_subscription_id",
            "stripe_invoice_id",
            "gross_amount",
            "commission_rate",
            "commission_amount",
            "status",
            "period_start",
            "period_end",
            "created_at",
            "updated_at",
            "void_reason",
        ],
        extrasaction="ignore",
    )
    writer.writeheader()
    for r in rows:
        writer.writerow(r)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="genesis_commissions.csv"'},
    )
