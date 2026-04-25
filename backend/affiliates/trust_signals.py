"""Anti-sybil / low-quality referral signals — internal only; drives attribution credit state."""
from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Set

from backend.economics.store import EconomicsStore


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def hash_signal(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    s = value.strip()
    if not s:
        return None
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def normalize_email_domain(email: Optional[str]) -> Optional[str]:
    if not email or "@" not in email:
        return None
    dom = email.rsplit("@", 1)[-1].strip().lower()
    return dom or None


def _load_disposable_domains() -> Set[str]:
    raw = os.getenv("CLAW_AFFILIATE_DISPOSABLE_EMAIL_DOMAINS", "").strip()
    base: Set[str] = {
        "mailinator.com",
        "guerrillamail.com",
        "guerrillamailblock.com",
        "yopmail.com",
        "tempmail.com",
        "trashmail.com",
        "10minutemail.com",
        "fakeinbox.com",
        "dispostable.com",
        "getnada.com",
    }
    if not raw:
        return base
    try:
        extra = {x.strip().lower() for x in raw.split(",") if x.strip()}
        return base | extra
    except Exception:
        return base


DISPOSABLE_EMAIL_DOMAINS = _load_disposable_domains()


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)).strip())
    except (TypeError, ValueError):
        return default


@dataclass(frozen=True)
class TrustEvaluation:
    momentum_credit_state: str  # pending | excluded
    flags: List[str]
    score_delta_note: str


def evaluate_new_attribution(
    *,
    economics: EconomicsStore,
    affiliate_id: str,
    attr_id: str,
    signup_ip_hash: Optional[str],
    device_fingerprint_hash: Optional[str],
    email_domain: Optional[str],
) -> TrustEvaluation:
    """
    Runs immediately after insert. Default ``pending``; may mark ``excluded`` for strong abuse signals.
    Flags are stored on the row for internal review (not exposed publicly).
    """
    flags: List[str] = []
    state = "pending"

    dom = (email_domain or "").strip().lower()
    if dom and dom in DISPOSABLE_EMAIL_DOMAINS:
        flags.append("disposable_email")
        state = "excluded"

    if state != "excluded":
        burst_limit = _int_env("CLAW_AFFILIATE_BURST_SIGNUPS_PER_HOUR", 40)
        since = (_utc_now() - timedelta(hours=1)).isoformat().replace("+00:00", "Z")
        recent = economics.count_attributions_in_window(affiliate_id, since_iso=since)
        if recent > burst_limit:
            flags.append("rapid_signup_burst")
            state = "excluded"

    if state != "excluded" and device_fingerprint_hash:
        dev_limit = _int_env("CLAW_AFFILIATE_DEVICE_CLUSTER_LIMIT", 12)
        since_d = (_utc_now() - timedelta(days=30)).isoformat().replace("+00:00", "Z")
        dev_n = economics.count_attributions_with_device(
            affiliate_id,
            device_fingerprint_hash=device_fingerprint_hash,
            since_iso=since_d,
        )
        if dev_n > dev_limit:
            flags.append("repeated_device_cluster")
            state = "excluded"

    if signup_ip_hash and state != "excluded":
        ip_limit = _int_env("CLAW_AFFILIATE_IP_CLUSTER_SOFT_LIMIT", 20)
        since_ip = (_utc_now() - timedelta(days=7)).isoformat().replace("+00:00", "Z")
        ip_n = economics.count_attributions_with_ip(
            affiliate_id,
            signup_ip_hash=signup_ip_hash,
            since_iso=since_ip,
        )
        if ip_n > ip_limit:
            flags.append("shared_ip_pattern")

    if not flags:
        flags = []

    note = "trust_eval_ok"
    if state == "excluded":
        note = "excluded_new_attribution"
    elif flags:
        note = "flagged_pending_review"

    economics.update_attribution_trust(
        attr_id=attr_id,
        momentum_credit_state=state,
        internal_risk_flags_json=json.dumps(flags, ensure_ascii=False),
    )

    return TrustEvaluation(momentum_credit_state=state, flags=list(flags), score_delta_note=note)
