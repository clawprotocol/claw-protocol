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
ORION = "Orion Harbor LLC"
NORTHWIND = "Northwind Retail Inc."
LUMEN = "Lumen Bioinformatics Inc."
THALASSA = "Thalassa Data Systems LLC"
COASTAL = "Coastal Meridian Analytics LLC"
VANGUARD = "Vanguard Regulatory Sciences Ltd."
STONEBRIDGE = "Stonebridge Wellness LLC"
NOVAPATH = "NovaPath Learning Inc."
CLEARSPRING = "ClearSpring Distribution LLC"
CONSULTANT_SIGNER = "Maya Chen"
CLIENT_SIGNER = "Jordan Hale"
PROVIDER_SIGNER = "Avery Cole"
CUSTOMER_SIGNER = "Casey Reed"
LUMEN_SIGNER = "Dr. Elena Vasquez"
THALASSA_SIGNER = "Marcus Webb"
COASTAL_SIGNER = "Priya Nair"
VANGUARD_SIGNER = "James O'Sullivan"
STONEBRIDGE_SIGNER = "Sandra Wells"
NOVAPATH_SIGNER = "Caleb Price"
CLEARSPRING_SIGNER = "Maya Coleman"
FEE = "$48,000"
SCOPE = "AI workflow implementation"
TERM = "twelve months"
START = "October 1, 2026"
LAW = "Delaware"
SAAS_LAW = "New York"
FOUR_PARTY_LAW = "Massachusetts"
THREE_PARTY_LAW = "Oklahoma"


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


def _is_hosted_saas(text: str) -> bool:
    return ORION in text and NORTHWIND in text


def _is_four_party_precision(text: str) -> bool:
    return LUMEN in text and THALASSA in text and COASTAL in text and VANGUARD in text


def _is_three_party_ip_license(text: str) -> bool:
    return STONEBRIDGE in text and NOVAPATH in text and CLEARSPRING in text


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
        f"This Consulting Services Agreement (the \"Agreement\") is entered into "
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
        "IN WITNESS WHEREOF, the parties have executed this Agreement.",
        f"Consultant: {HARBOR}   By: {CONSULTANT_SIGNER}   Title: Principal   Date: ________",
        f"Client: {IRONVALE}   By: {CLIENT_SIGNER}   Title: Operations Lead   Date: ________",
        "13. ADDITIONAL OPERATIVE TERMS. Consultant shall complete discovery, implementation "
        "planning, configuration, and knowledge-transfer handoff for the AI workflow. Client shall "
        "nominate a single operational owner and furnish existing process documentation reasonably "
        "required for the work. Neither party may assign this Agreement without prior written "
        "consent except to a surviving affiliate. Force majeure suspends performance only while "
        "the event continues. Notices are effective on the next business day after email send.",
    ]
    return "\n\n".join(sections)


