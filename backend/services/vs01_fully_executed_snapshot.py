"""Build and persist VS01 fully-executed signed corpus snapshots server-side."""

from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

from backend.services.vs01_execution_block_heading import (
    extract_role_entity_names_from_portable,
    is_entity_legal_name_heading_line,
    party_index_at_witness_line,
)
from backend.services.vs01_signer_completion import (
    all_signers_signed_from_audit,
    extract_fully_executed_snapshot_from_portable,
    fully_executed_signed_already_recorded,
    fully_executed_snapshot_ready,
    read_fully_executed_snapshot_from_draft,
    snapshot_record_corpus_plain,
)

_log = logging.getLogger(__name__)

_WITNESS_RE = re.compile(r"\bIN WITNESS WHEREOF\b", re.I)
_CLIENT_BLOCK_RE = re.compile(r"\n\s*CLIENT\s*:\s*(?:\n|$)", re.I)
def _fingerprint_corpus(corpus: str) -> str:
    return hashlib.sha256(corpus.encode("utf-8")).hexdigest()


def resolve_witness_execution_scan_start(corpus_plain: str) -> int:
    length = len(corpus_plain)
    tail_guard = int(length * 0.45)
    lines = corpus_plain.split("\n")
    cluster_top_idx = -1
    for i in range(len(lines) - 1, -1, -1):
        trimmed = lines[i].strip()
        if is_entity_legal_name_heading_line(trimmed):
            cluster_top_idx = i if cluster_top_idx < 0 else min(cluster_top_idx, i)
            continue
        if cluster_top_idx < 0:
            continue
        if not trimmed:
            continue
        if re.match(r"^(?:By|Name|Title|Date|Signature)\s*:", trimmed, re.I):
            continue
        if re.match(r"^IN WITNESS WHEREOF\b", trimmed, re.I):
            cluster_top_idx = min(cluster_top_idx, i)
            break
        break
    entity_cluster_start = (
        -1
        if cluster_top_idx < 0
        else 0
        if cluster_top_idx == 0
        else len("\n".join(lines[:cluster_top_idx])) + 1
    )

    witness_matches = list(re.finditer(r"\bIN WITNESS WHEREOF\b", corpus_plain, re.I))
    witness_start = -1
    for match in reversed(witness_matches):
        if match.start() >= tail_guard:
            witness_start = match.start()
            break
    if witness_start < 0 and witness_matches:
        witness_start = witness_matches[-1].start()

    if entity_cluster_start >= tail_guard and entity_cluster_start > witness_start:
        return entity_cluster_start
    if witness_start >= 0:
        return witness_start
    if entity_cluster_start >= tail_guard:
        return entity_cluster_start
    return signature_patch_start_index(corpus_plain)


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


def _stamp_signature_in_text(
    text: str,
    party_index: int,
    sig: str,
    role_entity_names: Optional[Sequence[str]],
) -> Tuple[str, bool]:
    patch_start = resolve_witness_execution_scan_start(text)
    lines = text.split("\n")
    for i, line in enumerate(lines):
        line_start = len("\n".join(lines[:i])) + (1 if i > 0 else 0)
        if line_start < patch_start:
            continue
        trimmed = line.strip()
        if not _witness_by_line_is_blank(trimmed):
            continue
        if party_index_at_witness_line(lines, i, patch_start, role_entity_names) != party_index:
            continue
        indent = re.match(r"^\s*", line).group(0) if re.match(r"^\s*", line) else ""
        lines[i] = f"{indent}By: {sig}"
        return "\n".join(lines), True
    return text, False


def stamp_witness_block_party_signature(
    corpus_plain: str,
    party_index: int,
    signature_text: str,
    role_entity_names: Optional[Sequence[str]] = None,
) -> Tuple[str, bool]:
    sig = (signature_text or "").strip()
    if not sig:
        return corpus_plain, False
    stamped, ok = _stamp_signature_in_text(corpus_plain, party_index, sig, role_entity_names)
    if ok or len(corpus_plain) < 8000:
        return stamped, ok
    tail_len = min(len(corpus_plain), 8000)
    offset = len(corpus_plain) - tail_len
    tail = corpus_plain[offset:]
    tail_stamped, tail_ok = _stamp_signature_in_text(tail, party_index, sig, role_entity_names)
    if not tail_ok:
        return corpus_plain, False
    return corpus_plain[:offset] + tail_stamped, True


