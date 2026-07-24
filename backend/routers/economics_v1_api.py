from __future__ import annotations

import hashlib
import json
import os
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from backend.affiliates import payout_batches as affiliate_payout_batches
from backend.affiliates import safe_batch_export as affiliate_safe_batch_export
from backend.affiliates import trust_ledger as affiliate_trust_ledger
from backend.affiliates.payout_ops_summary import (
    build_payout_batch_summary,
    list_payout_batch_summaries,
)
from backend.affiliates import payouts as affiliate_payouts
from backend.affiliates import service as affiliate_service
from backend.economics import config as econ_config
from backend.billing import subscriptions as subs
from backend.billing import usage_metering
from backend.billing.usage_receipt_service import generate_usage_receipt
from backend.economics.store import get_economics_store
from backend.verification.usage_bundle import build_usage_bundle
from backend.usage_economics.store import get_usage_economics_store
from backend.usage_economics.policy import require_claw_org_id_header

router = APIRouter(prefix="/v1", tags=["economics"])


class CreateAffiliateBody(BaseModel):
    affiliate_code: str = Field(..., min_length=2)
    wallet_address: str
    display_name: Optional[str] = None
    owner_org_id: Optional[str] = None


class RecordAffiliateTrustClickBody(BaseModel):
    referral_code: str = Field(..., min_length=2)
    idempotency_key: str = Field(..., min_length=8, max_length=160)
    agreement_id: Optional[str] = Field(default=None, max_length=128)


class AttributeAffiliateBody(BaseModel):
    org_id: str
    affiliate_code: str
    attribution_type: str = "signup"
    signup_email: Optional[str] = Field(
        default=None,
        description="Optional — disposable domains and clustering heuristics (hashed at rest where applicable).",
    )
    device_fingerprint: Optional[str] = Field(
        default=None,
        max_length=512,
        description="Opaque client-stable id (hashed server-side); never store raw device ids in logs.",
    )


class MeterUsageBody(BaseModel):
    org_id: str
    service_type: str
    unit_count: float = 1.0
    user_id: Optional[str] = None
    reference_id: Optional[str] = None


class AffiliateAccessRequestBody(BaseModel):
    request_type: str = Field(..., min_length=3, max_length=64)
    doginal_pfp_number: Optional[int] = Field(default=None, ge=1, le=10000)
    dao_name: Optional[str] = Field(default=None, max_length=160)
    x_handle: Optional[str] = Field(default=None, max_length=64)
    email: Optional[str] = Field(default=None, max_length=254)
    note: Optional[str] = Field(default=None, max_length=500)


class ReviewAffiliateAccessRequestBody(BaseModel):
    status: str = Field(..., min_length=4, max_length=24)
    review_note: Optional[str] = Field(default=None, max_length=500)


class CreateAffiliateLinkBody(BaseModel):
    requested_handle: str = Field(..., min_length=3, max_length=32)


def _request_client_ip(request: Request) -> str:
    ip = ""
    try:
        if request.client:
            ip = request.client.host or ""
    except Exception:
        ip = ""
    fwd = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    return fwd or ip


def _validate_x_handle(raw: Optional[str]) -> Optional[str]:
    h = (raw or "").strip()
    if not h:
        return None
    if h.startswith("@"):
        h = h[1:]
    h = h.lower()
    if not h or len(h) > 32:
        raise HTTPException(status_code=400, detail="invalid_x_handle")
    if not all(ch.isalnum() or ch == "_" for ch in h):
        raise HTTPException(status_code=400, detail="invalid_x_handle")
    return h


def _sanitize_request_type(raw: str) -> str:
    t = (raw or "").strip().lower()
    allowed = {"doginal_holder", "trait_dao_partner", "csn_creator_partner", "other"}
    if t not in allowed:
        raise HTTPException(status_code=400, detail="invalid_request_type")
    return t


