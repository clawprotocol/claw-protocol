"""Persist intake-confirmed signer identity on durable party IDs.

Proposal apply, PATCH shells, and resume payloads may omit signer fields.
Empty later values must not erase confirmed metadata. Identity is keyed by
party ID; unique legal-name match is allowed only before an incoming ID exists.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

_ENTITY_SUFFIX_RE = re.compile(
    r"\b(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP)\b",
    re.I,
)


def nonempty(value: Any) -> Optional[str]:
    text = str(value or "").strip()
    return text or None


def normalize_legal_name(name: str) -> str:
    return " ".join(str(name or "").split()).strip().lower().rstrip(".,;:")


def party_id_of(row: Dict[str, Any]) -> str:
    return str(row.get("id") or "").strip()


def signer_name_of(row: Dict[str, Any]) -> Optional[str]:
    return nonempty(row.get("signer_name") or row.get("signerName"))


def signer_title_of(row: Dict[str, Any]) -> Optional[str]:
    return nonempty(row.get("signer_title") or row.get("signerTitle"))


def is_entity_name_copy(signer_name: str, entity_name: str) -> bool:
    signer = nonempty(signer_name)
    entity = nonempty(entity_name)
    if not signer:
        return False
    if entity and normalize_legal_name(signer) == normalize_legal_name(entity):
        return True
    return bool(_ENTITY_SUFFIX_RE.search(signer))


def accepted_human_signer_name(signer_name: Optional[str], entity_name: str) -> Optional[str]:
    name = nonempty(signer_name)
    if not name:
        return None
    if is_entity_name_copy(name, entity_name):
        return None
    return name


def prefer_confirmed(incoming: Optional[str], prior: Optional[str]) -> Optional[str]:
    """Empty incoming never overwrites a previously confirmed nonempty value."""
    return nonempty(incoming) or nonempty(prior)


def _unique_current_by_legal_name(
    name: str,
    current: List[Dict[str, Any]],
    used_ids: set[str],
) -> Optional[Dict[str, Any]]:
    key = normalize_legal_name(name)
    if not key:
        return None
    matches = [
        row
        for row in current
        if normalize_legal_name(str(row.get("name") or "")) == key
        and party_id_of(row) not in used_ids
    ]
    if len(matches) != 1:
        return None
    return matches[0]


def _emit_party(row: Dict[str, Any], *, entity: str, role: str, pid: str) -> Dict[str, Any]:
    signer = accepted_human_signer_name(signer_name_of(row), entity)
    title = signer_title_of(row)
    email = nonempty(row.get("email"))
    phone = nonempty(row.get("phone"))
    out: Dict[str, Any] = {
        "id": pid or None,
        "name": entity,
        "role": role or "party",
        "email": email,
        "phone": phone,
        "signer_name": signer,
        "signer_title": title,
        "signerName": signer,
        "signerTitle": title,
    }
    return out


def merge_structured_party_identity(
    *,
    current: List[Dict[str, Any]],
    incoming: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Merge incoming party shells onto current identity authority.

    Rules:
    - Party ID is the canonical key.
    - Unique normalized legal-name match is allowed only when incoming has no ID.
    - Empty signer name/title/email cannot erase confirmed values.
    - Reviewer email may update the same party ID; it cannot replace signer name.
    - Entity-name copies are not human signer names.
    - Incoming must not drop existing parties.
    - Ambiguous legal-name bases fail closed (no cross-bind).
    """
    current_rows = [dict(row) for row in (current or []) if nonempty(row.get("name"))]
    incoming_rows = [dict(row) for row in (incoming or []) if nonempty(row.get("name"))]
    if not incoming_rows:
        return [_emit_party(
            row,
            entity=nonempty(row.get("name")) or "",
            role=nonempty(row.get("role")) or "party",
            pid=party_id_of(row),
        ) for row in current_rows]

    current_by_id = {party_id_of(row): row for row in current_rows if party_id_of(row)}
    used_ids: set[str] = set()
    merged: List[Dict[str, Any]] = []

    for inc in incoming_rows:
        pid = party_id_of(inc)
        prior: Optional[Dict[str, Any]] = None
        if pid and pid in current_by_id:
            prior = current_by_id[pid]
        elif not pid:
            prior = _unique_current_by_legal_name(str(inc.get("name") or ""), current_rows, used_ids)

        if prior:
            prior_id = party_id_of(prior)
            if prior_id:
                used_ids.add(prior_id)
            entity = nonempty(inc.get("name")) or nonempty(prior.get("name")) or ""
            role = nonempty(inc.get("role")) or nonempty(prior.get("role")) or "party"
            inc_signer = accepted_human_signer_name(signer_name_of(inc), entity)
            prior_signer = accepted_human_signer_name(signer_name_of(prior), entity)
            signer = prefer_confirmed(inc_signer, prior_signer)
            title = prefer_confirmed(signer_title_of(inc), signer_title_of(prior))
            email = prefer_confirmed(nonempty(inc.get("email")), nonempty(prior.get("email")))
            phone = prefer_confirmed(nonempty(inc.get("phone")), nonempty(prior.get("phone")))
            merged.append({
                "id": prior_id or pid or None,
                "name": entity,
                "role": role,
                "email": email,
                "phone": phone,
                "signer_name": signer,
                "signer_title": title,
                "signerName": signer,
                "signerTitle": title,
            })
            continue

        entity = nonempty(inc.get("name")) or ""
        merged.append(_emit_party(
            inc,
            entity=entity,
            role=nonempty(inc.get("role")) or "party",
            pid=pid,
        ))

    for row in current_rows:
        pid = party_id_of(row)
        if pid and pid in used_ids:
            continue
        if not pid:
            key = normalize_legal_name(str(row.get("name") or ""))
            already = any(normalize_legal_name(str(item.get("name") or "")) == key for item in merged)
            if already:
                continue
        merged.append(_emit_party(
            row,
            entity=nonempty(row.get("name")) or "",
            role=nonempty(row.get("role")) or "party",
            pid=pid,
        ))
    return merged


def missing_confirmed_signer_names(parties: List[Dict[str, Any]]) -> List[str]:
    """Party IDs (or legal names) that still lack a human signer name. Do not guess."""
    missing: List[str] = []
    for row in parties or []:
        entity = nonempty(row.get("name")) or ""
        if not entity:
            continue
        if accepted_human_signer_name(signer_name_of(row), entity):
            continue
        missing.append(party_id_of(row) or entity)
    return missing
