"""
Server-established explicit acceptance records for inventing-floor bypass.

A Boolean ``owner_explicit_accept=True`` is not sufficient. Acceptance must be
established by an authenticated backend action and bind tenant, actor,
agreement/version, content hash, fingerprints, timestamp, and source action.
"""

from __future__ import annotations

import hashlib
import hmac
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence

from backend.agreements.semantic_term_authority import detect_fingerprint_codes


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def sha256_hex(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class ExplicitAcceptanceRecord:
    tenant_id: str
    actor_id: str
    agreement_id: str
    agreement_version: str
    content_sha256: str
    accepted_fingerprint_codes: tuple[str, ...]
    accepted_at: str
    source_action: str
    source_proposal_id: str = ""
    record_id: str = ""

    def as_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["accepted_fingerprint_codes"] = list(self.accepted_fingerprint_codes)
        return d


class ExplicitAcceptanceError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def establish_explicit_acceptance(
    *,
    tenant_id: str,
    actor_id: str,
    agreement_id: str,
    agreement_version: str,
    accepted_text: str,
    source_action: str,
    source_proposal_id: str = "",
) -> ExplicitAcceptanceRecord:
    """Build a server-side acceptance record from an authenticated action."""
    tid = (tenant_id or "").strip()
    aid = (actor_id or "").strip()
    ag = (agreement_id or "").strip()
    ver = str(agreement_version or "").strip()
    src = (source_action or "").strip()
    body = accepted_text or ""
    if not tid or not aid or not ag or not ver or not src:
        raise ExplicitAcceptanceError(
            "acceptance_binding_incomplete",
            "Acceptance requires tenant, actor, agreement, version, and source_action",
        )
    if not body.strip():
        raise ExplicitAcceptanceError("acceptance_empty_corpus", "Accepted text is empty")
    fps = tuple(sorted(detect_fingerprint_codes(body)))
    content = sha256_hex(body)
    stamp = _utc_now_iso()
    material = "|".join([tid, aid, ag, ver, content, ",".join(fps), stamp, src, source_proposal_id or ""])
    record_id = sha256_hex(material)[:32]
    return ExplicitAcceptanceRecord(
        tenant_id=tid,
        actor_id=aid,
        agreement_id=ag,
        agreement_version=ver,
        content_sha256=content,
        accepted_fingerprint_codes=fps,
        accepted_at=stamp,
        source_action=src,
        source_proposal_id=(source_proposal_id or "").strip(),
        record_id=record_id,
    )


def assert_acceptance_covers_corpus(
    record: Optional[ExplicitAcceptanceRecord],
    *,
    tenant_id: str,
    actor_id: str,
    agreement_id: str,
    agreement_version: str,
    corpus: str,
    source_action: str = "",
    source_proposal_id: str = "",
) -> None:
    """Fail closed if record missing or bindings do not match the persist attempt."""
    if record is None:
        raise ExplicitAcceptanceError("acceptance_record_required", "Explicit acceptance record required")
    checks = [
        (record.tenant_id, (tenant_id or "").strip(), "acceptance_tenant_mismatch"),
        (record.actor_id, (actor_id or "").strip(), "acceptance_actor_mismatch"),
        (record.agreement_id, (agreement_id or "").strip(), "acceptance_agreement_mismatch"),
        (record.agreement_version, str(agreement_version or "").strip(), "acceptance_version_mismatch"),
    ]
    for left, right, code in checks:
        if not left or not right or left != right:
            raise ExplicitAcceptanceError(code, f"Acceptance binding failed: {code}")
    if source_action and record.source_action != source_action.strip():
        raise ExplicitAcceptanceError("acceptance_source_mismatch", "source_action mismatch")
    if source_proposal_id and record.source_proposal_id != source_proposal_id.strip():
        raise ExplicitAcceptanceError("acceptance_proposal_mismatch", "source_proposal_id mismatch")
    digest = sha256_hex(corpus or "")
    if not hmac.compare_digest(record.content_sha256, digest):
        raise ExplicitAcceptanceError(
            "acceptance_content_mismatch",
            "Corpus hash does not match accepted text",
        )
    present = set(detect_fingerprint_codes(corpus or ""))
    accepted = set(record.accepted_fingerprint_codes)
    # Partial acceptance: every fingerprint in corpus must have been accepted.
    missing = present - accepted
    if missing:
        raise ExplicitAcceptanceError(
            "acceptance_partial_fingerprints",
            f"Corpus fingerprints not covered by acceptance: {sorted(missing)}",
        )
