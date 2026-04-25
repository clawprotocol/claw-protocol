"""Premium tier gates for Agreement Memory (assistive only; never used for proof)."""

from __future__ import annotations

from typing import Literal

from backend.billing import subscriptions as subs
from backend.economics.store import EconomicsStore, get_economics_store
from backend.utils.enforce import org_id_from_subject
from backend.usage_economics.policy import subject_has_paid_plan

AgreementMemoryTier = Literal["none", "standard", "full"]


def agreement_memory_tier_for_subject(
    subject_ref: str, economics: EconomicsStore | None = None
) -> AgreementMemoryTier:
    """
    Maps billing plan → memory capability.
    - none: free / trial / no active subscription
    - standard: paid starter-class (semantic search, similar, clause hints)
    - full: pro / enterprise (relationship panel, cross-doc summaries when enabled)
    """
    if not subject_has_paid_plan(subject_ref, economics=economics):
        return "none"
    oid = org_id_from_subject(subject_ref)
    if not oid:
        return "none"
    eco = economics or get_economics_store()
    eco.init_schema()
    row = subs.get_subscription_for_org(eco, oid)
    if not row:
        return "none"
    code = str(row.get("plan_code") or "").lower().strip()
    if code in ("pro", "enterprise", "team", "institutional"):
        return "full"
    return "standard"