def _saas_corpus() -> str:
    sections = [
        "SOFTWARE AS A SERVICE SUBSCRIPTION AGREEMENT",
        f"This SaaS Subscription Agreement (the \"Agreement\") is entered into "
        f"by and between {ORION} (\"Provider\") and {NORTHWIND} (\"Customer\").",
        "1. PARTIES AND ROLES. Provider operates a hosted software platform. "
        "Customer is subscribing to hosted access only. "
        f"Provider's authorized signer is {PROVIDER_SIGNER}. Customer's authorized signer is {CUSTOMER_SIGNER}.",
        "2. SERVICES. Provider shall provide hosted platform access and standard onboarding. "
        "Scope is the hosted platform only. Provider shall not perform professional services, "
        "consulting deliverables, implementation projects, or a project-acceptance process.",
        f"3. FEES AND PAYMENT. Customer shall pay {FEE} annually for the hosted subscription. "
        "Invoices are due net thirty (30) days. The fee is a subscription for hosted access "
        "and is not a professional-services estimate.",
        "4. TERM AND DURATION. The initial subscription term is twelve months. "
        "The Agreement renews only if the parties agree in writing.",
        "5. OBLIGATIONS. Provider shall make the hosted platform available and furnish "
        "standard onboarding materials. Customer shall use the platform for its internal business "
        "and keep account credentials confidential.",
        "6. INTELLECTUAL PROPERTY. Provider retains ownership of the hosted platform. "
        "Customer retains ownership of Customer data. This Agreement does not transfer "
        "consulting work product or project deliverables.",
        "7. CONFIDENTIALITY. Each party shall protect the other party's non-public information and "
        "use it only to perform this Agreement.",
        "8. LIMITATION OF LIABILITY. Except for confidentiality breaches or willful misconduct, "
        f"each party's aggregate liability is limited to the {FEE} annual subscription fee.",
        f"9. GOVERNING LAW. This Agreement is governed by the laws of the State of {SAAS_LAW}, "
        "without regard to conflict-of-law rules.",
        "10. NOTICES. Notices shall be sent to each party's designated email address.",
        "11. TERMINATION. Either party may terminate for material breach after written notice "
        "and a ten-day opportunity to cure.",
        "12. ENTIRE AGREEMENT. This Agreement is the entire agreement. Electronic signatures are valid.",
        "IN WITNESS WHEREOF, the parties have executed this Agreement.",
        f"Provider: {ORION}   By: {PROVIDER_SIGNER}   Title: Product Lead   Date: ________",
        f"Customer: {NORTHWIND}   By: {CUSTOMER_SIGNER}   Title: Operations Lead   Date: ________",
        "13. ADDITIONAL OPERATIVE TERMS. Provider shall furnish hosted credentials and standard "
        "onboarding documentation. Customer shall nominate one account administrator. "
        "Neither party may assign this Agreement without prior written consent except to a "
        "surviving affiliate. Force majeure suspends performance only while the event continues. "
        "Notices are effective on the next business day after email send. This Agreement does "
        "not create milestones, deemed acceptance, service-level credits, or consulting completion criteria.",
    ]
    return "\n\n".join(sections)


def _saas_draft_response() -> str:
    return json.dumps(
        {
            "title": "SaaS Subscription Agreement",
            "agreement_family": "saas_subscription",
            "document_text": _saas_corpus(),
            "key_terms_found": [
                ORION,
                NORTHWIND,
                FEE,
                "hosted platform access",
                "standard onboarding",
                "net 30",
                SAAS_LAW,
            ],
            "missing_material_info": [],
            "parties": [
                {"name": ORION, "role": "Provider"},
                {"name": NORTHWIND, "role": "Customer"},
            ],
            "purpose": "hosted platform access and standard onboarding",
            "payment_terms": f"Annual subscription {FEE}, net 30",
            "jurisdiction": SAAS_LAW,
            "updated_document_text": _saas_corpus(),
        }
    )


def _retain_current_if_parties(current: str, names: tuple[str, ...], family: str) -> Optional[str]:
    if current and all(name in current for name in names):
        return json.dumps(
            {
                "updated_document_text": current,
                "document_text": current,
                "summary_changes": [f"Retained the owner-approved {family} paper."],
                "missing_material_info": [],
            }
        )
    return None


def _unique_operative_expansion(parties: List[str], start_section: int, min_chars: int) -> str:
    """Distinct operative paragraphs so the complex-intake 10k floor is met without filler spam."""
    duties = [
        "keep a written record of its assigned deliverables and notify the other parties of material delays",
        "use commercially reasonable care with shared data and return or destroy copies on written request after the term",
        "nominate one operational contact and keep that contact current during the initial term",
        "cooperate on audit-readiness materials that relate only to its own assigned work",
        "maintain insurance appropriate to its role and furnish certificates on reasonable request",
        "treat non-public information as confidential for five years using at least reasonable care",
        "not assign this Agreement without prior written consent except to a surviving affiliate",
        "perform only the work assigned to it in this Agreement and not invent extra counterparties",
    ]
    blocks: List[str] = []
    n = 0
    while len("\n\n".join(blocks)) < min_chars:
        party = parties[n % len(parties)]
        duty = duties[n % len(duties)]
        blocks.append(
            f"{start_section + n}. {party} shall {duty}. This operational paragraph {n + 1} "
            f"is specific to that party's role and does not reassign another party's milestones, "
            f"revenue share, or governing law."
        )
        n += 1
    return "\n\n".join(blocks)