def _stamp_date_in_text(
    text: str,
    party_index: int,
    display: str,
    role_entity_names: Optional[Sequence[str]],
) -> Tuple[str, bool]:
    patch_start = resolve_witness_execution_scan_start(text)
    lines = text.split("\n")
    for i, line in enumerate(lines):
        line_start = len("\n".join(lines[:i])) + (1 if i > 0 else 0)
        if line_start < patch_start:
            continue
        trimmed = line.strip()
        if not _witness_date_line_is_blank(trimmed):
            continue
        if party_index_at_witness_line(lines, i, patch_start, role_entity_names) != party_index:
            continue
        indent = re.match(r"^\s*", line).group(0) if re.match(r"^\s*", line) else ""
        lines[i] = f"{indent}Date: {display}"
        return "\n".join(lines), True
    return text, False


def stamp_witness_block_party_signing_date(
    corpus_plain: str,
    party_index: int,
    signing_date_iso: str,
    role_entity_names: Optional[Sequence[str]] = None,
) -> Tuple[str, bool]:
    iso = (signing_date_iso or "").strip() or datetime.now(timezone.utc).date().isoformat()
    display = _format_signing_date_display(iso)
    if not display:
        return corpus_plain, False
    stamped, ok = _stamp_date_in_text(corpus_plain, party_index, display, role_entity_names)
    if ok or len(corpus_plain) < 8000:
        return stamped, ok
    tail_len = min(len(corpus_plain), 8000)
    offset = len(corpus_plain) - tail_len
    tail = corpus_plain[offset:]
    tail_stamped, tail_ok = _stamp_date_in_text(tail, party_index, display, role_entity_names)
    if not tail_ok:
        return corpus_plain, False
    return corpus_plain[:offset] + tail_stamped, True


def _count_signed_witness_blocks_at(
    corpus_plain: str,
    role_entity_names: Optional[Sequence[str]] = None,
) -> Tuple[int, int]:
    patch_start = resolve_witness_execution_scan_start(corpus_plain)
    lines = corpus_plain.split("\n")
    party_by_signed: Dict[int, Dict[str, bool]] = {}
    for i, line in enumerate(lines):
        line_start = len("\n".join(lines[:i])) + (1 if i > 0 else 0)
        if line_start < patch_start:
            continue
        trimmed = line.strip()
        party_index = party_index_at_witness_line(lines, i, patch_start, role_entity_names)
        entry = party_by_signed.setdefault(party_index, {"by": False, "date": False})
        if re.match(r"^by\s*:", trimmed, re.I) and not _witness_by_line_is_blank(trimmed):
            entry["by"] = True
        if re.match(r"^date\s*:", trimmed, re.I) and not _witness_date_line_is_blank(trimmed):
            entry["date"] = True
    blocks = list(party_by_signed.values())
    signed = sum(1 for b in blocks if b["by"] and b["date"])
    return signed, len(blocks)


def count_signed_witness_blocks(
    corpus_plain: str,
    role_entity_names: Optional[Sequence[str]] = None,
) -> Tuple[int, int]:
    signed, total = _count_signed_witness_blocks_at(corpus_plain, role_entity_names)
    if total >= 4 or len(corpus_plain) < 8000:
        return signed, total
    tail = corpus_plain[-min(len(corpus_plain), 8000):]
    tail_signed, tail_total = _count_signed_witness_blocks_at(tail, role_entity_names)
    return max(signed, tail_signed), max(total, tail_total)


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


def _normalize_email(value: Any) -> str:
    return str(value or "").strip().lower()


