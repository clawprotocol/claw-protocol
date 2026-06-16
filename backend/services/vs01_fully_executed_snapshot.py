"""Build and persist VS01 fully-executed signed corpus snapshots server-side."""

from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from backend.services.vs01_signer_completion import (
    all_signers_signed_from_audit,
    extract_fully_executed_snapshot_from_portable,
    fully_executed_snapshot_ready,
    read_fully_executed_snapshot_from_draft,
)

_log = logging.getLogger(__name__)

_WITNESS_RE = re.compile(r"\bIN WITNESS WHEREOF\b", re.I)
_CLIENT_BLOCK_RE = re.compile(r"\n\s*CLIENT\s*:\s*(?:\n|$)", re.I)
_PARTY_BLOCK_HEADING_RE = re.compile(
    r"^\s*(?:CLIENT|SERVICE\s+PROVIDER|PROVIDER|COUNTERPARTY|PARTY\s+\d+)\s*:?\s*$",
    re.I,
)


def _fingerprint_corpus(corpus: str) -> str:
    return hashlib.sha256(corpus.encode("utf-8")).hexdigest()


def signature_patch_start_index(text: str) -> int:
    length = len(text)
    if length < 80:
        return -1
    min_fraction = 0.45 if length >= 2000 else 0.12
    min_pos = int(length * min_fraction)

    witness_matches = list(_WITNESS_RE.finditer(text))
    for match in reversed(witness_matches):
        if match.start() >= min_pos:
            return match.start()
    for match in reversed(witness_matches):
        if match.start() >= int(length * 0.72):
            return match.start()

    client_idx = _CLIENT_BLOCK_RE.search(text)
    if client_idx and client_idx.start() >= min_pos:
        return client_idx.start()

    witness = _WITNESS_RE.search(text)
    if witness:
        return witness.start()
    if client_idx:
        return client_idx.start()
    return length // 2


def _party_index_at_line(lines: List[str], line_index: int, patch_start: int) -> int:
    party_index = -1
    offset = 0
    for i in range(line_index + 1):
        if offset < patch_start:
            offset += len(lines[i]) + (1 if i > 0 else 0)
            continue
        if _PARTY_BLOCK_HEADING_RE.match(lines[i].strip()):
            party_index += 1
        offset += len(lines[i]) + (1 if i > 0 else 0)
    return max(0, party_index)


def _witness_by_line_is_blank(trimmed: str) -> bool:
    if not re.match(r"^by\s*:", trimmed, re.I):
        return False
    value = re.sub(r"^by\s*:\s*", "", trimmed, flags=re.I).strip()
    return not value or bool(re.search(r"_{2,}", value))


def _witness_date_line_is_blank(trimmed: str) -> bool:
    if not re.match(r"^date\s*:", trimmed, re.I):
        return False
    value = re.sub(r"^date\s*:\s*", "", trimmed, flags=re.I).strip()
    return not value or bool(re.search(r"_{2,}", value))


def _format_signing_date_display(iso: str) -> str:
    t = (iso or "").strip()
    if not t:
        return ""
    try:
        d = datetime.fromisoformat(f"{t}T12:00:00")
        return f"{d.strftime('%B')} {d.day}, {d.year}"
    except ValueError:
        return t


def stamp_witness_block_party_signature(
    corpus_plain: str, party_index: int, signature_text: str
) -> Tuple[str, bool]:
    sig = (signature_text or "").strip()
    if not sig:
        return corpus_plain, False
    patch_start = signature_patch_start_index(corpus_plain)
    lines = corpus_plain.split("\n")
    for i, line in enumerate(lines):
        line_start = len("\n".join(lines[:i])) + (1 if i > 0 else 0)
        if line_start < patch_start:
            continue
        trimmed = line.strip()
        if not _witness_by_line_is_blank(trimmed):
            continue
        if _party_index_at_line(lines, i, patch_start) != party_index:
            continue
        indent = re.match(r"^\s*", line).group(0) if re.match(r"^\s*", line) else ""
        lines[i] = f"{indent}By: {sig}"
        return "\n".join(lines), True
    return corpus_plain, False


