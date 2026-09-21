"""Reusable commercially substantive mocked model papers for premium-full-draft tests.

These fixtures replace headings-plus-padding mocks. They do not change production
validation. Length comes from operative commercial detail, not filler runs.
"""

from __future__ import annotations

from typing import Any, Dict


def agency_llc_client_llc_paid_media_agreement() -> str:
    """Two-party New York agency retainer covering the paid-media success intake."""
    return """
AGENCY SERVICES AGREEMENT

This Agreement is between Agency LLC ("Agency") and Client LLC ("Client").
Agency and Client are the only legal parties. Agency acts as Agency. Client acts as Client.
This Agreement takes effect when both parties have signed it. No calendar Effective Date is stated.

1. Scope of services
Agency shall plan, place, and manage paid media campaigns for Client and must obtain written
spend pre-approval from Client before committing media spend. Agency shall deliver performance
reporting on campaign delivery, spend, and results. Agency shall not invent additional parties
or expand the commercial purpose beyond running campaigns.

2. CRM ownership and Own CRM exports
Client shall Own CRM exports. Client owns the CRM records, lists, and export files created or
collected in the engagement. Agency must deliver Own CRM exports to Client on request and at
the end of the term, and shall not withhold those exports to secure payment.

3. Compensation and payment
Client shall pay Agency a monthly retainer on the stated Monthly payment terms. Agency shall
invoice the retainer and any pre-approved media spend separately. Client must pay each proper
invoice according to those Monthly terms. Agency shall not place unpaid media without a current
pre-approval.

4. Term and termination
The initial term continues until a party ends it. Either party may terminate for convenience by
written notice. Either party may terminate for material breach if the other party fails to cure
after written notice. Agency must deliver work product and Own CRM exports through the
termination date. Accrued payment obligations survive.

5. Confidentiality
Each party shall protect the other party's non-public business information, campaign data, and
Own CRM exports, and must use that information only to perform this Agreement. These duties
survive termination.

6. Intellectual property
Client owns campaign creative that Client paid for, campaign data, and Own CRM exports.
Agency retains its pre-existing tools, templates, and know-how. Agency shall not claim
ownership of Client's CRM data.

7. Indemnification
Each party shall indemnify, defend, and hold harmless the other party from third-party claims
arising from the indemnifying party's material breach, infringement of that party's materials,
or grossly negligent campaign practices.

8. Limitation of liability
Except for confidentiality breaches, indemnification obligations, or willful misconduct, each
party's aggregate liability under this Agreement is limited to fees paid or payable for the
monthly retainer in the then-current monthly period. This limitation does not excuse Agency
from delivering Own CRM exports.

9. Notices
Notices must be sent in writing by email and by mail to the business address each party
designates in writing. A notice is effective when received.

10. Dispute resolution and governing law
The parties shall first negotiate in good faith. If they do not resolve the dispute, either
party may bring an action in the courts of the State of New York. The laws of the State of
New York govern this Agreement, without regard to conflict-of-law rules.

11. Counterparts and electronic signatures
This Agreement may be signed in counterparts. Electronic signatures are valid and bind the
signing party. Together the counterparts are one instrument.

12. Entire agreement
This Agreement is the entire agreement on the subject matter and supersedes prior discussions
on the same subject.

IN WITNESS WHEREOF the parties sign this Agreement.

Agency LLC (Agency)
By: ________________________  Name: ________________  Title: ________________  Date: ________________

Client LLC (Client)
By: ________________________  Name: ________________  Title: ________________  Date: ________________
""".strip()


