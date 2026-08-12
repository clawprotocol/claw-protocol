"""Shared commercial entitlement helpers for integration tests.

Buyer plans are Guest and Pro only. Authenticated orgs without Pro receive
``entitlement_required`` on draft create. Tests that exercise signing, email,
provenance, or review flows must grant Pro explicitly — never Genesis create.
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import Optional


def _ensure_writable_db_parents() -> None:
    """Create parent dirs for economics DBs under tmp_path / CLAW_DATA_DIR."""
    keys = (
        "CLAW_ECONOMICS_DB_PATH",
        "CLAW_USAGE_ECONOMICS_DB_PATH",
        "CLAW_ONRAMP_DB_PATH",
        "CLAW_TREASURY_DB_PATH",
    )
    for key in keys:
        dbp = (os.environ.get(key) or "").strip()
        if dbp:
            Path(dbp).parent.mkdir(parents=True, exist_ok=True)
    data_dir = (os.environ.get("CLAW_DATA_DIR") or "").strip()
    if data_dir:
        Path(data_dir).mkdir(parents=True, exist_ok=True)


def ensure_org_pro_entitlement(org_id: str, user_id: Optional[str] = None) -> None:
    """Activate a Pro subscription on ``org_id`` in the economics store."""
    from backend.billing.subscription_authority import demo_expiry_iso
    from backend.economics.store import get_economics_store

    oid = (org_id or "").strip()
    if oid.startswith("org:"):
        oid = oid[4:]
    if not oid:
        raise ValueError("org_id required")

    _ensure_writable_db_parents()
    # Do not reset the economics singleton here — fixtures own lifecycle.
    # Re-bind if the module-level store was cleared after env path changes.
    import backend.economics.store as eco_store_mod

    if getattr(eco_store_mod, "_store", None) is None:
        pass  # get_economics_store() will create against current env path

    eco = get_economics_store()
    eco.init_schema()
    existing = eco.get_subscription_by_org(oid)
    if existing and str(existing.get("status") or "").lower() == "active":
        if str(existing.get("plan_code") or "").lower() in {"pro", "paid_pro", "business"}:
            return
    eco.insert_subscription(
        sub_id=str(uuid.uuid4()),
        org_id=oid,
        user_id=user_id,
        plan_code="pro",
        status="active",
        payment_id=f"test:pro:{uuid.uuid4().hex[:8]}",
        expires_at=demo_expiry_iso(30),
        current_period_end=demo_expiry_iso(30),
    )


def ensure_user_genesis_entitlement(user_id: str) -> None:
    """Deprecated — Genesis create grants are retired. Grants Pro on ``user-{uid}`` instead."""
    uid = (user_id or "").strip()
    if not uid:
        raise ValueError("user_id required")
    ensure_org_pro_entitlement(f"user-{uid}", user_id=uid)


def ensure_headers_entitled(headers) -> dict:
    """
    Grant Pro for the org in ``headers`` (mutates economics store).

    Accepts a header dict or a zero-arg callable that returns one (common
    test helper pattern). Returns the resolved headers for chaining.
    Does not grant attacker/other orgs — callers pass the owner headers only.
    """
    if callable(headers):
        headers = headers()
    if not isinstance(headers, dict):
        raise TypeError("ensure_headers_entitled expects a dict or zero-arg callable")
    org = str(headers.get("X-Claw-Org-Id") or "").strip()
    user = str(headers.get("X-Claw-Test-Auth-User-Id") or "").strip() or None
    if org:
        ensure_org_pro_entitlement(org, user_id=user)
    elif user:
        ensure_org_pro_entitlement(f"user-{user}", user_id=user)
    return headers
