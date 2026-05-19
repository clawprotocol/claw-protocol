/** Ironclad / 5-party AI rollout — shared E2E + QA fixture. */
export const IRONCLAD_JOINT_ROLLOUT_INTAKE = `Need an agreement between Ironclad Systems Group LLC, Harborline Data Solutions Inc., Northwind Automation Partners LLC, Silver Mesa Analytics LP, and VertexGrid Technologies LLC for a joint AI software and infrastructure rollout project.

Main people involved:

* Ethan Cole — CEO at Ironclad — ethan.cole@ironcladsg.com
* Maya Bennett — CTO at Harborline — maya.bennett@harborlinedata.com
* Lucas Reed — Managing Partner at Northwind — lucas.reed@northwindap.io
* Olivia Hart — Ops Director at Silver Mesa — olivia.hart@silvermesaanalytics.com
* Adrian Vale — President at VertexGrid — adrian.vale@vertexgridtech.com

The deal should cover white-label AI workflow software, API integrations, onboarding and migration help, analytics dashboards, monitoring, support, and ongoing maintenance.

Total contract value is $187,500 paid over 6 milestone payments tied to deployment stages and launch targets.

Initial term should be 24 months with automatic yearly renewal unless someone gives 45 days notice.

Use Texas law.

Please include normal enterprise protections like confidentiality, cybersecurity/data protection obligations, IP ownership, liability limits, indemnification, uptime/SLA expectations, dispute resolution, non-solicitation/non-circumvention, audit rights, force majeure, termination rights, and electronic signatures.`;

export const IRONCLAD_PARTIES = [
  "Ironclad Systems Group LLC",
  "Harborline Data Solutions Inc.",
  "Northwind Automation Partners LLC",
  "Silver Mesa Analytics LP",
  "VertexGrid Technologies LLC",
] as const;

function padOperative(core: string, targetLen = 24_000): string {
  const pad = "\n\nThe parties agree to cooperate in good faith on commercial terms. ".repeat(350);
  let t = core;
  while (t.length < targetLen) t += pad;
  return t;
}

/** Clean authoritative Pro body for mocked premium-full-draft success (post client polish). */
export function buildIroncladPremiumFullDraftBody(): string {
  const partyBlock = IRONCLAD_PARTIES.join(", ");
  const signerLines = IRONCLAD_PARTIES.map(
    (p, i) =>
      `${p}\nBy: _________________________\nName: Signatory ${i + 1}\nTitle: Authorized Signatory\nEmail: signer${i + 1}@example.com`,
  ).join("\n\n");

  const core = [
    "MULTI-PARTY TECHNOLOGY SERVICES AND IMPLEMENTATION AGREEMENT",
    "",
    `This Agreement is entered into among ${partyBlock}.`,
    "",
    "1. PARTIES AND PURPOSE. The Parties engage in a joint AI software and infrastructure rollout.",
    "2. SCOPE AND DELIVERABLES. White-label AI workflow software, API integrations, migration, analytics, monitoring, and support.",
    "3. GOVERNANCE AND COORDINATION.",
    "3.1 Project Coordination. The Parties shall coordinate deployment sequencing and acceptance testing using operational contact channels set forth in the Notices section.",
    "4. TERM AND RENEWAL.",
    "4.1 Term. The initial term is twenty-four (24) months with automatic yearly renewal unless a Party provides forty-five (45) days prior written notice of non-renewal.",
    "5. FEES AND PAYMENT.",
    "5.3 Invoicing and Payment Timing. Invoices shall reference the applicable milestone or service period and are due within thirty (30) days of receipt.",
    "5.4 Total Fees. Total contract value is One Hundred Eighty-Seven Thousand Five Hundred Dollars ($187,500) paid across six milestone payments.",
    "6. SUPPORT AND SERVICE LEVELS. Commercially reasonable uptime targets and incident response procedures apply.",
    "7. DATA PROTECTION AND SECURITY. Each Party shall implement reasonable safeguards for customer and operational data.",
    "8. CONFIDENTIALITY. The Parties shall protect Confidential Information using commercially reasonable measures.",
    "9. INTELLECTUAL PROPERTY. Ownership and license grants are as set forth in this Agreement and schedules.",
    "10. WARRANTIES. Each Party represents it has authority to enter into this Agreement.",
    "11. INDEMNIFICATION. Mutual indemnities apply for third-party claims arising from breach or negligence.",
    "12. LIMITATION OF LIABILITY. Direct damages are capped except for excluded matters stated herein.",
    "13. TERMINATION. Material breach may be cured per notice provisions; convenience termination requires written notice.",
    "14. DISPUTE RESOLUTION.",
    "14.1 Disputes shall be resolved by mediation, then binding arbitration in Texas under applicable AAA rules.",
    "15. GOVERNING LAW. This Agreement is governed by the laws of the State of Texas.",
    "16. NOTICES. Operational and legal notices shall be sent to designated contacts.",
    "",
    "IN WITNESS WHEREOF, the Parties have executed this Agreement as of the Effective Date.",
    signerLines,
  ].join("\n");

  return padOperative(core);
}