def redwood_atlas_saas_reseller_agreement() -> str:
    """Two-party Delaware SaaS reseller paper for the airlock success path.

    Context names two parties. The intake names additional companies; this paper does
    not add those companies as legal parties.
    """
    return """
RESELLER AND WHITE-LABEL SERVICES AGREEMENT

This Agreement is between Redwood Peak Ventures LLC ("Redwood Peak Ventures LLC") and
Atlas Harbor Technologies Inc. ("Atlas Harbor Technologies Inc.").
Redwood Peak Ventures LLC and Atlas Harbor Technologies Inc. are the only legal parties.
No other company named in any intake note is a party, signer, guarantor, or affiliate
bound by this Agreement. This Agreement takes effect when both parties have signed it.
No calendar Effective Date is stated.

1. Purpose and scope
Atlas Harbor Technologies Inc. shall provide reseller and white-label services so that
Redwood Peak Ventures LLC may offer workflow automation software to its customers under
Redwood Peak Ventures LLC's brand. The scope includes white-label deployment of workflow
automation software, API integrations, onboarding support, analytics dashboards, and
ongoing maintenance. Atlas Harbor Technologies Inc. must configure the branded instance,
implement the API integrations Redwood Peak Ventures LLC identifies in writing, train
Redwood Peak Ventures LLC operators, deliver analytics dashboards, and maintain the
instance. Atlas Harbor Technologies Inc. shall document the deployed configuration and
must not expand the deal to additional legal parties. Redwood Peak Ventures LLC shall
supply brand assets, credentials, trainee names, and timely decisions. Atlas Harbor
Technologies Inc. shall treat a deployment phase as complete only when the corresponding
work is actually usable: the branded instance runs, the integrations accept production-shaped
data, onboarding materials have been delivered, dashboards show usage and exceptions, and
maintenance channels are open. Redwood Peak Ventures LLC must not unreasonably withhold
confirmation that a completed phase occurred.

2. Fees and milestone payments
Redwood Peak Ventures LLC shall pay a total fee of $124,750. That total must be paid
across five milestone payments tied to deployment phases. Atlas Harbor Technologies Inc.
shall invoice each milestone when the corresponding deployment phase is completed.
Redwood Peak Ventures LLC must pay each proper milestone invoice. The five phases are
white-label environment readiness, API integration completion, onboarding completion,
analytics dashboard acceptance, and start of ongoing maintenance. The parties shall not
add extra fees unless they agree in a signed writing.

3. Term, renewal, and termination
The term is eighteen months starting when both parties have signed. The term then renews
automatically on a month-to-month basis unless a party terminates with 30 days notice.
Either party may terminate for convenience with 30 days notice. Either party may terminate
for cause if the other party fails to cure a material breach after written notice.
Atlas Harbor Technologies Inc. must provide a reasonable offboarding export of configuration
and analytics data if the Agreement ends. Accrued fees remain payable.

4. Confidentiality and data security
Each party shall keep confidential the other party's non-public business information,
software, customer lists, credentials, and dashboard data, and must use that information
only to perform this Agreement. These confidentiality duties survive termination.
Atlas Harbor Technologies Inc. shall implement reasonable administrative, technical, and
physical safeguards for the white-label instance, API credentials, and dashboard data,
limit access to personnel who need it, and notify Redwood Peak Ventures LLC after
confirming a security incident affecting that instance. Redwood Peak Ventures LLC shall
protect credentials issued to its users and must revoke access that is no longer needed.

5. Intellectual property ownership
Atlas Harbor Technologies Inc. owns the pre-existing software, APIs, and tools it supplies.
Redwood Peak Ventures LLC owns its trademarks, customer data, workflow content, and
dashboard outputs. Upon payment of the applicable milestone, Redwood Peak Ventures LLC
receives a non-exclusive license during the term to use the white-label software for its
reseller offering. Atlas Harbor Technologies Inc. shall not claim ownership of Redwood Peak
Ventures LLC customer data. No additional company is granted intellectual property rights
by this section. Redwood Peak Ventures LLC may resell and white-label the software to its
customers during the term and shall not represent that any company other than the two
parties is a contracting party.

6. Uptime, service levels, and third-party dependency
Atlas Harbor Technologies Inc. shall maintain commercially reasonable uptime for the
white-label production instance and must provide service level support for incidents
that interrupt production use. Atlas Harbor Technologies Inc. shall report uptime and
service level performance on request. Service credits, if any, are the exclusive remedy
for uptime shortfalls unless a shortfall is caused by willful misconduct. This section
does not invent a numeric availability percentage. A party is not liable for delay caused
by a third-party dependency or other event beyond its reasonable control, provided it
gives prompt notice and resumes performance when the event ends. Payment for completed
milestones remains due.

7. Limitation of liability and indemnification
Except for confidentiality breaches, indemnification obligations, or willful misconduct,
each party's aggregate liability under this Agreement is limited to the fees paid under
this Agreement. Neither party is liable for incidental or consequential damages. Each
party shall indemnify, defend, and hold harmless the other party from third-party claims
arising from the indemnifying party's material breach, infringement of materials that
party supplied, or unauthorized use of the software. The indemnified party must promptly
notice the claim and reasonably cooperate. This indemnification is the indemnification
requested for this deal.

8. Workforce solicitation, audit, and cooperation
During the term and for a commercially reasonable period after it ends, neither party
shall solicit the other party's employees who worked on this engagement to leave that
party's employment, except through general public advertising not targeted at those
people. Redwood Peak Ventures LLC may audit records reasonably needed to confirm
milestone completion, invoicing of the $124,750 fee, and security obligations, on
reasonable notice. Atlas Harbor Technologies Inc. shall cooperate. Each party shall
designate one commercial contact and must respond to reasonable operational requests.

9. Notices
Notices must be in writing and sent by email and by mail to the notice address each party
designates in writing. Notice of termination, indemnification, or dispute must also be
sent to the other party's designated legal contact if one has been named in writing.

10. Dispute resolution
The parties shall first negotiate in good faith to resolve disputes. If negotiation does
not resolve the dispute, the parties shall attempt mediation. If mediation does not
resolve the dispute, either party may pursue litigation or, if both parties later agree
in writing, arbitration. Dispute resolution proceedings must be brought as allowed by
the governing law and venue in this Agreement.

11. Governing law
The laws of the State of Delaware govern this Agreement, without regard to conflict-of-law
rules. The state and federal courts located in Delaware are the exclusive venue for
litigation under this Agreement, and each party submits to that venue.

12. Counterparts, electronic signatures, and entire agreement
This Agreement may be executed in counterparts. Electronic signatures are valid and bind
the signing party. Counterparts together form one Agreement. This Agreement is the entire
agreement on reseller and white-label services between Redwood Peak Ventures LLC and
Atlas Harbor Technologies Inc. and supersedes prior discussions on that subject.
Amendments must be in a writing signed by both parties.

Performance and offboarding detail
Atlas Harbor Technologies Inc. must correct integration and dashboard defects that prevent
a paid milestone from being usable and shall keep a current list of open defects.
Redwood Peak Ventures LLC shall supply sample records needed to prove integrations and
must identify material dashboard defects in writing. If this Agreement ends, Atlas Harbor
Technologies Inc. shall deliver the offboarding export and must not withhold it to secure
a disputed amount except for unpaid completed milestones. Redwood Peak Ventures LLC shall
use the stated support channels for defects after maintenance begins.

Atlas Harbor Technologies Inc. shall schedule maintenance windows with advance written
notice and must restore production use after each window. Redwood Peak Ventures LLC shall
identify a backup commercial contact if the primary contact is unavailable. Atlas Harbor
Technologies Inc. must keep API credentials used for this engagement separate from other
customers and shall rotate those credentials when Redwood Peak Ventures LLC asks in writing
after a suspected incident. Redwood Peak Ventures LLC shall promptly confirm receipt of
each milestone invoice and must raise a written billing question before the next milestone
is invoiced if it disputes an amount. The parties shall keep the $124,750 total as the
complete fee for the five stated phases unless they sign a written change.
Atlas Harbor Technologies Inc. shall keep the white-label instance logically separate
from other reseller deployments and must not reuse Redwood Peak Ventures LLC workflow
content for another customer. Redwood Peak Ventures LLC shall not remove Atlas Harbor
Technologies Inc. copyright or license notices from the underlying software.

IN WITNESS WHEREOF the parties sign this Agreement.

Redwood Peak Ventures LLC (party)
By: ________________________  Name: ________________  Title: ________________  Date: ________________

Atlas Harbor Technologies Inc. (party)
By: ________________________  Name: ________________  Title: ________________  Date: ________________
""".strip()


