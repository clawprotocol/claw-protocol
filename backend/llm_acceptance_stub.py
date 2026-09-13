"""Test-only model-boundary stub for Core Paid Journey acceptance.

Activated only when CLAW_ENVIRONMENT is local/dev/test AND
CLAW_LLM_ACCEPTANCE_STUB=1. Production never honors this.

The stub echoes declared intake facts into a substantive consulting corpus.
It does not invent missing counterparties. It does not prove live-model quality.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional

HARBOR = "Harbor Peak Analytics LLC"
IRONVALE = "Ironvale Manufacturing Inc."
CONSULTANT_SIGNER = "Maya Chen"
CLIENT_SIGNER = "Jordan Hale"
FEE = "$48,000"
SCOPE = "AI workflow implementation"
TERM = "twelve months"
START = "October 1, 2026"
LAW = "Delaware"


def acceptance_stub_enabled() -> bool:
    env = (os.getenv("CLAW_ENVIRONMENT") or "").strip().lower()
    if env not in {"test", "local", "dev"}:
        return False
    flag = (os.getenv("CLAW_LLM_ACCEPTANCE_STUB") or "").strip().lower()
    return flag in {"1", "true", "yes", "on"}


def _joined_messages(messages: List[Dict[str, Any]]) -> str:
    parts: List[str] = []
    for row in messages or []:
        parts.append(str(row.get("content") or ""))
    return "\n".join(parts)


def _user_payload(messages: List[Dict[str, Any]]) -> Dict[str, Any]:
    for row in reversed(list(messages or [])):
        if str(row.get("role") or "") != "user":
            continue
        raw = str(row.get("content") or "").strip()
        if not raw.startswith("{"):
            continue
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed
    return {}


def _intake_text(messages: List[Dict[str, Any]], payload: Dict[str, Any]) -> str:
    for key in ("intake_text", "prompt", "user_text", "current_document_text"):
        val = payload.get(key)
        if isinstance(val, str) and val.strip():
            return val
    return _joined_messages(messages)


def _has_named_parties(text: str) -> bool:
    return HARBOR in text and IRONVALE in text


def _sparse_response() -> str:
    return json.dumps(
        {
            "title": "",
            "agreement_family": "services_agreement",
            "document_text": "",
            "key_terms_found": ["about 48k consulting"],
            "missing_material_info": [
                "legal names of the consultant and the client",
                "scope of services",
                "term and start date",
                "governing law",
            ],
            "parties": [],
            "summary_changes": [
                "Name the consultant and the client before drafting.",
            ],
            "suggestions": [
                "Name the consultant and the client before drafting.",
            ],
        }
    )


PADDED_FILLER = (
    "Operative consulting detail on discovery, implementation, acceptance, and handoff. "
)
PADDED_FILLER_REPEAT = 220


def consulting_corpus_padded() -> str:
    """Failing negative fixture — repetitive filler must not pass quality."""
    return _consulting_corpus() + "\n\n" + (PADDED_FILLER * PADDED_FILLER_REPEAT)


def _consulting_corpus() -> str:
    sections = [
        "CONSULTING SERVICES AGREEMENT",
        f"This Consulting Services Agreement (the \"Agreement\") is entered into as of {START} "
        f"by and between {HARBOR} (\"Consultant\") and {IRONVALE} (\"Client\").",
        "1. PARTIES AND ROLES. Consultant is an independent professional services firm. "
        "Client is retaining Consultant to perform the services described in this Agreement. "
        f"Consultant's authorized signer is {CONSULTANT_SIGNER}. Client's authorized signer is {CLIENT_SIGNER}.",
        f"2. SCOPE OF SERVICES. Consultant shall perform {SCOPE} for Client, including discovery, "
        "implementation planning, configuration, and knowledge transfer. Consultant shall not invent "
        "additional counterparties or change the commercial bargain without a written amendment.",
        f"3. FEES AND PAYMENT. Client shall pay a fixed fee of {FEE} for the services. "
        "Invoices are due net thirty (30) days. The fee is not a subscription and is not an estimate.",
        f"4. TERM AND DURATION. The initial term is {TERM} beginning {START}. "
        "The Agreement ends at the close of the initial term unless the parties sign an extension.",
        "5. OBLIGATIONS. Consultant shall perform the services in a professional manner and keep "
        "Client reasonably informed. Client shall provide timely access to systems, stakeholders, "
        "and information reasonably required for the work.",
        "6. INTELLECTUAL PROPERTY. Consultant retains ownership of pre-existing tools. "
        "Client owns deliverables after payment. Each party keeps its pre-existing intellectual property.",
        "7. CONFIDENTIALITY. Each party shall protect the other party's non-public information and "
        "use it only to perform this Agreement.",
        "8. LIMITATION OF LIABILITY. Except for confidentiality breaches or willful misconduct, "
        f"each party's aggregate liability is limited to the {FEE} fixed fee.",
        f"9. GOVERNING LAW. This Agreement is governed by the laws of the State of {LAW}, "
        "without regard to conflict-of-law rules.",
        "10. NOTICES. Notices shall be sent to each party's designated email address.",
        "11. TERMINATION. Either party may terminate for material breach after written notice "
        "and a ten-day opportunity to cure.",
        "12. ENTIRE AGREEMENT. This Agreement is the entire agreement. Electronic signatures are valid.",
        "IN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.",
        f"Consultant: {HARBOR}   By: {CONSULTANT_SIGNER}   Title: Principal   Date: ________",
        f"Client: {IRONVALE}   By: {CLIENT_SIGNER}   Title: Operations Lead   Date: ________",
        "13. ADDITIONAL OPERATIVE TERMS. Consultant shall complete discovery, implementation, "
        "acceptance testing, and knowledge-transfer handoff for the AI workflow. Client shall "
        "nominate a single operational owner, furnish existing process documentation, and accept "
        "or reject each milestone in writing within ten business days. The parties will hold a "
        "monthly steering review. Neither party may assign this Agreement without prior written "
        "consent except to a surviving affiliate. Force majeure suspends performance only while "
        "the event continues. Notices are effective on the next business day after email send.",
    ]
    return "\n\n".join(sections)


def _full_draft_response() -> str:
    return json.dumps(
        {
            "title": "Consulting Services Agreement",
            "agreement_family": "services_agreement",
            "document_text": _consulting_corpus(),
            "key_terms_found": [
                HARBOR,
                IRONVALE,
                FEE,
                SCOPE,
                TERM,
                START,
                LAW,
                "pre-existing tools",
                "deliverables after payment",
            ],
            "missing_material_info": [],
            "parties": [
                {"name": HARBOR, "role": "Consultant"},
                {"name": IRONVALE, "role": "Client"},
            ],
            "purpose": SCOPE,
            "payment_terms": f"Fixed fee {FEE}",
            "jurisdiction": LAW,
            "updated_document_text": _consulting_corpus(),
        }
    )


def stub_legal_llm_completion(
    messages: List[Dict[str, Any]],
    *,
    call_purpose: Optional[str] = None,
) -> str:
    payload = _user_payload(messages)
    text = _intake_text(messages, payload)
    purpose = (call_purpose or "").strip().lower()
    if not _has_named_parties(text):
        return _sparse_response()
    if purpose in {"explicit_revision", "conditional_repair"}:
        current = str(payload.get("current_document_text") or payload.get("document_text") or "")
        if HARBOR in current and IRONVALE in current:
            return json.dumps(
                {
                    "updated_document_text": current,
                    "document_text": current,
                    "summary_changes": ["Retained the owner-approved consulting paper."],
                    "missing_material_info": [],
                }
            )
    return _full_draft_response()
