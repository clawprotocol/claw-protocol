"""
Affiliate Momentum — profiles, dashboard, leaderboard.

Org-scoped routes require ``X-Claw-Org-Id`` to match path ``org_id``.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from backend.affiliates.badges_catalog import BADGE_BY_ID, all_badge_definitions
from backend.affiliates.gamification_events import emit_affiliate_gamification_event
from backend.affiliates.gamification_sync import run_affiliate_gamification_sync
from backend.affiliates import trust_ledger as affiliate_trust_ledger
from backend.affiliates.momentum import (
    build_leaderboard_rows,
    get_leaderboard_rank,
    momentum_scores_for_affiliate,
)
from backend.affiliates.affiliate_quality import compute_and_persist_affiliate_quality
from backend.affiliates.evm_wallet import validate_evm_wallet_address
from backend.affiliates.progression import next_progression_target
from backend.economics import config as econ_config
from backend.economics.store import get_economics_store
from backend.security.legacy_affiliate_commercial_gate import (
    deny_legacy_private_affiliate_in_commercial,
)
from backend.usage_economics.policy import require_claw_org_id_header

router = APIRouter(
    prefix="/v1/orgs/{org_id}/affiliate/gamification",
    tags=["affiliate-gamification"],
    dependencies=[Depends(deny_legacy_private_affiliate_in_commercial)],
)

SCHEMA_VERSION = "claw.affiliate.gamification/v2"


def _require_org_match(request: Request, org_id_path: str) -> str:
    oid = require_claw_org_id_header(request).strip()
    from backend.security.commercial_auth import require_commercial_owner_principal
    require_commercial_owner_principal(request)
    if oid != (org_id_path or "").strip():
        raise HTTPException(
            status_code=403,
            detail={"code": "org_mismatch", "message": "X-Claw-Org-Id must match this org path."},
        )
    return oid


def _affiliate_dashboard_core(
    org_id: str,
    *,
    emit_open: bool,
    include_celebrations: bool,
) -> Dict[str, Any]:
    eco = get_economics_store()
    eco.init_schema()
    aff = eco.get_affiliate_by_owner_org(org_id.strip())
    if not aff:
        raise HTTPException(status_code=404, detail="no_affiliate_for_org")
    aid = str(aff["id"])
    if emit_open:
        emit_affiliate_gamification_event("affiliate_profile_opened", org_id=org_id.strip(), affiliate_id=aid)
    counts, momentum_pending, momentum_confirmed = momentum_scores_for_affiliate(eco, aid)
    sync = run_affiliate_gamification_sync(
        eco, aid, counts=counts, momentum=momentum_confirmed
    )
    prof = eco.get_gamification_profile(aid) or {}
    try:
        compute_and_persist_affiliate_quality(eco, aid)
        prof = eco.get_gamification_profile(aid) or prof
    except Exception:
        pass

    rank = get_leaderboard_rank(eco, aid)
    next_ms = next_progression_target(momentum)
    unlocks: List[Dict[str, Any]] = list(sync["badge_unlocks"])
    recent = sorted(
        unlocks,
        key=lambda x: str(x.get("unlocked_at") or ""),
        reverse=True,
    )[:8]
    recent_wins: List[Dict[str, Any]] = []
    for u in recent:
        bid = str(u.get("badge_id") or "")
        meta = BADGE_BY_ID.get(bid)
        recent_wins.append(
            {
                "badge_id": bid,
                "title": meta.title if meta else bid,
                "visual": meta.visual if meta else "·",
                "unlocked_at": u.get("unlocked_at"),
            }
        )

    badges_detailed: List[Dict[str, Any]] = []
    for u in unlocks:
        bid = str(u.get("badge_id") or "")
        meta = BADGE_BY_ID.get(bid)
        badges_detailed.append(
            {
                "badge_id": bid,
                "title": meta.title if meta else bid,
                "description": meta.description if meta else "",
                "visual": meta.visual if meta else "·",
                "category": meta.category if meta else "general",
                "unlocked_at": u.get("unlocked_at"),
            }
        )
    badges_detailed.sort(key=lambda x: str(x.get("unlocked_at") or ""), reverse=True)

    celebrations = sync["celebrations"] if include_celebrations else {"badges": [], "tier_upgrade": None}

    display_name = str(aff.get("display_name") or "").strip() or str(aff.get("affiliate_code") or aid)
    code_slug = str(aff.get("affiliate_code") or "").strip()
    doginal_verified = bool(int(prof.get("doginal_verified") or 0))
    ledger = eco.affiliate_earnings_usd_summary(aid)
    total_credited = eco.affiliate_earnings_total_credited_usd(aid)
    timeline_rows = eco.list_affiliate_earnings_timeline(aid, limit=40)
    latest_payout = eco.get_latest_completed_affiliate_payout(aid)
    paying_ref = eco.count_affiliate_paying_referred_orgs(aid)
    pm_row = eco.get_affiliate_payout_method_row(aid, "usdc_wallet")
    payout_method = "none"
    if pm_row and str(pm_row.get("status") or "") == "active":
        w = (pm_row.get("usdc_wallet_address") or "").strip()
        if w.startswith("0x") and len(w) == 42:
            payout_method = "usdc_wallet"
    elif str(aff.get("wallet_address") or "").startswith("0x"):
        payout_method = "usdc_wallet"

    wallet_display: Optional[str] = None
    try:
        if pm_row and (pm_row.get("usdc_wallet_address") or "").strip():
            wallet_display = validate_evm_wallet_address(str(pm_row.get("usdc_wallet_address")))
        elif (aff.get("wallet_address") or "").strip():
            wallet_display = validate_evm_wallet_address(str(aff.get("wallet_address")))
    except ValueError:
        wallet_display = None

    explorer_tpl = econ_config.affiliate_payout_explorer_tx_url_template()
    latest_out: Optional[Dict[str, Any]] = None
    if latest_payout:
        th = str(latest_payout.get("tx_hash") or "").strip()
        latest_out = {
            "payout_id": str(latest_payout["id"]),
            "amount_usd": round(float(latest_payout.get("amount_usd") or 0), 2),
            "paid_at": latest_payout.get("paid_at"),
            "tx_hash": latest_payout.get("tx_hash"),
            "explorer_tx_url": (
                explorer_tpl.replace("{tx_hash}", th) if th and "{tx_hash}" in explorer_tpl else None
            ),
        }

    trust_ledger_v1 = affiliate_trust_ledger.build_trust_dashboard(
        eco, affiliate_id=aid, referral_code=code_slug
    )

    return {
        "ok": True,
        "schema": SCHEMA_VERSION,
        "profile": {
            "affiliate_id": aid,
            "display_name": display_name,
            "referral_code": str(aff.get("affiliate_code") or ""),
            "avatar_url": prof.get("avatar_url"),
            "avatar_asset_ref": prof.get("avatar_asset_ref"),
            "tagline": prof.get("tagline"),
            "leaderboard_visible": bool(int(prof.get("leaderboard_visible") or 1)),
            "progression_tier": sync["progression_tier"],
            "momentum_score": round(momentum_confirmed, 2),
            "momentum_pending_score": round(momentum_pending, 2),
            "leaderboard_score_basis": "confirmed_momentum",
            "leaderboard_rank": rank,
            "lifetime_conversions": counts["paid_conversions"],
            "retained_conversions": counts["retained_paid_users"],
            "agreements_influenced": counts["agreements_influenced"],
            "qualified_signups": counts["qualified_signups"],
            "activated_users": counts["activated_users"],
            "dormant_signups": counts.get("dormant_signups", 0),
        },
        "streak": {
            **sync["streak"],
            "best_streak_days": int(prof.get("best_streak_days") or 0),
        },
        "funnel": {
            "qualified_signups": counts["qualified_signups"],
            "activated_users": counts["activated_users"],
            "dormant_signups": counts.get("dormant_signups", 0),
            "paid_conversions": counts["paid_conversions"],
            "retained_paid_users": counts["retained_paid_users"],
            "agreements_influenced": counts["agreements_influenced"],
        },
        "badges_unlocked": badges_detailed,
        "badge_catalog": [
            {
                "badge_id": b.badge_id,
                "title": b.title,
                "description": b.description,
                "visual": b.visual,
                "category": b.category,
            }
            for b in all_badge_definitions()
        ],
        "recent_wins": recent_wins,
        "next_milestone": next_ms,
        "celebrations": celebrations,
        "copy_hints": {
            "headline": "Momentum",
            "tier_lane": "Progression",
            "rank_label": "Rank",
            "rank_basis_note": "Rank uses confirmed Momentum — activation and paid outcomes, not raw signups.",
            "rising_label": "Rising",
            "top_label": "Top affiliates",
            "streak_label": "Streak",
            "unlocks_label": "Unlocks",
        },
        "affiliate_program": {
            "status": "doginal_verified" if doginal_verified else "regular",
            "doginal_verified": doginal_verified,
        },
        "personal_links": {
            "at_path": f"/@{code_slug}" if code_slug else None,
            "doginal_path": (f"/doginal/{code_slug}" if code_slug and doginal_verified else None),
        },
        "earnings_ledger_usd": {
            "pending_usd": round(float(ledger.get("pending_usd") or 0), 2),
            "payable_usd": round(float(ledger.get("payable_usd") or 0), 2),
            "paid_usd": round(float(ledger.get("paid_usd") or 0), 2),
        },
        "referral_summary": {
            "total_referred_users": int(counts["qualified_signups"]),
            "paying_referred_users": paying_ref,
        },
        "payout_method": payout_method,
        "payout_note": (
            "Commissions are calculated in USD and paid in USDC on Base. "
            "A short hold may apply before a balance is eligible. "
            "The first send often lands in about 30–45 days for new program members."
        ),
        "earnings_timeline": [
            {
                "id": str(r.get("id") or ""),
                "amount_usd": round(float(r.get("amount_usd") or 0), 2),
                "status": str(r.get("status") or ""),
                "earning_type": str(r.get("earning_type") or ""),
                "created_at": r.get("created_at"),
                "unlock_at": r.get("unlock_at"),
                "paid_at": r.get("paid_at"),
                "risk_hold": int(r.get("risk_hold") or 0),
                "payout_tx_hash": r.get("payout_tx_hash"),
            }
            for r in timeline_rows
        ],
        "payout_ui": {
            "policy": {
                "hold_days": int(econ_config.affiliate_stripe_hold_days()),
                "first_payout_delay_days": int(econ_config.affiliate_first_payout_delay_days()),
                "payout_wallet_cooling_days": int(econ_config.affiliate_payout_wallet_cooling_days()),
            },
            "totals": {
                "total_earned_usd": round(float(total_credited), 2),
                "total_paid_usd": round(float(ledger.get("paid_usd") or 0), 2),
            },
            "network_display": {
                "chain_id": int(econ_config.affiliate_payout_chain_id()),
                "slug": str(econ_config.payout_network()),
                "label": "Base (USDC)",
                "usdc_contract": str(econ_config.affiliate_base_usdc_contract()),
                "explorer_tx_url_template": explorer_tpl,
            },
            "payout_wallet_display": {
                "address": wallet_display,
                "configured": bool(wallet_display),
            },
            "payout_status_usd": {
                "pending_usd": round(float(ledger.get("pending_usd") or 0), 2),
                "payable_usd": round(float(ledger.get("payable_usd") or 0), 2),
                "paid_usd": round(float(ledger.get("paid_usd") or 0), 2),
            },
            "next_payout_window_copy": (
                "We review balances each Friday (UTC). "
                "Under the program minimum, amounts roll to the next week; above it, they can go out in the next USDC run after review."
            ),
            "first_payout_timing_copy": (
                "The first USDC send may take 30–45 days while new subscription activity clears standard review windows."
            ),
            "latest_completed_payout": latest_out,
        },
        "trust_ledger_v1": trust_ledger_v1,
    }


class PatchAffiliatePayoutWalletBody(BaseModel):
    usdc_wallet_address: Optional[str] = Field(
        default=None,
        max_length=42,
        description="Base USDC payout wallet (0x + 40 hex). Omit or null to clear.",
    )


class PatchAffiliateProfileBody(BaseModel):
    avatar_url: Optional[str] = Field(default=None, max_length=2048)
    avatar_asset_ref: Optional[str] = Field(
        default=None,
        max_length=512,
        description="Future: Doginals / asset refs, e.g. collection+id",
    )
    tagline: Optional[str] = Field(default=None, max_length=240)
    leaderboard_visible: Optional[bool] = None


@router.get("/leaderboard")
def get_affiliate_leaderboard(
    org_id: str,
    request: Request,
    limit: int = 30,
) -> Dict[str, Any]:
    _require_org_match(request, org_id)
    eco = get_economics_store()
    viewer_aff = eco.get_affiliate_by_owner_org(org_id.strip())
    viewer_id = str(viewer_aff["id"]) if viewer_aff else None
    rows, meta = build_leaderboard_rows(
        economics=eco,
        limit=limit,
        viewer_affiliate_id=viewer_id,
        update_rank_snapshots=True,
    )
    emit_affiliate_gamification_event(
        "affiliate_leaderboard_opened",
        org_id=org_id.strip(),
        viewer_affiliate_id=viewer_id,
        row_count=len(rows),
    )
    return {
        "ok": True,
        "schema": SCHEMA_VERSION,
        "leaderboard": rows,
        "meta": meta,
    }


@router.get("/dashboard")
def get_affiliate_dashboard(org_id: str, request: Request) -> Dict[str, Any]:
    _require_org_match(request, org_id)
    return _affiliate_dashboard_core(org_id, emit_open=True, include_celebrations=True)


@router.get("/profile")
def get_affiliate_gamification_profile(org_id: str, request: Request) -> Dict[str, Any]:
    _require_org_match(request, org_id)
    return _affiliate_dashboard_core(org_id, emit_open=True, include_celebrations=True)


@router.patch("/payout-wallet")
def patch_affiliate_payout_wallet(
    org_id: str,
    request: Request,
    body: PatchAffiliatePayoutWalletBody,
) -> Dict[str, Any]:
    _require_org_match(request, org_id)
    eco = get_economics_store()
    eco.init_schema()
    aff = eco.get_affiliate_by_owner_org(org_id.strip())
    if not aff:
        raise HTTPException(status_code=404, detail="no_affiliate_for_org")
    aid = str(aff["id"])
    raw = body.usdc_wallet_address
    if raw is not None:
        raw = raw.strip() or None
    try:
        if raw is not None:
            validate_evm_wallet_address(raw)
        eco.upsert_affiliate_payout_method(
            affiliate_id=aid,
            method_type="usdc_wallet",
            usdc_wallet_address=raw,
            status="active" if raw else "inactive",
        )
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_wallet", "message": "Wallet must be 0x + 40 hex (EVM)."},
        ) from None
    emit_affiliate_gamification_event(
        "affiliate_payout_wallet_updated",
        affiliate_id=aid,
        org_id=org_id.strip(),
    )
    return _affiliate_dashboard_core(org_id, emit_open=False, include_celebrations=False)


@router.patch("/profile")
def patch_affiliate_gamification_profile(
    org_id: str,
    request: Request,
    body: PatchAffiliateProfileBody,
) -> Dict[str, Any]:
    _require_org_match(request, org_id)
    eco = get_economics_store()
    eco.init_schema()
    aff = eco.get_affiliate_by_owner_org(org_id.strip())
    if not aff:
        raise HTTPException(status_code=404, detail="no_affiliate_for_org")
    aid = str(aff["id"])
    prof_before = eco.get_gamification_profile(aid)
    before_url = (prof_before or {}).get("avatar_url") if prof_before else None
    before_ref = (prof_before or {}).get("avatar_asset_ref") if prof_before else None

    patch_kw: Dict[str, Any] = {}
    if body.avatar_url is not None:
        patch_kw["avatar_url"] = body.avatar_url
    if body.avatar_asset_ref is not None:
        patch_kw["avatar_asset_ref"] = body.avatar_asset_ref
    if body.tagline is not None:
        patch_kw["tagline"] = body.tagline
    if body.leaderboard_visible is not None:
        patch_kw["leaderboard_visible"] = body.leaderboard_visible
    if patch_kw:
        eco.upsert_gamification_profile(aid, **patch_kw)
    prof_after = eco.get_gamification_profile(aid)
    after_url = (prof_after or {}).get("avatar_url")
    after_ref = (prof_after or {}).get("avatar_asset_ref")
    if ("avatar_url" in patch_kw or "avatar_asset_ref" in patch_kw) and (
        after_url != before_url or after_ref != before_ref
    ):
        emit_affiliate_gamification_event(
            "affiliate_avatar_updated",
            affiliate_id=aid,
            org_id=org_id.strip(),
        )
    return _affiliate_dashboard_core(org_id, emit_open=False, include_celebrations=False)