def agency_headings_plus_filler_paper() -> str:
    """Long headings-plus-padding body that must remain fail-closed."""
    body_block = "\n\n".join(
        [
            "1. PARTIES. Agency LLC and Client LLC enter this Agreement.",
            "2. SCOPE. Paid media, spend approvals, CRM ownership, and performance reporting.",
            "3. COMPENSATION. Monthly retainer; invoicing and net payment terms as stated.",
            "4. CONFIDENTIALITY. Mutual protection of non-public business information.",
            "5. TERM AND TERMINATION. Initial term with written notice for convenience.",
            "6. LIABILITY. Commercially reasonable limitation except for gross negligence.",
            "7. DISPUTES. Good-faith negotiation then courts of the selected jurisdiction.",
            "8. NOTICES. Email and mailing to designated business addresses.",
            "9. MISCELLANEOUS. Entire agreement; counterparts; electronic signatures valid.",
            "10. GOVERNING LAW. As stated in the agreement header.",
        ]
    )
    return (
        "WHEREAS the parties wish to document paid media services.\n\n"
        + body_block
        + "\n\n"
        + ("Additional operative detail. " * 320)
        + "\n\n"
        + ("z" * 1200)
    )


def agency_success_model_json(*, use_authoritative_draft: bool = True) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "title": "Agency Services Agreement",
        "agreement_family": "Marketing / agency retainer",
        "key_terms_found": ["Fees", "IP"],
        "missing_material_info": ["Cap table"],
    }
    paper = agency_llc_client_llc_paid_media_agreement()
    if use_authoritative_draft:
        payload["authoritative_draft"] = paper
    else:
        payload["document_text"] = paper
    return payload


