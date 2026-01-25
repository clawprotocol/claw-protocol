# backend/liability/map_liability_assessment.py
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _norm_token(s: str) -> str:
    return (s or "").strip().lower().replace(" ", "_")


def map_liability_assessment(
    *,
    event_id: str,
    notice: Dict[str, Any],
    created_at: str | None = None,
) -> Dict[str, Any]:
    """
    Deterministic mapping per docs/CLAW_PERSONAL_LIABILITY_MAPPING.md.
    Input: notice object that contains notice["liability_attestation"].
    Output: claw.liability_assessment.v1 JSON.
    """
    created_at = created_at or _utc_now_iso()

    la = (notice or {}).get("liability_attestation") or {}
    role = _norm_token(la.get("role", "unknown"))
    capacity = _norm_token(la.get("capacity", "unknown"))
    relationship = _norm_token(la.get("relationship", "unknown"))
    valid_from = la.get("valid_from")
    valid_to = la.get("valid_to", None)

    control_flags_in = la.get("control_flags") or []
    if not isinstance(control_flags_in, list):
        control_flags_in = []
    control_flags = [_norm_token(x) for x in control_flags_in if isinstance(x, str) and x.strip()]

    declared_exclusions_in = la.get("declared_exclusions") or []
    if not isinstance(declared_exclusions_in, list):
        declared_exclusions_in = []
    declared_exclusions = [_norm_token(x) for x in declared_exclusions_in if isinstance(x, str) and x.strip()]

    # tags (deterministic)
    tags: List[str] = [
        f"role.{role}",
        f"capacity.{capacity}",
        f"relationship.{relationship}",
    ]
    if "no_authority" in declared_exclusions:
        tags.append("exclusion.no_authority_claimed")

    # flags (deterministic)
    flags: List[str] = []
    for f in control_flags:
        flags.append(f"control.{f}")
    if valid_to in (None, "", "null"):
        flags.append("time_window.open_ended")

    # warnings (neutral templates)
    warnings: List[str] = []
    if control_flags:
        warnings.append("Control/access was asserted during the declared window.")
    if "no_authority" in declared_exclusions:
        warnings.append("No authority was claimed by the user during the declared window.")
    if "time_window.open_ended" in flags:
        warnings.append("The declaration window is open-ended (valid_to is null).")

    # patterns (fixed allowlist keyed by tags/flags)
    patterns: List[str] = []
    if capacity == "representative" or role == "agent":
        patterns.append("Use explicit role scoping when acting on behalf of an entity.")
    if any(x.startswith("control.") for x in flags):
        patterns.append("Maintain contemporaneous records of delegated authority and revocation dates.")
    if "time_window.open_ended" in flags:
        patterns.append("Define explicit start/end dates for roles and access where feasible.")

    disclaimers = [
        "This is not legal advice.",
        "User-provided data may be incomplete or inaccurate.",
        "Outputs are classifications for evidentiary use and may be reviewed by counsel.",
    ]

    return {
        "schema": "claw.liability_assessment.v1",
        "created_at": created_at,
        "inputs_attested_event_id": event_id,
        "subject": {
            "role": role,
            "capacity": capacity,
            "relationship": relationship,
            "valid_from": valid_from,
            "valid_to": valid_to,
        },
        "tags": tags,
        "flags": flags,
        "warnings": warnings,
        "patterns": patterns,
        "disclaimers": disclaimers,
    }
