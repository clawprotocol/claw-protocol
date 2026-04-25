# backend/utils/enforce.py
from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from typing import Optional

from fastapi import Request

from backend.utils.tiers import Tier, TIERS, Capability
from backend.utils.usage_store import UsageStore


class TierLimitError(Exception):
    """Raised when a user exceeds their tier limits."""
    def __init__(self, message: str, code: str = "tier_limit") -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class Principal:
    subject: str          # stable identifier (wallet/email/api key hash)
    tier: Tier


def resolve_subject_from_request(req: Request) -> str:
    """Stable product subject for usage economics: org id preferred, then wallet, api key, then IP."""
    org = (req.headers.get("x-claw-org-id") or "").strip()
    if org:
        return f"org:{org}"
    wallet = req.headers.get("x-claw-wallet")
    api_key = req.headers.get("x-claw-api-key")
    ip = req.client.host if req.client else "unknown"

    if wallet:
        return f"wallet:{wallet.lower()}"
    if api_key:
        return "apikey:" + hashlib.sha256(api_key.encode("utf-8")).hexdigest()[:24]
    return f"ip:{ip}"


def org_id_from_subject(subject_ref: str) -> str | None:
    s = (subject_ref or "").strip()
    if s.startswith("org:"):
        return s[4:].strip() or None
    return None


def principal_from_request(req: Request) -> Principal:
    """
    Resolve caller identity + tier.

    ``x-claw-tier`` selects backend tier when valid.
    When ``CLAW_RESOLVE_TIER_FROM_CLAW_KEY=1``, an **active CLAW Key** for the same subject
    may raise the effective tier (never below header tier — header can still cap upward in future).
    """
    subject = resolve_subject_from_request(req)

    tier_raw = (req.headers.get("x-claw-tier") or "proof").strip().lower()
    tier = Tier(tier_raw) if tier_raw in {t.value for t in Tier} else Tier.PROOF

    if os.getenv("CLAW_RESOLVE_TIER_FROM_CLAW_KEY", "0").strip().lower() in ("1", "true", "yes"):
        try:
            from backend.treasury.claw_key_entitlement import (  # noqa: PLC0415
                backend_tier_rank,
                resolve_backend_tier_from_claw_key_row,
            )
            from backend.treasury.treasury_store import get_treasury_store  # noqa: PLC0415

            row = get_treasury_store().get_active_claw_key_for_subject(subject)
            kt = resolve_backend_tier_from_claw_key_row(row)
            if kt is not None and backend_tier_rank(kt) > backend_tier_rank(tier):
                tier = kt
        except Exception:
            pass

    return Principal(subject=subject, tier=tier)


def assert_capability(p: Principal, cap: Capability) -> None:
    limits = TIERS[p.tier]
    if cap not in limits.allowed:
        raise TierLimitError(f"Capability not allowed for tier '{p.tier.value}': {cap.value}", code="capability_denied")


def assert_upload_limits(p: Principal, store: UsageStore, file_mb: int) -> None:
    limits = TIERS[p.tier]
    if file_mb > limits.max_upload_mb:
        raise TierLimitError(f"File too large for tier '{p.tier.value}'. Max {limits.max_upload_mb} MB.", code="upload_too_large")
    snap = store.snapshot(p.subject)
    if snap.uploads_day >= limits.max_uploads_per_day:
        raise TierLimitError(f"Upload limit reached for today on tier '{p.tier.value}'.", code="upload_limit")


def assert_ai_limits(p: Principal, store: UsageStore, input_chars: int) -> None:
    limits = TIERS[p.tier]
    if limits.ai_calls_per_month <= 0:
        raise TierLimitError("AI is not enabled for this tier.", code="ai_disabled")
    if input_chars > limits.max_input_chars_per_call:
        raise TierLimitError(f"Input too long for tier '{p.tier.value}'.", code="input_too_long")
    snap = store.snapshot(p.subject)
    if snap.ai_calls_month >= limits.ai_calls_per_month:
        raise TierLimitError("Monthly AI limit reached.", code="ai_limit")


def record_upload(p: Principal, store: UsageStore) -> None:
    store.incr_upload(p.subject)


def record_ai_call(p: Principal, store: UsageStore) -> None:
    store.incr_ai_call(p.subject)


def assert_priority_anchor(p: Principal, store: UsageStore) -> None:
    limits = TIERS[p.tier]
    if not limits.allow_free_anchor:
        raise TierLimitError("Anchoring not permitted for this tier.", code="anchor_disabled")
    snap = store.snapshot(p.subject)
    if snap.priority_anchors_day >= limits.free_anchor_per_day:
        # degrade: allow "pending anchor" only (caller can still get receipt)
        raise TierLimitError("Daily priority anchoring limit reached. Receipt will be 'pending anchor'.", code="anchor_degraded")


def record_priority_anchor(p: Principal, store: UsageStore) -> None:
    store.incr_priority_anchor(p.subject)