def saas_success_model_json() -> Dict[str, Any]:
    return {
        "title": "Reseller and White-Label Services Agreement",
        "agreement_family": "SaaS / software services",
        "authoritative_draft": redwood_atlas_saas_reseller_agreement(),
        "key_terms_found": ["Fees", "SLA"],
        "missing_material_info": [],
    }


def headings_plus_filler_model_json() -> Dict[str, Any]:
    return {
        "title": "Agency Services Agreement",
        "agreement_family": "Marketing / agency retainer",
        "authoritative_draft": agency_headings_plus_filler_paper(),
        "key_terms_found": ["Fees", "IP"],
        "missing_material_info": [],
    }


def agency_success_context() -> Dict[str, Any]:
    return {
        "title": "T",
        "jurisdiction": "New York",
        "parties": [
            {"name": "Agency LLC", "role": "Agency"},
            {"name": "Client LLC", "role": "Client"},
        ],
        "purpose": "Run campaigns",
        "payment_terms": "Monthly",
        "material_asks": ["Own CRM exports"],
    }


def saas_two_party_context() -> Dict[str, Any]:
    return {
        "title": "Web Development Agreement",
        "jurisdiction": "Delaware",
        "parties": [
            {"name": "Redwood Peak Ventures LLC", "role": "party"},
            {"name": "Atlas Harbor Technologies Inc.", "role": "party"},
        ],
        "purpose": "Reseller and white-label services",
        "payment_terms": "$124,750 milestone payments",
        "agreement_family": "services_agreement",
        "material_asks": ["confidentiality", "indemnification", "dispute resolution"],
    }


AGENCY_SUCCESS_INTAKE = (
    "Retainer for paid media between Agency LLC and Client LLC, spend pre-approval, CRM ownership."
)


def client_co_designer_llc_logo_agreement() -> str:
    """Two-party California logo engagement covering $1,500 and two revision rounds."""
    return """
LOGO DESIGN SERVICES AGREEMENT

This Agreement is between Client Co and Designer LLC.
Client Co acts as Client. Designer LLC acts as Designer.
Client Co and Designer LLC are the only legal parties.
This Agreement takes effect when both parties have signed it. No calendar Effective Date is stated.

1. Scope
Designer LLC shall design a logo for Client Co. Designer LLC must deliver the agreed
logo files after Client Co accepts the work or after the included revision rounds are used.

2. Revisions
The fee includes 2 revisions. Designer LLC shall complete those two revision rounds
when Client Co requests them in writing. Additional revisions require a signed writing.

3. Payment
Client Co shall pay Designer LLC a flat fee of $1,500. Designer LLC must invoice the
$1,500 fee. Client Co shall pay that invoice. The $1,500 fee covers the logo and the
2 revisions.

4. Term and termination
This engagement continues until the logo is delivered or a party ends it by written notice.
Designer LLC must deliver then-current logo files if Client Co has paid the $1,500 fee.

5. Confidentiality
Each party shall protect the other party's non-public brand information and must use it
only to perform this Agreement.

6. Intellectual property
Upon payment of the $1,500 fee, Client Co owns the final accepted logo. Designer LLC
retains pre-existing tools and unused concepts. Designer LLC shall not reuse the final
accepted logo for another customer.

7. Liability and indemnification
Each party shall perform with reasonable care. Designer LLC shall indemnify Client Co
against third-party claims that the original logo Designer LLC created infringes a
third-party copyright, except for materials Client Co supplied.

8. Notices
Notices must be sent by email and by mail to the address each party designates in writing.

9. Dispute resolution and governing law
The parties shall negotiate in good faith. The laws of the State of California govern
this Agreement. Courts in California are the venue for disputes.

10. Counterparts and electronic signatures
This Agreement may be signed in counterparts. Electronic signatures are valid and bind
the signing party.

IN WITNESS WHEREOF the parties sign this Agreement.

Client Co (Client)
By: ________________________  Name: ________________  Title: ________________  Date: ________________

Designer LLC (Designer)
By: ________________________  Name: ________________  Title: ________________  Date: ________________
""".strip()
