"""Shared participant identity helpers for recipient delivery / correction / resend."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

PARTY_INDEX_PARTICIPANT_PREFIX = "party_index_"


def normalize_workflow_role(role: str) -> str:
    """Align with backend review_delivery ``_normalize_workflow_role``."""
    r = (role or "").strip().lower()
    if r in ("owner", "sender", "landlord"):
        return "owner"
    if r in ("signer", "signatory"):
        return "signer"
    if r in ("reviewer",):
        return "reviewer"
    if r in ("viewer", "counterparty", "fyi", "copy", "read_only", "readonly"):
        return "viewer"
    return r or "party"


def is_owner_side_workflow_role(role: str) -> bool:
    """Owner bucket for review delivery rows (includes paid Pro ``client``)."""
    r = (role or "").strip().lower()
    if r in ("owner", "sender", "landlord", "client"):
        return True
    return normalize_workflow_role(role) == "owner"


def resolve_owner_party_index(parties: List[Any]) -> int:
    for i, party in enumerate(parties):
        if not isinstance(party, dict):
            continue
        if normalize_workflow_role(str(party.get("role") or "")) == "owner":
            return i
    return 0


def party_requires_review_approval(
    party: Dict[str, Any],
    party_index: int,
    parties: List[Any],
) -> bool:
    """Mirror review_delivery ``_party_requires_review_approval``."""
    role = normalize_workflow_role(str(party.get("role") or ""))
    if role in ("viewer", "owner"):
        return False
    if is_owner_side_workflow_role(str(party.get("role") or "")):
        return False
    if role == "reviewer":
        return True
    has_explicit_reviewer = any(
        isinstance(p, dict) and normalize_workflow_role(str(p.get("role") or "")) == "reviewer"
        for p in parties
    )
    if has_explicit_reviewer:
        return False
    if party_index == resolve_owner_party_index(parties):
        return False
    name = str(party.get("name") or "").strip()
    email = str(party.get("email") or "").strip().lower()
    return bool(name and email and "@" in email)


def participant_id_for_party(party: Dict[str, Any], party_index: int) -> str:
    pid = str(party.get("id") or "").strip()
    if pid:
        return pid
    return f"{PARTY_INDEX_PARTICIPANT_PREFIX}{party_index}"


def find_party_dict_by_participant_id(
    draft: Dict[str, Any],
    participant_id: str,
) -> Optional[Dict[str, Any]]:
    pid = (participant_id or "").strip()
    if not pid:
        return None
    if pid.startswith(PARTY_INDEX_PARTICIPANT_PREFIX):
        suffix = pid[len(PARTY_INDEX_PARTICIPANT_PREFIX) :]
        if suffix.isdigit():
            idx = int(suffix)
            parties = draft.get("parties") or []
            if isinstance(parties, list) and 0 <= idx < len(parties):
                row = parties[idx]
                if isinstance(row, dict):
                    return row
    for p in draft.get("parties") or []:
        if isinstance(p, dict) and str(p.get("id") or "").strip() == pid:
            return p
    return None