def stamp_witness_block_party_signing_date(
    corpus_plain: str, party_index: int, signing_date_iso: str
) -> Tuple[str, bool]:
    iso = (signing_date_iso or "").strip() or datetime.now(timezone.utc).date().isoformat()
    display = _format_signing_date_display(iso)
    if not display:
        return corpus_plain, False
    patch_start = signature_patch_start_index(corpus_plain)
    lines = corpus_plain.split("\n")
    for i, line in enumerate(lines):
        line_start = len("\n".join(lines[:i])) + (1 if i > 0 else 0)
        if line_start < patch_start:
            continue
        trimmed = line.strip()
        if not _witness_date_line_is_blank(trimmed):
            continue
        if _party_index_at_line(lines, i, patch_start) != party_index:
            continue
        indent = re.match(r"^\s*", line).group(0) if re.match(r"^\s*", line) else ""
        lines[i] = f"{indent}Date: {display}"
        return "\n".join(lines), True
    return corpus_plain, False


def count_signed_witness_blocks(corpus_plain: str) -> Tuple[int, int]:
    patch_start = signature_patch_start_index(corpus_plain)
    lines = corpus_plain.split("\n")
    party_by_signed: Dict[int, Dict[str, bool]] = {}
    for i, line in enumerate(lines):
        line_start = len("\n".join(lines[:i])) + (1 if i > 0 else 0)
        if line_start < patch_start:
            continue
        trimmed = line.strip()
        party_index = _party_index_at_line(lines, i, patch_start)
        entry = party_by_signed.setdefault(party_index, {"by": False, "date": False})
        if re.match(r"^by\s*:", trimmed, re.I) and not _witness_by_line_is_blank(trimmed):
            entry["by"] = True
        if re.match(r"^date\s*:", trimmed, re.I) and not _witness_date_line_is_blank(trimmed):
            entry["date"] = True
    blocks = list(party_by_signed.values())
    total = len(blocks)
    signed = sum(1 for b in blocks if b["by"] and b["date"])
    return signed, total


def parse_signature_completed_events(audit: Any) -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    for event in audit or []:
        if not isinstance(event, dict):
            continue
        if str(event.get("event_type") or "") != "signature_completed":
            continue
        val = event.get("value")
        if not isinstance(val, dict):
            continue
        rid = str(val.get("signer_role_id") or "").strip()
        if not rid:
            continue
        out.append(
            {
                "signer_role_id": rid,
                "signed_date_iso": str(val.get("signed_date_iso") or "").strip(),
                "signed_date_display": str(val.get("signed_date_display") or "").strip(),
                "display_name": str(val.get("participant_display_name") or "").strip(),
                "signed_at": str(event.get("at") or "").strip(),
            }
        )
    return out


def signature_text_for_signer_role(fields: Any, signer_role_id: str) -> str:
    rid = (signer_role_id or "").strip()
    for field in fields or []:
        if not isinstance(field, dict):
            continue
        if str(field.get("type") or "") != "signature":
            continue
        assigned = str(field.get("assignedSignerRoleId") or "").strip()
        if assigned and assigned != rid:
            continue
        value = str(field.get("value") or "").strip()
        if value:
            return value
    return ""


def build_snapshot_record(corpus_plain: str, portable: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    corpus = (corpus_plain or "").strip()
    if len(corpus) < 80:
        return None
    signed, total = count_signed_witness_blocks(corpus)
    roles = portable.get("roles") if isinstance(portable.get("roles"), list) else []
    required_roles = sum(
        1 for r in roles if isinstance(r, dict) and r.get("requiresSignature", True) is not False
    )
    required = max(total, required_roles, 2)
    if signed < required:
        return None
    signer_role_ids = [
        str(r.get("roleId") or "").strip()
        for r in roles
        if isinstance(r, dict) and r.get("requiresSignature", True) is not False and str(r.get("roleId") or "").strip()
    ]
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "v": 1,
        "corpus_plain": corpus,
        "corpus_hash": _fingerprint_corpus(corpus),
        "saved_at": now,
        "signer_role_ids": signer_role_ids,
    }