def _affiliate_access_status_payload(
    eco: Any, *, org_id: Optional[str], email: Optional[str]
) -> Dict[str, Any]:
    sub_row = subs.get_subscription_for_org(eco, (org_id or "").strip()) if org_id else None
    status = str((sub_row or {}).get("status") or "").strip().lower()
    paid_subscriber = status in ("active", "trialing")
    existing_affiliate = (
        eco.get_affiliate_by_owner_org((org_id or "").strip()) if org_id else None
    )
    req = eco.get_latest_affiliate_access_request(org_id=org_id, email=email)
    approved = bool(req and str(req.get("status") or "").strip().lower() == "approved")
    return {
        "ok": True,
        "eligibility": {
            "paid_subscriber": paid_subscriber,
            "manual_approved": approved,
            "can_create_link": bool(paid_subscriber or approved),
            "has_active_affiliate": bool(existing_affiliate),
        },
        "request": req,
    }


@router.post("/affiliates")
async def create_affiliate(request: Request, body: CreateAffiliateBody) -> Dict[str, Any]:
    from backend.security.commercial_auth import require_org_matches_principal
    from backend.security.legacy_affiliate_commercial_gate import (
        deny_legacy_private_affiliate_in_commercial,
    )

    deny_legacy_private_affiliate_in_commercial(request)
    require_org_matches_principal(request, body.owner_org_id)
    out = affiliate_service.create_affiliate(
        affiliate_code=body.affiliate_code,
        wallet_address=body.wallet_address,
        display_name=body.display_name,
        owner_org_id=body.owner_org_id,
    )
    if not out.get("ok"):
        raise HTTPException(status_code=400, detail=out.get("error", "failed"))
    return out


@router.post("/affiliates/create-link")
async def create_affiliate_link(request: Request, body: CreateAffiliateLinkBody) -> Dict[str, Any]:
    from backend.security.commercial_auth import require_commercial_owner_principal
    from backend.security.legacy_affiliate_commercial_gate import (
        deny_legacy_private_affiliate_in_commercial,
    )

    deny_legacy_private_affiliate_in_commercial(request)
    eco = get_economics_store()
    eco.init_schema()
    require_commercial_owner_principal(request)
    org_id = require_claw_org_id_header(request).strip()
    st = _affiliate_access_status_payload(eco, org_id=org_id, email=None)
    eligibility = st.get("eligibility") or {}
    if not bool(eligibility.get("can_create_link")):
        raise HTTPException(status_code=403, detail="affiliate_link_not_enabled_for_org")
    out = affiliate_service.create_affiliate_link_for_org(
        owner_org_id=org_id,
        requested_handle=body.requested_handle,
        economics=eco,
    )
    if not out.get("ok"):
        err = str(out.get("error") or "failed")
        if err == "invalid_handle":
            raise HTTPException(status_code=400, detail="invalid_handle")
        if err == "handle_taken":
            raise HTTPException(status_code=409, detail="handle_taken")
        raise HTTPException(status_code=400, detail=err)
    aff = eco.get_affiliate_by_owner_org(org_id)
    code = str((aff or {}).get("affiliate_code") or out.get("affiliate_code") or "").strip()
    return {
        "ok": True,
        "created": bool(out.get("created")),
        "affiliate": aff,
        "referral": {
            "canonical_at_path": f"/@{code}" if code else str(out.get("canonical_at_path") or ""),
        },
    }


@router.get("/affiliates/access-request/status")
async def affiliate_access_request_status(request: Request) -> Dict[str, Any]:
    from backend.security.legacy_affiliate_commercial_gate import (
        deny_legacy_private_affiliate_in_commercial,
    )

    deny_legacy_private_affiliate_in_commercial(request)
    eco = get_economics_store()
    eco.init_schema()
    org_id = (request.headers.get("X-Claw-Org-Id") or "").strip() or None
    email = (request.headers.get("X-Claw-Email") or "").strip().lower() or None
    return _affiliate_access_status_payload(eco, org_id=org_id, email=email)


