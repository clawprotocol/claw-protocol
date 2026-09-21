"""Bind signer/email parse rows onto legal parties without truncating individuals."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

_ENTITY_SUFFIX_RE = re.compile(
    r"\b(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP)\b",
    re.I,
)
_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
_ENTITY_NAME = (
    r"[A-Z][A-Za-z0-9&'.-]+(?:\s+[A-Z][A-Za-z0-9&'.-]+){0,6}\s+"
    r"(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP)\.?"
)
_PAREN_ROLE_RE = re.compile(
    rf"({_ENTITY_NAME})\s*\(\s*"
    r"(Consultant|Client|Customer|Provider|Service Provider|Contractor|Advisor)\s*\)"
)
_ROLE_SIGNER_RE = re.compile(
    r"\b(consultant|client|customer|provider|service\s+provider|contractor)\s+signer[:\s]+"
    r"([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){0,3})"
    r"(?:[, ]+([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}))?",
    re.I,
)
_ENTITY_SIGNER_LINE_RE = re.compile(
    rf"(?:^|[\n.;])\s*({_ENTITY_NAME})\s+signer[:\s]+"
    r"([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){0,3})"
    r"(?:[^@\n]*?([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}))?",
    re.M,
)
_INDIVIDUAL_RE = re.compile(
    r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){0,3})\s+"
    r"(?:as\s+an\s+individual|\(individual\)|\(an\s+individual\))"
    r"(?:\s*\(\s*([A-Za-z][A-Za-z\s-]{1,40})\s*\))?"
)
_CONTRACTING_PARTY_RE = re.compile(
    r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){0,3})\s+"
    r"is\s+(?:a|the)\s+(?:(?:second|third|fourth)\s+)?(?:contracting|legal)\s+party",
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
    return left.rstrip(".") == right.rstrip(".")


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


def _individual_contracting(intake: str) -> Dict[str, str]:
    found: Dict[str, str] = {}
    for match in _INDIVIDUAL_RE.finditer(intake or ""):
        name = _norm(match.group(1))
        role = _title_role(match.group(2) or "") if match.group(2) else "Individual"
        if _is_human(name):
            found[name] = role or "Individual"
    for match in _CONTRACTING_PARTY_RE.finditer(intake or ""):
        name = _norm(match.group(1))
        if _is_human(name) and name not in found:
            found[name] = "Individual"
    return found


def bind_representatives_to_legal_parties(
    parties: List[Dict[str, Any]],
    intake: str,
) -> Dict[str, Any]:
    rows = [p for p in parties if isinstance(p, dict)]
    intake_roles = _intake_entities_and_roles(intake)
    individuals = _individual_contracting(intake)
    for row in rows:
        name = _norm(str(row.get("name") or ""))
        role = _norm(str(row.get("role") or ""))
        if _is_entity(name) and role and not _REPRESENTATIVE_ROLE_RE.search(role):
            intake_roles.setdefault(name, _title_role(role))
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
    confirmed_individuals: List[Dict[str, Any]] = []
    unresolved: List[Dict[str, Any]] = []

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
    entity_line_signers = [
        {"entity": _norm(m.group(1)), "signerName": _norm(m.group(2)), "email": _norm(m.group(3) or "")}
        for m in _ENTITY_SIGNER_LINE_RE.finditer(intake or "")
    ]

    def individual_role(name: str, row_role: str) -> str:
        labeled = next((role for ind, role in individuals.items() if _names_match(ind, name)), "")
        if row_role and not _REPRESENTATIVE_ROLE_RE.search(row_role):
            return row_role
        return labeled or "Individual"

    for row in rows:
        name = _norm(str(row.get("name") or ""))
        role = _norm(str(row.get("role") or ""))
        email = _norm(str(row.get("email") or ""))
        if not name:
            continue
        if any(_names_match(entity, name) for entity in entities):
            continue
        email_only = _is_email(name) and not _is_human(name)
        if email_only:
            addr = name
            labeled = re.search(r"^\s*(.+?)\s+signer(?:\s+email)?\s*$", role, re.I)
            parent = labeled or re.search(r"\b(consultant|client|customer|provider|contractor)\b", role, re.I)
            target = _entity_for_role(intake_roles, parent.group(1) if parent else "")
            if target and bind_to(target, {"email": addr}, addr, "email"):
                continue
            unresolved.append({**row, "name": name, "email": addr})
            continue
        if _is_human(name) or _REPRESENTATIVE_ROLE_RE.search(role):
            if any(_names_match(ind, name) for ind in individuals):
                confirmed_individuals.append(
                    {
                        **row,
                        "name": name,
                        "role": individual_role(name, role),
                        "email": email if _is_email(email) else None,
                    }
                )
                continue
            instruction = next((item for item in role_signers if _names_match(item["signerName"], name)), None)
            labeled = re.search(r"^\s*(.+?)\s+signer(?:\s+email)?\s*$", role, re.I)
            parent = labeled or re.search(r"\b(consultant|client|customer|provider|contractor)\b", role, re.I)
            entity_line = next((item for item in entity_line_signers if _names_match(item["signerName"], name)), None)
            target = (entity_line or {}).get("entity") or _entity_for_role(
                intake_roles,
                (instruction or {}).get("role") or (parent.group(1) if parent else ""),
            )
            if target and bind_to(
                target,
                {
                    "signerName": name,
                    "email": (instruction or {}).get("email") or (entity_line or {}).get("email") or email,
                    "role": _title_role(instruction["role"]) if instruction else None,
                },
                name,
                "role_label" if _REPRESENTATIVE_ROLE_RE.search(role) else "signer",
            ):
                continue
            unresolved.append({**row, "name": name, "role": role, "email": email if _is_email(email) else None})
            continue
        unresolved.append(row)

    for item in role_signers:
        target = _entity_for_role(intake_roles, item["role"])
        if target:
            bind_to(target, {"signerName": item["signerName"], "email": item["email"]}, item["signerName"], "signer")
    for item in entity_line_signers:
        target = next((entity for entity in entities if _names_match(entity, item["entity"])), None)
        if target:
            bind_to(
                target,
                {"signerName": item["signerName"], "email": item["email"]},
                item["signerName"],
                "signer",
            )

    for entity, role in intake_roles.items():
        slot = slots.get(_key(entity))
        if slot and (not slot.get("role") or slot.get("role") == "party"):
            slot["role"] = role

    parties_out: List[Dict[str, Any]] = []
    for entity in entities:
        slot = slots.get(_key(entity))
        if slot:
            parties_out.append(slot)
    parties_out.extend(confirmed_individuals)

    question = None
    unresolved_humans = [row for row in unresolved if _is_human(str(row.get("name") or ""))]
    askable = [
        row
        for row in unresolved_humans
        if re.search(rf"\b{re.escape(str(row.get('name') or ''))}\b", intake or "", re.I)
    ]
    if askable and len(entities) >= 2:
        question = (
            f"Is {askable[0].get('name')} signing for one of the named companies, "
            "or contracting as their own legal party?"
        )
    return {
        "parties": parties_out,
        "bound_representatives": bound,
        "unresolved_extraction_rows": unresolved,
        "clarification_question": question,
    }
