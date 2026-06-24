import type { ParsedDraftShape } from "./intakeSmartDefaults";

export const NORTH_STAR = "North Star Manufacturing LLC";
export const SUMMIT_RIDGE = "Summit Ridge Advisory Group LLC";
export const DELTA_INTEGRATION = "Delta Integration Services LLC";
export const BLUE_CANYON = "Blue Canyon Analytics LLC";

export const TEST429_FOUR_PARTY_NORTH_STAR_INTAKE = `Create a four-party consulting and implementation agreement.

Party 1 (Client):
North Star Manufacturing LLC

Party 2 (Lead Consultant):
Summit Ridge Advisory Group LLC

Party 3 (Technology Integrator):
Delta Integration Services LLC

Party 4 (Data Analytics Provider):
Blue Canyon Analytics LLC

Background:

Client is modernizing its manufacturing operations, ERP workflows, inventory controls, production reporting, and executive analytics.

Lead Consultant will manage the overall transformation project, project governance, stakeholder coordination, requirements gathering, implementation oversight, and executive reporting.

Technology Integrator will configure and deploy software systems, integrations, automation workflows, and user training.

Data Analytics Provider will design dashboards, reporting models, KPI frameworks, and business intelligence deliverables.

Scope:

* Current-state operational assessment
* ERP and workflow optimization
* Integration architecture
* Data migration planning
* Dashboard and analytics implementation
* User training
* Executive reporting
* Go-live support

Commercial Terms:

Client will pay a total project fee of $240,000.

Payment schedule:

* $60,000 upon execution
* $60,000 after completion of requirements and planning
* $60,000 upon implementation completion
* $60,000 after final acceptance

Revenue Allocation:

* Lead Consultant receives 40% of collected fees
* Technology Integrator receives 35% of collected fees
* Data Analytics Provider receives 25% of collected fees

Term:

Agreement remains in effect for 18 months unless earlier terminated.

Governance:

Major project decisions require approval of Client and Lead Consultant.

Technology Integrator and Data Analytics Provider must coordinate through Lead Consultant regarding project changes that affect scope, timeline, integrations, or reporting deliverables.

Confidentiality:

Mutual confidentiality obligations apply to all four parties.

Liability:

No party is liable for indirect, consequential, special, incidental, exemplary, or punitive damages.

Each party's aggregate liability is capped at fees actually received under this Agreement, except for fraud, willful misconduct, confidentiality breaches, or unpaid payment obligations.

Termination:

Client may terminate for material breach if uncured after 30 days written notice.

If terminated without cause, Client remains responsible for approved work completed through the termination date.

Governing Law:

Oklahoma.

Include a complete four-party execution block with separate signature blocks for all four parties.`;

export const TEST429_MIN_SERVER_LEN = 2000;

export function test429Draft(): ParsedDraftShape {
  return {
    title: "Consulting and Implementation Agreement",
    jurisdiction: "Oklahoma",
    agreement_family: "consulting_agreement",
    parties: [
      { name: NORTH_STAR, role: "Client" } as never,
      { name: SUMMIT_RIDGE, role: "Lead Consultant" } as never,
    ],
    purpose: "Manufacturing operations modernization and analytics.",
    payment_terms: "$240,000 milestone payments",
    duration: "18 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 240000, cadence: "milestone", valid: true },
  };
}

