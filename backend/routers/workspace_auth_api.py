"""Workspace auth binding — link Supabase user to claw org and migrate local drafts."""

from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.lawdog_dashboard.supabase_service import sync_agreement_draft_to_supabase, ensure_organization
from backend.usage_economics.store import get_usage_economics_store

router = APIRouter(prefix="/v1/workspace", tags=["workspace-auth"])
_log = logging.getLogger("claw.workspace_auth")


class BindUserOrgIn(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=128)
    email: Optional[str] = Field(default=None, max_length=256)
    display_name: Optional[str] = Field(default=None, max_length=256)
    previous_org_id: Optional[str] = Field(default=None, max_length=128)


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

    return {
        "ok": True,
        "org_id": org_id,
        "user_id": user_id,
        "migrated_agreement_count": len(migrated_agreements),
        "migrated_agreement_ids": migrated_agreements[:50],
    }


@router.post("/demo-activate-subscription")
async def demo_activate_subscription(body: BindUserOrgIn) -> Dict[str, Any]:
    """Dev/QA only: activate Pro subscription without Stripe."""
    import os

    env = os.getenv("CLAW_ENVIRONMENT", "local").strip().lower()
    if env not in ("local", "dev", "test"):
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
    )
    return {"ok": True, "org_id": org_id, "subscription": eco.get_subscription_by_org(org_id)}
