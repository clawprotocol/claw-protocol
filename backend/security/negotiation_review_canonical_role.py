"""Canonical negotiation-review role mapping (GTM Security Slice 3B)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Set

_OWNER_ROLES = frozenset({"owner", "sender", "landlord", "client", "creator"})
_VIEWER_ROLES = frozenset({"viewer", "counterparty", "fyi", "copy", "read_only", "readonly"})
_REVIEWER_ROLES = frozenset({"reviewer"})
_RECIPIENT_ROLES = frozenset(
    {
        "party",
        "service_provider",
        "recipient",
        "tenant",
        "vendor",
        "signer",
        "signatory",
    }
)


def _clean(value: Any) -> str:
    return str(value or "").strip().lower()


def _party_ids(draft: Dict[str, Any]) -> List[str]:
    ids: List[str] = []
    for party in draft.get("parties") or []:
        if not isinstance(party, dict):
            continue
        pid = str(party.get("id") or "").strip()
        if pid:
            ids.append(pid)
    return ids


def _duplicate_party_ids(draft: Dict[str, Any]) -> bool:
    seen: Set[str] = set()
    for pid in _party_ids(draft):
        if pid in seen:
            return True
        seen.add(pid)
    return False


def normalize_party_workflow_role(role: str) -> str:
    r = _clean(role)
    if not r:
        return ""
    if r in _OWNER_ROLES:
        return "owner"
    if r in _VIEWER_ROLES:
        return "viewer"
    if r in _REVIEWER_ROLES:
        return "reviewer"
    if r in _RECIPIENT_ROLES:
        return "recipient"
    return r


def canonical_review_role_for_party(party: Dict[str, Any]) -> Optional[str]:
    """
    Map a party record to the canonical review role bound at mint and checked at exchange.
    Returns None when the party cannot participate in recipient review.
    """
    if not isinstance(party, dict):
        return None
    workflow = normalize_party_workflow_role(str(party.get("role") or ""))
    if not workflow:
        return None
    if workflow == "owner":
        return None
    if workflow == "viewer":
        return None
    if workflow == "reviewer":
        return "reviewer"
    if workflow == "recipient":
        return "recipient"
    return None


def _parties_for_id(draft: Dict[str, Any], party_id: str) -> List[Dict[str, Any]]:
    pid = (party_id or "").strip()
    if not pid:
        return []
    matches: List[Dict[str, Any]] = []
    for party in draft.get("parties") or []:
        if not isinstance(party, dict):
            continue
        if str(party.get("id") or "").strip() == pid:
            matches.append(party)
    return matches


def canonical_review_role_for_party_id(draft: Dict[str, Any], party_id: str) -> Optional[str]:
    if _duplicate_party_ids(draft):
        return None
    matches = _parties_for_id(draft, party_id)
    if len(matches) != 1:
        return None
    return canonical_review_role_for_party(matches[0])


def party_matches_canonical_review_role(
    draft: Dict[str, Any],
    *,
    party_id: str,
    bound_role: str,
) -> bool:
    expected = canonical_review_role_for_party_id(draft, party_id)
    if not expected:
        return False
    return _clean(bound_role) == expected


def assert_eligible_review_participant(
    draft: Dict[str, Any],
    *,
    party_id: str,
    requested_role: Optional[str] = None,
) -> str:
    """
    Validate participant eligibility and return the canonical review role.
    Raises ValueError with a stable code on rejection.
    """
    if _duplicate_party_ids(draft):
        raise ValueError("duplicate_party_id")
    pid = (party_id or "").strip()
    if not pid:
        raise ValueError("recipient_party_required")
    matches = _parties_for_id(draft, pid)
    if len(matches) != 1:
        raise ValueError("ambiguous_party_match")
    canonical = canonical_review_role_for_party(matches[0])
    if not canonical:
        workflow = normalize_party_workflow_role(str(matches[0].get("role") or ""))
        if workflow == "owner":
            raise ValueError("owner_party_not_eligible_for_review")
        if workflow == "viewer":
            raise ValueError("viewer_party_not_eligible_for_review")
        raise ValueError("party_not_eligible_for_review")
    if requested_role is not None:
        req = _clean(requested_role)
        if req and req != canonical:
            raise ValueError("review_role_mismatch")
    return canonical