/** Simulates malformed server corpus: duplicate recital, duplicate tail, 2-party notices, split headings. */
export function buildTest429MalformedFourPartyServerCorpus(): string {
  const duplicateTail = [
    "14. Miscellaneous",
    "",
    "14.1 Entire Agreement",
    "This Agreement is the entire agreement among the Parties.",
    "",
    "14.2 Amendments",
    "Amendments require written consent.",
    "",
    "14.3 Assignment",
    "No assignment without consent.",
    "",
    "14.4 Severability",
    "Invalid provisions are severed.",
    "",
    "14.5 Counterparts",
    "This Agreement may be executed in counterparts.",
    "",
    "14.6 Electronic Signatures",
    "Electronic signatures are binding.",
    "",
    "[SIGNATURES FOLLOW]",
    "",
    "14. Miscellaneous",
    "",
    "14.1 Entire Agreement",
    "This Agreement is the entire agreement among the Parties.",
    "",
    "14.2 Amendments",
    "Amendments require written consent.",
    "",
    "14.3 Assignment",
    "No assignment without consent.",
    "",
    "14.4 Severability",
    "Invalid provisions are severed.",
    "",
    "14.5 Counterparts",
    "This Agreement may be executed in counterparts.",
    "",
    "14.6 Electronic Signatures",
    "Electronic signatures are binding.",
    "",
    "[SIGNATURES FOLLOW]",
  ].join("\n");

  return [
    "CONSULTING AND IMPLEMENTATION AGREEMENT",
    "",
    `This Consulting and Implementation Agreement (the "Agreement") is entered into as of the Effective Date by and between ${NORTH_STAR} ${NORTH_STAR} ("${NORTH_STAR}") and ${SUMMIT_RIDGE} ("${SUMMIT_RIDGE}").`,
    "",
    `This Agreement is entered into as of the Effective Date by and among ${NORTH_STAR}, ${SUMMIT_RIDGE}, ${DELTA_INTEGRATION}, and ${BLUE_CANYON} (each a "Party" and collectively, the "Parties").`,
    "",
    "1. Scope of Services",
    "",
    "1.1 Project Overview",
    "The Parties will collaborate on manufacturing modernization.",
    "",
    "1.2 Lead",
    "",
    "Consultant Responsibilities",
    "Lead Consultant will manage governance and oversight.",
    "",
    "2. Governance",
    "",
    "3. Coordination",
    "",
    "3.2 Coordination Through",
    "",
    "Lead Consultant",
    "Technology Integrator coordinates through Lead Consultant.",
    "",
    "4. Commercial Terms",
    "",
    "4.4 Revenue",
    "",
    "Allocation Among Service Providers",
    "Fees are allocated among service providers.",
    "",
    "4.5 Internal",
    "",
    "Allocation Responsibility",
    "Lead Consultant tracks internal allocations.",
    "",
    "5. Confidentiality",
    "Mutual confidentiality applies to all Parties.",
    "",
    "6. Limitation of Liability",
    "Liability is capped as stated in the intake.",
    "",
    "7. Term",
    "The term is eighteen (18) months.",
    "",
    "8. Payment",
    "Client will pay $240,000 in milestone installments.",
    "",
    "9. Notices",
    "Notices must be in writing.",
    `If to ${NORTH_STAR}:`,
    NORTH_STAR,
    "Attn: Authorized Signer",
    "Email: primary business email on file with the Party",
    "Address: primary business address on file with the Party",
    `If to ${SUMMIT_RIDGE}:`,
    SUMMIT_RIDGE,
    "Attn: Authorized Signer",
    "Email: primary business email on file with the Party",
    "Address: primary business address on file with the Party",
    "",
    "10. Termination",
    "",
    "10.3 Termination for Material Breach by",
    "",
    "Service Provider Team",
    "Client may terminate for material breach after notice.",
    "",
    "11. Governing Law",
    "Oklahoma law governs.",
    "",
    "12. Relationship of Parties",
    "Independent contractors.",
    "",
    "13. General Provisions",
    "Miscellaneous operative terms.",
    "",
    duplicateTail,
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    `PARTY 1:`,
    NORTH_STAR,
    "By: ______________________________",
    "Name: ______________________________",
    "Title: ______________________________",
    "Date: ______________________________",
    "",
    `PARTY 2:`,
    SUMMIT_RIDGE,
    "By: ______________________________",
    "Name: ______________________________",
    "Title: ______________________________",
    "Date: ______________________________",
    "",
    `PARTY 3:`,
    DELTA_INTEGRATION,
    "By: ______________________________",
    "Name: ______________________________",
    "Title: ______________________________",
    "Date: ______________________________",
    "",
    `PARTY 4:`,
    BLUE_CANYON,
    "By: ______________________________",
    "Name: ______________________________",
    "Title: ______________________________",
    "Date: ______________________________",
  ].join("\n");
}