@router.post("/affiliates/access-request")
async def create_affiliate_access_request(
    request: Request, body: AffiliateAccessRequestBody
) -> Dict[str, Any]:
    from backend.security.legacy_affiliate_commercial_gate import (
        deny_legacy_private_affiliate_in_commercial,
    )

    deny_legacy_private_affiliate_in_commercial(request)
    eco = get_economics_store()
    eco.init_schema()
    org_id = (request.headers.get("X-Claw-Org-Id") or "").strip() or None
    email = (body.email or "").strip().lower() or (
        (request.headers.get("X-Claw-Email") or "").strip().lower() or None
    )
    xh = _validate_x_handle(body.x_handle)
    req_type = _sanitize_request_type(body.request_type)
    dao_name = (body.dao_name or "").strip()[:160] or None
    note = (body.note or "").strip()[:500] or None
    doginal_num = int(body.doginal_pfp_number) if body.doginal_pfp_number else None
    ip = _request_client_ip(request)
    ip_hash = hashlib.sha256(f"ip:{ip}".encode("utf-8")).hexdigest()[:24] if ip else None
    fp_material = "|".join(
        [
            str(org_id or ""),
            str(email or ""),
            req_type,
            str(doginal_num or ""),
            str(xh or ""),
        ]
    )
    fingerprint = hashlib.sha256(fp_material.encode("utf-8")).hexdigest()[:40]
    out = eco.create_affiliate_access_request(
        request_id=str(uuid.uuid4()),
        org_id=org_id,
        email=email,
        request_type=req_type,
        doginal_pfp_number=doginal_num,
        dao_name=dao_name,
        x_handle=xh,
        note=note,
        ip_hash=ip_hash,
        request_fingerprint=fingerprint,
    )
    return {"ok": True, "created": bool(out.get("created")), "request": out.get("request")}


@router.post("/affiliates/attribute")
async def attribute_affiliate(request: Request, body: AttributeAffiliateBody) -> Dict[str, Any]:
    from backend.payments.store import get_onramp_store
    from backend.treasury.treasury_store import get_treasury_store
    from backend.security.commercial_auth import require_org_matches_principal

    require_org_matches_principal(request, body.org_id)

    client_ip = None
    try:
        if request.client:
            client_ip = request.client.host
    except Exception:
        client_ip = None
    fwd = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if fwd:
        client_ip = fwd
    out = affiliate_service.attribute_affiliate(
        org_id=body.org_id,
        affiliate_code=body.affiliate_code,
        attribution_type=body.attribution_type,
        store=get_onramp_store(),
        treasury=get_treasury_store(),
        payment_id=None,
        emit_event=True,
        signup_ip=client_ip,
        device_fingerprint=body.device_fingerprint,
        signup_email=body.signup_email.strip() if body.signup_email else None,
    )
    if not out.get("ok"):
        raise HTTPException(status_code=400, detail=out.get("error", "failed"))
    return out


@router.get("/affiliates/{affiliate_id}")
async def get_affiliate(affiliate_id: str, request: Request) -> Dict[str, Any]:
    from backend.security.commercial_auth import require_commercial_owner_principal
    from backend.security.legacy_affiliate_commercial_gate import (
        deny_legacy_private_affiliate_in_commercial,
    )

    deny_legacy_private_affiliate_in_commercial(request)
    require_commercial_owner_principal(request)
    row = affiliate_service.get_affiliate(affiliate_id)
    if not row:
        raise HTTPException(status_code=404, detail="not_found")
    owner_org = str((row or {}).get("owner_org_id") or "").strip()
    if not owner_org:
        # Ownerless rows are never readable via this commercial-denied surface.
        raise HTTPException(status_code=404, detail="not_found")
    from backend.security.commercial_auth import require_org_matches_principal

    require_org_matches_principal(request, owner_org)
    return dict(row)


