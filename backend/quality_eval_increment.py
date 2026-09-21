"""Inactive sidecar for a later $1 / bounded-call quality-eval increment.

This is not customer billing and is never a replacement ledger. Extra
allowances are granted only when the sidecar is explicitly active against
the existing cumulative ledger. Excluded purposes are rejected as soon as
the sidecar is attached, so leftover one-pager or revision slots cannot
be spent by accident.
"""
from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from typing import Any

INCREMENT_ENV = "CLAW_QUALITY_EVAL_INCREMENT_PATH"
OFFICIAL_LEDGER_NAME = "quality-eval-approved-20260913.sqlite3"
EXCLUDED_PURPOSES = frozenset({
    "free_one_pager",
    "explicit_revision",
    "structured_revision",
    "recipient_negotiation",
    "premium_review",
    "finalize_audit",
    "review_route",
})
INCREMENT_ALLOWANCE = {
    "primary": 2,
    "bootstrap_parse": 2,
    "parse": 2,
    "clarification": 2,
    "repair": 1,
    "revision": 0,
    "negotiation": 0,
    "bootstrap_one_pager": 0,
}
MAX_ADDITIONAL_USD = 1
MAX_ADDITIONAL_UNITS = MAX_ADDITIONAL_USD * 2_000_000
GLOBAL_ATTEMPT_CAP_WHEN_ACTIVE = 20


def _blocked(code: str):
    from backend.quality_eval_budget import QualityEvalBlocked
    raise QualityEvalBlocked(code)


def official_ledger_path(root: Path | None = None) -> Path:
    base = root or Path(__file__).resolve().parents[1]
    return base / "evals/commercial-readiness/results" / OFFICIAL_LEDGER_NAME


def load_increment_policy(path: str | Path | None = None) -> dict[str, Any] | None:
    raw = str(path or os.getenv(INCREMENT_ENV, "")).strip()
    if not raw:
        return None
    if os.getenv("CLAW_ENVIRONMENT", "").strip().lower() not in {"test", "local"}:
        _blocked("evaluation_is_local_only")
    dest = Path(raw)
    if not dest.is_file():
        _blocked("increment_policy_missing")
    policy = json.loads(dest.read_text())
    if not isinstance(policy, dict):
        _blocked("increment_policy_invalid")
    return policy


def require_existing_historical_ledger(ledger_path: str | Path, policy: dict[str, Any]):
    from backend.quality_eval_budget import QualityEvalBudget, USD_UNITS
    path = Path(ledger_path)
    if not path.is_file():
        _blocked("approval_ledger_missing")
    required = str(policy.get("ledger_required_basename") or OFFICIAL_LEDGER_NAME)
    if path.name != required:
        _blocked("increment_requires_official_ledger")
    budget = QualityEvalBudget(path)
    summary = budget.summary()
    baseline_attempts = int(policy["approval_baseline_attempts"])
    baseline_reserved = int(policy["approval_baseline_reserved_units"])
    if summary["attempts"] < baseline_attempts:
        _blocked("increment_rejects_replacement_ledger")
    reserved_units = round(summary["reserved_upper_usd"] * USD_UNITS)
    if reserved_units < baseline_reserved:
        _blocked("increment_rejects_replacement_ledger")
    if summary["model"] != "gpt-5.4" or summary["halted"]:
        _blocked("approval_ledger_not_ready")
    return budget


def inspect_ledger_baselines(ledger_path: str | Path) -> dict[str, Any]:
    path = Path(ledger_path)
    if not path.is_file():
        _blocked("approval_ledger_missing")
    with sqlite3.connect(f"file:{path.resolve()}?mode=ro", uri=True) as db:
        reserved = int(db.execute("SELECT COALESCE(SUM(reserved),0) FROM attempts").fetchone()[0])
        attempts = int(db.execute("SELECT COUNT(*) FROM attempts").fetchone()[0])
        buckets = {
            str(row[0]): int(row[1])
            for row in db.execute("SELECT bucket, COUNT(*) FROM attempts GROUP BY bucket")
        }
    return {"attempts": attempts, "reserved": reserved, "buckets": buckets}


def prepare_inactive_increment_policy(ledger_path: str | Path, dest: str | Path) -> dict[str, Any]:
    path = Path(ledger_path)
    baselines = inspect_ledger_baselines(path)
    policy = {
        "active": False,
        "ledger_required_basename": path.name,
        "approval_baseline_attempts": baselines["attempts"],
        "approval_baseline_reserved_units": baselines["reserved"],
        "approval_baseline_reserved_usd": baselines["reserved"] / 2_000_000,
        "max_additional_reserved_usd": MAX_ADDITIONAL_USD,
        "max_additional_reserved_units": MAX_ADDITIONAL_UNITS,
        "global_attempt_cap_when_active": GLOBAL_ATTEMPT_CAP_WHEN_ACTIVE,
        "additional_allowance": INCREMENT_ALLOWANCE,
        "baseline_buckets": baselines["buckets"],
        "excluded_purposes": sorted(EXCLUDED_PURPOSES),
        "notes": (
            "Inactive. Do not raise LIMITS in quality_eval_budget.py. "
            "Activation is a later explicit approval. One-pager, revision, "
            "and negotiation are excluded; leftover slots are not spendable."
        ),
    }
    Path(dest).write_text(json.dumps(policy, indent=2) + "\n")
    return policy


def increment_reservation_gate(
    *,
    purpose: str,
    bucket: str,
    count: int,
    bucket_count: int,
    reserved: int,
    reservation: int,
    ceiling: int,
    policy: dict[str, Any] | None,
) -> None:
    from backend.quality_eval_budget import LIMITS
    if policy and purpose in EXCLUDED_PURPOSES:
        _blocked("excluded_eval_purpose")
    if policy and policy.get("active"):
        extra_cap = int(policy.get("global_attempt_cap_when_active") or GLOBAL_ATTEMPT_CAP_WHEN_ACTIVE)
        allowance = policy.get("additional_allowance") or INCREMENT_ALLOWANCE
        baseline_buckets = policy.get("baseline_buckets") or {}
        extra_allowed = int(allowance.get(bucket, 0))
        baseline_for_bucket = int(baseline_buckets.get(bucket, 0))
        if count >= extra_cap or bucket_count >= baseline_for_bucket + extra_allowed:
            _blocked("call_limit")
        additional = reserved + reservation - int(policy["approval_baseline_reserved_units"])
        if additional > int(policy.get("max_additional_reserved_units") or MAX_ADDITIONAL_UNITS):
            _blocked("increment_dollar_limit")
        if reserved + reservation > ceiling:
            _blocked("dollar_limit")
        return
    if count >= 16 or bucket_count >= LIMITS[bucket]:
        _blocked("call_limit")
    if reserved + reservation > ceiling:
        _blocked("dollar_limit")
