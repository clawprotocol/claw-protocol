"""
Fail-closed semantic-term authority for Paid Pro corpora.

Invariant: no transformation may introduce a material contract term unless that
term is supported by an authoritative input (intake / playbook / accepted redline /
explicit user confirmation). Model output and hard-coded “enterprise polish”
floors are not authority by themselves.

Coverage note: this module uses fingerprint detectors for known inventing floors
and truncation signals. It is NOT a general semantic-equivalence prover. Primary
safety comes from disabling unauthorized mutation behavior in the client; this
module is the authoritative backend gate before SoT persist / freeze candidates
leave the API as successful generations.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence

from backend.config.deployment_runtime import claw_environment


def _env_truthy(name: str) -> bool:
    return (os.environ.get(name) or "").strip().lower() in {"1", "true", "yes", "on"}


def unauthorized_semantic_inserts_allowed() -> bool:
    """
    Break-glass for nonproduction eval only.
    Production can never enable this.
    """
    env = (claw_environment() or "").strip().lower()
    if env in {"production", "prod"}:
        return False
    return _env_truthy("CLAW_ALLOW_UNAUTHORIZED_SEMANTIC_INSERTS")


@dataclass(frozen=True)
class AuthorityFinding:
    code: str
    severity: str
    message: str


@dataclass(frozen=True)
class AuthorityGateResult:
    ok: bool
    blocked: bool
    findings: List[AuthorityFinding]
    finish_reason: str = ""

    def as_diagnostic(self) -> Dict[str, Any]:
        return {
            "ok": self.ok,
            "blocked": self.blocked,
            "finish_reason": self.finish_reason,
            "findings": [
                {"code": f.code, "severity": f.severity, "message": f.message} for f in self.findings
            ],
        }


_FINGERPRINTS: Sequence[tuple[str, re.Pattern[str], Optional[re.Pattern[str]], str]] = (
    (
        "uptime_99_5",
        re.compile(r"target\s+monthly\s+uptime\s+availability\s+of\s+99\.5%", re.I),
        re.compile(r"99\.5\s*%|uptime\s+sla|sla\s*[:\s].*99", re.I),
        "Unauthorized 99.5% uptime commitment without authority",
    ),
    (
        "negotiation_15_business_days",
        re.compile(
            r"good\s+faith\s+negotiations\s+for\s+at\s+least\s+fifteen\s*\(\s*15\s*\)\s+business\s+days",
            re.I,
        ),
        re.compile(r"fifteen\s*\(?\s*15\s*\)?\s+business\s+days|15\s+business\s+days.*negotiat", re.I),
        "Unauthorized 15-day negotiation window without authority",
    ),
    (
        "attorneys_fees_prevailing",
        re.compile(
            r"prevailing\s+Party\s+in\s+any\s+action\s+or\s+proceeding[\s\S]{0,200}attorneys['’]?\s+fees",
            re.I,
        ),
        re.compile(r"attorneys?\s*['’]?\s*fees|prevailing\s+party", re.I),
        "Unauthorized prevailing-party attorneys’ fees without authority",
    ),
    (
        "survival_topic_expansion",
        re.compile(
            r"provisions\s+concerning\s+payment\s+obligations\s+accrued\s+before\s+termination,\s*"
            r"confidentiality,\s*intellectual\s+property,\s*data\s+rights",
            re.I,
        ),
        re.compile(r"survive\s+(?:termination|expiration).*confidentiality.*intellectual\s+property", re.I),
        "Unauthorized expanded survival clause without authority",
    ),
    (
        "milestone_acceptance_invented",
        re.compile(r"Acceptance:\s*Each\s+milestone\s+is\s+deemed\s+accepted", re.I),
        re.compile(r"milestone|deemed\s+accepted|acceptance\s+criteria", re.I),
        "Unauthorized invented milestone acceptance language",
    ),
    (
        "ai_workflow_acceptance_floor",
        re.compile(r"ACCEPTANCE\s+AND\s+DEMONSTRATION\s+REVIEW", re.I),
        re.compile(r"acceptance|demonstration\s+review|AI\s+workflow", re.I),
        "Unauthorized AI-workflow acceptance section without authority",
    ),
    (
        "mutual_consulting_lol_cap",
        re.compile(
            r"fees\s+paid\s+in\s+(?:the\s+)?(?:(?:prior|previous)\s+)?(?:twelve\s*\(\s*12\s*\)|12)\s+months",
            re.I,
        ),
        re.compile(r"12\s+months|twelve\s*\(\s*12\s*\)|liability\s+cap|limitation\s+of\s+liability", re.I),
        "Unauthorized liability-cap floor without authority",
    ),
)


def detect_fingerprint_codes(corpus: str) -> List[str]:
    """Return inventing-floor fingerprint codes present in corpus."""
    body = corpus or ""
    hit: List[str] = []
    for code, body_re, _auth_re, _message in _FINGERPRINTS:
        if body_re.search(body):
            hit.append(code)
    return hit


def evaluate_semantic_term_authority(
    *,
    corpus: str,
    authority_texts: Sequence[str],
    finish_reason: str = "",
    prior_server_corpus: str = "",
    explicit_acceptance: Any = None,
) -> AuthorityGateResult:
    """
    Fail-closed when corpus contains known inventing-floor fingerprints that are
    absent from authority texts and prior server corpus.
    Also fails on finish_reason=length (truncation must not reach SoT).

    explicit_acceptance: optional server-established ExplicitAcceptanceRecord.
    A client Boolean is never accepted. When provided and binding checks pass,
    inventing-floor fingerprints covered by the record may persist; empty/truncation
    still block.
    """
    findings: List[AuthorityFinding] = []
    fr = (finish_reason or "").strip().lower()
    if fr == "length":
        findings.append(
            AuthorityFinding(
                code="finish_reason_length",
                severity="blocker",
                message="Generation truncated (finish_reason=length); cannot freeze partial corpus",
            )
        )

    body = corpus or ""
    if not body.strip():
        findings.append(
            AuthorityFinding(
                code="empty_or_degraded_corpus",
                severity="blocker",
                message="Empty or degraded corpus cannot be frozen or persisted as SoT",
            )
        )
    authority_blob = "\n".join(t or "" for t in authority_texts)
    prior = prior_server_corpus or ""

    acceptance_ok = False
    if explicit_acceptance is not None:
        try:
            from backend.agreements.explicit_acceptance_authority import (
                ExplicitAcceptanceError,
                assert_acceptance_covers_corpus,
            )

            # Binding context must already be validated by caller against the record;
            # here we only verify content + fingerprint coverage for the corpus.
            assert_acceptance_covers_corpus(
                explicit_acceptance,
                tenant_id=getattr(explicit_acceptance, "tenant_id", ""),
                actor_id=getattr(explicit_acceptance, "actor_id", ""),
                agreement_id=getattr(explicit_acceptance, "agreement_id", ""),
                agreement_version=getattr(explicit_acceptance, "agreement_version", ""),
                corpus=body,
                source_action=getattr(explicit_acceptance, "source_action", ""),
                source_proposal_id=getattr(explicit_acceptance, "source_proposal_id", "") or "",
            )
            acceptance_ok = True
        except ExplicitAcceptanceError as exc:
            findings.append(
                AuthorityFinding(code=exc.code, severity="blocker", message=exc.message)
            )
        except Exception as exc:  # noqa: BLE001
            findings.append(
                AuthorityFinding(
                    code="acceptance_validation_failed",
                    severity="blocker",
                    message=f"Acceptance validation failed: {type(exc).__name__}",
                )
            )

    if not acceptance_ok and not unauthorized_semantic_inserts_allowed():
        for code, body_re, auth_re, message in _FINGERPRINTS:
            if not body_re.search(body):
                continue
            if body_re.search(prior):
                continue
            if auth_re is not None and auth_re.search(authority_blob):
                continue
            if auth_re is None and code.lower() in authority_blob.lower():
                continue
            findings.append(AuthorityFinding(code=code, severity="blocker", message=message))

    hard_codes = {
        "finish_reason_length",
        "empty_or_degraded_corpus",
        "acceptance_record_required",
        "acceptance_tenant_mismatch",
        "acceptance_actor_mismatch",
        "acceptance_agreement_mismatch",
        "acceptance_version_mismatch",
        "acceptance_source_mismatch",
        "acceptance_proposal_mismatch",
        "acceptance_content_mismatch",
        "acceptance_partial_fingerprints",
        "acceptance_validation_failed",
        "acceptance_binding_incomplete",
        "acceptance_empty_corpus",
    }
    hard_blockers = [f for f in findings if f.severity == "blocker" and f.code in hard_codes]
    inventing_blockers = [
        f for f in findings if f.severity == "blocker" and f.code not in hard_codes
    ]
    blocked = len(hard_blockers) > 0
    if inventing_blockers and not unauthorized_semantic_inserts_allowed() and not acceptance_ok:
        blocked = True
    return AuthorityGateResult(
        ok=not blocked,
        blocked=blocked,
        findings=findings,
        finish_reason=fr,
    )


def assert_persistable_paid_pro_corpus(
    *,
    corpus: str,
    intake_text: str,
    prior_server_corpus: str = "",
    finish_reason: str = "",
    explicit_user_accepted_terms: str = "",
    explicit_acceptance: Any = None,
    # Deprecated: Boolean bypass removed. Kept only to fail closed if callers pass True.
    owner_explicit_accept: bool = False,
) -> AuthorityGateResult:
    if owner_explicit_accept and explicit_acceptance is None:
        return AuthorityGateResult(
            ok=False,
            blocked=True,
            findings=[
                AuthorityFinding(
                    code="acceptance_record_required",
                    severity="blocker",
                    message="Boolean owner_explicit_accept is insufficient; server acceptance record required",
                )
            ],
            finish_reason=(finish_reason or "").strip().lower(),
        )
    return evaluate_semantic_term_authority(
        corpus=corpus,
        authority_texts=[intake_text or "", explicit_user_accepted_terms or ""],
        finish_reason=finish_reason,
        prior_server_corpus=prior_server_corpus,
        explicit_acceptance=explicit_acceptance,
    )
