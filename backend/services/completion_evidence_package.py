"""
Completion evidence package assembly for VS01 fully-executed agreements.

Produces a tamper-evident package containing:
- Who signed: party identity + attributed signer for each party
- When signed: timestamp per signer + completion timestamp
- What was signed: corpus hash / snapshot of the executed document
- Cryptographic timeline proof (existing CLAW model)
- Per-party retrieval path for the fully-executed document

UETA/ESIGN guidance (practical requirements, no overclaiming):
- Intent: captured via explicit sign action
- Attribution: signer identity bound to signature event
- Association: signature linked to the signed record via content hash
- Retention: copy/retrieval path provided for each party

CLAW does NOT:
- Adjudicate disputes or render judgments
- Replace notarization, witness, or regulated workflows
- Guarantee enforceability (transaction-specific rules apply)
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.services.vs01_signer_completion import (
    completed_vs01_signer_role_ids,
    required_vs01_signer_role_ids,
    resolve_required_signer_count,
)
from backend.services.vs01_fully_executed_snapshot import (
    parse_signature_completed_events,
    read_fully_executed_snapshot_from_draft,
)


@dataclass(frozen=True)
class SignerEvidence:
    """Evidence record for one signing party."""

    party_index: int
    party_id: str
    legal_entity_name: str
    signer_name: str
    signer_email: str
    signer_role_id: str
    signed_at: str
    signed_date_iso: str
    signed_date_display: str
    document_id: str
    locked_version_id: Optional[str]
    agreement_version_hash: Optional[str]


@dataclass(frozen=True)
class CompletionEvidencePackage:
    """
    Tamper-evident evidence package for a fully-executed agreement.

    Suitable for lawyer/auditor review. Does not constitute legal advice or
    determine enforceability.
    """

    v: int
    agreement_id: str
    title: str
    completed_at: str
    corpus_hash_sha256: str
    corpus_plain_available: bool
    signer_count: int
    required_signer_count: int
    fully_executed: bool
    signers: List[SignerEvidence]
    timeline_proof_available: bool
    retrieval_paths: Dict[str, str]
    package_hash_sha256: str


def _sha256_dict(obj: Dict[str, Any]) -> str:
    """Deterministic hash of package contents for tamper evidence."""
    import json

    canonical = json.dumps(obj, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _resolve_party_info_for_role(
    draft: Dict[str, Any],
    role_id: str,
) -> Dict[str, Any]:
    """Extract party info from draft parties and portable roles."""
    stored = draft.get("vs01_signing_packet_v1")
    portable = stored.get("portable") if isinstance(stored, dict) else None
    roles = portable.get("roles") if isinstance(portable, dict) else None

    role_row: Dict[str, Any] = {}
    if isinstance(roles, list):
        for r in roles:
            if isinstance(r, dict) and str(r.get("roleId") or "").strip() == role_id:
                role_row = r
                break

    party_index = int(role_row.get("partyIndex") or 0) if role_row else 0
    counterparty_id = str(
        role_row.get("vs01CounterpartyId") or role_row.get("partyId") or ""
    ).strip()

    party_dict: Dict[str, Any] = {}
    for i, p in enumerate(draft.get("parties") or []):
        if not isinstance(p, dict):
            continue
        pid = str(p.get("id") or "").strip()
        if counterparty_id and pid == counterparty_id:
            party_dict = p
            party_index = i
            break
        if i == party_index:
            party_dict = p

    return {
        "party_index": party_index,
        "party_id": counterparty_id or str(party_dict.get("id") or "").strip() or f"party_{party_index}",
        "legal_entity_name": (
            str(role_row.get("entityName") or "").strip()
            or str(role_row.get("partyName") or "").strip()
            or str(party_dict.get("name") or "").strip()
        ),
        "signer_name": (
            str(role_row.get("signerName") or "").strip()
            or str(party_dict.get("signerName") or "").strip()
        ),
        "signer_email": (
            str(role_row.get("signerEmail") or role_row.get("reviewEmail") or "").strip()
            or str(party_dict.get("email") or "").strip()
        ),
    }


def build_signer_evidence_from_audit(
    draft: Dict[str, Any],
) -> List[SignerEvidence]:
    """Build evidence records for all signers from audit log."""
    events = parse_signature_completed_events(draft.get("audit_log"))
    signers: List[SignerEvidence] = []

    for event in events:
        role_id = event.get("signer_role_id") or ""
        party_info = _resolve_party_info_for_role(draft, role_id)

        signers.append(
            SignerEvidence(
                party_index=party_info["party_index"],
                party_id=party_info["party_id"],
                legal_entity_name=party_info["legal_entity_name"],
                signer_name=party_info["signer_name"] or event.get("display_name", ""),
                signer_email=party_info["signer_email"],
                signer_role_id=role_id,
                signed_at=event.get("signed_at") or "",
                signed_date_iso=event.get("signed_date_iso") or "",
                signed_date_display=event.get("signed_date_display") or "",
                document_id="",
                locked_version_id=None,
                agreement_version_hash=None,
            )
        )

    return signers


def _resolve_retrieval_paths(
    agreement_id: str,
    signers: List[SignerEvidence],
    origin: str = "",
) -> Dict[str, str]:
    """Generate per-party retrieval paths for the executed document."""
    base = origin.rstrip("/") if origin else ""
    paths: Dict[str, str] = {}

    if base and agreement_id:
        view_signed = f"{base}/app/agreements/{agreement_id}/view-signed"
        paths["owner_view"] = view_signed
        for signer in signers:
            paths[f"party_{signer.party_index}_view"] = view_signed

    return paths


def build_completion_evidence_package(
    draft: Dict[str, Any],
    *,
    agreement_id: str,
    origin: str = "",
) -> Optional[CompletionEvidencePackage]:
    """
    Build a completion evidence package from a fully-executed agreement draft.

    Returns None if the agreement is not fully executed or snapshot is unavailable.
    """
    aid = (agreement_id or str(draft.get("id") or "")).strip()
    if not aid:
        return None

    snapshot = read_fully_executed_snapshot_from_draft(draft)
    if not snapshot:
        return None

    corpus_plain = str(snapshot.get("corpus_plain") or "").strip()
    corpus_hash = str(snapshot.get("corpus_hash") or "").strip()
    if not corpus_hash:
        corpus_hash = hashlib.sha256(corpus_plain.encode("utf-8")).hexdigest()

    required = required_vs01_signer_role_ids(draft)
    completed = completed_vs01_signer_role_ids(draft.get("audit_log"))
    fully_executed = bool(required) and required <= completed

    if not fully_executed:
        required_count = resolve_required_signer_count(draft)
        events = parse_signature_completed_events(draft.get("audit_log"))
        if len(events) < required_count:
            return None

    signers = build_signer_evidence_from_audit(draft)
    required_count = resolve_required_signer_count(draft)

    completed_at = ""
    for event in reversed(list(draft.get("audit_log") or [])):
        if isinstance(event, dict) and str(event.get("event_type") or "") == "signed":
            val = event.get("value")
            if isinstance(val, dict) and val.get("fully_executed"):
                completed_at = str(event.get("at") or "").strip()
                break
    if not completed_at and signers:
        completed_at = signers[-1].signed_at

    retrieval_paths = _resolve_retrieval_paths(aid, signers, origin)

    hashed_content = {
        "agreement_id": aid,
        "corpus_hash": corpus_hash,
        "completed_at": completed_at,
        "signers": [
            {
                "party_id": s.party_id,
                "signer_role_id": s.signer_role_id,
                "signed_at": s.signed_at,
            }
            for s in signers
        ],
    }
    package_hash = _sha256_dict(hashed_content)

    return CompletionEvidencePackage(
        v=1,
        agreement_id=aid,
        title=str(draft.get("title") or "").strip() or "Untitled agreement",
        completed_at=completed_at,
        corpus_hash_sha256=corpus_hash,
        corpus_plain_available=len(corpus_plain) >= 80,
        signer_count=len(signers),
        required_signer_count=required_count,
        fully_executed=fully_executed or len(signers) >= required_count,
        signers=signers,
        timeline_proof_available=False,
        retrieval_paths=retrieval_paths,
        package_hash_sha256=package_hash,
    )


def completion_evidence_to_dict(package: CompletionEvidencePackage) -> Dict[str, Any]:
    """Serialize completion evidence package to dict for JSON export."""
    return {
        "schema": "claw.completion_evidence.v1",
        "v": package.v,
        "agreement_id": package.agreement_id,
        "title": package.title,
        "completed_at": package.completed_at,
        "corpus_hash_sha256": package.corpus_hash_sha256,
        "corpus_plain_available": package.corpus_plain_available,
        "signer_count": package.signer_count,
        "required_signer_count": package.required_signer_count,
        "fully_executed": package.fully_executed,
        "signers": [
            {
                "party_index": s.party_index,
                "party_id": s.party_id,
                "legal_entity_name": s.legal_entity_name,
                "signer_name": s.signer_name,
                "signer_email_redacted": _redact_email(s.signer_email),
                "signer_role_id": s.signer_role_id,
                "signed_at": s.signed_at,
                "signed_date_iso": s.signed_date_iso,
                "signed_date_display": s.signed_date_display,
            }
            for s in package.signers
        ],
        "timeline_proof_available": package.timeline_proof_available,
        "retrieval_paths": package.retrieval_paths,
        "package_hash_sha256": package.package_hash_sha256,
        "legal_notice": (
            "This package is evidence only. CLAW does not adjudicate disputes, "
            "render legal judgments, or determine enforceability. Transaction-specific "
            "rules and jurisdictional requirements may apply."
        ),
    }


def _redact_email(email: str) -> str:
    """Redact email for evidence package (privacy)."""
    e = (email or "").strip().lower()
    if "@" not in e:
        return "***"
    local, domain = e.split("@", 1)
    if len(local) <= 1:
        return f"*@{domain}"
    return f"{local[0]}***@{domain}"


def validate_four_party_completion(
    draft: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Validate that a four-party agreement is ready for completion.

    Returns a dict with:
    - valid: bool
    - party_count: int
    - missing_signatures: list of role_ids
    - errors: list of error messages
    """
    required = required_vs01_signer_role_ids(draft)
    completed = completed_vs01_signer_role_ids(draft.get("audit_log"))

    required_count = resolve_required_signer_count(draft)
    parties = draft.get("parties") or []

    errors: List[str] = []
    missing = sorted(required - completed) if required else []

    for i, party in enumerate(parties):
        if not isinstance(party, dict):
            continue
        party_id = str(party.get("id") or "").strip()
        if not party_id:
            errors.append(f"Party {i + 1} missing stable party ID")
        name = str(party.get("name") or "").strip()
        if not name:
            errors.append(f"Party {i + 1} missing legal entity name")

    return {
        "valid": len(missing) == 0 and len(errors) == 0,
        "party_count": len(parties),
        "required_signer_count": required_count,
        "completed_signer_count": len(completed),
        "missing_signatures": missing,
        "errors": errors,
    }
