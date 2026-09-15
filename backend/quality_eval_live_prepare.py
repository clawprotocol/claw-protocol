"""Explicit increment policy selection and live authorization boundary.

The committed sidecar stays inactive. An authorized live run requires both
an active selected policy copy and --authorize-increment. Credential
retrieval happens only after that check.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path
from typing import Any, Callable

from backend.quality_eval_increment import require_existing_historical_ledger

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INACTIVE_POLICY = ROOT / "evals/commercial-readiness/quality-eval-increment-20260914.inactive.json"
OFFICIAL_LEDGER = ROOT / "evals/commercial-readiness/results/quality-eval-approved-20260913.sqlite3"
AUTHORIZATION_KIND = "explicit_increment_approval"
# Only owner-approved increment sizes. Do not accept arbitrary dollar grants.
AUTHORIZED_ADDITIONAL_RESERVED_USD = frozenset({1.0, 2.5})


class LivePrepareBlocked(RuntimeError):
    """Metadata-only; never include credentials or request content."""


def authorized_additional_reserved_usd(value: Any) -> float | None:
    try:
        amount = float(value)
    except (TypeError, ValueError):
        return None
    for allowed in AUTHORIZED_ADDITIONAL_RESERVED_USD:
        if abs(amount - allowed) < 1e-9:
            return allowed
    return None


def is_increment_policy_file(name: str) -> bool:
    return Path(name).name.startswith("quality-eval-increment") and name.endswith(".json")


def product_source_hashes(root: Path | None = None) -> dict[str, str]:
    base = root or ROOT
    files = subprocess.check_output(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard"],
        cwd=base,
        text=True,
    ).splitlines()
    hashes: dict[str, str] = {}
    for name in files:
        if name.startswith("evals/commercial-readiness/results/"):
            continue
        if is_increment_policy_file(name):
            continue
        path = base / name
        if path.is_file():
            hashes[name] = hashlib.sha256(path.read_bytes()).hexdigest()
    return hashes


def resolve_increment_selection(
    policy_path: str | Path | None = None,
    *,
    authorize: bool = False,
) -> dict[str, Any]:
    path = Path(policy_path or DEFAULT_INACTIVE_POLICY)
    if not path.is_file():
        raise LivePrepareBlocked("increment_policy_missing")
    policy = json.loads(path.read_text())
    if not isinstance(policy, dict):
        raise LivePrepareBlocked("increment_policy_invalid")
    active = policy.get("active") is True
    auth = policy.get("authorization") if isinstance(policy.get("authorization"), dict) else {}
    auth_usd = authorized_additional_reserved_usd(auth.get("max_additional_reserved_usd"))
    policy_usd = authorized_additional_reserved_usd(policy.get("max_additional_reserved_usd"))
    authorization_ok = (
        auth.get("kind") == AUTHORIZATION_KIND
        and auth_usd is not None
        and policy_usd is not None
        and auth_usd == policy_usd
    )
    authorized = bool(authorize) and active and authorization_ok
    if authorized:
        reason = "authorized_increment_copy"
    elif not path.is_file():
        reason = "increment_policy_missing"
    elif not active:
        reason = "increment_inactive"
    elif not authorize:
        reason = "authorize_increment_required"
    else:
        reason = "increment_authorization_record_required"
    return {
        "path": str(path.resolve()),
        "basename": path.name,
        "active": active,
        "authorized": authorized,
        "authorize_flag": bool(authorize),
        "authorization_kind": auth.get("kind"),
        "policy_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "is_default_inactive": path.resolve() == DEFAULT_INACTIVE_POLICY.resolve(),
        "reason": reason,
        "policy": policy,
    }


def assert_live_provider_may_be_contacted(selection: dict[str, Any]) -> None:
    if not selection.get("authorized"):
        raise LivePrepareBlocked("increment_not_authorized")


def retrieve_live_drafting_credentials() -> dict[str, str]:
    provider = subprocess.run(
        [
            "railway",
            "variable",
            "list",
            "--project",
            "865aee06-0e3e-49f4-b954-b9670ba483eb",
            "--service",
            "claw-protocol",
            "--environment",
            "staging",
            "--json",
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if provider.returncode:
        raise LivePrepareBlocked("railway_read_failed_output_suppressed")
    values = json.loads(provider.stdout)
    if (
        not values.get("OPENAI_API_KEY")
        or values.get("CLAW_LLM_MODEL_PREMIUM") != "gpt-5.4"
        or values.get("CLAW_LLM_MODEL_BASIC") != "gpt-4o-mini"
        or values.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        != "https://api.openai.com/v1"
    ):
        raise LivePrepareBlocked("drafting_configuration_requires_review")
    return {
        "OPENAI_API_KEY": values["OPENAI_API_KEY"],
        "CLAW_LLM_MODEL_BASIC": values.get("CLAW_LLM_MODEL_BASIC", "gpt-4o-mini"),
    }


def prepare_authorized_live_boundary(
    *,
    selection: dict[str, Any],
    ledger_path: str | Path,
    retrieve: Callable[[], dict[str, str]] | None = None,
) -> dict[str, Any]:
    assert_live_provider_may_be_contacted(selection)
    budget = require_existing_historical_ledger(ledger_path, selection["policy"])
    creds = (retrieve or retrieve_live_drafting_credentials)()
    return {
        "budget": budget,
        "credentials": creds,
        "credentials_present": bool(creds.get("OPENAI_API_KEY")),
        "selection": selection,
    }