def _four_party_parse_response() -> str:
    return json.dumps(
        {
            "title": "Precision Medicine Data Platform Agreement",
            "jurisdiction": FOUR_PARTY_LAW,
            "parties": [
                {"name": LUMEN, "role": "Platform Developer"},
                {"name": THALASSA, "role": "Data Infrastructure Provider"},
                {"name": COASTAL, "role": "Analytics Integrator"},
                {"name": VANGUARD, "role": "Regulatory Compliance Advisor"},
            ],
            "purpose": "regulated precision medicine analytics platform",
            "payment_terms": "party-specific milestones",
            "duration": "24 months",
            "due_date": None,
            "effective_date": None,
        }
    )


def _three_party_parse_response() -> str:
    return json.dumps(
        {
            "title": "Intellectual Property License and Royalty Agreement",
            "jurisdiction": THREE_PARTY_LAW,
            "parties": [
                {"name": STONEBRIDGE, "role": "Content owner / licensor"},
                {"name": NOVAPATH, "role": "Platform adapter / host"},
                {"name": CLEARSPRING, "role": "Distributor"},
            ],
            "purpose": "adapt, host, and distribute wellness training materials",
            "payment_terms": "45% / 35% / 20% subscription revenue split",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        }
    )


def _four_party_corpus(*, expand: bool = True) -> str:
    parties = [LUMEN, THALASSA, COASTAL, VANGUARD]
    sections = [
        "PRECISION MEDICINE DATA PLATFORM AGREEMENT",
        f"The parties are {LUMEN} (Platform Developer), {THALASSA} (Data Infrastructure Provider), "
        f"{COASTAL} (Analytics Integrator), and {VANGUARD} (Regulatory Compliance Advisor).",
        "1. PARTIES AND ROLES. Each company is an independent contractor. "
        f"{LUMEN}'s authorized signer is {LUMEN_SIGNER}, Chief Science Officer. "
        f"{THALASSA}'s authorized signer is {THALASSA_SIGNER}, President. "
        f"{COASTAL}'s authorized signer is {COASTAL_SIGNER}, Vice President of Operations. "
        f"{VANGUARD}'s authorized signer is {VANGUARD_SIGNER}, Managing Director. "
        "Nothing in this Agreement creates a partnership, joint venture, or employment relationship.",
        f"2. SCOPE OF SERVICES. The parties will jointly develop, validate, and operate a regulated "
        f"precision medicine analytics platform. {LUMEN} is the Platform Developer. {THALASSA} provides "
        f"data infrastructure, including data pipeline readiness and production cutover. {COASTAL} delivers "
        f"analytics modules and completes user acceptance testing. {VANGUARD} performs regulatory gap "
        f"assessment and audit readiness certification.",
        "3. FEES AND PAYMENT. "
        f"{LUMEN} receives $250,000 upon execution, $400,000 upon platform alpha delivery, and "
        f"$350,000 upon validation report acceptance. {THALASSA} receives $180,000 upon data pipeline "
        f"readiness and $220,000 upon production cutover. {COASTAL} receives $150,000 upon analytics "
        f"module delivery and $175,000 upon user acceptance testing completion. {VANGUARD} receives "
        f"$95,000 upon regulatory gap assessment and $105,000 upon audit readiness certification. "
        "The initial term is 24 months with two optional 12-month renewals. "
        "This first draft does not name a milestone payer.",
        "4. INTELLECTUAL PROPERTY. Foreground IP developed solely by a party remains that party's "
        "property. Jointly developed foreground IP is owned equally unless otherwise agreed in writing.",
        "5. CONFIDENTIALITY. Each party will protect the other parties' confidential information for "
        "five years using at least reasonable care.",
        "6. LIMITATION OF LIABILITY. Except for confidentiality breaches, indemnification obligations, "
        "or willful misconduct, no party's aggregate liability exceeds fees paid in the twelve months "
        "preceding the claim. Each party will maintain commercial general liability insurance of at "
        "least $2,000,000 per occurrence and professional liability coverage appropriate to its role.",
        "7. INDEMNIFICATION. Each party shall indemnify the others against third-party claims arising "
        "from its breach or willful misconduct.",
        f"8. GOVERNING LAW. This Agreement is governed by the laws of the State of {FOUR_PARTY_LAW}, "
        "without regard to conflict-of-law rules.",
        "9. NOTICES. Formal notices must be delivered to each party's distinct notice address. "
        f"{LUMEN} notice address is 402 Kendall Square, Suite 500, Cambridge, MA 02142. "
        f"{THALASSA} notice address is 8801 Research Drive, Attn Legal Dept, Charlotte, NC 28262. "
        f"{COASTAL} notice address is PO Box 4410, San Diego, CA 92121-4410. "
        f"{VANGUARD} notice address is 225 Market Street, 12th Floor, Harrisburg, PA 17101.",
        "10. TERMINATION. A party may terminate for material breach after written notice and a "
        "fifteen-business-day opportunity to cure.",
        "11. DISPUTE RESOLUTION. The parties shall first attempt good-faith negotiation in the "
        f"selected {FOUR_PARTY_LAW} forum before seeking court relief.",
        "12. ENTIRE AGREEMENT. This Agreement is the entire agreement. Electronic signatures and "
        "counterparts are valid.",
        "IN WITNESS WHEREOF, the parties have executed this Agreement.",
        f"{LUMEN}   By: {LUMEN_SIGNER}   Title: Chief Science Officer   Date: ________",
        f"{THALASSA}   By: {THALASSA_SIGNER}   Title: President   Date: ________",
        f"{COASTAL}   By: {COASTAL_SIGNER}   Title: Vice President of Operations   Date: ________",
        f"{VANGUARD}   By: {VANGUARD_SIGNER}   Title: Managing Director   Date: ________",
    ]
    if expand:
        sections.append(_unique_operative_expansion(parties, start_section=13, min_chars=7200))
    return "\n\n".join(sections)