def reconstruct_corpus_from_audit_and_portable(draft: Dict[str, Any]) -> Optional[str]:
    stored = draft.get("vs01_signing_packet_v1")
    if not isinstance(stored, dict):
        return None
    portable = stored.get("portable")
    if not isinstance(portable, dict):
        return None
    seed = portable.get("seed")
    if not isinstance(seed, dict):
        return None
    corpus = str(seed.get("corpusPlain") or "")
    if len(corpus) < 80:
        return None

    events = parse_signature_completed_events(draft.get("audit_log"))
    if not events:
        return None

    fields = portable.get("fields") if isinstance(portable.get("fields"), list) else []
    roles = portable.get("roles") if isinstance(portable.get("roles"), list) else []
    for event in events:
        rid = event["signer_role_id"]
        role = next(
            (r for r in roles if isinstance(r, dict) and str(r.get("roleId") or "").strip() == rid),
            None,
        )
        party_index = int(role.get("partyIndex") or 0) if isinstance(role, dict) else 0
        sig = signature_text_for_signer_role(fields, rid) or event.get("display_name") or ""
        if sig:
            corpus, _ = stamp_witness_block_party_signature(corpus, party_index, sig)
        iso = (event.get("signed_date_iso") or "").strip()
        if not iso:
            at = str(event.get("signed_at") or "").strip()
            iso = at[:10] if len(at) >= 10 else datetime.now(timezone.utc).date().isoformat()
        corpus, _ = stamp_witness_block_party_signing_date(corpus, party_index, iso)
    return corpus


@dataclass(frozen=True)
class EnsureFullyExecutedSnapshotResult:
    draft_dict: Dict[str, Any]
    mutated: bool
    source: str
    snapshot_ready: bool


def ensure_fully_executed_snapshot_on_draft(
    draft: Dict[str, Any],
    *,
    agreement_id: str = "",
) -> EnsureFullyExecutedSnapshotResult:
    aid = (agreement_id or str(draft.get("id") or "")).strip()
    if fully_executed_snapshot_ready(draft):
        _log.info(
            "[vs01-final-signed-snapshot] agreement_id=%s source=existing snapshot_ready=true",
            aid,
        )
        return EnsureFullyExecutedSnapshotResult(draft, False, "existing", True)

    stored = draft.get("vs01_signing_packet_v1")
    if not isinstance(stored, dict):
        stored = {"v": 1}
    portable = stored.get("portable") if isinstance(stored.get("portable"), dict) else {}

    snap = extract_fully_executed_snapshot_from_portable(portable) if portable else None
    if snap:
        next_stored = {**stored, "fully_executed_snapshot": snap}
        _log.info(
            "[vs01-final-signed-snapshot] agreement_id=%s source=portable_snapshot snapshot_ready=true",
            aid,
        )
        return EnsureFullyExecutedSnapshotResult(
            {**draft, "vs01_signing_packet_v1": next_stored},
            True,
            "portable_snapshot",
            True,
        )

    seed = portable.get("seed") if isinstance(portable.get("seed"), dict) else {}
    corpus = str(seed.get("corpusPlain") or "")
    built = build_snapshot_record(corpus, portable) if corpus else None
    if built:
        next_stored = {**stored, "fully_executed_snapshot": built}
        _log.info(
            "[vs01-final-signed-snapshot] agreement_id=%s source=portable_corpus snapshot_ready=true",
            aid,
        )
        return EnsureFullyExecutedSnapshotResult(
            {**draft, "vs01_signing_packet_v1": next_stored},
            True,
            "portable_corpus",
            True,
        )

    audit = draft.get("audit_log") or []
    if all_signers_signed_from_audit(draft, audit):
        rebuilt = reconstruct_corpus_from_audit_and_portable(draft)
        if rebuilt:
            built = build_snapshot_record(rebuilt, portable)
            if built:
                next_seed = {
                    **seed,
                    "corpusPlain": rebuilt,
                    "corpusHash": _fingerprint_corpus(rebuilt),
                }
                next_portable = {**portable, "seed": next_seed}
                next_stored = {
                    **stored,
                    "portable": next_portable,
                    "fully_executed_snapshot": built,
                }
                _log.info(
                    "[vs01-final-signed-snapshot] agreement_id=%s source=reconstructed snapshot_ready=true",
                    aid,
                )
                return EnsureFullyExecutedSnapshotResult(
                    {**draft, "vs01_signing_packet_v1": next_stored},
                    True,
                    "reconstructed",
                    True,
                )

    _log.warning(
        "[vs01-final-signed-snapshot] agreement_id=%s source=missing snapshot_ready=false",
        aid,
    )
    return EnsureFullyExecutedSnapshotResult(draft, False, "missing", False)
