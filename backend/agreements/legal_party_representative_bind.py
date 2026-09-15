"""Bind signer/email parse rows onto legal parties without truncating individuals."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

_ENTITY_SUFFIX_RE = re.compile(
    r"\b(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP)\b",
    re.I,
)
_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
_PAREN_ROLE_RE = re.compile(
    r"([A-Z][A-Za-z0-9&.'\-\s]{2,80}?(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Ltd\.?|LLP|PLLC|LP)\.?)\s*\(\s*"
    r"(Consultant|Client|Customer|Provider|Service Provider|Contractor)\s*\)",
    re.I,
)
_ROLE_SIGNER_RE = re.compile(
    r"\b(consultant|client|customer|provider|service\s+provider|contractor)\s+signer[:\s]+"
    r"([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){0,3})"
    r"(?:[, ]+([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}))?",
    re.I,
)
_INDIVIDUAL_RE = re.compile(
    r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){0,3})\s+(?:as\s+an\s+individual|\(individual\)|\(an\s+individual\))",
    re.I,
)
_REPRESENTATIVE_ROLE_RE = re.compile(r"\b(?:signer|signatory|authorized\s+signer|notice\s+contact|email)\b", re.I)
_HUMAN_NAME_RE = re.compile(r"^[A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){0,3}$")


def _norm(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def _key(value: str) -> str:
    return _norm(value).lower()


def _title_role(role: str) -> str:
    return " ".join(part[:1].upper() + part[1:].lower() for part in _norm(role).split())


def _is_email(value: str) -> bool:
    return bool(_EMAIL_RE.match(_norm(value)))


def _is_entity(name: str) -> bool:
    text = _norm(name)
    return bool(text and _ENTITY_SUFFIX_RE.search(text) and not _is_email(text))


def _is_human(name: str) -> bool:
    text = _norm(name)
    return bool(_HUMAN_NAME_RE.match(text) and not _is_entity(text) and not _is_email(text))


def _names_match(a: str, b: str) -> bool:
    left, right = _key(a), _key(b)
    if not left or not right:
        return False
    if left == right:
        return True
    return left.rstrip(".") == right.rstrip(".") or left in right or right in left


def _intake_entities_and_roles(intake: str) -> Dict[str, str]:
    found: Dict[str, str] = {}
    for match in _PAREN_ROLE_RE.finditer(intake or ""):
        found[_norm(match.group(1))] = _title_role(match.group(2))
    return found


def _entity_for_role(roles: Dict[str, str], role: str) -> Optional[str]:
    want = _key(role)
    if not want or len(want) < 3:
        return None
    for entity, labeled in roles.items():
        have = _key(labeled)
        if have == want or want in have or have in want:
            return entity
    return None


def bind_representatives_to_legal_parties(
    parties: List[Dict[str, Any]],
    intake: str,
) -> Dict[str, Any]:
    rows = [p for p in parties if isinstance(p, dict)]
    intake_roles = _intake_entities_and_roles(intake)
    entities: List[str] = []
    for name in list(intake_roles.keys()) + [_norm(str(p.get("name") or "")) for p in rows]:
        if _is_entity(name) and not any(_names_match(prev, name) for prev in entities):
            entities.append(name)

    slots: Dict[str, Dict[str, Any]] = {}
    for entity in entities:
        row = next((p for p in rows if _names_match(str(p.get("name") or ""), entity)), {})
        role = _norm(str(row.get("role") or ""))
        if _REPRESENTATIVE_ROLE_RE.search(role):
            role = intake_roles.get(entity) or "party"
        slots[_key(entity)] = {
            "name": _norm(str(row.get("name") or entity)),
            "role": role or intake_roles.get(entity) or "party",
            "email": _norm(str(row.get("email") or "")) if _is_email(str(row.get("email") or "")) else None,
            "signerName": _norm(str(row.get("signerName") or row.get("signer_name") or "")),
            "signerTitle": _norm(str(row.get("signerTitle") or row.get("signer_title") or "")),
        }

    bound: List[Dict[str, str]] = []
    extras: List[Dict[str, Any]] = []
    individuals = [_norm(m.group(1)) for m in _INDIVIDUAL_RE.finditer(intake or "")]

    def bind_to(entity: str, patch: Dict[str, Any], source: str, kind: str) -> bool:
        current = slots.get(_key(entity))
        if not current:
            return False
        if patch.get("email") and not current.get("email"):
            current["email"] = patch["email"]
        if patch.get("signerName") and not current.get("signerName"):
            current["signerName"] = patch["signerName"]
        if patch.get("signerTitle") and not current.get("signerTitle"):
            current["signerTitle"] = patch["signerTitle"]
        if patch.get("role") and (not current.get("role") or current.get("role") == "party"):
            current["role"] = patch["role"]
        bound.append({"name": source, "boundTo": current["name"], "kind": kind})
        return True

    role_signers = [
        {"role": _key(m.group(1)), "signerName": _norm(m.group(2)), "email": _norm(m.group(3) or "")}
        for m in _ROLE_SIGNER_RE.finditer(intake or "")
    ]

    for row in rows:
        name = _norm(str(row.get("name") or ""))
        role = _norm(str(row.get("role") or ""))
        email = _norm(str(row.get("email") or ""))
        if not name:
            continue
        if any(_names_match(entity, name) for entity in entities):
            continue
        if _is_email(name) or _is_email(email):
            addr = name if _is_email(name) else email
            domain = next(
                (
                    entity
                    for entity in entities
                    if entity.split()[0].lower() in addr.lower() and len(entity.split()[0]) >= 4
                ),
                None,
            )
            parent = re.search(r"\b(consultant|client|customer|provider|contractor)\b", role, re.I)
            role_entity = _entity_for_role(intake_roles, parent.group(1) if parent else "")
            target = domain or role_entity
            if target and bind_to(target, {"email": addr}, addr, "email"):
                continue
            extras.append({**row, "name": name, "email": addr})
            continue
        if _is_human(name) or _REPRESENTATIVE_ROLE_RE.search(role):
            if any(_names_match(ind, name) for ind in individuals):
                extras.append({**row, "name": name, "role": role if not _REPRESENTATIVE_ROLE_RE.search(role) else "Individual"})
                continue
            instruction = next((item for item in role_signers if _names_match(item["signerName"], name)), None)
            parent = re.search(r"\b(consultant|client|customer|provider|contractor)\b", role, re.I)
            target = _entity_for_role(
                intake_roles,
                (instruction or {}).get("role") or (parent.group(1) if parent else ""),
            )
            if target and bind_to(
                target,
                {
                    "signerName": name,
                    "email": instruction.get("email") if instruction else email,
                    "role": _title_role(instruction["role"]) if instruction else None,
                },
                name,
                "role_label" if _REPRESENTATIVE_ROLE_RE.search(role) else "signer",
            ):
                continue
            extras.append({**row, "name": name, "role": role})
            continue
        extras.append(row)

    for item in role_signers:
        target = _entity_for_role(intake_roles, item["role"])
        if target:
            bind_to(target, {"signerName": item["signerName"], "email": item["email"]}, item["signerName"], "signer")

    for entity, role in intake_roles.items():
        slot = slots.get(_key(entity))
        if slot and (not slot.get("role") or slot.get("role") == "party"):
            slot["role"] = role

    parties_out: List[Dict[str, Any]] = []
    for entity in entities:
        slot = slots.get(_key(entity))
        if slot:
            parties_out.append(slot)
    parties_out.extend(extras)

    unresolved = [
        row
        for row in extras
        if _is_human(str(row.get("name") or "")) and not any(_names_match(ind, str(row.get("name") or "")) for ind in individuals)
    ]
    question = None
    if unresolved and len(entities) >= 2:
        question = (
            f"Is {unresolved[0].get('name')} signing for one of the named companies, "
            "or contracting as their own legal party?"
        )
    return {
        "parties": parties_out,
        "bound_representatives": bound,
        "clarification_question": question,
    }