def _three_party_corpus(*, expand: bool = True) -> str:
    parties = [STONEBRIDGE, NOVAPATH, CLEARSPRING]
    sections = [
        "INTELLECTUAL PROPERTY LICENSE AND ROYALTY AGREEMENT",
        f'This Agreement is entered into by and among {STONEBRIDGE} ("Licensor"), '
        f'{NOVAPATH} ("Platform Provider"), and {CLEARSPRING} ("Distributor").',
        "1. PARTIES AND ROLES. The coordinator is not a party, signer, notice recipient, or beneficiary. "
        f"{STONEBRIDGE}'s authorized signer is {STONEBRIDGE_SIGNER}, Managing Member. "
        f"{NOVAPATH}'s authorized signer is {NOVAPATH_SIGNER}, Chief Product Officer. "
        f"{CLEARSPRING}'s authorized signer is {CLEARSPRING_SIGNER}, President.",
        f"2. SCOPE OF SERVICES. {STONEBRIDGE} owns the original wellness training videos and written "
        f"course materials and keeps ownership of the original content. {NOVAPATH} will adapt and host "
        f"the materials on its online training platform and owns the platform code and improvements it "
        f"creates. {CLEARSPRING} will market and sell subscriptions and handle customer contracts, "
        f"billing, and account management.",
        f"3. FEES AND PAYMENT. Subscription revenue is split 45% to {STONEBRIDGE}, 35% to {NOVAPATH}, "
        f"and 20% to {CLEARSPRING}.",
        "4. INTELLECTUAL PROPERTY. Stonebridge keeps original-content ownership. NovaPath owns platform "
        "code and its improvements. This Agreement does not transfer coordinator rights.",
        "5. CONFIDENTIALITY. Each party will protect the other parties' non-public information and use "
        "it only to perform this Agreement.",
        "6. LIMITATION OF LIABILITY AND INDEMNIFICATION. Except for confidentiality breaches or willful "
        "misconduct, each party's aggregate liability is limited to royalties received in the twelve "
        "months preceding the claim. Each party shall indemnify the others against third-party claims "
        "arising from its breach.",
        f"7. GOVERNING LAW. This Agreement is governed by the laws of the State of {THREE_PARTY_LAW}, "
        "without regard to conflict-of-law rules.",
        "8. NOTICES. Notices shall be sent to each party's designated address. Electronic signatures "
        "and counterparts are valid.",
        "9. TERMINATION. A party may terminate for material breach after written notice and a ten-day "
        "opportunity to cure.",
        "10. DISPUTE RESOLUTION. The parties shall first attempt good-faith negotiation before seeking "
        f"court relief in {THREE_PARTY_LAW}.",
        "11. ENTIRE AGREEMENT. This Agreement is the entire agreement.",
        "IN WITNESS WHEREOF, the parties have executed this Agreement.",
        f"{STONEBRIDGE}   By: {STONEBRIDGE_SIGNER}   Title: Managing Member   Date: ________",
        f"{NOVAPATH}   By: {NOVAPATH_SIGNER}   Title: Chief Product Officer   Date: ________",
        f"{CLEARSPRING}   By: {CLEARSPRING_SIGNER}   Title: President   Date: ________",
    ]
    if expand:
        sections.append(_unique_operative_expansion(parties, start_section=12, min_chars=7200))
    return "\n\n".join(sections)