@router.get("/affiliates/{affiliate_id}/accruals")
async def list_accruals(affiliate_id: str, request: Request) -> Dict[str, Any]:
    from backend.security.commercial_auth import require_commercial_owner_principal, require_org_matches_principal
    from backend.security.legacy_affiliate_commercial_gate import (
        deny_legacy_private_affiliate_in_commercial,
    )

    deny_legacy_private_affiliate_in_commercial(request)
    require_commercial_owner_principal(request)
    row = affiliate_service.get_affiliate(affiliate_id)
    if not row:
        raise HTTPException(status_code=404, detail="not_found")
    owner_org = str((row or {}).get("owner_org_id") or "").strip()
    if not owner_org:
        raise HTTPException(status_code=404, detail="not_found")
    require_org_matches_principal(request, owner_org)
    eco = get_economics_store()
    eco.init_schema()
    rows = eco.list_accruals_for_affiliate(affiliate_id)
    return {"accruals": rows}


@router.post("/affiliates/payouts/run")
async def run_payouts(request: Request) -> Dict[str, Any]:
    from backend.security.privileged_ops import PERM_MUTATE_FINANCIAL, require_privileged_operator

    require_privileged_operator(
        request,
        permission=PERM_MUTATE_FINANCIAL,
        action_type="affiliate_payouts_run",
        target_type="affiliate_payouts",
        target_id="run",
        reason=(request.headers.get("x-claw-admin-reason") or "").strip() or None,
    )
    as_of = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return affiliate_payouts.run_payout_cycle(as_of_iso=as_of)


def _require_affiliate_ops(request: Request, *, action_type: str = "affiliate_ops") -> None:
    """Operator principal + reason; optional affiliate-ops secret as second factor when set."""
    from backend.security.privileged_ops import PERM_MUTATE_FINANCIAL, require_privileged_operator

    require_privileged_operator(
        request,
        permission=PERM_MUTATE_FINANCIAL,
        action_type=action_type,
        target_type="affiliate_ops",
        target_id=action_type,
        reason=(request.headers.get("x-claw-admin-reason") or "").strip() or None,
    )
    secret = os.getenv("CLAW_AFFILIATE_OPS_SECRET", "").strip()
    if secret:
        presented = (request.headers.get("X-Claw-Affiliate-Ops") or "").strip()
        if not presented or not secrets.compare_digest(presented, secret):
            raise HTTPException(status_code=403, detail="forbidden")


class PrepareAffiliatePayoutBatchesBody(BaseModel):
    notes: Optional[str] = Field(default=None, max_length=2000)


class MarkAffiliateBatchPaidBody(BaseModel):
    tx_hash: Optional[str] = Field(default=None, max_length=256)
    network: str = Field(default="base", max_length=64)


@router.post("/affiliates/ops/payout-batches/prepare")
async def affiliate_ops_prepare_payout_batches(
    request: Request, body: PrepareAffiliatePayoutBatchesBody
) -> Dict[str, Any]:
    _require_affiliate_ops(request)
    as_of = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return affiliate_payout_batches.prepare_draft_earning_batches(
        as_of_iso=as_of, notes=body.notes
    )


@router.post("/affiliates/ops/payout-batches/{batch_id}/exported")
async def affiliate_ops_mark_batch_exported(batch_id: str, request: Request) -> Dict[str, Any]:
    _require_affiliate_ops(request)
    out = affiliate_payout_batches.mark_batch_exported(batch_id=batch_id)
    if not out.get("ok"):
        raise HTTPException(status_code=400, detail=out.get("error", "failed"))
    return out


@router.post("/affiliates/ops/payout-batches/{batch_id}/paid")
async def affiliate_ops_mark_batch_paid(
    batch_id: str, request: Request, body: MarkAffiliateBatchPaidBody
) -> Dict[str, Any]:
    _require_affiliate_ops(request)
    out = affiliate_payout_batches.mark_batch_paid(
        batch_id=batch_id,
        tx_hash=body.tx_hash,
        network=body.network,
    )
    if not out.get("ok"):
        raise HTTPException(status_code=400, detail=out.get("error", "failed"))
    return out


