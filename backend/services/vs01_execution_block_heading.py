"""Witness / execution-block heading detection for VS01 signature stamping."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence

ENTITY_SUFFIX_RE = re.compile(
    r"\b(?:LLC|L\.L\.C\.|Inc\.?|INC|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP|L\.P\.)\b",
    re.I,
)


@dataclass
class ExecutionBlockHeadingMatch:
    party_index: int
    block_heading: str


@dataclass
class ExecutionBlockHeadingScanState:
    in_witness_block: bool = False
    next_sequential_party_index: int = 0
    current: Optional[ExecutionBlockHeadingMatch] = None


def normalize_entity_label(label: str) -> str:
    return re.sub(r":\s*$", "", label).replace("  ", " ").strip().lower()


def is_witness_block_marker_line(trimmed: str) -> bool:
    return bool(re.match(r"^IN WITNESS WHEREOF\b", trimmed, re.I))


def is_entity_execution_block_heading_line(trimmed: str, in_witness_block: bool) -> bool:
    if not trimmed:
        return False
    if not in_witness_block:
        return False
    return is_entity_legal_name_heading_line(trimmed)


def is_entity_legal_name_heading_line(trimmed: str) -> bool:
    if not trimmed:
        return False
    if not re.search(r":\s*$", trimmed):
        return False
    if re.match(r"^(?:By|Signature|Name|Title|Date|Email|Address)\s*:", trimmed, re.I):
        return False
    if re.search(r"\bif\s+to\b", trimmed, re.I):
        return False
    if re.match(r"^(?:CLIENT|SERVICE\s+PROVIDER|PARTY\s+\d+)\s*:?\s*$", trimmed, re.I):
        return False
    entity = re.sub(r":\s*$", "", trimmed).strip()
    if len(entity) < 4 or len(entity) > 160:
        return False
    if re.match(r"^\d+\.\s+", entity):
        return False
    return bool(ENTITY_SUFFIX_RE.search(entity))


def match_canonical_role_block_heading(trimmed: str) -> Optional[ExecutionBlockHeadingMatch]:
    patterns: List[tuple[re.Pattern[str], int, str]] = [
        (re.compile(r"^\s*CLIENT\s*:?\s*$", re.I), 0, "CLIENT"),
        (re.compile(r"^\s*SERVICE\s+PROVIDER\s*:?\s*$", re.I), 1, "SERVICE PROVIDER"),
        (re.compile(r"^\s*PARTY\s+(\d+)\s*:?\s*$", re.I), -1, "PARTY"),
    ]
    for pattern, default_idx, label in patterns:
        match = pattern.match(trimmed)
        if not match:
            continue
        if default_idx >= 0:
            party_index = default_idx
        else:
            party_index = max(0, int(match.group(1)) - 1)
        return ExecutionBlockHeadingMatch(party_index=party_index, block_heading=label)
    return None


def party_index_for_entity_label(
    entity_label: str,
    role_entity_names: Optional[Sequence[str]],
) -> Optional[int]:
    if not role_entity_names:
        return None
    norm = normalize_entity_label(entity_label)
    for idx, name in enumerate(role_entity_names):
        if normalize_entity_label(name) == norm:
            return idx
    return None


def scan_execution_block_heading_line(
    trimmed: str,
    state: ExecutionBlockHeadingScanState,
    role_entity_names: Optional[Sequence[str]] = None,
) -> Optional[ExecutionBlockHeadingMatch]:
    if not trimmed:
        return None
    if is_witness_block_marker_line(trimmed):
        state.in_witness_block = True
        state.next_sequential_party_index = 0
        state.current = None
        return None

    canonical = match_canonical_role_block_heading(trimmed)
    if canonical:
        state.current = canonical
        return canonical

    if state.in_witness_block and is_entity_legal_name_heading_line(trimmed):
        entity_label = re.sub(r":\s*$", "", trimmed).strip()
        from_roles = party_index_for_entity_label(entity_label, role_entity_names)
        party_index = from_roles if from_roles is not None else state.next_sequential_party_index
        match = ExecutionBlockHeadingMatch(party_index=party_index, block_heading=entity_label)
        state.current = match
        state.next_sequential_party_index = max(state.next_sequential_party_index, party_index + 1)
        return match

    if not state.in_witness_block and is_entity_legal_name_heading_line(trimmed):
        state.in_witness_block = True
        entity_label = re.sub(r":\s*$", "", trimmed).strip()
        from_roles = party_index_for_entity_label(entity_label, role_entity_names)
        party_index = from_roles if from_roles is not None else state.next_sequential_party_index
        match = ExecutionBlockHeadingMatch(party_index=party_index, block_heading=entity_label)
        state.current = match
        state.next_sequential_party_index = max(state.next_sequential_party_index, party_index + 1)
        return match

    return None


def party_index_at_witness_line(
    lines: List[str],
    target_line_index: int,
    patch_start: int,
    role_entity_names: Optional[Sequence[str]] = None,
) -> int:
    state = ExecutionBlockHeadingScanState()
    by_line_index = -1
    date_line_index = -1
    for i in range(target_line_index + 1):
        line_start = 0 if i == 0 else len("\n".join(lines[:i])) + 1
        if line_start < patch_start:
            continue
        trimmed = lines[i].strip()
        scan_execution_block_heading_line(trimmed, state, role_entity_names)
        if re.match(r"^by\s*:", trimmed, re.I):
            by_line_index += 1
            if i == target_line_index:
                prev_trimmed = lines[i - 1].strip() if i > 0 else ""
                prev2_trimmed = lines[i - 2].strip() if i > 1 else ""
                prev_entity = (
                    is_entity_legal_name_heading_line(prev_trimmed)
                    or is_entity_legal_name_heading_line(prev2_trimmed)
                )
                if prev_entity:
                    return (
                        state.current.party_index
                        if state.current is not None
                        else max(0, by_line_index)
                    )
                return max(0, by_line_index)
        if re.match(r"^date\s*:", trimmed, re.I):
            date_line_index += 1
            if i == target_line_index:
                prev_trimmed = lines[i - 1].strip() if i > 0 else ""
                prev2_trimmed = lines[i - 2].strip() if i > 1 else ""
                prev_entity = (
                    is_entity_legal_name_heading_line(prev_trimmed)
                    or is_entity_legal_name_heading_line(prev2_trimmed)
                )
                if prev_entity:
                    return (
                        state.current.party_index
                        if state.current is not None
                        else max(0, date_line_index)
                    )
                return max(0, date_line_index)
    if state.current is not None:
        return state.current.party_index
    return 0


def extract_role_entity_names_from_portable(portable: Dict[str, Any]) -> List[str]:
    roles = portable.get("roles") if isinstance(portable.get("roles"), list) else []
    sorted_roles = sorted(
        [r for r in roles if isinstance(r, dict)],
        key=lambda r: int(r.get("partyIndex") or 0),
    )
    names: List[str] = []
    for role in sorted_roles:
        name = str(role.get("entityName") or role.get("partyName") or "").strip()
        if name:
            names.append(name)
    return names