def signature_text_for_signer_role(
    fields: Any,
    signer_role_id: str,
    *,
    party_index: int = -1,
    signer_email: Optional[str] = None,
    audit_display_name: Optional[str] = None,
    role_signer_name: Optional[str] = None,
) -> str:
    rid = (signer_role_id or "").strip()
    if not rid:
        return ""
    target_email = _normalize_email(signer_email)
    for field in fields or []:
        if not isinstance(field, dict):
            continue
        if str(field.get("type") or "") != "signature":
            continue
        if field.get("autoInitials"):
            continue
        assigned = str(field.get("assignedSignerRoleId") or "").strip()
        if assigned != rid:
            continue
        value = str(field.get("value") or "").strip()
        if value:
            return value
    if party_index >= 0 and target_email:
        for field in fields or []:
            if not isinstance(field, dict):
                continue
            if str(field.get("type") or "") != "signature":
                continue
            if field.get("autoInitials"):
                continue
            if str(field.get("assignedSignerRoleId") or "").strip():
                continue
            if int(field.get("assignedPartyIndex") or -1) != party_index:
                continue
            field_mail = _normalize_email(field.get("assignedSignerEmail"))
            if field_mail and field_mail == target_email:
                value = str(field.get("value") or "").strip()
                if value:
                    return value
    audit_name = str(audit_display_name or "").strip()
    if audit_name:
        return audit_name
    role_name = str(role_signer_name or "").strip()
    if role_name:
        return role_name
    return ""


def strip_witness_execution_overlays(corpus_plain: str) -> str:
    """Reset filled witness By/Date lines before audit replay."""
    patch_start = resolve_witness_execution_scan_start(corpus_plain)
    lines = corpus_plain.split("\n")
    for i, line in enumerate(lines):
        line_start = 0 if i == 0 else len("\n".join(lines[:i])) + 1
        if line_start < patch_start:
            continue
        trimmed = line.strip()
        indent_match = re.match(r"^\s*", line)
        indent = indent_match.group(0) if indent_match else ""
        if re.match(r"^by\s*:", trimmed, re.I) and not _witness_by_line_is_blank(trimmed):
            lines[i] = f"{indent}By: ______________________________"
        elif re.match(r"^date\s*:", trimmed, re.I) and not _witness_date_line_is_blank(trimmed):
            lines[i] = f"{indent}Date: ______________________________"
    return "\n".join(lines)