@router.post("/affiliates/ops/payout-batches/{batch_id}/cancel")
async def affiliate_ops_cancel_draft_batch(batch_id: str, request: Request) -> Dict[str, Any]:
    _require_affiliate_ops(request)
    out = affiliate_payout_batches.cancel_draft_batch(batch_id=batch_id)
    if not out.get("ok"):
        raise HTTPException(status_code=400, detail=out.get("error", "failed"))
    return out


@router.get("/affiliates/ops/payout-batches/{batch_id}/safe-json")
async def affiliate_ops_export_payout_batch_safe_json(batch_id: str, request: Request) -> JSONResponse:
    _require_affiliate_ops(request)
    try:
        payload = affiliate_safe_batch_export.build_safe_payout_batch_json(batch_id=batch_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return JSONResponse(content=payload)


@router.get("/affiliates/ops/payout-batches/{batch_id}/export-csv")
async def affiliate_ops_export_payout_batch_csv(batch_id: str, request: Request) -> Response:
    _require_affiliate_ops(request)
    try:
        fname, body = affiliate_payout_batches.build_payout_batch_csv(batch_id=batch_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="batch_not_found") from None
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/affiliates/ops/affiliates/{affiliate_id}/quality")
async def affiliate_ops_get_quality(affiliate_id: str, request: Request) -> Dict[str, Any]:
    _require_affiliate_ops(request)
    eco = get_economics_store()
    eco.init_schema()
    prof = eco.get_gamification_profile(affiliate_id) or {}
    raw = prof.get("affiliate_quality_factors_json")
    factors = None
    if raw and isinstance(raw, str):
        try:
            factors = json.loads(raw)
        except json.JSONDecodeError:
            factors = {"parse_error": True}
    return {
        "affiliate_id": affiliate_id,
        "affiliate_quality_score": prof.get("affiliate_quality_score"),
        "affiliate_risk_flag": bool(int(prof.get("affiliate_risk_flag") or 0)),
        "factors": factors,
    }


@router.get("/affiliates/ops/payout-context")
async def affiliate_ops_payout_context(request: Request) -> Dict[str, Any]:
    _require_affiliate_ops(request)
    return {
        "payout_safe_address": econ_config.affiliate_payout_safe_multisig_address(),
        "chain_id": int(econ_config.affiliate_payout_chain_id()),
        "network": str(econ_config.payout_network()),
        "asset": str(econ_config.payout_asset()),
        "usdc_contract": str(econ_config.affiliate_base_usdc_contract()),
        "explorer_tx_url_template": str(econ_config.affiliate_payout_explorer_tx_url_template()),
        "require_tx_hash_for_mark_paid": bool(econ_config.affiliate_require_tx_hash_for_mark_paid()),
        "treasury_stub_configured": econ_config.affiliate_treasury_safe_balance_usdc_stub() is not None,
    }


@router.get("/affiliates/ops/payout-batches")
async def affiliate_ops_list_payout_batches(
    request: Request, limit: int = Query(default=50, ge=1, le=200)
) -> Dict[str, Any]:
    _require_affiliate_ops(request)
    batches = list_payout_batch_summaries(limit=limit)
    return {"batches": batches}


@router.get("/affiliates/ops/payout-batches/{batch_id}/summary")
async def affiliate_ops_payout_batch_summary(batch_id: str, request: Request) -> Dict[str, Any]:
    _require_affiliate_ops(request)
    summ = build_payout_batch_summary(batch_id)
    if not summ:
        raise HTTPException(status_code=404, detail="not_found")
    return summ


@router.get("/affiliates/ops/operator-alerts")
async def affiliate_ops_operator_alerts(
    request: Request, limit: int = Query(default=100, ge=1, le=500)
) -> Dict[str, Any]:
    _require_affiliate_ops(request)
    eco = get_economics_store()
    eco.init_schema()
    rows = eco.list_operator_alerts(limit=limit)
    return {"alerts": rows}


@router.post("/affiliates/trust/record-click")
async def record_affiliate_trust_click(
    request: Request, body: RecordAffiliateTrustClickBody
) -> Dict[str, Any]:
    """Append-only click attribution (caller supplies stable idempotency_key per browser session)."""
    eco = get_economics_store()
    eco.init_schema()
    ip = (request.client.host if request.client else "") or ""
    fwd = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if fwd:
        ip = fwd
    h = hashlib.sha256(f"ip:{ip}".encode("utf-8")).hexdigest()[:24] if ip else None
    out = affiliate_trust_ledger.record_click_attributed(
        eco,
        referral_code=body.referral_code,
        idempotency_key=body.idempotency_key.strip(),
        customer_ref_hash=h,
        agreement_id=(body.agreement_id or "").strip() or None,
    )
    if not out.get("ok"):
        raise HTTPException(status_code=400, detail=out.get("error", "failed"))
    return out


@router.post("/affiliates/ops/trust/friday-rollover")
async def affiliate_ops_trust_friday_rollover(request: Request) -> Dict[str, Any]:
    _require_affiliate_ops(request)
    eco = get_economics_store()
    eco.init_schema()
    return affiliate_trust_ledger.run_friday_rollover_pass(eco)


@router.get("/affiliates/ops/trust/affiliate-preview")
async def affiliate_ops_trust_affiliate_preview(
    request: Request, limit: int = Query(default=80, ge=1, le=500)
) -> Dict[str, Any]:
    """Operator snapshot: trust balances + Friday eligibility (data-driven)."""
    _require_affiliate_ops(request)
    eco = get_economics_store()
    eco.init_schema()
    rows_out: List[Dict[str, Any]] = []
    for row in eco.iter_affiliate_ids_for_trust_rollover()[:limit]:
        aid = str(row.get("id") or "")
        code = str(row.get("affiliate_code") or "").strip()
        if not aid:
            continue
        tw = affiliate_trust_ledger.build_trust_dashboard(
            eco, affiliate_id=aid, referral_code=code or aid
        )
        rows_out.append(
            {
                "affiliate_id": aid,
                "referral_code": tw.get("referral_code"),
                "unpaid_total_usd": tw.get("unpaid_total_usd"),
                "eligible_next_payout": tw.get("eligible_next_payout"),
                "rolling_forward_usd": tw.get("rolling_forward_usd"),
                "lifetime_paid_usd": tw.get("lifetime_paid_usd"),
                "clicks": tw.get("clicks"),
                "conversions": tw.get("conversions"),
            }
        )
    return {"affiliates": rows_out}


@router.get("/affiliates/ops/access-requests")
async def affiliate_ops_access_requests(
    request: Request,
    status: str = Query(default="pending"),
    request_type: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
) -> Dict[str, Any]:
    _require_affiliate_ops(request)
    eco = get_economics_store()
    eco.init_schema()
    rows = eco.list_affiliate_access_requests(
        status=(status or "").strip().lower() or None,
        request_type=(request_type or "").strip().lower() or None,
        limit=limit,
    )
    return {"requests": rows}


@router.post("/affiliates/ops/access-requests/{request_id}/review")
async def affiliate_ops_review_access_request(
    request_id: str, request: Request, body: ReviewAffiliateAccessRequestBody
) -> Dict[str, Any]:
    _require_affiliate_ops(request)
    eco = get_economics_store()
    eco.init_schema()
    reviewer = (request.headers.get("X-Claw-Reviewer") or "").strip() or "ops"
    try:
        row = eco.review_affiliate_access_request(
            request_id=request_id,
            status=(body.status or "").strip().lower(),
            reviewed_by=reviewer,
            review_note=body.review_note,
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid_status") from None
    if not row:
        raise HTTPException(status_code=404, detail="not_found")
    return {"ok": True, "request": row}


@router.get("/orgs/{org_id}/keys")
async def get_org_keys(org_id: str, request: Request) -> Dict[str, Any]:
    from backend.security.commercial_auth import require_org_matches_principal

    require_org_matches_principal(request, org_id)
    return usage_metering.get_key_balance(org_id)


@router.post("/usage/meter")
async def post_meter(request: Request, body: MeterUsageBody) -> Dict[str, Any]:
    from backend.security.commercial_auth import require_org_matches_principal

    uid = require_org_matches_principal(request, body.org_id)
    # Actor user_id must match authenticated principal when provided.
    body_uid = (body.user_id or "").strip()
    if body_uid and body_uid != uid:
        raise HTTPException(
            status_code=403,
            detail={"code": "cross_user_denied", "message": "Meter user_id does not match principal."},
        )
    out = usage_metering.meter_usage(
        org_id=body.org_id,
        user_id=uid,
        service_type=body.service_type,
        unit_count=body.unit_count,
        reference_id=body.reference_id,
    )
    if not out.get("ok"):
        raise HTTPException(status_code=402, detail=out)
    return out


@router.get("/usage/{usage_id}/receipt")
async def get_usage_receipt(usage_id: str, request: Request) -> Dict[str, Any]:
    from backend.security.receipt_access import require_usage_receipt_access

    require_usage_receipt_access(request, usage_id)
    try:
        return generate_usage_receipt(usage_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/usage/{usage_id}/bundle")
async def get_usage_bundle(usage_id: str, request: Request) -> Dict[str, Any]:
    from backend.security.receipt_access import require_usage_receipt_access

    require_usage_receipt_access(request, usage_id)
    try:
        return build_usage_bundle(usage_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc



@router.get("/subscriptions/{org_id}")
async def get_subscription(org_id: str, request: Request) -> Dict[str, Any]:
    from backend.security.commercial_auth import require_org_matches_principal

    require_org_matches_principal(request, org_id)
    eco = get_economics_store()
    eco.init_schema()
    row = subs.get_subscription_for_org(eco, org_id)
    if not row:
        # Missing subscription is a normal probe result (local-org, pre-checkout, stale org id).
        # Never 404 — callers treat null as free/no plan without poisoning checkout-return flows.
        return {"subscription": None}
    return {"subscription": row}


@router.get("/internal/usage-economics/overview")
async def internal_usage_economics_overview(request: Request) -> Dict[str, Any]:
    """Operator-only: internal Key counters & subjects (never shown in product UI)."""
    from backend.security.privileged_ops import PERM_READ_OPS, require_privileged_operator

    require_privileged_operator(
        request,
        permission=PERM_READ_OPS,
        action_type="internal_usage_economics_overview",
        target_type="usage_economics",
        target_id="overview",
        reason=(request.headers.get("x-claw-admin-reason") or "").strip() or None,
    )
    # Optional second factor when CLAW_ADMIN_TOKEN is configured.
    expected = os.getenv("CLAW_ADMIN_TOKEN", "").strip()
    if expected:
        presented = (request.headers.get("X-Claw-Admin-Token") or "").strip()
        if not presented or not secrets.compare_digest(presented, expected):
            raise HTTPException(status_code=403, detail="forbidden")
    try:
        from backend.ops.break_glass_audit import BreakGlassAction, log_break_glass_event

        log_break_glass_event(
            request,
            BreakGlassAction.INTERNAL_USAGE_ECONOMICS_OVERVIEW,
            auth_channel="x-claw-admin-token",
        )
    except Exception:
        pass
    ustore = get_usage_economics_store()
    ustore.init_schema()
    eco = get_economics_store()
    eco.init_schema()
    free_vs_paid = {"paid_org_rows": 0, "note": "Heuristic: orgs with active subscription in economics DB."}
    try:
        with eco._conn() as con:
            row = con.execute(
                "SELECT COUNT(*) AS c FROM subscriptions WHERE status = 'active'"
            ).fetchone()
            free_vs_paid["paid_org_rows"] = int(row[0]) if row else 0
    except Exception:
        pass
    return {
        "subjects": ustore.admin_aggregate_subjects(),
        "recent_events": ustore.list_recent_events(150),
        "distribution": free_vs_paid,
    }