def _four_party_draft_response() -> str:
    doc = _four_party_corpus()
    return json.dumps(
        {
            "title": "Precision Medicine Data Platform Agreement",
            "agreement_family": "services_agreement",
            "document_text": doc,
            "key_terms_found": [
                LUMEN,
                THALASSA,
                COASTAL,
                VANGUARD,
                FOUR_PARTY_LAW,
                "$250,000",
                "24 months",
            ],
            "missing_material_info": [],
            "parties": [
                {"name": LUMEN, "role": "Platform Developer"},
                {"name": THALASSA, "role": "Data Infrastructure Provider"},
                {"name": COASTAL, "role": "Analytics Integrator"},
                {"name": VANGUARD, "role": "Regulatory Compliance Advisor"},
            ],
            "purpose": "regulated precision medicine analytics platform",
            "payment_terms": "party-specific milestones",
            "jurisdiction": FOUR_PARTY_LAW,
            "updated_document_text": doc,
        }
    )


def _three_party_draft_response() -> str:
    doc = _three_party_corpus()
    return json.dumps(
        {
            "title": "Intellectual Property License and Royalty Agreement",
            "agreement_family": "ip_license_royalty",
            "document_text": doc,
            "key_terms_found": [
                STONEBRIDGE,
                NOVAPATH,
                CLEARSPRING,
                "45%",
                "35%",
                "20%",
                THREE_PARTY_LAW,
            ],
            "missing_material_info": [],
            "parties": [
                {"name": STONEBRIDGE, "role": "Content owner / licensor"},
                {"name": NOVAPATH, "role": "Platform adapter / host"},
                {"name": CLEARSPRING, "role": "Distributor"},
            ],
            "purpose": "adapt, host, and distribute wellness training materials",
            "payment_terms": "45% / 35% / 20% subscription revenue split",
            "jurisdiction": THREE_PARTY_LAW,
            "updated_document_text": doc,
        }
    )


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
    if _is_four_party_precision(text):
        if purpose in {"explicit_revision", "conditional_repair"}:
            current = str(payload.get("current_document_text") or payload.get("document_text") or "")
            retained = _retain_current_if_parties(current, (LUMEN, THALASSA, COASTAL, VANGUARD), "four-party")
            if retained:
                return retained
        if purpose in {"structured_extraction", "missing_facts"}:
            return _four_party_parse_response()
        if purpose == "free_one_pager":
            return _four_party_corpus(expand=False)
        return _four_party_draft_response()
    if _is_three_party_ip_license(text):
        if purpose in {"explicit_revision", "conditional_repair"}:
            current = str(payload.get("current_document_text") or payload.get("document_text") or "")
            retained = _retain_current_if_parties(current, (STONEBRIDGE, NOVAPATH, CLEARSPRING), "three-party")
            if retained:
                return retained
        if purpose in {"structured_extraction", "missing_facts"}:
            return _three_party_parse_response()
        if purpose == "free_one_pager":
            return _three_party_corpus(expand=False)
        return _three_party_draft_response()
    if _is_hosted_saas(text):
        if purpose in {"explicit_revision", "conditional_repair"}:
            current = str(payload.get("current_document_text") or payload.get("document_text") or "")
            if ORION in current and NORTHWIND in current:
                return json.dumps(
                    {
                        "updated_document_text": current,
                        "document_text": current,
                        "summary_changes": ["Retained the owner-approved hosted SaaS paper."],
                        "missing_material_info": [],
                    }
                )
        return _saas_draft_response()
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
