"""Shared usage-economics test helpers for ownership registration."""

from __future__ import annotations


def register_test_agreement_owner(
    *,
    db_path: str,
    agreement_id: str,
    org_id: str,
) -> None:
    """Register agreement_owner row matching legacy test org headers."""
    from backend.usage_economics.store import UsageEconomicsStore

    aid = (agreement_id or "").strip()
    org = (org_id or "").strip()
    if not aid or not org:
        return
    store = UsageEconomicsStore(db_path)
    store.init_schema()
    if store.get_agreement_owner_row(aid):
        return
    store.insert_agreement_owner(
        agreement_id=aid,
        subject_ref=f"org:{org}",
        internal_keys_draft=0,
    )
