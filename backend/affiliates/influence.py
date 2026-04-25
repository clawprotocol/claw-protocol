"""Credit affiliates when referred workspaces hit real milestones (not raw clicks)."""
from __future__ import annotations

from typing import Optional

from backend.affiliates.service import get_active_affiliate_for_org
from backend.economics.store import EconomicsStore, get_economics_store


def maybe_record_agreement_sent_influence(org_id: Optional[str], economics: Optional[EconomicsStore] = None) -> None:
    """When a referred org sends an agreement for review, credit the referring affiliate."""
    oid = (org_id or "").strip()
    if not oid:
        return
    eco = economics or get_economics_store()
    eco.init_schema()
    active = get_active_affiliate_for_org(oid, economics=eco)
    if not active or not active.get("affiliate"):
        return
    aid = str(active["affiliate"]["id"])
    eco.increment_agreements_influenced(aid, 1)
