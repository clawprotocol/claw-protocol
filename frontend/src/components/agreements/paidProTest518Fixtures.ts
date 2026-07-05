import type { ParsedDraftShape } from "./intakeSmartDefaults";

export const TEST518_REDWOOD = "Redwood Biologics, Inc.";
export const TEST518_SUMMIT = "Summit AI Consulting LLC";
export const TEST518_BLUE_HARBOR = "Blue Harbor Systems LLC";
export const TEST518_IRON_GATE = "Iron Gate Security LLC";

/** Production QA — multi-party biotech / AI / cloud / security stack (TEST518). */
export const TEST518_PRODUCTION_QUAD_PARTY_INTAKE = [
  "Draft a comprehensive multi-party services agreement among the following four parties:",
  "",
  `1. ${TEST518_REDWOOD} (Clinical Data Provider)`,
  `2. ${TEST518_SUMMIT} (AI Model Developer)`,
  `3. ${TEST518_BLUE_HARBOR} (Cloud Infrastructure Host)`,
  `4. ${TEST518_IRON_GATE} (Cybersecurity Monitor)`,
  "",
  `${TEST518_REDWOOD} will contribute de-identified clinical trial outcome data.`,
  `${TEST518_SUMMIT} will develop and train predictive AI models.`,
  `${TEST518_BLUE_HARBOR} will host cloud infrastructure and analytics pipelines.`,
  `${TEST518_IRON_GATE} will provide continuous cybersecurity monitoring and incident response.`,
  "",
  "Total project fee is $450,000 payable in milestone installments.",
  "Term: eighteen (18) months with ninety days of post-launch support.",
  "",
  "Major project decisions require approval from Redwood Biologics and Summit AI Consulting.",
  "Each provider is responsible only for its assigned work.",
  "",
  "Include confidentiality, intellectual property ownership, limitation of liability, insurance requirements,",
  "data privacy obligations, termination for cause and convenience, notice provisions, governing law (Delaware),",
  "dispute resolution, force majeure, independent contractor status, assignment restrictions, amendment,",
  "severability, waiver, and entire agreement clauses.",
  "",
  "Prepare the agreement for electronic signature by all four parties.",
].join("\n");

export function test518Draft(): ParsedDraftShape {
  return {
    title: "Multi-Party Services Agreement",
    jurisdiction: "Delaware",
    agreement_family: "consulting_agreement",
    parties: [
      { name: TEST518_REDWOOD, role: "Client" } as never,
      { name: TEST518_SUMMIT, role: "Service Provider" } as never,
    ],
    purpose:
      "Clinical data, AI model development, cloud infrastructure hosting, and cybersecurity monitoring.",
    payment_terms: "$450,000 milestone installments",
    duration: "18 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 450000, cadence: "milestone", valid: true },
  };
}

/** Concise but complete server_full_draft (~2.2k) — below SUBSTANTIVE_SERVER_DRAFT_MIN_LEN. */
export function buildTest518ConciseServerBody(): string {
  const header = [
    "MULTI-PARTY SERVICES AGREEMENT",
    "",
    `This Multi-Party Services Agreement ("Agreement") is entered into among ${TEST518_REDWOOD}, ${TEST518_SUMMIT}, ${TEST518_BLUE_HARBOR}, and ${TEST518_IRON_GATE}.`,
    "",
    "1. Scope of Services",
    `${TEST518_SUMMIT} shall develop AI models. ${TEST518_BLUE_HARBOR} shall host cloud infrastructure. ${TEST518_IRON_GATE} shall provide cybersecurity monitoring. ${TEST518_REDWOOD} shall supply de-identified clinical trial data.`,
    "",
    "2. Payment",
    "Total fee of $450,000 payable in milestone installments as mutually agreed.",
    "",
    "3. Term",
    "The term is eighteen (18) months including ninety days of post-launch support.",
    "",
    "4. Confidentiality",
    "Each party shall maintain confidentiality of non-public information received under this Agreement.",
    "",
    "5. Intellectual Property",
    "Work product ownership shall follow the role assignments described in the scope of services.",
    "",
    "6. Limitation of Liability",
    "Except for willful misconduct, liability is limited to fees paid in the twelve months preceding the claim.",
    "",
    "7. Termination",
    "Either party may terminate for cause or convenience on written notice.",
    "",
    "8. Governing Law",
    "This Agreement is governed by the laws of the State of Delaware.",
    "",
    "9. Notices",
    "Notices shall be sent to each party at its principal business address.",
    "",
    "10. Entire Agreement",
    "This Agreement constitutes the entire agreement among the parties.",
    "",
    "11. Electronic Signatures",
    "The parties may execute this Agreement using electronic signatures and counterparts.",
    "",
    "IN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.",
  ].join("\n");
  return header;
}