def build_snapshot_record(corpus_plain: str, portable: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    corpus = (corpus_plain or "").strip()
    if len(corpus) < 80:
        return None
    role_entity_names = extract_role_entity_names_from_portable(portable)
    signed, total = count_signed_witness_blocks(corpus, role_entity_names)
    roles = portable.get("roles") if isinstance(portable.get("roles"), list) else []
    required_roles = sum(
        1 for r in roles if isinstance(r, dict) and r.get("requiresSignature", True) is not False
    )
    required = max(total, required_roles, 2)
    sig_fields_filled = sum(
        1
        for field in portable.get("fields") or []
        if isinstance(field, dict)
        and str(field.get("type") or "") == "signature"
        and not field.get("autoInitials")
        and str(field.get("value") or "").strip()
    )
    tail_filled_by = len(
        re.findall(r"^[^\n]*by\s*:\s*(?!_{2,})\S", corpus[-8000:], flags=re.I | re.M)
    )
    if signed < required and not (sig_fields_filled >= required and tail_filled_by >= required):
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
    corpus = str(seed.get("corpusPlain") or seed.get("corpus_plain") or "")
    if len(corpus) < 80:
        return None

    events = parse_signature_completed_events(draft.get("audit_log"))
    if not events:
        return None

    corpus = strip_witness_execution_overlays(corpus)
    fields = portable.get("fields") if isinstance(portable.get("fields"), list) else []
    roles = portable.get("roles") if isinstance(portable.get("roles"), list) else []
    role_entity_names = extract_role_entity_names_from_portable(portable)
    for event in events:
        rid = event["signer_role_id"]
        role = next(
            (r for r in roles if isinstance(r, dict) and str(r.get("roleId") or "").strip() == rid),
            None,
        )
        party_index = int(role.get("partyIndex") or 0) if isinstance(role, dict) else 0
        signer_email = ""
        role_signer_name = ""
        if isinstance(role, dict):
            signer_email = str(role.get("signerEmail") or role.get("reviewEmail") or "").strip()
            role_signer_name = str(role.get("signerName") or "").strip()
        sig = signature_text_for_signer_role(
            fields,
            rid,
            party_index=party_index,
            signer_email=signer_email or None,
            audit_display_name=event.get("display_name"),
            role_signer_name=role_signer_name or None,
        )
        if sig:
            corpus, _ = stamp_witness_block_party_signature(
                corpus, party_index, sig, role_entity_names
            )
        iso = (event.get("signed_date_iso") or "").strip()
        if not iso:
            at = str(event.get("signed_at") or "").strip()
            iso = at[:10] if len(at) >= 10 else datetime.now(timezone.utc).date().isoformat()
        corpus, _ = stamp_witness_block_party_signing_date(
            corpus, party_index, iso, role_entity_names
        )
    return corpus


@dataclass(frozen=True)
class EnsureFullyExecutedSnapshotResult:
    draft_dict: Dict[str, Any]
    mutated: bool
    source: str
    snapshot_ready: bool


def _normalize_signer_label(value: str) -> str:
    return " ".join((value or "").split()).lower()


def completed_execution_by_name_violations(corpus_plain: str) -> List[str]:
    """Return invariant violations when any party By: differs from that block's Name:."""
    corpus = (corpus_plain or "").strip()
    if len(corpus) < 80:
        return []
    patch_start = resolve_witness_execution_scan_start(corpus)
    lines = corpus.split("\n")
    violations: List[str] = []
    current_by = ""
    current_name = ""
    party_idx = -1
    rows: List[Tuple[int, str, str]] = []

    def flush() -> None:
        nonlocal current_by, current_name, party_idx, violations, rows
        by = current_by.strip()
        name = current_name.strip()
        if by and name and _normalize_signer_label(by) != _normalize_signer_label(name):
            violations.append(f"party {party_idx}: By {by!r} != Name {name!r}")
        if by or name:
            rows.append((party_idx, by, name))
        current_by = ""
        current_name = ""

    for i, line in enumerate(lines):
        line_start = len("\n".join(lines[:i])) + (1 if i > 0 else 0)
        if line_start < patch_start:
            continue
        trimmed = line.strip()
        if not trimmed:
            continue
        if is_entity_legal_name_heading_line(trimmed):
            flush()
            party_idx += 1
            continue
        if re.match(r"^by\s*:", trimmed, re.I):
            current_by = re.sub(r"^by\s*:\s*", "", trimmed, flags=re.I).strip()
            continue
        if re.match(r"^name\s*:", trimmed, re.I):
            current_name = re.sub(r"^name\s*:\s*", "", trimmed, flags=re.I).strip()
    flush()

    for i in range(1, len(rows)):
        prev_idx, prev_by, prev_name = rows[i - 1]
        idx, by, name = rows[i]
        if (
            by
            and prev_by
            and name
            and prev_name
            and _normalize_signer_label(by) == _normalize_signer_label(prev_by)
            and _normalize_signer_label(name) != _normalize_signer_label(prev_name)
        ):
            violations.append(
                f"party {idx} By duplicates party {prev_idx} signer {by!r} while Name differs"
            )
    return violations


def _plain_from_review_record(snap: Any) -> str:
    if not isinstance(snap, dict):
        return ""
    for key in ("corpusPlain", "corpus_plain"):
        raw = snap.get(key)
        if isinstance(raw, str) and raw.strip():
            return raw.strip()
    return ""


def read_certified_review_plain_for_completed_snapshot(draft: Dict[str, Any]) -> str:
    """Certified Review corpus already painted on view-signed for completed deals."""
    rec = draft.get("accepted_review_snapshot_v1")
    if isinstance(rec, dict):
        status = str(rec.get("status") or "").strip().lower()
        if not status or status == "accepted":
            plain = _plain_from_review_record(rec)
            if len(plain) >= 80:
                return plain

    registry = draft.get("canonical_review_snapshots_v1")
    if not isinstance(registry, dict):
        return ""
    accepted_id = str(
        registry.get("acceptedSnapshotId") or registry.get("accepted_snapshot_id") or ""
    ).strip()
    snaps = registry.get("snapshots")
    if accepted_id and isinstance(snaps, dict):
        snap = snaps.get(accepted_id)
        if isinstance(snap, dict):
            status = str(snap.get("status") or "").strip().lower()
            if not status or status == "accepted":
                plain = _plain_from_review_record(snap)
                if len(plain) >= 80:
                    return plain
    if isinstance(snaps, dict):
        for snap in snaps.values():
            if not isinstance(snap, dict):
                continue
            if str(snap.get("status") or "").strip().lower() != "accepted":
                continue
            plain = _plain_from_review_record(snap)
            if len(plain) >= 80:
                return plain
    return ""


def _seed_corpus_plain(seed: Any) -> str:
    if not isinstance(seed, dict):
        return ""
    return str(seed.get("corpusPlain") or seed.get("corpus_plain") or "").strip()


def _snapshot_record_from_corpus(corpus_plain: str, portable: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Persist a completed-deal snapshot from any paint-able corpus (≥80 chars).

    Unlike ``build_snapshot_record``, this does not require stamped witness
    blocks — already-executed deals may only have certified Review text.
    """
    corpus = (corpus_plain or "").strip()
    if len(corpus) < 80:
        return None
    roles = portable.get("roles") if isinstance(portable.get("roles"), list) else []
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


def _attach_fully_executed_snapshot(
    draft: Dict[str, Any],
    stored: Dict[str, Any],
    snap: Dict[str, Any],
    source: str,
    *,
    portable: Optional[Dict[str, Any]] = None,
    overwrite_seed: bool = False,
) -> EnsureFullyExecutedSnapshotResult:
    next_stored = {**stored, "fully_executed_snapshot": snap}
    if overwrite_seed and isinstance(portable, dict):
        seed = portable.get("seed") if isinstance(portable.get("seed"), dict) else {}
        next_seed = {
            **seed,
            "corpusPlain": str(snap.get("corpus_plain") or ""),
            "corpusHash": str(snap.get("corpus_hash") or ""),
        }
        next_stored["portable"] = {**portable, "seed": next_seed}
    return EnsureFullyExecutedSnapshotResult(
        {**draft, "vs01_signing_packet_v1": next_stored},
        True,
        source,
        True,
    )


def ensure_fully_executed_snapshot_on_draft(
    draft: Dict[str, Any],
    *,
    agreement_id: str = "",
) -> EnsureFullyExecutedSnapshotResult:
    aid = (agreement_id or str(draft.get("id") or "")).strip()
    audit = draft.get("audit_log") or []
    dropped_existing: Optional[Dict[str, Any]] = None
    if fully_executed_snapshot_ready(draft) and not all_signers_signed_from_audit(draft, audit):
        _log.warning(
            "[vs01-final-signed-snapshot] agreement_id=%s source=existing_before_all_signers — dropping",
            aid,
        )
        draft = {
            **draft,
            "vs01_signing_packet_v1": {
                **(draft.get("vs01_signing_packet_v1") or {}),
                "fully_executed_snapshot": None,
            },
        }
    if fully_executed_snapshot_ready(draft):
        existing = read_fully_executed_snapshot_from_draft(draft)
        corpus = snapshot_record_corpus_plain(existing)
        violations = completed_execution_by_name_violations(corpus)
        if not violations:
            _log.info(
                "[vs01-final-signed-snapshot] agreement_id=%s source=existing snapshot_ready=true",
                aid,
            )
            return EnsureFullyExecutedSnapshotResult(draft, False, "existing", True)
        _log.warning(
            "[vs01-final-signed-snapshot] agreement_id=%s source=existing_invalid violations=%s — rebuilding",
            aid,
            violations,
        )
        dropped_existing = existing
        draft = {
            **draft,
            "vs01_signing_packet_v1": {
                **(draft.get("vs01_signing_packet_v1") or {}),
                "fully_executed_snapshot": None,
            },
        }

    stored = draft.get("vs01_signing_packet_v1")
    if not isinstance(stored, dict):
        stored = {"v": 1}
    portable = stored.get("portable") if isinstance(stored.get("portable"), dict) else {}

    snap = extract_fully_executed_snapshot_from_portable(portable) if portable else None
    if snap and not all_signers_signed_from_audit(draft, draft.get("audit_log") or []):
        _log.warning(
            "[vs01-final-signed-snapshot] agreement_id=%s source=portable_snapshot_before_all_signers — ignoring",
            aid,
        )
        snap = None
    if snap:
        snap_corpus = str(snap.get("corpus_plain") or "")
        snap_violations = completed_execution_by_name_violations(snap_corpus)
        if not snap_violations:
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
        _log.warning(
            "[vs01-final-signed-snapshot] agreement_id=%s source=portable_snapshot_invalid violations=%s — rebuilding",
            aid,
            snap_violations,
        )

    seed = portable.get("seed") if isinstance(portable.get("seed"), dict) else {}
    corpus = _seed_corpus_plain(seed)
    built = build_snapshot_record(corpus, portable) if corpus else None
    if built:
        built_corpus = str(built.get("corpus_plain") or "")
        built_violations = completed_execution_by_name_violations(built_corpus)
        frozen_authority = draft.get("frozen_signing_authority_v1")
        parity_ok = True
        if isinstance(frozen_authority, dict):
            from backend.services.completed_agreement_parity import validate_completed_agreement_authorized_delta

            parity_ok, parity_code, parity_detail = validate_completed_agreement_authorized_delta(
                frozen_corpus=corpus,
                completed_corpus=built_corpus,
                snapshot=frozen_authority,
            )
            if not parity_ok:
                _log.warning(
                    "[vs01-final-signed-snapshot] agreement_id=%s authorized_delta_failed code=%s detail=%s — trying other sources",
                    aid,
                    parity_code,
                    parity_detail,
                )
        if parity_ok and not built_violations:
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
        if built_violations:
            _log.warning(
                "[vs01-final-signed-snapshot] agreement_id=%s source=portable_corpus_invalid violations=%s — rebuilding",
                aid,
                built_violations,
            )

    audit = draft.get("audit_log") or []
    signers_done = all_signers_signed_from_audit(draft, audit)
    completed_deal = signers_done or fully_executed_signed_already_recorded(audit)
    review_plain = read_certified_review_plain_for_completed_snapshot(draft)
    if signers_done:
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

        if review_plain and len(corpus) < 80:
            review_draft = {
                **draft,
                "vs01_signing_packet_v1": {
                    **stored,
                    "portable": {
                        **portable,
                        "seed": {**seed, "corpusPlain": review_plain},
                    },
                },
            }
            rebuilt = reconstruct_corpus_from_audit_and_portable(review_draft)
            if rebuilt:
                built = build_snapshot_record(rebuilt, portable)
                if built:
                    _log.info(
                        "[vs01-final-signed-snapshot] agreement_id=%s source=reconstructed snapshot_ready=true",
                        aid,
                    )
                    return _attach_fully_executed_snapshot(
                        draft,
                        stored,
                        built,
                        "reconstructed",
                        portable={**portable, "seed": {**seed, "corpusPlain": rebuilt}},
                        overwrite_seed=True,
                    )

    if completed_deal:
        if dropped_existing and snapshot_record_corpus_plain(dropped_existing):
            _log.info(
                "[vs01-final-signed-snapshot] agreement_id=%s source=existing_kept snapshot_ready=true",
                aid,
            )
            return _attach_fully_executed_snapshot(draft, stored, dropped_existing, "existing_kept")

        if review_plain:
            record = _snapshot_record_from_corpus(review_plain, portable)
            if record:
                _log.info(
                    "[vs01-final-signed-snapshot] agreement_id=%s source=accepted_review snapshot_ready=true",
                    aid,
                )
                return _attach_fully_executed_snapshot(draft, stored, record, "accepted_review")

        if corpus:
            record = _snapshot_record_from_corpus(corpus, portable)
            if record:
                _log.info(
                    "[vs01-final-signed-snapshot] agreement_id=%s source=portable_corpus snapshot_ready=true",
                    aid,
                )
                return _attach_fully_executed_snapshot(draft, stored, record, "portable_corpus")

    _log.warning(
        "[vs01-final-signed-snapshot] agreement_id=%s source=missing snapshot_ready=false",
        aid,
    )
    return EnsureFullyExecutedSnapshotResult(draft, False, "missing", False)
